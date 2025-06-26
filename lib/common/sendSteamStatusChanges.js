import { generateSteamNotification } from './generateSteamUI.js';
import { segment, logger, karin } from 'node-karin';
import { Config } from '../config.js';
import { debuglog } from '../debuglog.js';
import { fetchStoreItemDetails } from '../main/fetchSteamStatus.js'; // 引入新的API

/**
 * 处理状态变更并发送通知
 * @param {Array<{groupId: string, steamId: string, status: object, previousStatus: object}>} changedUsers
 */
async function handleStatusChanges(changedUsers) {
  const changesByGroup = new Map();
  const allGameIds = new Set();

  for (const change of changedUsers) {
    if (!changesByGroup.has(change.groupId)) {
      changesByGroup.set(change.groupId, []);
    }
    changesByGroup.get(change.groupId).push(change);

    if (change.status.gameid) allGameIds.add(change.status.gameid);
    if (change.previousStatus.gameid) allGameIds.add(change.previousStatus.gameid);
  }

  // 一次性批量获取所有相关游戏详情
  const gameDetailsCache = allGameIds.size > 0
    ? await fetchStoreItemDetails(Array.from(allGameIds))
    : {};

  if (allGameIds.size > 0) {
    debuglog(`[handleStatusChanges] 本次任务需要获取 ${allGameIds.size} 款游戏的详情...`, gameDetailsCache);
  }

  for (const [groupId, changes] of changesByGroup.entries()) {
    try {
      if (changes.length === 0) continue;

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

function formatPlaytime(ms) {
  if (!ms || ms <= 0) return '';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  let result = ' (游玩了';
  if (hours > 0) result += ` ${hours} 小时`;
  if (minutes > 0) result += ` ${minutes} 分钟`;
  result += ')';
  return totalMinutes > 0 ? result : '';
}

/**
 * 根据新旧状态和新的数据结构生成通知文字
 */
async function getStatusMessage(current, previous, gameDetailsCache) {
  const userName = current.personaname || '未知用户';
  const statusMap = { 0: '已离线', 1: '上线了', 2: '正忙', 3: '离开了', 4: '在打盹', 5: '想交易', 6: '想玩游戏' };

  const wasInGame = !!previous.gameid;
  const isInGame = !!current.gameid;

  // 使用新的数据结构获取游戏名称
  const prevGameName = (wasInGame && gameDetailsCache[previous.gameid]?.name) || previous.gameextrainfo || '一款游戏';
  const currGameName = (isInGame && gameDetailsCache[current.gameid]?.name) || current.gameextrainfo || '一款游戏';

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

  // 场景2：游戏内子状态变化
  if (isInGame && wasInGame && current.personastate !== previous.personastate) {
    if (current.personastate === 1) { // 从离开/忙碌 -> 回来继续玩
      return `${userName} 回来了，继续在 ${currGameName} 中`;
    }
    if (statusMap[current.personastate]) {
      return `${userName} ${statusMap[current.personastate]}`;
    }
  }

  // 场景3：非游戏状态的变化
  if (!isInGame && !wasInGame && current.personastate !== previous.personastate) {
    if (statusMap[current.personastate]) {
      return `${userName} ${statusMap[current.personastate]}`;
    }
  }

  return null;
}

export { handleStatusChanges };