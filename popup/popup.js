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
        <div class="profile-info">
          <div class="profile-name">${escapeHtml(profile.name)}</div>
          <div class="profile-meta">${domainCount} 个域名${isActive ? ' · 当前激活' : ''}</div>
        </div>
        <div class="profile-actions">
          <button class="btn btn-icon btn-secondary manage-domains-btn" data-profile-id="${profile.id}">域名</button>
          ${!isActive ? `<button class="btn btn-icon btn-primary switch-btn" data-profile-id="${profile.id}">切换</button>` : ''}
          <button class="btn btn-icon btn-danger delete-btn" data-profile-id="${profile.id}">删除</button>
        </div>
      </div>
    `;
  }).join('');
  
  // 绑定事件
  document.querySelectorAll('.profile-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.profile-actions')) {
        const profileId = item.dataset.profileId;
        handleSwitchProfile(profileId);
      }
    });
  });
  
  document.querySelectorAll('.switch-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const profileId = btn.dataset.profileId;
      handleSwitchProfile(profileId);
    });
  });
  
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const profileId = btn.dataset.profileId;
      handleDeleteProfile(profileId);
    });
  });
  
  document.querySelectorAll('.manage-domains-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const profileId = btn.dataset.profileId;
      showDomainDialog(profileId);
    });
  });
}

/**
 * 处理切换配置
 */
async function handleSwitchProfile(profileId) {
  try {
    // 发送消息给Service Worker执行切换
    const response = await chrome.runtime.sendMessage({
      action: 'switchProfile',
      profileId: profileId,
      clearCookies: true
    });
    
    if (response.success) {
      currentProfileId = profileId;
      await loadProfiles();
      showMessage('配置切换成功');
    } else {
      showMessage('切换失败: ' + (response.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('切换配置失败:', error);
    showMessage('切换失败: ' + error.message, 'error');
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
    domainsList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">暂无域名</p>';
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
  
  // 简单的域名验证
  if (!/^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(domain)) {
    showMessage('请输入有效的域名', 'error');
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

