import { readData, writeStatus, readStatus, fetchSteamStatusXML } from './scrapeSteam.js';
import { handleStatusChanges } from './sendSteamStatusChanges.js'; // 自动发送处理
import { logger } from 'node-karin';
import Config from './config.js';


const INTERVAL = Config.Config.interval;
let intervalId = null;

async function fetchSteamStatusInBatches(steamIds, batchSize = 5) {
  const results = {};
  for (let i = 0; i < steamIds.length; i += batchSize) {
    const batch = steamIds.slice(i, i + batchSize);
    const promises = batch.map(async steamId => {
      try {
        const status = await fetchSteamStatusXML(steamId);
        return { steamId, status };
      } catch (error) {
        console.error(`获取 Steam ID ${steamId} 的状态时出错:`, error);
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

async function monitorSteamStatus() {
  logger.log(`[monitorSteamStatus] 开始监控 Steam 状态 当前延迟查询：${INTERVAL/1000}s/次`);
  const data = readData();
  const previousStatus = readStatus() || {};
  const currentStatus = {};
  const changedUsers = [];

  if (!data || !data.groups) {
    logger.log('[monitorSteamStatus] 没有找到任何群聊数据');
    return;
  }

  const allSteamIds = [];
  for (const groupId in data.groups) {
    const groupData = data.groups[groupId];
    if (!groupData || !groupData.enabled) continue;
    logger.log(`[monitorSteamStatus] 处理群聊: ${groupId}`);

    const steamIds = Array.isArray(groupData.steamIds) ? groupData.steamIds : [];
    allSteamIds.push(...steamIds);
  }

  const uniqueSteamIds = [...new Set(allSteamIds)];
  const steamStatusMap = await fetchSteamStatusInBatches(uniqueSteamIds);

  for (const groupId in data.groups) {
    const groupData = data.groups[groupId];
    if (!groupData || !groupData.enabled) continue;

    currentStatus[groupId] = {};
    const steamIds = Array.isArray(groupData.steamIds) ? groupData.steamIds : [];

    for (const steamId of steamIds) {
      const status = steamStatusMap[steamId];
      if (!status) continue;
      currentStatus[groupId][steamId] = status;

      const previousGroupStatus = previousStatus[groupId] || {};
      const previousSteamStatus = previousGroupStatus[steamId] || {};

      if (previousSteamStatus.profileStatusClass !== status.profileStatusClass || previousSteamStatus.stateMessage !== status.stateMessage) {
        changedUsers.push({ groupId, steamId, status });
        logger.log(`[monitorSteamStatus] 状态变化的用户: ${steamId}`);
      }
    }
  }

  writeStatus(currentStatus);

  if (changedUsers.length > 0) {
    await handleStatusChanges(changedUsers);
  }
}

export function startMonitoring() {
  if (intervalId) {
    logger.log('[startMonitoring] 监控任务已在运行');
    return;
  }
  logger.log(`[startMonitoring] 启动监控任务，当前任务延迟：${INTERVAL/1000}s/次`);
  intervalId = setInterval(monitorSteamStatus, INTERVAL);
}

export function stopMonitoring() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.log('[stopMonitoring] 停止监控任务');
  }
}
