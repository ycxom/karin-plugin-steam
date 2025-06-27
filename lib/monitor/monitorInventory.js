// lib/monitor/monitorInventory.js
import { segment, logger, karin } from 'node-karin';
import { Config } from '../config.js';
import { getAllGroupBindings, readInventoryCache, writeInventoryCache, getAllSteamIdsWithInventoryMonitoringEnabled, getQQBySteamId, getUserAllGroupsInventoryBroadcast, getUserGroupInventoryBroadcast } from '../db/databaseOps.js';
import { fetchSteamLibrary } from '../main/SteamInventory.js';
import { generateInventoryUpdateImage } from '../common/generateSteamUI.js';
import { fetchGameDetails, fetchStoreItemDetails } from '../main/fetchSteamStatus.js';
import { debuglog } from '../debuglog.js';

let inventoryMonitorTimeoutId = null;
let isInventoryMonitoring = false;

async function monitorInventories() {
    debuglog('[库存监控] 开始执行一轮库存监控...');
    try {
        const usersToMonitor = await getAllSteamIdsWithInventoryMonitoringEnabled();
        if (!usersToMonitor || usersToMonitor.length === 0) return;

        const steamToGroupMap = new Map();
        const allBindings = await getAllGroupBindings();
        for (const binding of allBindings) {
            if (!steamToGroupMap.has(binding.steam_id)) {
                steamToGroupMap.set(binding.steam_id, []);
            }
            steamToGroupMap.get(binding.steam_id).push(binding.group_id);
        }

        const allNewGamesBySteamId = new Map();
        const allNewAppIds = new Set();

        for (const steamId of usersToMonitor) {
            const newGameAppIds = await checkUserInventory(steamId);
            if (newGameAppIds && newGameAppIds.length > 0) {
                allNewGamesBySteamId.set(steamId, newGameAppIds);
                newGameAppIds.forEach(appid => allNewAppIds.add(appid));
            }
        }

        if (allNewAppIds.size === 0) return;

        debuglog(`[库存监控] 共发现 ${allNewAppIds.size} 款新游戏，开始获取详情...`);
        const gameDetailsCache = {};

        const detailPromises = Array.from(allNewAppIds).map(async (appId) => {
            const details = await fetchGameDetails(appId);
            if (details) {
                gameDetailsCache[appId] = details;
            }
        });
        await Promise.allSettled(detailPromises);
        debuglog(`[库存监控] 已获取 ${Object.keys(gameDetailsCache).length} 款游戏的基础详情。`);

        const priceDetailsCache = await fetchStoreItemDetails(Array.from(allNewAppIds), {
            include_all_purchase_options: true
        });
        debuglog(`[库存监控] 已获取 ${Object.keys(priceDetailsCache).length} 款游戏的价格信息。`);

        for (const appIdStr in gameDetailsCache) {
            const appId = parseInt(appIdStr, 10);
            const priceInfo = priceDetailsCache[appId];
            if (priceInfo && priceInfo.best_purchase_option) {
                const purchaseOption = priceInfo.best_purchase_option;
                gameDetailsCache[appId].price_overview = {
                    final_formatted: purchaseOption.formatted_final_price,
                    initial_formatted: purchaseOption.formatted_original_price,
                    discount_percent: purchaseOption.discount_pct,
                    ...purchaseOption
                };
            }
        }
        debuglog(`[库存监控] 已将价格信息正确映射并合并到游戏详情中。`);

        for (const [steamId, newAppIds] of allNewGamesBySteamId.entries()) {
            const fullNewGamesDetails = newAppIds
                .map(appid => gameDetailsCache[appid])
                .filter(Boolean);

            if (fullNewGamesDetails.length > 0) {
                const qqId = await getQQBySteamId(steamId);
                if (!qqId) continue;

                const allGroupsInventoryEnabled = await getUserAllGroupsInventoryBroadcast(qqId);
                if (!allGroupsInventoryEnabled) {
                    logger.mark(`[库存监控] 用户 ${qqId} (${steamId}) 关闭了所有群的库存播报，跳过。`);
                    continue;
                }

                const groupsToNotify = steamToGroupMap.get(steamId) || [];
                if (groupsToNotify.length > 0) {
                    logger.mark(`[库存监控] 用户 ${steamId} 有新游戏, 准备发往群聊: ${groupsToNotify.join(', ')}`);
                    const imageBase64 = await generateInventoryUpdateImage(steamId, fullNewGamesDetails);
                    if (imageBase64) {
                        const message = [segment.text("📢有人偷偷买游戏啦！"), segment.image(`base64://${imageBase64}`)];
                        for (const groupId of groupsToNotify) {
                            if (await getUserGroupInventoryBroadcast(qqId, groupId)) {
                                await karin.sendMsg(Config.qq || karin.getAllBotID()[1], karin.contactGroup(groupId), message);
                                logger.mark(`[库存监控] 已向群聊 ${groupId} 发送 ${steamId} 的库存更新通知。`);
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        logger.error('[库存监控] 任务执行期间发生严重错误:', error);
    } finally {
        if (isInventoryMonitoring) {
            inventoryMonitorTimeoutId = setTimeout(monitorInventories, Config.inventoryMonitorInterval || 3600000);
        }
    }
}
/**
 * 检查单个用户的库存变化
 * @param {string} steamId
 * @returns {Promise<Array<string>|null>} 新增游戏的AppID数组
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
            return newAppIds;
        }
        return null;

    } catch (error) {
        logger.error(`[库存监控] 检查用户 ${steamId} 库存时出错:`, error);
        return null;
    }
}

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
