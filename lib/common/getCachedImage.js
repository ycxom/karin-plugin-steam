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

// 确保缓存目录存在
if (!fs.existsSync(imageCacheDir)) {
    fs.mkdirSync(imageCacheDir, { recursive: true });
}

/**
 * 根据缓存键获取或下载并缓存图片
 * @param {string} url 图片的URL
 * @param {string} cacheKey 唯一的缓存键 (例如, avatarhash, communityitemid)
 * @returns {Promise<string>} Base64 Data URI
 */
export async function getCachedImageAsBase64(url, cacheKey) {
    if (!url || !cacheKey) {
        return '';
    }

    const hash = crypto.createHash('sha1').update(cacheKey).digest('hex');
    // 尝试从URL中提取有效的文件扩展名，如果失败则默认为.png
    let fileExtension;
    try {
        fileExtension = path.extname(new URL(url).pathname) || '.png';
        if (fileExtension.length > 5) fileExtension = '.png'; // 防止过长的无效扩展名
    } catch {
        fileExtension = '.png';
    }
    const cacheFilePath = path.join(imageCacheDir, `${hash}${fileExtension}`);

    // 1. 检查本地缓存
    if (fs.existsSync(cacheFilePath)) {
        try {
            const fileBuffer = fs.readFileSync(cacheFilePath);
            const mimeType = `image/${fileExtension.slice(1)}`;

            // **核心改动：更新文件的访问和修改时间**
            const now = new Date();
            fs.utimesSync(cacheFilePath, now, now);

            debuglog(`[ImageCache] 成功从缓存读取: ${cacheKey}`);
            return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
        } catch (error) {
            logger.warn(`[ImageCache] 读取缓存文件 ${cacheFilePath} 失败:`, error);
        }
    }

    // 2. 无缓存，则下载并保存
    try {
        const proxy = Config.proxy || '';
        const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            httpsAgent: agent,
            timeout: 15000
        });

        fs.writeFileSync(cacheFilePath, response.data);
        debuglog(`[ImageCache] 成功下载并缓存: ${cacheKey}`);

        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        const mimeType = response.headers['content-type'] || 'image/jpeg';
        return `data:${mimeType};base64,${base64}`;
    } catch (error) {
        logger.warn(`[ImageCache] 下载或保存图片失败: ${url}`, error.message);
        return '';
    }
}