/**
 * Popup主逻辑
 */

import { 
  getProfiles, 
  getActiveProfileId, 
  createProfile, 
  deleteProfile, 
  switchProfile,
  isPluginEnabled,
  setPluginEnabled,
  updateProfile
} from '../utils/config-manager.js';
import { getProfileCookies, updateCookie, deleteCookie, addCookie, clearProfileCookies, clearAllCookies } from '../utils/cookie-manager.js';
import { setStorage } from '../utils/storage.js';

let currentProfileId = null;
let profiles = [];

/**
 * 初始化
 */
async function init() {
  await loadProfiles();
  await updatePluginToggle();
  setupEventListeners();
}

/**
 * 加载配置列表
 */
async function loadProfiles() {
  profiles = await getProfiles();
  currentProfileId = await getActiveProfileId();
  renderProfiles();
}

/**
 * 渲染配置列表
 */
function renderProfiles() {
  const profilesList = document.getElementById('profilesList');
  
  if (profiles.length === 0) {
    profilesList.innerHTML = `
      <div class="empty-state">
        <p>还没有配置</p>
        <p>点击"新建配置"开始使用</p>
      </div>
    `;
    return;
  }
  
  profilesList.innerHTML = profiles.map(profile => {
    const isActive = profile.id === currentProfileId;
    const domainCount = profile.domains ? profile.domains.length : 0;
    
    return `
      <div class="profile-item ${isActive ? 'active' : ''}" data-profile-id="${profile.id}">
        <label class="profile-checkbox-label">
          <input type="checkbox" class="profile-checkbox" data-profile-id="${profile.id}" ${isActive ? 'checked' : ''}>
          <div class="profile-info">
            <div class="profile-name">${escapeHtml(profile.name)}</div>
            <div class="profile-meta">${domainCount > 0 ? domainCount + ' 个域名' : '所有域名'}</div>
          </div>
        </label>
        <div class="profile-actions">
          <button class="btn btn-icon btn-secondary domain-detail-btn" data-profile-id="${profile.id}">域名配置</button>
          <button class="btn btn-icon btn-secondary cookie-detail-btn" data-profile-id="${profile.id}">Cookie清单</button>
          <button class="btn btn-icon btn-warning clear-cookies-btn" data-profile-id="${profile.id}">清除Cookie</button>
          <button class="btn btn-icon btn-danger delete-btn" data-profile-id="${profile.id}">删除</button>
        </div>
      </div>
    `;
  }).join('');
  
  // 绑定checkbox事件
  document.querySelectorAll('.profile-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      e.stopPropagation();
      const profileId = checkbox.dataset.profileId;
      const isChecked = checkbox.checked;
      
      if (isChecked) {
        // 选中：切换配置
        await handleCheckboxSelect(profileId);
      } else {
        // 取消选中：清空所有cookie
        await handleCheckboxDeselect();
      }
    });
  });
  
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const profileId = btn.dataset.profileId;
      handleDeleteProfile(profileId);
    });
  });
  
  document.querySelectorAll('.domain-detail-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const profileId = btn.dataset.profileId;
      showDomainDialog(profileId);
    });
  });
  
  document.querySelectorAll('.cookie-detail-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const profileId = btn.dataset.profileId;
      showCookieDialog(profileId);
    });
  });
  
  document.querySelectorAll('.clear-cookies-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const profileId = btn.dataset.profileId;
      handleClearProfileCookies(profileId);
    });
  });
}

/**
 * 处理checkbox选中（切换配置）
 */
