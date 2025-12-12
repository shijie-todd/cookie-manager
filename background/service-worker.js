/**
 * Service Worker - 后台服务
 * 监听Cookie变化、处理配置切换等
 */

import { getActiveProfile, isPluginEnabled, switchProfile as switchProfileConfig } from '../utils/config-manager.js';
import { saveCookieToActiveProfile, saveCurrentProfileCookies, clearAllCookies, loadCookies } from '../utils/cookie-manager.js';

// 标记是否正在切换配置，避免在切换过程中触发Cookie保存
let isSwitchingProfile = false;

/**
 * 初始化Service Worker
 */
async function init() {
  console.log('Cookie管理器 Service Worker 已启动');
  
  // 恢复拦截状态
  await setupCookieInterceptor();
}

/**
 * 设置Cookie拦截器
 */
async function setupCookieInterceptor() {
  const enabled = await isPluginEnabled();
  const activeProfile = await getActiveProfile();
  
  if (enabled && activeProfile) {
    // 监听Cookie变化
    chrome.cookies.onChanged.addListener(handleCookieChange);
    console.log('Cookie拦截器已启用');
  } else {
    // 移除监听器（注意：无法直接移除，但可以通过标志位控制）
    console.log('Cookie拦截器未启用');
  }
}

/**
 * 处理Cookie变化事件
 * @param {object} changeInfo - Cookie变化信息
 */
async function handleCookieChange(changeInfo) {
  // 如果正在切换配置，不处理Cookie变化
  if (isSwitchingProfile) {
    return;
  }
  
  const enabled = await isPluginEnabled();
  if (!enabled) {
    return;
  }
  
  const activeProfile = await getActiveProfile();
  if (!activeProfile) {
    return;
  }
  
  // 只保存被设置或更改的Cookie（不保存被删除的）
  if (changeInfo.removed) {
    return;
  }
  
  // 保存Cookie到当前激活配置
  try {
    await saveCookieToActiveProfile(changeInfo.cookie);
  } catch (error) {
    console.error('保存Cookie失败:', error);
  }
}

/**
 * 切换配置
 * @param {string} profileId - 要切换到的配置ID
 * @param {boolean} clearCookies - 是否清空Cookie（默认true）
 * @returns {Promise<void>}
 */
async function switchProfile(profileId, clearCookies = true) {
  if (isSwitchingProfile) {
    console.warn('正在切换配置，请稍候...');
    return;
  }
  
  isSwitchingProfile = true;
  
  try {
    // 1. 保存当前配置的Cookie
    const currentProfile = await getActiveProfile();
    if (currentProfile) {
      await saveCurrentProfileCookies();
    }
    
    // 2. 切换配置
    await switchProfileConfig(profileId);
    
    // 3. 清空所有Cookie（如果需要）
    if (clearCookies) {
      const newProfile = await getActiveProfile();
      const excludeDomains = newProfile?.domains || [];
      await clearAllCookies(excludeDomains);
    }
    
    // 4. 加载新配置的Cookie
    await loadCookies(profileId);
    
    console.log(`已切换到配置: ${profileId}`);
  } catch (error) {
    console.error('切换配置失败:', error);
    throw error;
  } finally {
    isSwitchingProfile = false;
  }
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.action) {
        case 'switchProfile':
          await switchProfile(message.profileId, message.clearCookies !== false);
          sendResponse({ success: true });
          break;
          
        case 'saveCurrentCookies':
          await saveCurrentProfileCookies();
          sendResponse({ success: true });
          break;
          
        case 'getActiveProfile':
          const profile = await getActiveProfile();
          sendResponse({ success: true, profile });
          break;
          
        case 'isPluginEnabled':
          const enabled = await isPluginEnabled();
          sendResponse({ success: true, enabled });
          break;
          
        default:
          sendResponse({ success: false, error: '未知操作' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  // 返回true表示异步响应
  return true;
});

// 监听插件启用/禁用状态变化
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.pluginEnabled || changes.activeProfileId) {
      setupCookieInterceptor();
    }
  }
});

// 初始化
init();

