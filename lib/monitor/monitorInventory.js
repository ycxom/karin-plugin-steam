import { segment, logger, karin } from 'node-karin';
import { Config } from '../config.js';
import { getAllEnabledGroups, getSteamIdsInGroup, readInventoryCache, writeInventoryCache, getAllSteamIdsWithInventoryMonitoringEnabled } from '../main/databaseOps.js';
import { fetchSteamLibrary, appListCache } from '../main/SteamInventory.js';
import { generateInventoryUpdateImage } from '../common/generateSteamUI.js';
import { fetchGameDetails } from '../main/fetchSteamStatus.js';

let inventoryMonitorTimeoutId = null;
let isInventoryMonitoring = false;

/**
 * 检查单个用户的库存变化
 * @param {string} steamId
 * @returns {Promise<object[]|null>} 如果有新增游戏，则返回包含【游戏详细信息】的对象数组
 */
async function checkUserInventory(steamId) {
    try {
        const [previousAppIds, currentGames] = await Promise.all([
            readInventoryCache(steamId),
            fetchSteamLibrary(steamId)
        ]);

        if (!currentGames || currentGames.length === 0) return null;

        const currentAppIds = currentGames.map(game => String(game.appid));
        let newGamesDetails = null;

        if (previousAppIds.length === 0) {
            logger.log(`[库存监控] 首次初始化用户 ${steamId} 的库存快照...`);
        } else {
            const previousAppIdSet = new Set(previousAppIds);
            const newAppIds = currentAppIds.filter(id => !previousAppIdSet.has(id));

            if (newAppIds.length > 0) {
                logger.mark(`[库存监控] 用户 ${steamId} 新增 ${newAppIds.length} 款游戏，开始获取详情...`);
                // ✅ 并发获取所有新增游戏的详细信息
                const detailPromises = newAppIds.map(id => fetchGameDetails(id));
                // 使用 Promise.allSettled 确保即使部分游戏详情获取失败，也不会中断整个流程
                const results = await Promise.allSettled(detailPromises);

                newGamesDetails = results
                    .filter(result => result.status === 'fulfilled' && result.value)
                    .map(result => result.value);
            }
        }

        await writeInventoryCache(steamId, currentAppIds);
        return newGamesDetails;

    } catch (error) {
        logger.error(`[库存监控] 检查用户 ${steamId} 库存时出错:`, error);
        return null;
    }
}

/**
 * 主监控任务
 */
async function monitorInventories() {
    logger.debug('[库存监控] 开始执行一轮库存监控...');
    try {
        const usersToMonitor = await getAllSteamIdsWithInventoryMonitoringEnabled();
        if (!usersToMonitor || usersToMonitor.length === 0) {
            logger.debug('[库存监控] 没有需要监控的用户。');
            return;
        }
        logger.debug(`[库存监控] 本轮需要监控 ${usersToMonitor.length} 个用户。`);

        const enabledGroups = await getAllEnabledGroups();
        const steamToGroupMap = new Map();
        for (const groupId of enabledGroups) {
            const steamIdsInGroup = await getSteamIdsInGroup(groupId);
            for (const steamId of steamIdsInGroup) {
                if (!steamToGroupMap.has(steamId)) {
                    steamToGroupMap.set(steamId, []);
                }
                steamToGroupMap.get(steamId).push(groupId);
            }
        }

        for (const steamId of usersToMonitor) {
            const newGameNames = await checkUserInventory(steamId);

            if (newGameNames && newGameNames.length > 0) {
                const groupsToNotify = steamToGroupMap.get(steamId) || [];
                if (groupsToNotify.length > 0) {

                    logger.mark(`[库存监控] 用户 ${steamId} 有新的库存项目，开始生成通知图片...`);
                    const imageBase64 = await generateInventoryUpdateImage(steamId, newGameNames);

                    if (imageBase64) {
                        const message = [
                            segment.text("📢有人偷偷买游戏啦！"),
                            segment.image(`base64://${imageBase64}`)
                        ];

                        for (const groupId of groupsToNotify) {
                            await karin.sendMsg(Config.qq || karin.getAllBotID()[1], karin.contactGroup(groupId), message);
                            logger.mark(`[库存监控] 已向群聊 ${groupId} 发送 ${steamId} 的库存更新通知图。`);
                        }
                    } else {
                        logger.error(`[库存监控] 用户 ${steamId} 的通知图片生成失败，跳过本次发送。`);
                    }
                }
            }
        }

    } catch (error) {
        logger.error('[库存监控] 任务执行期间发生严重错误:', error);
    } finally {
        if (isInventoryMonitoring) {
            const interval = Config.inventoryMonitorInterval || 3600000;
            inventoryMonitorTimeoutId = setTimeout(monitorInventories, interval);
        }
    }
}


// 启动和停止函数
export function startInventoryMonitoring() {
    if (isInventoryMonitoring) return;
    isInventoryMonitoring = true;
    const interval = Config.inventoryMonitorInterval || 3600000; // 默认1小时
    logger.log(`[库存监控] 启动库存监控任务，任务间隔：${interval / 1000 / 60} 分钟。`);
    monitorInventories();
}

export function stopInventoryMonitoring() {
    if (inventoryMonitorTimeoutId) {
        clearTimeout(inventoryMonitorTimeoutId);
        inventoryMonitorTimeoutId = null;
    }
    isInventoryMonitoring = false;
    logger.log('[库存监控] 库存监控任务已停止。');
}

export function restartInventoryMonitoring() {
    logger.mark('[restartInventoryMonitoring] 检测到配置变更，正在重启监控任务...');
    stopInventoryMonitoring();
    setTimeout(startInventoryMonitoring, 500);
}