async function handleCheckboxSelect(profileId) {
  try {
    // 先取消其他所有checkbox
    document.querySelectorAll('.profile-checkbox').forEach(cb => {
      if (cb.dataset.profileId !== profileId) {
        cb.checked = false;
      }
    });
    
    // 发送消息给Service Worker执行切换
    const response = await chrome.runtime.sendMessage({
      action: 'switchProfile',
      profileId: profileId,
      clearCookies: true
    });
    
    if (response.success) {
      currentProfileId = profileId;
      await loadProfiles();
      showMessage('配置已激活');
    } else {
      // 如果切换失败，取消选中
      const checkbox = document.querySelector(`.profile-checkbox[data-profile-id="${profileId}"]`);
      if (checkbox) {
        checkbox.checked = false;
      }
      showMessage('切换失败: ' + (response.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('切换配置失败:', error);
    // 如果切换失败，取消选中
    const checkbox = document.querySelector(`.profile-checkbox[data-profile-id="${profileId}"]`);
    if (checkbox) {
      checkbox.checked = false;
    }
    showMessage('切换失败: ' + error.message, 'error');
  }
}

/**
 * 处理checkbox取消选中（清空所有cookie）
 */
async function handleCheckboxDeselect() {
  if (!confirm('确定要清空所有Cookie吗？\n此操作将删除浏览器中的所有Cookie。')) {
    // 如果用户取消，恢复checkbox状态
    const checkbox = document.querySelector(`.profile-checkbox[data-profile-id="${currentProfileId}"]`);
    if (checkbox) {
      checkbox.checked = true;
    }
    return;
  }
  
  try {
    // 清空所有cookie
    await clearAllCookies();
    
    // 清除当前激活的配置
    currentProfileId = null;
    
    // 清除激活状态（直接设置storage，使用正确的key）
    await setStorage({ activeProfileId: null }); // 注意：这里应该使用 'activeProfileId' 作为key
    
    await loadProfiles();
    showMessage('已清空所有Cookie');
  } catch (error) {
    console.error('清空Cookie失败:', error);
    showMessage('清空失败: ' + error.message, 'error');
    
    // 如果清空失败，恢复checkbox状态
    const checkbox = document.querySelector(`.profile-checkbox[data-profile-id="${currentProfileId}"]`);
    if (checkbox) {
      checkbox.checked = true;
    }
  }
}

/**
 * 处理删除配置
 */
async function handleDeleteProfile(profileId) {
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return;
  
  if (!confirm(`确定要删除配置"${profile.name}"吗？\n此操作不可恢复。`)) {
    return;
  }
  
  try {
    await deleteProfile(profileId);
    await loadProfiles();
    showMessage('配置已删除');
  } catch (error) {
    console.error('删除配置失败:', error);
    showMessage('删除失败: ' + error.message, 'error');
  }
}

/**
 * 处理清除配置的Cookie
 */
async function handleClearProfileCookies(profileId) {
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return;
  
  // 检查是否有Cookie数据
  const cookiesData = await getProfileCookies(profileId);
  const hasCookies = Object.keys(cookiesData).length > 0;
  
  if (!hasCookies) {
    showMessage('该配置下没有Cookie数据', 'error');
    return;
  }
  
  // 统计Cookie数量
  let cookieCount = 0;
  for (const cookies of Object.values(cookiesData)) {
    if (Array.isArray(cookies)) {
      cookieCount += cookies.length;
    }
  }
  
  if (!confirm(`确定要清除配置"${profile.name}"下的所有Cookie吗？\n将删除 ${cookieCount} 个Cookie，此操作不可恢复。`)) {
    return;
  }
  
  try {
    await clearProfileCookies(profileId);
    showMessage(`已清除 ${cookieCount} 个Cookie`);
    
    // 如果当前正在查看该配置的Cookie详情，刷新列表
    const cookieDialog = document.getElementById('cookieDialog');
    if (cookieDialog.style.display !== 'none' && cookieDialog.dataset.profileId === profileId) {
      await renderCookiesList(profileId);
    }
  } catch (error) {
    console.error('清除Cookie失败:', error);
    showMessage('清除失败: ' + error.message, 'error');
  }
}

/**
 * 显示新建配置对话框
 */
function showNewProfileDialog() {
  const dialog = document.getElementById('newProfileDialog');
  const input = document.getElementById('profileName');
  dialog.style.display = 'flex';
  input.value = '';
  input.focus();
}

/**
 * 隐藏新建配置对话框
 */
function hideNewProfileDialog() {
  document.getElementById('newProfileDialog').style.display = 'none';
}

/**
 * 处理创建新配置
 */
async function handleCreateProfile() {
  const nameInput = document.getElementById('profileName');
  const name = nameInput.value.trim();
  
  if (!name) {
    showMessage('请输入配置名称', 'error');
    return;
  }
  
  try {
    const newProfile = await createProfile(name, []);
    await loadProfiles();
    hideNewProfileDialog();
    showMessage('配置创建成功');
    
    // 自动打开域名管理对话框
    setTimeout(() => {
      showDomainDialog(newProfile.id);
    }, 300);
  } catch (error) {
    console.error('创建配置失败:', error);
    showMessage('创建失败: ' + error.message, 'error');
  }
}

/**
 * 显示域名管理对话框
 */
async function showDomainDialog(profileId) {
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return;
  
  const dialog = document.getElementById('domainDialog');
  const title = document.getElementById('domainDialogTitle');
  const domainsList = document.getElementById('domainsList');
  
  title.textContent = `管理域名 - ${profile.name}`;
  dialog.dataset.profileId = profileId;
  
  renderDomainsList(profileId, profile.domains || []);
  
  dialog.style.display = 'flex';
}

/**
 * 渲染域名列表
 */
function renderDomainsList(profileId, domains) {
  const domainsList = document.getElementById('domainsList');
  
  if (domains.length === 0) {
    domainsList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">未配置域名，将对所有域名生效</p>';
    return;
  }
  
  domainsList.innerHTML = domains.map(domain => `
    <div class="domain-item">
      <span>${escapeHtml(domain)}</span>
      <button class="btn btn-icon btn-danger remove-domain-btn" data-domain="${escapeHtml(domain)}">删除</button>
    </div>
  `).join('');
  
  // 绑定删除事件
  document.querySelectorAll('.remove-domain-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.domain;
      await handleRemoveDomain(profileId, domain);
    });
  });
}

