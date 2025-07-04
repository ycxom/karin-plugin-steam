// lib/monitor/monitorInventory.js
import { segment, logger, karin } from 'node-karin';
import { Config } from '../config.js';
import {
    getAllGroupBindings,
    readInventoryCache,
    writeInventoryCache,
    getAllSteamIdsWithInventoryMonitoringEnabled,
    getUserAllGroupsInventoryBroadcast,
    getUserGroupInventoryBroadcast
} from '../db/databaseOps.js';
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
        if (!usersToMonitor || usersToMonitor.length === 0) {
            debuglog('[库存监控] 没有启用库存监控的用户，跳过。');
            return;
        }

        const allNewGamesBySteamId = new Map();
        const allNewAppIds = new Set();
        const steamIdToOwnerMap = new Map();

        for (const user of usersToMonitor) {
            const { steam_id, qq_id, alias } = user;
            if (!steamIdToOwnerMap.has(steam_id)) {
                steamIdToOwnerMap.set(steam_id, []);
            }
            steamIdToOwnerMap.get(steam_id).push({ qqId: qq_id, alias: alias });

            const newGameAppIds = await checkUserInventory(steam_id);
            if (newGameAppIds && newGameAppIds.length > 0) {
                if (!allNewGamesBySteamId.has(steam_id)) {
                    allNewGamesBySteamId.set(steam_id, new Set());
                }
                newGameAppIds.forEach(appId => {
                    allNewGamesBySteamId.get(steam_id).add(appId);
                    allNewAppIds.add(appId);
                });
            }
        }

        if (allNewAppIds.size === 0) {
            debuglog('[库存监控] 未发现新游戏，跳过。');
            return;
        }

        debuglog(`[库存监控] 共发现 ${allNewAppIds.size} 款新游戏，开始获取详情...`);
        const gameDetailsCache = {};
        const detailPromises = Array.from(allNewAppIds).map(async (appId) => {
            const details = await fetchGameDetails(appId);
            if (details) gameDetailsCache[appId] = details;
        });
        await Promise.allSettled(detailPromises);

        const priceDetailsCache = await fetchStoreItemDetails(Array.from(allNewAppIds), {
            include_all_purchase_options: true
        });

        for (const appIdStr in gameDetailsCache) {
            const appId = parseInt(appIdStr, 10);
            const priceInfo = priceDetailsCache[appId];
            if (priceInfo && priceInfo.best_purchase_option) {
                gameDetailsCache[appId].price_overview = { ...priceInfo.best_purchase_option };
            }
        }

        const allBindings = await getAllGroupBindings();
        const groupToSteamMap = new Map();
        for (const binding of allBindings) {
            if (!groupToSteamMap.has(binding.group_id)) {
                groupToSteamMap.set(binding.group_id, []);
            }
            groupToSteamMap.get(binding.group_id).push(binding.steam_id);
        }

        for (const [steamId, newAppIdsSet] of allNewGamesBySteamId.entries()) {
            const owners = steamIdToOwnerMap.get(steamId) || [];
            if (owners.length === 0) continue;

            const fullNewGamesDetails = Array.from(newAppIdsSet).map(appid => gameDetailsCache[appid]).filter(Boolean);
            if (fullNewGamesDetails.length === 0) continue;

            for (const owner of owners) {
                const { qqId, alias } = owner;
                const allGroupsInventoryEnabled = await getUserAllGroupsInventoryBroadcast(qqId, alias);
                if (!allGroupsInventoryEnabled) {
                    logger.mark(`[库存监控] 用户 ${qqId} (${alias}) 关闭了所有群的库存播报，跳过。`);
                    continue;
                }

                const imageBase64 = await generateInventoryUpdateImage(steamId, fullNewGamesDetails);
                if (!imageBase64) continue;

                for (const [groupId, steamIdsInGroup] of groupToSteamMap.entries()) {
                    if (steamIdsInGroup.includes(steamId)) {
                        const aliasSpecificBroadcast = await getUserGroupInventoryBroadcast(qqId, groupId, alias);
                        const globalBroadcast = await getUserGroupInventoryBroadcast(qqId, groupId, 'global');

                        if (aliasSpecificBroadcast && globalBroadcast) {
                            logger.mark(`[库存监控] 用户 ${steamId} (${alias}) 有新游戏, 准备发往群聊: ${groupId}`);
                            const message = [segment.text(`📢 有人偷偷买游戏啦！(${alias})`), segment.image(`base64://${imageBase64}`)];
                            await karin.sendMsg(Config.qq || karin.getAllBotID()[0], karin.contactGroup(groupId), message);
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

        if (newAppIds.length > 0) {
            await writeInventoryCache(steamId, currentAppIds);
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
