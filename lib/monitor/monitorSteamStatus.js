// lib/monitor/monitorSteamStatus.js
import { readAllSteamStatusCache, updateSteamStatusCache, getSteamIdsInGroup, getAllEnabledGroups, getQQBySteamId, getUserAllGroupsBroadcast, getUserGroupBroadcast } from '../db/databaseOps.js';
import { fetchSteamStatus, fetchSteamStatusXML, fetchPlayersSummariesAPI } from '../main/fetchSteamStatus.js';
import { handleStatusChanges } from '../common/sendSteamStatusChanges.js';
import { logger } from 'node-karin';
import { Config } from '../config.js';
import { debuglog } from '../debuglog.js';

let monitorTimeoutId = null;
let isMonitoring = false;

function getValidatedFetchMode() {
  const validModes = ['api', 'html', 'xml'];
  const modeFromConfig = Config.fetchSteamStatus;

  if (validModes.includes(modeFromConfig)) {
    return modeFromConfig;
  }

  if (modeFromConfig) {
    logger.warn(`配置项 "fetchSteamStatus: ${modeFromConfig}" 无效，将使用默认的 "html" 抓取方式。`);
  }

  return 'html'; // 默认值
}

/**
 * 批量获取 Steam 状态的函数
 * - 在 'api' 模式下，会调用 fetchPlayersSummariesAPI 进行真·批量查询。
 * - 在 'html' 或 'xml' 模式下，会保持原有的逐个查询逻辑。
 * @param {string[]} steamIds - 需要查询的 Steam ID 数组
 * @param {number} batchSize - 仅在 html/xml 模式下生效的并发控制数量
 * @returns {Promise<Object>} - 返回一个以 steamId 为键，状态对象为值的普通对象
 */
async function fetchSteamStatusInBatches(steamIds, batchSize = 5) {
  const fetchSteam = getValidatedFetchMode();

  // 🚀 如果是 API 模式，使用最高效的批量获取方式
  if (fetchSteam === 'api') {
    debuglog('[fetchSteamStatusInBatches] 检测到 API 模式，启动高效批量查询...');
    try {
      // 一次性调用，获取所有玩家的信息，返回的是一个 Map
      const playersMap = await fetchPlayersSummariesAPI(steamIds);
      // 将返回的 Map 转换为普通的对象，以兼容后续代码
      return Object.fromEntries(playersMap);
    } catch (error) {
      logger.error(`[fetchSteamStatusInBatches] API 批量查询失败:`, error);
      return {}; // 出错时返回空对象
    }
  }

  // 🚶 如果是 HTML 或 XML 模式，使用原有的逐个查询逻辑（因为这两种方式不支持批量）
  debuglog(`[fetchSteamStatusInBatches] 使用 "${fetchSteam}" 模式进行逐个查询...`);
  const results = {};
  for (let i = 0; i < steamIds.length; i += batchSize) {
    const batch = steamIds.slice(i, i + batchSize);
    const promises = batch.map(async steamId => {
      try {
        let status;
        if (fetchSteam === 'html') {
          status = await fetchSteamStatus(steamId);
        } else { // 'xml'
          status = await fetchSteamStatusXML(steamId);
        }
        return { steamId, status };
      } catch (error) {
        logger.error(`获取 Steam ID ${steamId} (${fetchSteam}模式) 状态时出错:`, error);
        return { steamId, status: null };
      }
    });

    const batchResults = await Promise.all(promises);
    for (const result of batchResults) {
      if (result.status) {
        results[result.steamId] = result.status;
      }
    }
  }
  return results;
}


