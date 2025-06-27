// lib/common/getCachedImage.js
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { logger } from 'node-karin';
import { Config, dirPath } from '../config.js';
import pkg from 'https-proxy-agent';
import { debuglog } from '../debuglog.js';

const { HttpsProxyAgent } = pkg;
const imageCacheDir = path.resolve(dirPath, 'data', 'image_cache');

if (!fs.existsSync(imageCacheDir)) {
    fs.mkdirSync(imageCacheDir, { recursive: true });
}

/**
 * 根据缓存键获取或下载并缓存图片。
 * @param {string|string[]} urls - 一个或多个要尝试的图片URL。函数将按顺序尝试，直到成功。
 * @param {string} cacheKey - 唯一的缓存键，用于存储和检索文件。
 * @returns {Promise<string>} Base64 Data URI 或空字符串
 */
export async function getCachedImageAsBase64(urls, cacheKey) {
    if (!urls || (Array.isArray(urls) && urls.length === 0) || (typeof urls === 'string' && !urls)) {
        return '';
    }

    const urlsToTry = Array.isArray(urls) ? urls.filter(Boolean) : [urls];
    if (urlsToTry.length === 0) return '';

    const primaryUrl = urlsToTry[0];
    if (!primaryUrl || !cacheKey) {
        return '';
    }

    const hash = crypto.createHash('sha1').update(cacheKey).digest('hex');
    let fileExtension;
    try {
        const urlObj = new URL(primaryUrl);
        fileExtension = path.extname(urlObj.pathname) || '.jpg';
        if (fileExtension.length > 10) fileExtension = '.jpg'; // 防止无效扩展名
    } catch {
        fileExtension = '.jpg';
    }
    const cacheFilePath = path.join(imageCacheDir, `${hash}${fileExtension}`);

    if (fs.existsSync(cacheFilePath)) {
        try {
            const fileBuffer = fs.readFileSync(cacheFilePath);
            const mimeType = `image/${fileExtension.slice(1)}`;
            const now = new Date();
            fs.utimesSync(cacheFilePath, now, now);
            debuglog(`[ImageCache] 成功从缓存读取: ${cacheKey}`);
            return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
        } catch (error) {
            logger.warn(`[ImageCache] 读取缓存文件 ${cacheFilePath} 失败:`, error);
        }
    }

    for (const url of urlsToTry) {
        try {
            const proxy = Config.proxy || '';
            const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                httpsAgent: agent,
                timeout: 15000
            });

            fs.writeFileSync(cacheFilePath, response.data);
            debuglog(`[ImageCache] 成功下载并缓存: ${url} (Key: ${cacheKey})`);
            const base64 = Buffer.from(response.data, 'binary').toString('base64');
            const mimeType = response.headers['content-type'] || 'image/jpeg';
            return `data:${mimeType};base64,${base64}`;
        } catch (error) {
            if (error.response?.status !== 404 || url === urlsToTry[urlsToTry.length - 1]) {
                logger.warn(`[ImageCache] 下载或保存图片失败: ${url}`, error.message);
            } else {
                debuglog(`[ImageCache] URL 失败 (404), 尝试下一个回退地址...`);
            }
        }
    }

    return ''; // 所有URL都尝试失败后返回空
}