/**
 * 处理添加域名
 */
async function handleAddDomain() {
  const dialog = document.getElementById('domainDialog');
  const profileId = dialog.dataset.profileId;
  const input = document.getElementById('newDomain');
  const domain = input.value.trim();
  
  if (!domain) {
    showMessage('请输入域名', 'error');
    return;
  }
  
  // 域名验证（支持通配符，如 *.example.com）
  const domainPattern = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  if (!domainPattern.test(domain)) {
    showMessage('请输入有效的域名（支持通配符，如 *.example.com）', 'error');
    return;
  }
  
  try {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    
    const domains = profile.domains || [];
    if (domains.includes(domain)) {
      showMessage('域名已存在', 'error');
      return;
    }
    
    domains.push(domain);
    await updateProfile(profileId, { domains });
    await loadProfiles();
    
    // 更新对话框中的域名列表
    const updatedProfile = profiles.find(p => p.id === profileId);
    renderDomainsList(profileId, updatedProfile.domains || []);
    
    input.value = '';
    showMessage('域名已添加');
  } catch (error) {
    console.error('添加域名失败:', error);
    showMessage('添加失败: ' + error.message, 'error');
  }
}

/**
 * 处理删除域名
 */
async function handleRemoveDomain(profileId, domain) {
  try {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    
    const domains = (profile.domains || []).filter(d => d !== domain);
    await updateProfile(profileId, { domains });
    await loadProfiles();
    
    // 更新对话框中的域名列表
    const updatedProfile = profiles.find(p => p.id === profileId);
    renderDomainsList(profileId, updatedProfile.domains || []);
    
    showMessage('域名已删除');
  } catch (error) {
    console.error('删除域名失败:', error);
    showMessage('删除失败: ' + error.message, 'error');
  }
}

/**
 * 隐藏域名管理对话框
 */
function hideDomainDialog() {
  document.getElementById('domainDialog').style.display = 'none';
  document.getElementById('newDomain').value = '';
}

/**
 * 显示Cookie详情对话框
 */