// 监控 Steam 状态任务 (此函数无需修改，它将自动受益于上面函数的优化)
async function monitorSteamStatus() {
  debuglog(`[monitorSteamStatus] 开始执行一轮 Steam 状态监控...`);

  try {
    const previousSteamStatusCache = await readAllSteamStatusCache();
    const enabledGroups = await getAllEnabledGroups();

    if (!enabledGroups.length) {
      debuglog('[monitorSteamStatus] 没有启用 Steam 播报的群聊，跳过本轮监控。');
      return;
    }

    const steamToGroupMap = new Map();
    const allSteamIds = new Set();

    for (const groupId of enabledGroups) {
      const steamIdsInGroup = await getSteamIdsInGroup(groupId);
      for (const steamId of steamIdsInGroup) {
        allSteamIds.add(steamId);
        if (!steamToGroupMap.has(steamId)) {
          steamToGroupMap.set(steamId, []);
        }
        steamToGroupMap.get(steamId).push(groupId);
      }
    }

    const uniqueSteamIds = Array.from(allSteamIds);
    if (!uniqueSteamIds.length) {
      debuglog('[monitorSteamStatus] 没有需要监控的 Steam 用户，跳过本轮监控。');
      return;
    }

    // 1. 获取最新状态
    const currentStatusesRaw = await fetchSteamStatusInBatches(uniqueSteamIds);

    // 2. 统一数据格式
    const statusMap = new Map();
    const personastateMap = { 0: 'offline', 1: 'online', 2: 'busy', 3: 'away', 4: 'snooze', 5: 'looking to trade', 6: 'looking to play' };

    for (const steamId of uniqueSteamIds) {
      const status = currentStatusesRaw[steamId];
      if (!status) continue;

      let profileStatusClass = personastateMap[status.personastate] || 'offline';
      if (status.gameid) {
        profileStatusClass = 'in-game';
      }
      status.profileStatusClass = profileStatusClass;
      statusMap.set(steamId, status);
    }

    const changedUsers = [];
    const updateCachePromises = [];

    // 3. 使用统一格式进行状态变化检测
    for (const steamId of uniqueSteamIds) {
      const currentStatus = statusMap.get(steamId);
      if (!currentStatus) continue;

      const previousStatus = previousSteamStatusCache[steamId] || {};

      // 增加对 personastate 变化的判断
      const hasStatusChanged = !previousStatus.personaname || // 首次监控
        previousStatus.profileStatusClass !== currentStatus.profileStatusClass || // 基础状态变了（在线->离线，在线->游戏）
        (currentStatus.profileStatusClass === 'in-game' && previousStatus.gameid !== currentStatus.gameid) || // 换游戏了
        previousStatus.personastate !== currentStatus.personastate; // 游戏内子状态变了（在线玩 -> 离开）

      if (hasStatusChanged) {
        // 当用户开始玩一个新游戏时，记录开始时间
        if (!previousStatus.gameid && currentStatus.gameid) {
          currentStatus.game_start_time = Date.now();
        } else if (previousStatus.gameid && currentStatus.gameid && previousStatus.gameid !== currentStatus.gameid) {
          currentStatus.game_start_time = Date.now();
        } else if (previousStatus.gameid) {
          // 继承上一个状态的游戏开始时间
          currentStatus.game_start_time = previousStatus.game_start_time;
        }

        updateCachePromises.push(updateSteamStatusCache(steamId, currentStatus));

        const qqId = await getQQBySteamId(steamId);
        if (!qqId) continue;

        const allGroupsBroadcastEnabled = await getUserAllGroupsBroadcast(qqId);
        if (!allGroupsBroadcastEnabled) {
          logger.mark(`[monitorSteamStatus] 用户 ${qqId} (${steamId}) 关闭了所有群的播报，跳过。`);
          continue;
        }

        const groupsToNotify = steamToGroupMap.get(steamId) || [];
        for (const groupId of groupsToNotify) {
          const groupBroadcastEnabled = await getUserGroupBroadcast(qqId, groupId);
          if (groupBroadcastEnabled) {
            changedUsers.push({ groupId, steamId, status: currentStatus, previousStatus: previousStatus });
          } else {
            logger.mark(`[monitorSteamStatus] 用户 ${qqId} (${steamId}) 关闭了群 ${groupId} 的播报，跳过。`);
          }
        }
        logger.mark(`[monitorSteamStatus] 检测到状态变化 SteamID: ${steamId} (原因: ${previousStatus.personastate} -> ${currentStatus.personastate}, ${previousStatus.profileStatusClass} -> ${currentStatus.profileStatusClass})`);
      }
    }

    if (updateCachePromises.length > 0) {
      await Promise.all(updateCachePromises);
      debuglog(`[monitorSteamStatus] ${updateCachePromises.length} 条用户状态缓存已更新。`);
    }

    if (changedUsers.length > 0) {
      await handleStatusChanges(changedUsers);
    } else {
      debuglog(`[monitorSteamStatus] 本轮监控未发现任何状态变化。`);
    }

  } catch (error) {
    logger.error('[monitorSteamStatus] 监控任务执行期间发生错误:', error);
  } finally {
    if (isMonitoring) {
      monitorTimeoutId = setTimeout(monitorSteamStatus, Config.interval);
    }
  }
}

// 启动/停止/重启监控任务的函数 (无需修改)
export function startMonitoring() {
  const INTERVAL = Config.interval;
  if (isMonitoring) {
    logger.log('[startMonitoring] 监控任务已在运行');
    return;
  }
  isMonitoring = true;
  logger.log(`[startMonitoring] 启动监控任务，任务间隔：${INTERVAL / 1000}s`);
  monitorSteamStatus();
}

export function stopMonitoring() {
  if (monitorTimeoutId) {
    clearTimeout(monitorTimeoutId);
    monitorTimeoutId = null;
  }
  isMonitoring = false;
  logger.log('[stopMonitoring] 监控任务已停止');
}

export function restartMonitoring() {
  logger.mark('[restartMonitoring] 检测到配置变更，正在重启监控任务...');
  stopMonitoring();
  setTimeout(startMonitoring, 500);
}