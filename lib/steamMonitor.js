import { readData, fetchSteamStatus, writeStatus, readStatus } from './scrapeSteam.js';
import { generateSteamNotification } from './generateSteamUI.js';
import { segment, Bot, logger } from 'node-karin';
import Config from './config.js';

const INTERVAL = 42000; // 32 秒
let intervalId = null;

async function fetchSteamStatusInBatches(steamIds, batchSize = 5) {
  const results = {};
  for (let i = 0; i < steamIds.length; i += batchSize) {
    const batch = steamIds.slice(i, i + batchSize);
    const promises = batch.map(async steamId => {
      try {
        const status = await fetchSteamStatus(steamId);
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

export async function monitorSteamStatus(plugin) {
  if (!plugin || typeof plugin.reply !== 'function') {
    return;
  }

  logger.log('[monitorSteamStatus] 开始监控 Steam 状态');
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
    if (!groupData || !groupData.enabled) continue; // 只处理启用的群聊
    logger.log(`[monitorSteamStatus] 处理群聊: ${groupId}`);

    const steamIds = Array.isArray(groupData.steamIds) ? groupData.steamIds : [];
    allSteamIds.push(...steamIds);
  }

  const uniqueSteamIds = [...new Set(allSteamIds)]; // 去重
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

      if (previousSteamStatus.profileStatusClass !== status.profileStatusClass || previousSteamStatus.profileInGameName !== status.profileInGameName) {
        let message;
        if (status.profileStatusClass === 'offline') {
          message = `${status.actualPersonaName} 离线了`;
        } else if (status.profileStatusClass === 'online') {
          message = `${status.actualPersonaName} 上线了`;
        } else if (status.profileStatusClass === 'in-game') {
          message = `${status.actualPersonaName} 开始玩 ${status.profileInGameName}`;
        }
        changedUsers.push({ groupId, steamId, status, message });
        logger.log(`[monitorSteamStatus] 状态变化的用户: ${steamId}`);
      }
    }
  }

  writeStatus(currentStatus);

  for (const user of changedUsers) {
    const { groupId, status, message } = user;
    try {
      const base64Image = await generateSteamNotification([status]);
      const contact = {
        scene: 'group',
        peer: groupId,
      }
      const elements = [
        segment.text(message),
        segment.image(`base64://${base64Image}`)
      ]
      await Bot.sendMsg(Config.Config.qq, contact, elements)
    } catch (error) {
      console.error(error);
    }
  }
}

export function startMonitoring(plugin) {
  if (intervalId) {
    logger.log('[startMonitoring] 监控任务已在运行');
    return;
  }
  logger.log('[startMonitoring] 启动监控任务');
  intervalId = setInterval(monitorSteamStatus, INTERVAL, plugin); // 传递插件实例给监控函数
}

export function stopMonitoring() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.log('[stopMonitoring] 停止监控任务');
  }
}
