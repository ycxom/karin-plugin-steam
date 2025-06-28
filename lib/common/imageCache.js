import fs from 'fs';
import path from 'path';
import { logger } from 'node-karin';
import { dirPath } from './lib/config.js';
import { debuglog } from './lib/debuglog.js';

/**
 * 清理过期的图片缓存文件
 */
export function cleanupImageCache() {
    const imageCacheDir = path.resolve(dirPath, 'data', 'image_cache');
    const maxAgeInDays = 3; // 设置最大保留天数
    const now = Date.now();
    const maxAgeInMs = maxAgeInDays * 24 * 60 * 60 * 1000;

    logger.info('[ImageCache] 开始执行缓存清理任务...');

    if (!fs.existsSync(imageCacheDir)) {
        logger.info('[ImageCache] 缓存目录不存在，跳过清理。');
        return;
    }

    try {
        const files = fs.readdirSync(imageCacheDir);
        let deletedCount = 0;

        files.forEach(file => {
            const filePath = path.join(imageCacheDir, file);
            try {
                const stats = fs.statSync(filePath);
                const lastAccessTime = stats.atimeMs; // 使用 atime (最后访问时间)

                if (now - lastAccessTime > maxAgeInMs) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                    debuglog(`[ImageCache] 已删除过期文件: ${file}`);
                }
            } catch (statError) {
                logger.error(`[ImageCache] 获取文件状态或删除文件失败: ${filePath}`, statError);
            }
        });

        if (deletedCount > 0) {
            logger.mark(`[ImageCache] 清理完成，共删除了 ${deletedCount} 个过期缓存文件。`);
        } else {
            logger.info('[ImageCache] 清理完成，没有需要删除的文件。');
        }
    } catch (readDirError) {
        logger.error('[ImageCache] 读取缓存目录失败:', readDirError);
    }
}