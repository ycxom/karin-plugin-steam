import {  fetchSteamStatus } from '../main/fetchSteamStatus.js';
import { generateSteamNotification } from './generateSteamUI.js';
import { segment, Bot } from 'node-karin';
import Config from '../config.js';

/**
 * 处理状态变化并发送通知
 * @param {Array} changedUsers - 包含群组ID、Steam ID和状态信息的数组
 */
async function handleStatusChanges(changedUsers) {
  for (const user of changedUsers) {
    const { groupId, steamId } = user;
    try {
      const status = await fetchSteamStatus(steamId);
      const base64Image = await generateSteamNotification(groupId, [{ steamId, ...status }]);
      const contact = {
        scene: 'group',
        peer: groupId,
      };
      const elements = [
        segment.text(getStatusMessage(status)),
        segment.image(`base64://${base64Image}`)
      ];
      await Bot.sendMsg(Config.Config.qq, contact, elements);
    } catch (error) {
      console.error(`发送通知时出错: ${error.message}`);
    }
  }
}

/**
 * 根据状态生成消息
 * @param {Object} status - Steam用户状态信息
 * @returns {string} - 生成的消息
 */
function getStatusMessage(status) {
  let message;
  if (status.profileStatusClass === 'In non-Steam game') {
    message = `${status.actualPersonaName} 非 Steam 游戏中`;
  } else if (status.profileStatusClass === 'offline') {
    message = `${status.actualPersonaName} 离线了`;
  } else if (status.profileStatusClass === 'online') {
    message = `${status.actualPersonaName} 上线了`;
  } else if (status.profileStatusClass === 'in-game') {
    message = `${status.actualPersonaName} 开始玩 ${status.profileInGameName}`;
  }
  return message;
}

// 导出处理状态变化的函数
export { handleStatusChanges };
