// lib/common/sendSteamStatusChanges.js

import { generateSteamNotification } from './generateSteamUI.js';
import { segment, logger, karin } from 'node-karin';
import { Config } from '../config.js';
import { debuglog } from '../debuglog.js';
import { fetchGameDetails } from '../main/fetchSteamStatus.js';

/**
 * 【最终版】处理状态变更并发送通知
 * @param {Array<{groupId: string, steamId: string, status: object, previousStatus: object}>} changedUsers
 */
async function handleStatusChanges(changedUsers) {
  const changesByGroup = new Map();
  const allGameIds = new Set();

  for (const change of changedUsers) {
    if (!changesByGroup.has(change.groupId)) {
      changesByGroup.set(change.groupId, []);
    }
    // 传递完整的变更对象
    changesByGroup.get(change.groupId).push(change);

    if (change.status.gameid) allGameIds.add(change.status.gameid);
    if (change.previousStatus.gameid) allGameIds.add(change.previousStatus.gameid);
  }

  const gameDetailsCache = new Map();
  if (allGameIds.size > 0) {
    debuglog(`[handleStatusChanges] 本次任务需要获取 ${allGameIds.size} 款游戏的详情...`);
    const detailPromises = Array.from(allGameIds).map(async (gameId) => {
      const details = await fetchGameDetails(gameId);
      if (details) gameDetailsCache.set(gameId, details);
    });
    await Promise.all(detailPromises);
  }

  for (const [groupId, changes] of changesByGroup.entries()) {
    try {
      if (changes.length === 0) continue;

      // 提取最新的状态用于生成图片
      const statusesForImage = changes.map(c => c.status);

      const messagePromises = changes.map(change =>
        getStatusMessage(change.status, change.previousStatus, gameDetailsCache)
      );
      const statusMessages = (await Promise.all(messagePromises)).filter(Boolean);

      if (statusMessages.length === 0) continue;

      const combinedMessage = statusMessages.join('\n');
      const imageB64Array = await generateSteamNotification(groupId, statusesForImage, gameDetailsCache);

      if (imageB64Array && imageB64Array.length > 0) {
        const elements = [
          segment.text(combinedMessage),
          ...imageB64Array.map(b64 => segment.image(`base64://${b64}`))
        ];
        await karin.sendMsg(Config.qq || karin.getAllBotID()[1], karin.contactGroup(groupId), elements);
      }
    } catch (error) {
      logger.error(`[handleStatusChanges] 聚合通知发送失败，群: ${groupId}, 错误: ${error}`);
    }
  }
}

/**
 * 格式化毫秒为 "X小时Y分钟"
 */
function formatPlaytime(ms) {
  if (!ms || ms <= 0) return '';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  let result = ' (游玩了';
  if (hours > 0) result += ` ${hours} 小时`;
  if (minutes > 0) result += ` ${minutes} 分钟`;
  result += ')';
  // 如果时长过短，则不显示
  return totalMinutes > 0 ? result : '';
}

/**
 * 【高级重构版】根据新旧状态生成高度智能的通知文字
 */
async function getStatusMessage(current, previous, gameDetailsCache) {
  const userName = current.personaname || '未知用户';
  const statusMap = { 0: '已离线', 1: '上线了', 2: '正忙', 3: '离开了', 4: '在打盹', 5: '想交易', 6: '想玩游戏' };

  const wasInGame = !!previous.gameid;
  const isInGame = !!current.gameid;

  const prevGameName = (wasInGame && gameDetailsCache.get(previous.gameid)?.name) || previous.gameextrainfo || '一款游戏';
  const currGameName = (isInGame && gameDetailsCache.get(current.gameid)?.name) || current.gameextrainfo || '一款游戏';

  // 场景1：游戏状态发生变化
  if (isInGame && !wasInGame) { // 开始玩游戏
    return `${userName} 开始玩 ${currGameName}`;
  }
  if (isInGame && wasInGame && current.gameid !== previous.gameid) { // 切换游戏
    const playtime = formatPlaytime(Date.now() - previous.game_start_time);
    return `${userName} 结束了 ${prevGameName}${playtime}，并开始玩 ${currGameName}`;
  }
  if (!isInGame && wasInGame) { // 结束游戏
    const playtime = formatPlaytime(Date.now() - previous.game_start_time);
    return `${userName} 结束了 ${prevGameName}${playtime}`;
  }

  // 场景2：游戏内子状态变化 (例如从在线玩 -> 离开中玩)
  if (isInGame && wasInGame && current.personastate !== previous.personastate) {
    if (current.personastate === 1) { // 从离开/忙碌 -> 回来继续玩
      return `${userName} 回来了，继续在 ${currGameName} 中`;
    }
    if (statusMap[current.personastate]) {
      return `${userName} ${statusMap[current.personastate]}`; // "xxx 离开了"
    }
  }

  // 场景3：非游戏状态的变化
  if (!isInGame && !wasInGame && current.personastate !== previous.personastate) {
    if (statusMap[current.personastate]) {
      return `${userName} ${statusMap[current.personastate]}`;
    }
  }

  // 如果没有任何符合上述场景的明确变化，则不生成消息
  return null;
}

export { handleStatusChanges };