async function showCookieDialog(profileId) {
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return;
  
  const dialog = document.getElementById('cookieDialog');
  const title = document.getElementById('cookieDialogTitle');
  
  title.textContent = `Cookie详情 - ${profile.name}`;
  dialog.dataset.profileId = profileId;
  
  await renderCookiesList(profileId);
  
  dialog.style.display = 'flex';
}

/**
 * 渲染Cookie列表
 */
async function renderCookiesList(profileId) {
  const cookiesList = document.getElementById('cookiesList');
  const cookiesData = await getProfileCookies(profileId);
  
  if (Object.keys(cookiesData).length === 0) {
    cookiesList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">暂无Cookie数据</p>';
    return;
  }
  
  let html = '';
  for (const [domain, cookies] of Object.entries(cookiesData)) {
    if (!Array.isArray(cookies) || cookies.length === 0) continue;
    
    html += `<div class="cookie-domain-group">
      <div class="cookie-domain-header">
        <strong>${escapeHtml(domain)}</strong>
        <button class="btn btn-icon btn-primary add-cookie-btn" data-domain="${escapeHtml(domain)}">添加Cookie</button>
      </div>
      <table class="cookie-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>值</th>
            <th>路径</th>
            <th>标志</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>`;
    
    for (const cookie of cookies) {
      const flags = [];
      if (cookie.secure) flags.push('Secure');
      if (cookie.httpOnly) flags.push('HttpOnly');
      
      html += `
        <tr class="cookie-row" data-domain="${escapeHtml(domain)}" data-name="${escapeHtml(cookie.name)}" data-path="${escapeHtml(cookie.path || '/')}">
          <td class="cookie-name-cell">${escapeHtml(cookie.name)}</td>
          <td class="cookie-value-cell" title="${escapeHtml(cookie.value || '')}">${escapeHtml(cookie.value || '')}</td>
          <td class="cookie-path-cell">${escapeHtml(cookie.path || '/')}</td>
          <td class="cookie-flags-cell">${flags.map(f => `<span class="cookie-flag">${f}</span>`).join(' ') || '-'}</td>
          <td class="cookie-actions-cell">
            <button class="btn btn-icon btn-secondary edit-cookie-btn">编辑</button>
            <button class="btn btn-icon btn-danger remove-cookie-btn">删除</button>
          </td>
        </tr>
      `;
    }
    
    html += `</tbody></table></div>`;
  }
  
  cookiesList.innerHTML = html;
  
  // 绑定事件
  document.querySelectorAll('.add-cookie-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const domain = btn.dataset.domain;
      showAddCookieDialog(profileId, domain);
    });
  });
  
  document.querySelectorAll('.edit-cookie-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.cookie-row');
      const domain = row.dataset.domain;
      const name = row.dataset.name;
      const path = row.dataset.path;
      showEditCookieDialog(profileId, domain, name, path);
    });
  });
  
  document.querySelectorAll('.remove-cookie-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.cookie-row');
      const domain = row.dataset.domain;
      const name = row.dataset.name;
      const path = row.dataset.path;
      await handleDeleteCookie(profileId, domain, name, path);
    });
  });
}

/**
 * 显示添加Cookie对话框
 */
function showAddCookieDialog(profileId, domain) {
  const dialog = document.getElementById('addCookieDialog');
  dialog.dataset.profileId = profileId;
  dialog.dataset.domain = domain;
  document.getElementById('cookieName').value = '';
  document.getElementById('cookieValue').value = '';
  document.getElementById('cookiePath').value = '/';
  document.getElementById('cookieDomain').value = domain;
  document.getElementById('cookieSecure').checked = false;
  document.getElementById('cookieHttpOnly').checked = false;
  dialog.style.display = 'flex';
}

/**
 * 显示编辑Cookie对话框
 */
