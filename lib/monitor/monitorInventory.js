// lib/monitor/monitorInventory.js
import { segment, logger, karin } from 'node-karin';
import { Config } from '../config.js';
import { getAllGroupBindings, readInventoryCache, writeInventoryCache, getAllSteamIdsWithInventoryMonitoringEnabled, getQQBySteamId, getUserAllGroupsInventoryBroadcast, getUserGroupInventoryBroadcast } from '../db/databaseOps.js';
import { fetchSteamLibrary } from '../main/SteamInventory.js';
import { generateInventoryUpdateImage } from '../common/generateSteamUI.js';
import { fetchGameDetails, fetchStoreItemDetails } from '../main/fetchSteamStatus.js'; // 引入两个API
import { debuglog } from '../debuglog.js';

let inventoryMonitorTimeoutId = null;
let isInventoryMonitoring = false;

async function monitorInventories() {
    debuglog('[库存监控] 开始执行一轮库存监控...');
    try {
        const usersToMonitor = await getAllSteamIdsWithInventoryMonitoringEnabled();
        if (!usersToMonitor || usersToMonitor.length === 0) {
            debuglog('[库存监控] 没有需要监控的用户。');
            return;
        }
        debuglog(`[库存监控] 本轮需要监控 ${usersToMonitor.length} 个用户。`);

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

        for (const steamId of usersToMonitor) {
            const newGameAppIds = await checkUserInventory(steamId);
            if (newGameAppIds && newGameAppIds.length > 0) {
                allNewGamesBySteamId.set(steamId, newGameAppIds);
                newGameAppIds.forEach(appid => allNewAppIds.add(appid));
            }
        }

        if (allNewAppIds.size === 0) {
            debuglog('[库存监控] 本轮没有发现任何新增游戏。');
            return;
        }

        // 采用混合模式获取数据
        debuglog(`[库存监控] 共发现 ${allNewAppIds.size} 款新游戏，开始获取详情...`);
        const gameDetailsCache = {};

        // 步骤1: 使用原始API获取基础详情
        const detailPromises = Array.from(allNewAppIds).map(async (appId) => {
            const details = await fetchGameDetails(appId);
            if (details) {
                gameDetailsCache[appId] = details;
            }
        });
        await Promise.allSettled(detailPromises);
        debuglog(`[库存监控] 已获取 ${Object.keys(gameDetailsCache).length} 款游戏的基础详情。`);

        // 步骤2: 使用新API获取价格信息
        debuglog('[库存监控] 开始使用 IStoreBrowseService 获取价格信息...');
        const priceDetailsCache = await fetchStoreItemDetails(Array.from(allNewAppIds), {
            include_all_purchase_options: true
        });
        debuglog(`[库存监控] 已获取 ${Object.keys(priceDetailsCache).length} 款游戏的价格信息。`);

        // 步骤3: 将价格信息合并到基础详情中
        for (const appIdStr in gameDetailsCache) {
            const appId = parseInt(appIdStr, 10);
            const priceInfo = priceDetailsCache[appId];
            if (priceInfo && priceInfo.best_purchase_option) {
                // 直接用新API返回的价格对象替换旧的，因为新数据更全
                gameDetailsCache[appId].price_overview = priceInfo.best_purchase_option;
            }
        }
        debuglog(`[库存监控] 已将价格信息合并到游戏详情中：${JSON.stringify(gameDetailsCache)}`);


        // 后续逻辑保持不变，使用合并后的 gameDetailsCache
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
                            const groupInventoryEnabled = await getUserGroupInventoryBroadcast(qqId, groupId);
                            if (groupInventoryEnabled) {
                                await karin.sendMsg(Config.qq || karin.getAllBotID()[1], karin.contactGroup(groupId), message);
                                logger.mark(`[库存监控] 已向群聊 ${groupId} 发送 ${steamId} 的库存更新通知。`);
                            } else {
                                logger.mark(`[库存监控] 用户 ${qqId} (${steamId}) 关闭了群 ${groupId} 的库存播报，跳过。`);
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
            const interval = Config.inventoryMonitorInterval || 3600000;
            inventoryMonitorTimeoutId = setTimeout(monitorInventories, interval);
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
