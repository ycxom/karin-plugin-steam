// apps/tasks.js
import { logger } from 'node-karin';
import schedule from 'node-schedule';
import fs from 'fs';
import path from 'path';
import { Config, dirPath } from '../lib/config.js';
import { startMonitoring } from '../lib/monitor/monitorSteamStatus.js';
import { startInventoryMonitoring } from '../lib/monitor/monitorInventory.js';
import { initAppList, scheduleDailyUpdate } from '../lib/main/SteamInventory.js';
import { scheduleXXHUpdate } from '../lib/common/xxhFree.js';
import { debuglog } from '../lib/debuglog.js';

/**
 * 插件加载时执行所有初始化和任务调度
 */
async function initializePluginTasks() {
    logger.info('[Karin-plugin-steam] 开始执行所有后台任务初始化...');

    // 1. 启动状态播报监控 (如果配置中开启)
    if (Config.steamBroadcastEnabled) {
        debuglog('[Tasks] 状态播报功能已启用，正在启动状态监控...');
        startMonitoring();
    } else {
        debuglog('[Tasks] 状态播报功能未全局启用，跳过启动。');
    }

    // 2. 启动库存播报监控 (如果配置中开启)
    if (Config.inventoryMonitorEnabled) {
        debuglog('[Tasks] 库存监控功能已启用，正在启动库存监控任务...');
        startInventoryMonitoring();
    } else {
        debuglog('[Tasks] 库存监控功能未全局启用，跳过启动。');
    }

    // 3. 启动“喜加一”自动播报任务
    scheduleXXHUpdate();

    // 4. 初始化游戏列表并启动每日定时更新
    try {
        await initAppList();
        logger.log('[Tasks] 游戏列表缓存初始化成功。');
        scheduleDailyUpdate(); // 此函数内部已包含定时逻辑
    } catch (err) {
        logger.error(`[Tasks] 游戏列表初始化或任务安排失败: ${err.message}`);
    }

    // 5. 首次执行缓存清理并启动每日定时清理任务
    cleanupImageCache();
    scheduleCacheCleanup();

    logger.info('[Karin-plugin-steam] 所有后台任务均已启动或计划。');
}

/**
 * 清理过期的图片缓存文件
 */
function cleanupImageCache() {
    const imageCacheDir = path.resolve(dirPath, 'data', 'image_cache');
    const maxAgeInDays = 3;
    const now = Date.now();
    const maxAgeInMs = maxAgeInDays * 24 * 60 * 60 * 1000;

    logger.info('[ImageCache] 开始执行缓存清理任务...');

    if (!fs.existsSync(imageCacheDir)) {
        logger.info('[ImageCache] 缓存目录不存在，跳过本次清理。');
        return;
    }

    try {
        const files = fs.readdirSync(imageCacheDir);
        let deletedCount = 0;
        files.forEach(file => {
            const filePath = path.join(imageCacheDir, file);
            try {
                const stats = fs.statSync(filePath);
                if (now - stats.atimeMs > maxAgeInMs) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            } catch (e) {
                logger.error(`[ImageCache] 处理文件时出错: ${filePath}`, e);
            }
        });

        if (deletedCount > 0) {
            logger.mark(`[ImageCache] 清理任务完成，共删除了 ${deletedCount} 个过期文件。`);
        } else {
            logger.info('[ImageCache] 清理任务完成，没有需要删除的过期文件。');
        }
    } catch (e) {
        logger.error('[ImageCache] 读取缓存目录时发生错误:', e);
    }
}

/**
 * 启动定时任务来清理缓存
 */
function scheduleCacheCleanup() {
    schedule.scheduleJob('0 4 * * *', cleanupImageCache);
    logger.info('[ImageCache] 图片缓存自动清理任务已计划在每天凌晨4点运行。');
}

// 统一执行所有初始化和任务调度
initializePluginTasks();