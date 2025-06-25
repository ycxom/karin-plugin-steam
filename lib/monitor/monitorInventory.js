import { segment, logger, karin } from 'node-karin';
import { Config } from '../config.js';
import { getAllGroupBindings, readInventoryCache, writeInventoryCache, getAllSteamIdsWithInventoryMonitoringEnabled } from '../db/databaseOps.js';
import { fetchSteamLibrary } from '../main/SteamInventory.js';
import { generateInventoryUpdateImage } from '../common/generateSteamUI.js';
import { fetchGameDetails } from '../main/fetchSteamStatus.js';
import { debuglog } from '../debuglog.js';

let inventoryMonitorTimeoutId = null;
let isInventoryMonitoring = false;

/**
 * 主监控任务 (已修复)
 */
async function monitorInventories() {
    debuglog('[库存监控] 开始执行一轮库存监控...');
    try {
        const usersToMonitor = await getAllSteamIdsWithInventoryMonitoringEnabled();
        if (!usersToMonitor || usersToMonitor.length === 0) {
            debuglog('[库存监控] 没有需要监控的用户。');
            return;
        }
        debuglog(`[库存监控] 本轮需要监控 ${usersToMonitor.length} 个用户。`);

        // 2. 使用新函数来构建 steamId -> 群聊列表的映射
        const steamToGroupMap = new Map();
        const allBindings = await getAllGroupBindings();
        for (const binding of allBindings) {
            if (!steamToGroupMap.has(binding.steam_id)) {
                steamToGroupMap.set(binding.steam_id, []);
            }
            steamToGroupMap.get(binding.steam_id).push(binding.group_id);
        }
        debuglog(`[库存监控] 已加载 ${allBindings.length} 条群聊绑定关系。`);

        const allNewGamesBySteamId = new Map();
        const allNewAppIds = new Set();

        // 检查所有用户的库存，收集新游戏AppId
        for (const steamId of usersToMonitor) {
            const newGamesDetailsStubs = await checkUserInventory(steamId);
            if (newGamesDetailsStubs && newGamesDetailsStubs.length > 0) {
                allNewGamesBySteamId.set(steamId, newGamesDetailsStubs);
                newGamesDetailsStubs.forEach(game => allNewAppIds.add(game.appid));
            }
        }

        if (allNewAppIds.size === 0) {
            debuglog('[库存监控] 本轮没有发现任何新增游戏。');
            return;
        }

        // 统一获取所有新游戏的详情
        debuglog(`[库存监控] 共发现 ${allNewAppIds.size} 款新游戏，开始获取详情...`);
        const gameDetailsCache = new Map();
        const detailPromises = Array.from(allNewAppIds).map(async (appId) => {
            const details = await fetchGameDetails(appId);
            if (details) gameDetailsCache.set(String(appId), details);
        });
        await Promise.allSettled(detailPromises);
        debuglog(`[库存监控] 已成功获取 ${gameDetailsCache.size} 款新游戏的详情。`);

        // 为每个用户生成并发送通知
        for (const [steamId, games] of allNewGamesBySteamId.entries()) {
            const fullNewGamesDetails = games
                .map(game => gameDetailsCache.get(String(game.appid)))
                .filter(Boolean);

            if (fullNewGamesDetails.length > 0) {
                // 3. 此处现在可以正确获取到需要通知的群聊列表
                const groupsToNotify = steamToGroupMap.get(steamId) || [];
                if (groupsToNotify.length > 0) {
                    logger.mark(`[库存监控] 用户 ${steamId} 有新游戏, 准备发往群聊: ${groupsToNotify.join(', ')}`);
                    const imageBase64 = await generateInventoryUpdateImage(steamId, fullNewGamesDetails);
                    if (imageBase64) {
                        const message = [segment.text("📢有人偷偷买游戏啦！"), segment.image(`base64://${imageBase64}`)];
                        for (const groupId of groupsToNotify) {
                            await karin.sendMsg(Config.qq || karin.getAllBotID()[1], karin.contactGroup(groupId), message);
                            logger.mark(`[库存监控] 已向群聊 ${groupId} 发送 ${steamId} 的库存更新通知。`);
                        }
                    }
                } else {
                    // 为保险起见，保留日志，但理论上不应再触发
                    logger.warn(`[库存监控] 用户 ${steamId} 有新游戏, 但未在任何群聊绑定中找到他。`);
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


/**
 * 检查单个用户的库存变化
 * @param {string} steamId
 * @returns {Promise<Array<{appid: string}>|null>}
 */
async function checkUserInventory(steamId) {
    try {
        const [previousAppIds, currentGames] = await Promise.all([
            readInventoryCache(steamId),
            fetchSteamLibrary(steamId)
        ]);

        if (!currentGames || currentGames.length === 0) return null;

        const currentAppIds = currentGames.map(game => String(game.appid));

        if (previousAppIds.length === 0) {
            await writeInventoryCache(steamId, currentAppIds);
            return null;
        }

        const previousAppIdSet = new Set(previousAppIds);
        const newAppIds = currentAppIds.filter(id => !previousAppIdSet.has(id));

        await writeInventoryCache(steamId, currentAppIds);

        if (newAppIds.length > 0) {
            logger.mark(`[库存监控] 用户 ${steamId} 新增 ${newAppIds.length} 款游戏。`);
            return newAppIds.map(id => ({ appid: id }));
        }
        return null;

    } catch (error) {
        logger.error(`[库存监控] 检查用户 ${steamId} 库存时出错:`, error);
        return null;
    }
}

// 启动和停止函数
export function startInventoryMonitoring() {
    if (isInventoryMonitoring) return;
    isInventoryMonitoring = true;
    const interval = Config.inventoryMonitorInterval || 3600000;
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