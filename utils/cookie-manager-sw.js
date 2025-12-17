/**
 * Cookie管理模块 - Service Worker版本
 * 处理Cookie的保存、加载、清空等操作（非ES6模块格式）
 */

(function(global) {
  'use strict';

  const StorageUtils = global.StorageUtils;
  const ConfigManager = global.ConfigManager;
  if (!StorageUtils || !ConfigManager) {
    throw new Error('依赖模块未加载，请先加载utils/storage-sw.js和utils/config-manager-sw.js');
  }

  const STORAGE_KEY_COOKIE_DATA = 'cookieData';

  /**
   * 获取Cookie数据存储
   * @returns {Promise<object>} Cookie数据对象
   */
  async function getCookieData() {
    const data = await StorageUtils.getStorage(STORAGE_KEY_COOKIE_DATA);
    return data[STORAGE_KEY_COOKIE_DATA] || {};
  }

  /**
   * 保存Cookie数据
   * @param {object} cookieData - Cookie数据对象
   * @returns {Promise<void>}
   */
  async function saveCookieData(cookieData) {
    await StorageUtils.setStorage({ [STORAGE_KEY_COOKIE_DATA]: cookieData });
  }

  /**
   * 判断域名是否匹配（支持通配符）
   * @param {string} cookieDomain - Cookie的域名
   * @param {string} targetDomain - 目标域名（支持通配符，如 *.wps.com）
   * @returns {boolean} 是否匹配
   */
  function isDomainMatch(cookieDomain, targetDomain) {
    // 处理Cookie域名的格式（可能以.开头）
    const normalizedCookieDomain = cookieDomain.startsWith('.') 
      ? cookieDomain.substring(1) 
      : cookieDomain;
    let normalizedTargetDomain = targetDomain.startsWith('.')
      ? targetDomain.substring(1)
      : targetDomain;
    
    // 精确匹配
    if (normalizedCookieDomain === normalizedTargetDomain) {
      return true;
    }
    
    // 子域名匹配：cookieDomain是targetDomain的子域名
    if (normalizedCookieDomain.endsWith('.' + normalizedTargetDomain)) {
      return true;
    }
    
    // 通配符匹配：支持 *.example.com 格式
    if (normalizedTargetDomain.startsWith('*.')) {
      const baseDomain = normalizedTargetDomain.substring(2); // 去掉 "*."
      
      // 精确匹配基础域名
      if (normalizedCookieDomain === baseDomain) {
        return true;
      }
      
      // 匹配所有子域名：*.example.com 匹配 a.example.com, b.example.com 等
      if (normalizedCookieDomain.endsWith('.' + baseDomain)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 检查Cookie是否属于配置的域名列表
   * @param {object} cookie - Cookie对象
   * @param {string[]} domains - 域名列表（如果为空或未配置，则对所有域名生效）
   * @returns {boolean} 是否匹配
   */
  function isCookieInDomains(cookie, domains) {
    // 如果没有配置域名，则对所有域名生效
    if (!domains || domains.length === 0) {
      return true;
    }
    
    return domains.some(domain => isDomainMatch(cookie.domain, domain));
  }

  /**
   * 保存指定域名的所有Cookie到配置
   * @param {string} profileId - 配置ID
   * @param {string} domain - 域名
   * @returns {Promise<void>}
   */
  async function saveCookies(profileId, domain) {
    try {
      // 获取该域名的所有Cookie
      const cookies = await chrome.cookies.getAll({ domain });
      
      // 获取当前Cookie数据
      const cookieData = await getCookieData();
      
      // 初始化配置的Cookie数据
      if (!cookieData[profileId]) {
        cookieData[profileId] = {};
      }
      
      // 保存Cookie（需要保存完整属性）
      cookieData[profileId][domain] = cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expirationDate: cookie.expirationDate,
        storeId: cookie.storeId
      }));
      
      await saveCookieData(cookieData);
    } catch (error) {
      console.error('保存Cookie失败:', error);
      throw error;
    }
  }

  /**
   * 保存当前所有匹配域名的Cookie到激活配置
   * @returns {Promise<void>}
   */
  async function saveCurrentProfileCookies() {
    const activeProfile = await ConfigManager.getActiveProfile();
    if (!activeProfile) {
      return;
    }
    
    // 如果没有配置域名，保存所有Cookie
    if (!activeProfile.domains || activeProfile.domains.length === 0) {
      try {
        const allCookies = await chrome.cookies.getAll({});
        const cookieData = await getCookieData();
        
        if (!cookieData[activeProfile.id]) {
          cookieData[activeProfile.id] = {};
        }
        
        // 按域名分组保存Cookie
        const cookiesByDomain = {};
        for (const cookie of allCookies) {
          const domain = cookie.domain.startsWith('.') 
            ? cookie.domain.substring(1) 
            : cookie.domain;
          if (!cookiesByDomain[domain]) {
            cookiesByDomain[domain] = [];
          }
          cookiesByDomain[domain].push({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite,
            expirationDate: cookie.expirationDate,
            storeId: cookie.storeId
          });
        }
        
        cookieData[activeProfile.id] = cookiesByDomain;
        await saveCookieData(cookieData);
      } catch (error) {
        console.error('保存所有Cookie失败:', error);
        throw error;
      }
      return;
    }
    
    // 为每个域名保存Cookie
    for (const domain of activeProfile.domains) {
      // 如果是通配符域名（如 *.example.com），需要获取所有匹配的Cookie
      if (domain.startsWith('*.')) {
        const baseDomain = domain.substring(2);
        try {
          // 获取基础域名及其所有子域名的Cookie
          const allCookies = await chrome.cookies.getAll({});
          const matchedCookies = allCookies.filter(cookie => {
            const cookieDomain = cookie.domain.startsWith('.') 
              ? cookie.domain.substring(1) 
              : cookie.domain;
            return cookieDomain === baseDomain || cookieDomain.endsWith('.' + baseDomain);
          });
          
          const cookieData = await getCookieData();
          if (!cookieData[activeProfile.id]) {
            cookieData[activeProfile.id] = {};
          }
          
          // 按实际域名分组保存
          for (const cookie of matchedCookies) {
            const cookieDomain = cookie.domain.startsWith('.') 
              ? cookie.domain.substring(1) 
              : cookie.domain;
            if (!cookieData[activeProfile.id][cookieDomain]) {
              cookieData[activeProfile.id][cookieDomain] = [];
            }
            cookieData[activeProfile.id][cookieDomain].push({
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path,
              secure: cookie.secure,
              httpOnly: cookie.httpOnly,
              sameSite: cookie.sameSite,
              expirationDate: cookie.expirationDate,
              storeId: cookie.storeId
            });
          }
          await saveCookieData(cookieData);
        } catch (error) {
          console.error(`保存通配符域名 ${domain} 的Cookie失败:`, error);
        }
      } else {
        await saveCookies(activeProfile.id, domain);
      }
    }
  }

  /**
   * 恢复指定配置的Cookie
   * @param {string} profileId - 配置ID
   * @returns {Promise<void>}
   */
  async function loadCookies(profileId) {
    try {
      const cookieData = await getCookieData();
      const profileCookies = cookieData[profileId];
      
      if (!profileCookies) {
        return;
      }
      
      // 遍历所有域名的Cookie并恢复
      for (const [domain, cookies] of Object.entries(profileCookies)) {
        if (!Array.isArray(cookies)) continue;
        
        for (const cookie of cookies) {
          try {
            // 构建Cookie设置参数
            const cookieDetails = {
              url: `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path || '/'}`,
              name: cookie.name,
              value: cookie.value,
              path: cookie.path || '/',
              secure: cookie.secure || false,
              httpOnly: cookie.httpOnly || false,
              sameSite: cookie.sameSite || 'no_restriction'
            };
            
            // 如果有过期时间，添加过期时间
            if (cookie.expirationDate) {
              cookieDetails.expirationDate = cookie.expirationDate;
            }
            
            // 注意：httpOnly的Cookie无法通过JavaScript设置，需要特殊处理
            // 这里尝试设置，如果失败会捕获错误
            await chrome.cookies.set(cookieDetails);
          } catch (error) {
            // 某些Cookie可能无法设置（如httpOnly），记录但不中断流程
            console.warn(`无法设置Cookie ${cookie.name}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('恢复Cookie失败:', error);
      throw error;
    }
  }

  /**
   * 清空所有Cookie
   * @param {string[]} excludeDomains - 排除的域名列表（可选）
   * @returns {Promise<void>}
   */
  async function clearAllCookies(excludeDomains = []) {
    try {
      // 获取所有Cookie
      const allCookies = await chrome.cookies.getAll({});
      
      // 删除每个Cookie
      for (const cookie of allCookies) {
        // 如果域名在排除列表中，跳过
        if (excludeDomains.some(domain => isDomainMatch(cookie.domain, domain))) {
          continue;
        }
        
        try {
          const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path || '/'}`;
          await chrome.cookies.remove({
            url: url,
            name: cookie.name
          });
        } catch (error) {
          console.warn(`无法删除Cookie ${cookie.name}:`, error);
        }
      }
    } catch (error) {
      console.error('清空Cookie失败:', error);
      throw error;
    }
  }

  /**
   * 清空指定配置的所有Cookie数据
   * @param {string} profileId - 配置ID
   * @returns {Promise<void>}
   */
  async function clearProfileCookies(profileId) {
    const cookieData = await getCookieData();
    if (cookieData[profileId]) {
      delete cookieData[profileId];
      await saveCookieData(cookieData);
    }
  }

  /**
   * 保存单个Cookie到当前激活配置
   * @param {object} cookie - Cookie对象
   * @returns {Promise<void>}
   */
  async function saveCookieToActiveProfile(cookie) {
    const activeProfile = await ConfigManager.getActiveProfile();
    if (!activeProfile) {
      return;
    }
    
    // 检查Cookie是否属于配置的域名列表（如果没有配置域名，则对所有域名生效）
    if (!isCookieInDomains(cookie, activeProfile.domains)) {
      return;
    }
    
    // 获取Cookie的实际域名（用作存储key）
    const cookieDomain = cookie.domain.startsWith('.') 
      ? cookie.domain.substring(1) 
      : cookie.domain;
    
    // 获取当前Cookie数据
    const cookieData = await getCookieData();
    if (!cookieData[activeProfile.id]) {
      cookieData[activeProfile.id] = {};
    }
    if (!cookieData[activeProfile.id][cookieDomain]) {
      cookieData[activeProfile.id][cookieDomain] = [];
    }
    
    // 检查是否已存在同名Cookie，如果存在则更新，否则添加
    const existingIndex = cookieData[activeProfile.id][cookieDomain].findIndex(
      c => c.name === cookie.name && c.path === cookie.path
    );
    
    const cookieToSave = {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      expirationDate: cookie.expirationDate,
      storeId: cookie.storeId
    };
    
    if (existingIndex >= 0) {
      cookieData[activeProfile.id][cookieDomain][existingIndex] = cookieToSave;
    } else {
      cookieData[activeProfile.id][cookieDomain].push(cookieToSave);
    }
    
    await saveCookieData(cookieData);
  }

  // 导出到全局对象
  global.CookieManager = {
    saveCookies,
    saveCurrentProfileCookies,
    loadCookies,
    clearAllCookies,
    clearProfileCookies,
    saveCookieToActiveProfile
  };
})(this);

