// lib/monitor/monitorSteamStatus.js
import { readAllSteamStatusCache, updateSteamStatusCache, getSteamIdsInGroup, getAllEnabledGroups } from '../main/databaseOps.js';
import { fetchSteamStatus, fetchSteamStatusXML, fetchSteamStatusAPI } from '../main/fetchSteamStatus.js';
import { handleStatusChanges } from '../common/sendSteamStatusChanges.js';
import { logger } from 'node-karin';
import { Config } from '../config.js';

let monitorTimeoutId = null;
let isMonitoring = false;

// 默认抓取模式设置
if (!Config.fetchSteamStatus || !['api', 'html', 'xml'].includes(Config.fetchSteamStatus)) {
  logger.warn('配置项 "fetchSteamStatus" 未设置或无效，默认使用 "html" 抓取方式');
  fetchSteam = 'html';
}
logger.mark(`当前状态监听模式: ${Config.fetchSteam}`);

// 批量获取 Steam 状态 (此函数设计良好，无需修改)
async function fetchSteamStatusInBatches(steamIds, batchSize = 5) {
  const fetchSteam = Config.fetchSteamStatus || 'html';
  const results = {};
  for (let i = 0; i < steamIds.length; i += batchSize) {
    const batch = steamIds.slice(i, i + batchSize);
    const promises = batch.map(async steamId => {
      try {
        let status;
        switch (fetchSteam) {
          case 'api':
            status = await fetchSteamStatusAPI(steamId);
            break;
          case 'html':
            status = await fetchSteamStatus(steamId);
            break;
          case 'xml':
            status = await fetchSteamStatusXML(steamId);
            break;
          default:
            throw new Error(`未知状态获取方式: ${fetchSteam}`);
        }
        return { steamId, status };
      } catch (error) {
        logger.error(`获取 Steam ID ${steamId} 状态时出错:`, error);
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

// 监控 Steam 状态任务
async function monitorSteamStatus() {
  logger.debug(`[monitorSteamStatus] 开始执行一轮 Steam 状态监控...`);

  try {
    const previousSteamStatusCache = await readAllSteamStatusCache();
    const enabledGroups = await getAllEnabledGroups();

    if (!enabledGroups.length) {
      logger.debug('[monitorSteamStatus] 没有启用 Steam 播报的群聊，跳过本轮监控。');
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
      logger.debug('[monitorSteamStatus] 没有需要监控的 Steam 用户，跳过本轮监控。');
      return;
    }

    const steamStatuses = await fetchSteamStatusInBatches(uniqueSteamIds);

    const changedUsers = [];
    const updateCachePromises = [];

    // 检测状态变化
    for (const steamId of uniqueSteamIds) {
      const currentStatus = steamStatuses[steamId];
      if (!currentStatus) continue;

      updateCachePromises.push(updateSteamStatusCache(steamId, currentStatus));

      const previousStatus = previousSteamStatusCache[steamId];
      if (!previousStatus ||
        previousStatus.profileStatusClass !== currentStatus.profileStatusClass ||
        previousStatus.stateMessage !== currentStatus.stateMessage) {

        const groupsToNotify = steamToGroupMap.get(steamId) || [];
        for (const groupId of groupsToNotify) {
          changedUsers.push({ groupId, steamId, status: currentStatus });
          logger.mark(`[monitorSteamStatus] 检测到状态变化 SteamID: ${steamId} 群聊: ${groupId}`);
        }
      }
    }

    await Promise.all(updateCachePromises);
    logger.debug(`[monitorSteamStatus] ${updateCachePromises.length} 条用户状态缓存已更新。`);

    if (changedUsers.length > 0) {
      await handleStatusChanges(changedUsers);
    }

  } catch (error) {
    logger.error('[monitorSteamStatus] 监控任务执行期间发生错误:', error);
  } finally {
    if (isMonitoring) {
      monitorTimeoutId = setTimeout(monitorSteamStatus, Config.interval);
    }
  }
}

// 启动监控任务
export function startMonitoring() {
  const INTERVAL = Config.interval;
  if (isMonitoring) {
    logger.log('[startMonitoring] 监控任务已在运行');
    return;
  }
  isMonitoring = true;
  logger.log(`[startMonitoring] 启动监控任务，任务间隔：${INTERVAL / 1000}s`);
  // 立即执行一次，然后开始定时循环
  monitorSteamStatus();
}

// 停止监控任务
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