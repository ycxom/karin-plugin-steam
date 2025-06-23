// lib/common/sendSteamStatusChanges.js
import { fetchSteamStatus } from '../main/fetchSteamStatus.js';
import { generateSteamNotification } from './generateSteamUI.js';
import { segment, Bot, logger, karin } from 'node-karin';
import { Config } from '../config.js';
import { readSteamStatusCache } from '../main/databaseOps.js';

/**
 * 处理Steam状态变化并发送消息通知
 * @param {Array} changedUsers 包含群组ID、Steam ID和状态信息的数组
 */
async function handleStatusChanges(changedUsers) {
  for (const user of changedUsers) {
    const { groupId, steamId } = user;

    try {
      const status = await fetchSteamStatus(steamId);
      status.steamId = steamId;
      status.groupId = groupId;

      logger.debug(`[handleStatusChanges] 状态信息获取完成: ${JSON.stringify(status)}`);

      // 获取状态文字内容
      // ✅ 修复点 2: 必须使用 await 调用
      const statusMessage = await getStatusMessage(status);
      logger.debug(`[handleStatusChanges] 发送消息内容: ${statusMessage}`);

      // 渲染通知图片
      const base64Image = await generateSteamNotification(groupId, [status]);

      const contact = {
        scene: 'group',
        peer: groupId,
      };
      const elements = [
        segment.text(statusMessage),
        segment.image(`base64://${base64Image}`)
      ];

      await karin.sendMsg(Config.qq || karin.getAllBotID()[1], karin.contactGroup(groupId), elements);
      logger.mark(`[handleStatusChanges] 通知已发送到群: ${groupId}`);

    } catch (error) {
      logger.error(`[handleStatusChanges] 通知发送失败，群: ${groupId}, SteamID: ${steamId}, 错误: ${error}`);
    }
  }
}

/**
 * 根据最新steam状态信息和数据库缓存生成通知消息
 * @param {Object} status Steam最新状态信息
 * @returns 通知文字消息
 */
// ✅ 修复点 1: 函数必须是 async 函数
async function getStatusMessage(status) {
  const cachedStatus = await readSteamStatusCache(status.steamId) || {};
  const apiStatus = cachedStatus.profileStatusClass;
  const webStatus = status.profileStatusClass;

  logger.debug(`[getStatusMessage] apiStatus: ${apiStatus}, webStatus: ${webStatus}`);

  // 结合API和网页状态，确定最终状态
  let finalStatus = apiStatus !== undefined ? apiStatus : webStatus;
  if (apiStatus === 1 && (webStatus === 'in-game' || webStatus === 'In non-Steam game')) {
    finalStatus = webStatus;
  }

  logger.debug(`[getStatusMessage] 最终状态: ${finalStatus}`);

  status.profileStatusClass = finalStatus;

  if (typeof finalStatus === 'string') {
    switch (finalStatus) {
      case 'in-game':
        return `${status.actualPersonaName} 开始玩 ${status.profileInGameName}`;
      case 'In non-Steam game':
        return `${status.actualPersonaName} 正在玩非 Steam 游戏`;
      case 'offline':
        return `${status.actualPersonaName} 已离线`;
      case 'online':
        return `${status.actualPersonaName} 上线了`;
      default:
        return `${status.actualPersonaName} 的状态更新了`;
    }
  }

  const statusMessageMap = {
    0: '已离线',
    1: '在线',
    2: '正忙',
    3: '暂时离开',
    4: '在打盹中',
    5: '正在py交易',
    6: '正在找瑟瑟的游戏'
  };

  const messageText = statusMessageMap[finalStatus] || '状态更新了';
  return `${status.actualPersonaName} ${messageText}`;
}

export { handleStatusChanges };