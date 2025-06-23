// lib/monitor/monitorSteamStatus.js
// import { readAllSteamStatusCache, updateSteamStatusCache, getSteamIdsInGroup, getAllEnabledGroups } from '../main/databaseOps.js';
// import { fetchSteamStatus, fetchSteamStatusXML, fetchSteamStatusAPI } from '../main/fetchSteamStatus.js';
// import { handleStatusChanges } from '../common/sendSteamStatusChanges.js';
// import { logger } from 'node-karin';
// import { Config } from '../config.js';

// let intervalId = null;
// let fetchSteam = Config.fetchSteamStatus;

// // 默认抓取模式设置
// if (!fetchSteam || !['api', 'html', 'xml'].includes(fetchSteam)) {
//   logger.warn('配置项 "fetchSteamStatus" 未设置或无效，默认使用 "html" 抓取方式');
//   fetchSteam = 'html';
// }

// if (fetchSteam === 'api') {
//   logger.mark(`当前为 API 抓取监听模式`);
// } else if (fetchSteam === 'xml') {
//   logger.warn(`当前为 XML 抓取监听模式，请注意准确率低`);
// } else {
//   logger.warn(`当前为 HTML 抓取监听模式，请注意流量消耗`);
// }

// // 批量获取 Steam 状态


// // 监控 Steam 状态任务
// async function monitorSteamStatus() {
//   const INTERVAL = Config.interval;
//   logger.log(`[monitorSteamStatus] 开始监控 Steam 状态 当前延迟：${INTERVAL / 1000}s/次`);

//   const previousSteamStatusCache = await readAllSteamStatusCache();
//   const currentSteamStatusCache = {};
//   const changedUsers = [];

//   const enabledGroups = await getAllEnabledGroups();
//   if (!enabledGroups.length) {
//     logger.log('[monitorSteamStatus] 没有启用 Steam 播报的群聊');
//     return;
//   }

//   const allSteamIds = [];
//   for (const groupId of enabledGroups) {
//     const steamIds = await getSteamIdsInGroup(groupId);
//     allSteamIds.push(...steamIds);
//   }

//   const uniqueSteamIds = Array.from(new Set(allSteamIds));
//   const steamStatuses = await fetchSteamStatusInBatches(uniqueSteamIds);

//   // 检测状态变化
//   for (const steamId of uniqueSteamIds) {
//     const currentStatus = steamStatuses[steamId];
//     if (!currentStatus) continue;

//     currentSteamStatusCache[steamId] = currentStatus;

//     const previousStatus = previousSteamStatusCache[steamId];
//     if (!previousStatus ||
//       previousStatus.profileStatusClass !== currentStatus.profileStatusClass ||
//       previousStatus.stateMessage !== currentStatus.stateMessage) {

//       // 若状态发生变化，找到所有对应的群聊并推送通知
//       for (const groupId of enabledGroups) {
//         const groupSteamIds = await getSteamIdsInGroup(groupId);
//         if (groupSteamIds.includes(steamId)) {
//           changedUsers.push({ groupId, steamId, status: currentStatus });
//           logger.mark(`[monitorSteamStatus] 检测到状态变化 SteamID: ${steamId} 群聊: ${groupId}`);
//         }
//       }
//     }
//   }

//   // 更新状态缓存到数据库并发送通知
//   for (const steamId in currentSteamStatusCache) {
//     updateSteamStatusCache(steamId, currentSteamStatusCache[steamId]);
//   }

//   if (changedUsers.length > 0) {
//     await handleStatusChanges(changedUsers);
//   }
// }

// // 启动监控任务
// export function startMonitoring() {
//   const INTERVAL = Config.interval;
//   if (intervalId) {
//     logger.log('[startMonitoring] 监控任务已在运行');
//     return;
//   }
//   logger.log(`[startMonitoring] 启动监控任务，当前任务间隔：${INTERVAL / 1000}s`);
//   intervalId = setInterval(monitorSteamStatus, INTERVAL);
// }

// // 停止监控任务
// export function stopMonitoring() {
//   if (intervalId) {
//     clearInterval(intervalId);
//     intervalId = null;
//     logger.log('[stopMonitoring] 监控任务已停止');
//   }
// }



import { readAllSteamStatusCache, updateSteamStatusCache, getSteamIdsInGroup, getAllEnabledGroups } from '../main/databaseOps.js';
import { fetchSteamStatus, fetchSteamStatusXML, fetchSteamStatusAPI } from '../main/fetchSteamStatus.js';
import { handleStatusChanges } from '../common/sendSteamStatusChanges.js';
import { logger } from 'node-karin';
import { Config } from '../config.js';

let monitorTimeoutId = null; // ✨ 使用 setTimeout 替代 setInterval
let isMonitoring = false; // 防止重复启动的状态标记
let fetchSteam = Config.fetchSteamStatus;

// 默认抓取模式设置
if (!fetchSteam || !['api', 'html', 'xml'].includes(fetchSteam)) {
  logger.warn('配置项 "fetchSteamStatus" 未设置或无效，默认使用 "html" 抓取方式');
  fetchSteam = 'html';
}
logger.mark(`当前状态监听模式: ${fetchSteam}`);

// 批量获取 Steam 状态 (此函数设计良好，无需修改)
async function fetchSteamStatusInBatches(steamIds, batchSize = 5) {
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
  logger.log(`[monitorSteamStatus] 开始执行一轮 Steam 状态监控...`);

  try {
    const previousSteamStatusCache = await readAllSteamStatusCache();
    const enabledGroups = await getAllEnabledGroups();

    if (!enabledGroups.length) {
      logger.log('[monitorSteamStatus] 没有启用 Steam 播报的群聊，跳过本轮监控。');
      return;
    }

    // ✨ 性能优化: 一次性获取所有群组数据并建立反向索引
    const steamToGroupMap = new Map(); // key: steamId, value: [groupId1, groupId2, ...]
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
      logger.log('[monitorSteamStatus] 没有需要监控的 Steam 用户，跳过本轮监控。');
      return;
    }

    const steamStatuses = await fetchSteamStatusInBatches(uniqueSteamIds);

    const changedUsers = [];
    const updateCachePromises = [];

    // 检测状态变化
    for (const steamId of uniqueSteamIds) {
      const currentStatus = steamStatuses[steamId];
      if (!currentStatus) continue;

      // ✅ BUG修正: 并发更新数据库缓存
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

    // ✅ BUG修正: 等待所有数据库缓存更新完成
    await Promise.all(updateCachePromises);
    logger.debug(`[monitorSteamStatus] ${updateCachePromises.length} 条用户状态缓存已更新。`);

    if (changedUsers.length > 0) {
      await handleStatusChanges(changedUsers);
    }

  } catch (error) {
    logger.error('[monitorSteamStatus] 监控任务执行期间发生错误:', error);
  } finally {
    // ✨ 定时器优化: 使用 setTimeout 启动下一次任务
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