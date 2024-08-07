import { readData, fetchSteamStatus, writeStatus, readStatus } from './scrapeSteam.js';
import { generateSteamNotification } from './generateSteamUI.js';
import { segment, Bot, logger } from 'node-karin';
import Config from './config.js';

const INTERVAL = 42000; // 32 秒
let intervalId = null;

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

  for (const groupId in data.groups) {
    const groupData = data.groups[groupId];
    if (!groupData || !groupData.enabled) continue; // 只处理启用的群聊
    logger.log(`[monitorSteamStatus] 处理群聊: ${groupId}`);

    const steamIds = Array.isArray(groupData.steamIds) ? groupData.steamIds : [];
    currentStatus[groupId] = {};

    for (const steamId of steamIds) {
      try {
        const status = await fetchSteamStatus(steamId);
        currentStatus[groupId][steamId] = status;
        logger.log(`[monitorSteamStatus] 获取到 Steam ID ${steamId} 的状态: ${status.profileStatusClass}, 游戏: ${status.profileInGameName}`);

        const previousGroupStatus = previousStatus[groupId] || {};
        const previousSteamStatus = previousGroupStatus[steamId] || {};

        if (previousSteamStatus.profileStatusClass !== status.profileStatusClass || previousSteamStatus.profileInGameName !== status.profileInGameName) {
          changedUsers.push({ groupId, steamId, status });
          logger.log(`[monitorSteamStatus] 状态变化的用户: ${steamId}`);
        }
      } catch (error) {
        console.error(`获取 Steam ID ${steamId} 的状态时出错:`, error);
      }
    }
  }

  writeStatus(currentStatus);

  for (const user of changedUsers) {
    const { groupId, status } = user;
    try {
      const base64Image = await generateSteamNotification([status]);
      const contact = {
        scene: 'group',
        peer: groupId,
      }
      const imageSegment = segment.image(`base64://${base64Image}`);
      await Bot.sendMsg(Config.Config.qq, contact, imageSegment)
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
