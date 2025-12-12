/**
 * 存储工具模块
 * 封装chrome.storage.local操作
 */

/**
 * 获取存储数据
 * @param {string|string[]|object} keys - 要获取的键名
 * @returns {Promise<object>} 存储的数据
 */
export async function getStorage(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * 设置存储数据
 * @param {object} items - 要存储的数据对象
 * @returns {Promise<void>}
 */
export async function setStorage(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * 删除存储数据
 * @param {string|string[]} keys - 要删除的键名
 * @returns {Promise<void>}
 */
export async function removeStorage(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * 清空所有存储数据
 * @returns {Promise<void>}
 */
export async function clearStorage() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.clear(() => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * 获取所有存储数据
 * @returns {Promise<object>} 所有存储的数据
 */
export async function getAllStorage() {
  return getStorage(null);
}

