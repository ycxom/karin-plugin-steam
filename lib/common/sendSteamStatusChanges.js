import { fetchSteamStatus } from '../main/fetchSteamStatus.js';
import { generateSteamNotification } from './generateSteamUI.js';
import { segment, logger, karin } from 'node-karin';
import { Config } from '../config.js';
import { readSteamStatusCache } from '../main/databaseOps.js';

/**
 * @param {Array} changedUsers 包含群组ID和Steam ID的对象数组
 */
async function handleStatusChanges(changedUsers) {
  const changesByGroup = new Map();
  for (const { groupId, steamId } of changedUsers) {
    if (!changesByGroup.has(groupId)) {
      changesByGroup.set(groupId, new Set());
    }
    changesByGroup.get(groupId).add(steamId);
  }

  for (const [groupId, steamIdSet] of changesByGroup.entries()) {
    const steamIds = Array.from(steamIdSet);
    logger.mark(`[handleStatusChanges] 开始处理群聊 ${groupId} 的 ${steamIds.length} 条状态变更...`);

    try {
      const statusPromises = steamIds.map(id => fetchSteamStatus(id));
      const statusesRaw = await Promise.all(statusPromises);

      const statuses = statusesRaw.filter(Boolean).map((status, index) => ({
        ...status,
        steamId: steamIds[index],
        groupId: groupId,
      }));

      if (statuses.length === 0) continue;

      const messagePromises = statuses.map(status => getStatusMessage(status));
      const statusMessages = await Promise.all(messagePromises);
      const combinedMessage = statusMessages.join('\n');

      logger.debug(`[handleStatusChanges] 发送消息内容: \n${combinedMessage}`);

      const imageB64Array = await generateSteamNotification(groupId, statuses);

      if (imageB64Array && imageB64Array.length > 0) {
        const elements = [
          segment.text(combinedMessage),
          ...imageB64Array.map(b64 => segment.image(`base64://${b64}`))
        ];

        await karin.sendMsg(Config.qq || karin.getAllBotID()[1], karin.contactGroup(groupId), elements);
        logger.debug(`[handleStatusChanges] 聚合通知已发送到群: ${groupId}，共 ${imageB64Array.length} 张图片。`);
      }

    } catch (error) {
      logger.error(`[handleStatusChanges] 聚合通知发送失败，群: ${groupId}, 错误: ${error}`);
    }
  }
}

/**
 * @param {Object} status Steam最新状态信息
 * @returns 通知文字消息
 */
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
    0: '已离线', 1: '在线', 2: '正忙', 3: '暂时离开', 4: '在打盹中', 5: '正在py交易', 6: '正在找瑟瑟的游戏'
  };

  const messageText = statusMessageMap[finalStatus] || '状态更新了';
  return `${status.actualPersonaName} ${messageText}`;
}

export { handleStatusChanges };