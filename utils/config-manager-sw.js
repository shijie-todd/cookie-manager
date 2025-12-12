/**
 * 配置管理模块 - Service Worker版本
 * 管理Cookie配置的创建、删除、切换等功能（非ES6模块格式）
 */

(function(global) {
  'use strict';

  const StorageUtils = global.StorageUtils;
  if (!StorageUtils) {
    throw new Error('StorageUtils未加载，请先加载utils/storage-sw.js');
  }

  const STORAGE_KEY_PROFILES = 'profiles';
  const STORAGE_KEY_ACTIVE_PROFILE_ID = 'activeProfileId';
  const STORAGE_KEY_PLUGIN_ENABLED = 'pluginEnabled';

  /**
   * 获取所有配置
   * @returns {Promise<Array>} 配置列表
   */
  async function getProfiles() {
    const data = await StorageUtils.getStorage(STORAGE_KEY_PROFILES);
    return data[STORAGE_KEY_PROFILES] || [];
  }

  /**
   * 获取当前激活的配置ID
   * @returns {Promise<string|null>} 激活的配置ID
   */
  async function getActiveProfileId() {
    const data = await StorageUtils.getStorage(STORAGE_KEY_ACTIVE_PROFILE_ID);
    return data[STORAGE_KEY_ACTIVE_PROFILE_ID] || null;
  }

  /**
   * 获取当前激活的配置
   * @returns {Promise<object|null>} 激活的配置对象
   */
  async function getActiveProfile() {
    const activeId = await getActiveProfileId();
    if (!activeId) return null;
    
    const profiles = await getProfiles();
    return profiles.find(p => p.id === activeId) || null;
  }

  /**
   * 检查插件是否启用
   * @returns {Promise<boolean>} 是否启用
   */
  async function isPluginEnabled() {
    const data = await StorageUtils.getStorage(STORAGE_KEY_PLUGIN_ENABLED);
    return data[STORAGE_KEY_PLUGIN_ENABLED] !== false; // 默认为true
  }

  /**
   * 设置插件启用状态
   * @param {boolean} enabled - 是否启用
   * @returns {Promise<void>}
   */
  async function setPluginEnabled(enabled) {
    await StorageUtils.setStorage({ [STORAGE_KEY_PLUGIN_ENABLED]: enabled });
  }

  /**
   * 创建新配置
   * @param {string} name - 配置名称
   * @param {string[]} domains - 域名列表
   * @returns {Promise<object>} 创建的配置对象
   */
  async function createProfile(name, domains = []) {
    const profiles = await getProfiles();
    const newProfile = {
      id: `profile-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      name: name.trim(),
      domains: domains,
      enabled: true,
      createdAt: Date.now()
    };
    
    profiles.push(newProfile);
    await StorageUtils.setStorage({ [STORAGE_KEY_PROFILES]: profiles });
    
    return newProfile;
  }

  /**
   * 删除配置
   * @param {string} profileId - 配置ID
   * @returns {Promise<void>}
   */
  async function deleteProfile(profileId) {
    const profiles = await getProfiles();
    const filtered = profiles.filter(p => p.id !== profileId);
    await StorageUtils.setStorage({ [STORAGE_KEY_PROFILES]: filtered });
    
    // 如果删除的是当前激活的配置，清空激活状态
    const activeId = await getActiveProfileId();
    if (activeId === profileId) {
      await StorageUtils.setStorage({ [STORAGE_KEY_ACTIVE_PROFILE_ID]: null });
    }
  }

  /**
   * 切换激活配置
   * @param {string} profileId - 要激活的配置ID
   * @returns {Promise<void>}
   */
  async function switchProfile(profileId) {
    const profiles = await getProfiles();
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) {
      throw new Error('配置不存在');
    }
    
    await StorageUtils.setStorage({ [STORAGE_KEY_ACTIVE_PROFILE_ID]: profileId });
  }

  /**
   * 更新配置
   * @param {string} profileId - 配置ID
   * @param {object} updates - 要更新的字段
   * @returns {Promise<object>} 更新后的配置对象
   */
  async function updateProfile(profileId, updates) {
    const profiles = await getProfiles();
    const index = profiles.findIndex(p => p.id === profileId);
    if (index === -1) {
      throw new Error('配置不存在');
    }
    
    profiles[index] = { ...profiles[index], ...updates };
    await StorageUtils.setStorage({ [STORAGE_KEY_PROFILES]: profiles });
    
    return profiles[index];
  }

  // 导出到全局对象
  global.ConfigManager = {
    getProfiles,
    getActiveProfileId,
    getActiveProfile,
    isPluginEnabled,
    setPluginEnabled,
    createProfile,
    deleteProfile,
    switchProfile,
    updateProfile
  };
})(this);