async function showEditCookieDialog(profileId, domain, cookieName, cookiePath) {
  const cookiesData = await getProfileCookies(profileId);
  const cookies = cookiesData[domain] || [];
  const cookie = cookies.find(c => c.name === cookieName && (c.path || '/') === cookiePath);
  
  if (!cookie) return;
  
  const dialog = document.getElementById('editCookieDialog');
  dialog.dataset.profileId = profileId;
  dialog.dataset.domain = domain;
  dialog.dataset.cookieName = cookieName;
  dialog.dataset.cookiePath = cookiePath;
  
  document.getElementById('editCookieName').value = cookie.name;
  document.getElementById('editCookieValue').value = cookie.value || '';
  document.getElementById('editCookiePath').value = cookie.path || '/';
  document.getElementById('editCookieDomain').value = cookie.domain || domain;
  document.getElementById('editCookieSecure').checked = cookie.secure || false;
  document.getElementById('editCookieHttpOnly').checked = cookie.httpOnly || false;
  
  dialog.style.display = 'flex';
}

/**
 * 处理添加Cookie
 */
async function handleAddCookie() {
  const dialog = document.getElementById('addCookieDialog');
  const profileId = dialog.dataset.profileId;
  const domain = dialog.dataset.domain;
  
  const name = document.getElementById('cookieName').value.trim();
  const value = document.getElementById('cookieValue').value;
  const path = document.getElementById('cookiePath').value.trim() || '/';
  const cookieDomain = document.getElementById('cookieDomain').value.trim() || domain;
  const secure = document.getElementById('cookieSecure').checked;
  const httpOnly = document.getElementById('cookieHttpOnly').checked;
  
  if (!name) {
    showMessage('请输入Cookie名称', 'error');
    return;
  }
  
  try {
    await addCookie(profileId, domain, {
      name,
      value,
      path,
      domain: cookieDomain,
      secure,
      httpOnly
    });
    
    await renderCookiesList(profileId);
    hideAddCookieDialog();
    showMessage('Cookie添加成功');
  } catch (error) {
    console.error('添加Cookie失败:', error);
    showMessage('添加失败: ' + error.message, 'error');
  }
}

/**
 * 处理编辑Cookie
 */
async function handleEditCookie() {
  const dialog = document.getElementById('editCookieDialog');
  const profileId = dialog.dataset.profileId;
  const domain = dialog.dataset.domain;
  const oldName = dialog.dataset.cookieName;
  const oldPath = dialog.dataset.cookiePath;
  
  const name = document.getElementById('editCookieName').value.trim();
  const value = document.getElementById('editCookieValue').value;
  const path = document.getElementById('editCookiePath').value.trim() || '/';
  const cookieDomain = document.getElementById('editCookieDomain').value.trim() || domain;
  const secure = document.getElementById('editCookieSecure').checked;
  const httpOnly = document.getElementById('editCookieHttpOnly').checked;
  
  if (!name) {
    showMessage('请输入Cookie名称', 'error');
    return;
  }
  
  try {
    // 如果名称或路径改变了，需要先删除旧的，再添加新的
    if (name !== oldName || path !== oldPath) {
      await deleteCookie(profileId, domain, oldName, oldPath);
      await addCookie(profileId, domain, {
        name,
        value,
        path,
        domain: cookieDomain,
        secure,
        httpOnly
      });
    } else {
      await updateCookie(profileId, domain, name, path, {
        value,
        domain: cookieDomain,
        secure,
        httpOnly
      });
    }
    
    await renderCookiesList(profileId);
    hideEditCookieDialog();
    showMessage('Cookie更新成功');
  } catch (error) {
    console.error('更新Cookie失败:', error);
    showMessage('更新失败: ' + error.message, 'error');
  }
}

/**
 * 处理删除Cookie
 */
async function handleDeleteCookie(profileId, domain, cookieName, cookiePath) {
  if (!confirm(`确定要删除Cookie "${cookieName}" 吗？`)) {
    return;
  }
  
  try {
    await deleteCookie(profileId, domain, cookieName, cookiePath);
    await renderCookiesList(profileId);
    showMessage('Cookie已删除');
  } catch (error) {
    console.error('删除Cookie失败:', error);
    showMessage('删除失败: ' + error.message, 'error');
  }
}

/**
 * 隐藏Cookie详情对话框
 */
