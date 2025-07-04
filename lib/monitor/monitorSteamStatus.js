// lib/monitor/monitorSteamStatus.js
import {
  readAllSteamStatusCache,
  updateSteamStatusCache,
  getAllEnabledGroups,
  getSteamIdsInGroup,
  getQQBySteamId,
  getUserAllGroupsBroadcast,
  getUserGroupBroadcast,
  getBoundAccountsByQQ
} from '../db/databaseOps.js';
import { fetchPlayersSummariesAPI } from '../main/fetchSteamStatus.js';
import { handleStatusChanges } from '../common/sendSteamStatusChanges.js';
import { logger } from 'node-karin';
import { Config } from '../config.js';
import { debuglog } from '../debuglog.js';

let monitorTimeoutId = null;
let isMonitoring = false;

async function fetchSteamStatusInBatches(steamIds) {
  debuglog('[fetchSteamStatusInBatches] 使用 API 模式进行批量查询...');
  try {
    const playersMap = await fetchPlayersSummariesAPI(steamIds);
    return Object.fromEntries(playersMap);
  } catch (error) {
    logger.error(`[fetchSteamStatusInBatches] API 批量查询失败:`, error);
    return {};
  }
}

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
    const steamToOwnerMap = new Map(); // steamId -> [{ qqId, alias }]

    for (const groupId of enabledGroups) {
      const steamIdsInGroup = await getSteamIdsInGroup(groupId);
      for (const steamId of steamIdsInGroup) {
        allSteamIds.add(steamId);
        if (!steamToGroupMap.has(steamId)) {
          steamToGroupMap.set(steamId, []);
        }
        steamToGroupMap.get(steamId).push(groupId);

        if (!steamToOwnerMap.has(steamId)) {
          const qqIds = await getQQBySteamId(steamId);
          const owners = [];
          for (const qqId of qqIds) {
            const bindings = await getBoundAccountsByQQ(qqId);
            const binding = bindings.find(b => b.steam_id === steamId);
            if (binding) {
              owners.push({ qqId, alias: binding.alias });
            }
          }
          steamToOwnerMap.set(steamId, owners);
        }
      }
    }

    const uniqueSteamIds = Array.from(allSteamIds);
    if (!uniqueSteamIds.length) {
      debuglog('[monitorSteamStatus] 没有需要监控的 Steam 用户，跳过本轮监控。');
      return;
    }

    const currentStatusesRaw = await fetchSteamStatusInBatches(uniqueSteamIds);
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

    for (const steamId of uniqueSteamIds) {
      const currentStatus = statusMap.get(steamId);
      if (!currentStatus) continue;

      const previousStatus = previousSteamStatusCache[steamId] || {};
      const hasStatusChanged = !previousStatus.personaname ||
        previousStatus.profileStatusClass !== currentStatus.profileStatusClass ||
        (currentStatus.profileStatusClass === 'in-game' && previousStatus.gameid !== currentStatus.gameid) ||
        previousStatus.personastate !== currentStatus.personastate;

      if (hasStatusChanged) {
        if (!previousStatus.gameid && currentStatus.gameid) {
          currentStatus.game_start_time = Date.now();
        } else if (previousStatus.gameid && currentStatus.gameid && previousStatus.gameid !== currentStatus.gameid) {
          currentStatus.game_start_time = Date.now();
        } else if (previousStatus.gameid) {
          currentStatus.game_start_time = previousStatus.game_start_time;
        }

        updateCachePromises.push(updateSteamStatusCache(steamId, currentStatus));

        const ownerInfos = steamToOwnerMap.get(steamId) || [];
        for (const ownerInfo of ownerInfos) {
          const { qqId, alias } = ownerInfo;

          const allGroupsBroadcastEnabled = await getUserAllGroupsBroadcast(qqId, alias);
          if (!allGroupsBroadcastEnabled) {
            logger.mark(`[monitorSteamStatus] 用户 ${qqId} 的别名 ${alias} (${steamId}) 关闭了所有群的播报，跳过。`);
            continue;
          }

          const groupsToNotify = steamToGroupMap.get(steamId) || [];
          for (const groupId of groupsToNotify) {
            const aliasSpecificBroadcast = await getUserGroupBroadcast(qqId, groupId, alias);
            const globalBroadcast = await getUserGroupBroadcast(qqId, groupId, 'global');

            if (aliasSpecificBroadcast && globalBroadcast) {
              changedUsers.push({ groupId, steamId, alias, status: currentStatus, previousStatus: previousStatus });
            } else {
              debuglog(`[monitorSteamStatus] 用户 ${qqId} 的别名 ${alias} (${steamId}) 关闭了群 ${groupId} 的播报，跳过。`);
            }
          }
        }
        logger.mark(`[monitorSteamStatus] 检测到状态变化 SteamID: ${steamId}`);
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
