import axios from 'axios';
import { logger } from 'node-karin';
import pkg from 'https-proxy-agent';
import { Config } from '../config.js';
import { debuglog } from '../debuglog.js';

const { HttpsProxyAgent } = pkg;

class ApiKeyManager {
    constructor(keys) {
        // 过滤掉无效的空Key
        this.keys = (keys || []).filter(key => typeof key === 'string' && key.length > 0);
        this.currentIndex = 0;
        if (this.keys.length === 0) {
            logger.info('配置中未找到有效的Steam API Key，依赖API的查询将失败。');
        } else {
            logger.info(`已加载 ${this.keys.length} 个Steam API Key。`);
        }
    }

    /**
     * 循环获取一个API Key
     * @returns {string|null}
     */
    getKey() {
        if (this.keys.length === 0) return null;
        const key = this.keys[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        return key;
    }

    /**
     * 获取所有可用的Keys，用于重试
     * @returns {string[]}
     */
    getAllKeys() {
        // 返回从当前位置开始的循环队列，确保优先使用下一个Key
        const rotatedKeys = [...this.keys.slice(this.currentIndex), ...this.keys.slice(0, this.currentIndex)];
        return rotatedKeys;
    }
}

// 创建一个全局单例
const apiKeyManager = new ApiKeyManager(Config.steamApiKeys);

/**
 * 创建一个弹性的、可自动切换Key的Steam API请求函数
 * @param {function(string): string} urlBuilder 一个接收API Key并返回完整URL的函数
 * @returns {Promise<object|null>} 成功时返回响应的 data 对象，全部失败则返回 null
 */
export async function makeResilientSteamApiRequest(urlBuilder) {
    const proxy = Config.proxy || '';
    const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
    const keysToTry = apiKeyManager.getAllKeys();

    if (keysToTry.length === 0) {
        logger.error('[API Key Manager] 没有任何可用的API Key，请求无法发出。');
        return null;
    }

    debuglog(`[API Key Manager] 准备使用 ${keysToTry.length} 个Key进行弹性请求。`);

    for (const key of keysToTry) {
        const url = urlBuilder(key);
        // 为了安全，日志中不完整显示URL
        const sanitizedUrl = url.replace(/key=[^&]*/, 'key=*****');
        debuglog(`[API Key Manager] 正在尝试使用Key...${key.slice(-4)} 请求URL: ${sanitizedUrl}`);

        try {
            const response = await axios.get(url, {
                timeout: 30000,
                httpsAgent: agent
            });
            debuglog(`[API Key Manager] 使用Key...${key.slice(-4)} 成功请求，状态码: ${response.status}`);
            return response.data;
        } catch (error) {
            // **新增更详细的错误日志**
            if (error.response) {
                // 请求已发出，但服务器以非 2xx 状态码响应
                logger.warn(`[API Key Manager] 使用Key...${key.slice(-4)} 请求失败，状态码: ${error.response.status}，URL: ${sanitizedUrl}`);
                debuglog('[API Key Manager] 错误响应数据:', error.response.data);
            } else if (error.request) {
                // 请求已发出，但没有收到响应
                logger.warn(`[API Key Manager] 使用Key...${key.slice(-4)} 请求未收到响应，URL: ${sanitizedUrl}`, error.message);
            } else {
                // 准备请求时发生错误
                logger.error(`[API Key Manager] 设置请求时发生错误，URL: ${sanitizedUrl}`, error.message);
            }

            if (error.response && error.response.status === 429) {
                debuglog(`Key...${key.slice(-4)} 已达到请求上限 (429)，自动尝试下一个Key...`);
            }
        }
    }

    logger.warn(`[API Key Manager] 所有 ${keysToTry.length} 个API Key均请求失败，本次操作将忽略。`);
    return null;
}