function hideCookieDialog() {
  document.getElementById('cookieDialog').style.display = 'none';
}

/**
 * 隐藏添加Cookie对话框
 */
function hideAddCookieDialog() {
  document.getElementById('addCookieDialog').style.display = 'none';
}

/**
 * 隐藏编辑Cookie对话框
 */
function hideEditCookieDialog() {
  document.getElementById('editCookieDialog').style.display = 'none';
}

/**
 * 更新插件启用状态
 */
async function updatePluginToggle() {
  const enabled = await isPluginEnabled();
  const toggle = document.getElementById('pluginToggle');
  toggle.checked = enabled;
}

/**
 * 处理插件启用/禁用切换
 */
async function handlePluginToggle() {
  const toggle = document.getElementById('pluginToggle');
  const enabled = toggle.checked;
  
  try {
    await setPluginEnabled(enabled);
    showMessage(enabled ? '插件已启用' : '插件已禁用');
  } catch (error) {
    console.error('切换插件状态失败:', error);
    toggle.checked = !enabled;
    showMessage('操作失败: ' + error.message, 'error');
  }
}

/**
 * 设置事件监听器
 */
function setupEventListeners() {
  // 新建配置按钮
  document.getElementById('newProfileBtn').addEventListener('click', showNewProfileDialog);
  
  // 新建配置对话框
  document.getElementById('confirmNewProfileBtn').addEventListener('click', handleCreateProfile);
  document.getElementById('cancelNewProfileBtn').addEventListener('click', hideNewProfileDialog);
  document.getElementById('profileName').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleCreateProfile();
    }
  });
  
  // 域名管理对话框
  document.getElementById('addDomainBtn').addEventListener('click', handleAddDomain);
  document.getElementById('closeDomainDialogBtn').addEventListener('click', hideDomainDialog);
  document.getElementById('newDomain').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleAddDomain();
    }
  });
  
  // Cookie详情对话框
  document.getElementById('closeCookieDialogBtn').addEventListener('click', hideCookieDialog);
  
  // 添加Cookie对话框
  document.getElementById('confirmAddCookieBtn').addEventListener('click', handleAddCookie);
  document.getElementById('cancelAddCookieBtn').addEventListener('click', hideAddCookieDialog);
  
  // 编辑Cookie对话框
  document.getElementById('confirmEditCookieBtn').addEventListener('click', handleEditCookie);
  document.getElementById('cancelEditCookieBtn').addEventListener('click', hideEditCookieDialog);
  
  // 插件启用/禁用切换
  document.getElementById('pluginToggle').addEventListener('change', handlePluginToggle);
  
  // 点击对话框背景关闭
  document.getElementById('newProfileDialog').addEventListener('click', (e) => {
    if (e.target.id === 'newProfileDialog') {
      hideNewProfileDialog();
    }
  });
  
  document.getElementById('domainDialog').addEventListener('click', (e) => {
    if (e.target.id === 'domainDialog') {
      hideDomainDialog();
    }
  });
  
  document.getElementById('cookieDialog').addEventListener('click', (e) => {
    if (e.target.id === 'cookieDialog') {
      hideCookieDialog();
    }
  });
  
  document.getElementById('addCookieDialog').addEventListener('click', (e) => {
    if (e.target.id === 'addCookieDialog') {
      hideAddCookieDialog();
    }
  });
  
  document.getElementById('editCookieDialog').addEventListener('click', (e) => {
    if (e.target.id === 'editCookieDialog') {
      hideEditCookieDialog();
    }
  });
}

/**
 * 显示消息提示
 */
function showMessage(message, type = 'success') {
  // 简单的消息提示实现
  const messageEl = document.createElement('div');
  messageEl.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    background: ${type === 'error' ? '#f44336' : '#4CAF50'};
    color: white;
    border-radius: 4px;
    z-index: 10000;
    font-size: 14px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `;
  messageEl.textContent = message;
  document.body.appendChild(messageEl);
  
  setTimeout(() => {
    messageEl.remove();
  }, 3000);
}

/**
 * HTML转义
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 初始化
init();

