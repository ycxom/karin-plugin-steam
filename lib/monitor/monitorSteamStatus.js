import { readData, writeStatus, readStatus } from '../main/readwritefile.js';
import {  fetchSteamStatus,fetchSteamStatusXML,fetchSteamStatusAPI } from '../main/fetchSteamStatus.js';
import { handleStatusChanges } from '../common/sendSteamStatusChanges.js'; // 自动发送处理
import { logger } from 'node-karin';
import Config from '../config.js';

const fetchSteam = Config.Config.fetchSteamStatus;
let intervalId = null;

try {
  // 检查并设置默认值
  if (!fetchSteam || !['api', 'html', 'xml'].includes(fetchSteam)) {
      logger.warn('配置项 "fetchSteamStatus" 未设置或无效，默认使用 "html" 抓取方式');
      fetchSteam = 'html';
  }
} catch (e) {
  console.error('加载配置文件时出错:', e);
  fetchSteam = 'html'; // 设置默认值为 "html"
}

if(fetchSteam == 'api'){
  logger.mark(`当前为api抓取监听模式`)
}else if(fetchSteam == 'xml'){
  logger.warn(`当前为xml抓取监听模式，请注意准确率低`)
}else{
  logger.warn(`当前为html抓取监听模式，请注意流量消耗`)
}

// 批量获取 Steam 状态
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
                      throw new Error(`未知的状态获取方式: ${fetchSteam}`);
              }
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
// 监控 Steam 状态
async function monitorSteamStatus() {
  const INTERVAL = Config.Config.interval;

  logger.log(`[monitorSteamStatus] 开始监控 Steam 状态 当前延迟查询：${INTERVAL / 1000}s/次`);
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

  if (changedUsers.length > 0) {
    writeStatus(currentStatus);
    await handleStatusChanges(changedUsers);
  }
}

// 启动监控任务
export function startMonitoring() {
  const INTERVAL = Config.Config.interval
  if (intervalId) {
    logger.log('[startMonitoring] 监控任务已在运行');
    return;
  }
  logger.log(`[startMonitoring] 启动监控任务，当前任务延迟：${INTERVAL / 1000}s/次`);
  intervalId = setInterval(monitorSteamStatus, INTERVAL);
}

// 停止监控任务
export function stopMonitoring() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.log('[stopMonitoring] 停止监控任务');
  }
}
