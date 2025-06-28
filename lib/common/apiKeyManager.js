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
        logger.error('没有任何可用的API Key。');
        return null;
    }

    for (const key of keysToTry) {
        const url = urlBuilder(key);
        try {
            const response = await axios.get(url, {
                timeout: 30000,
                httpsAgent: agent
            });
            // 请求成功，直接返回数据
            debuglog(`使用Key...${key.slice(-4)} 成功请求 ${url}`);
            return response.data;
        } catch (error) {
            if (error.response && error.response.status === 429) {
                debuglog(`Key...${key.slice(-4)} 已达到请求上限 (429)，自动尝试下一个Key...`);
            } else {
                debuglog(`使用Key...${key.slice(-4)} 请求失败: ${error.message}`);
            }
        }
    }

    debuglog(`所有 ${keysToTry.length} 个API Key均请求失败，本次操作将忽略。`);
    return null; // 所有Key都失败后，返回null
}