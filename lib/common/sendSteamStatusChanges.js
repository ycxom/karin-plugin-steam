import {  fetchSteamStatus } from '../main/fetchSteamStatus.js';
import { generateSteamNotification } from './generateSteamUI.js';
import { segment, Bot, logger } from 'node-karin';
import Config from '../config.js';
import { readStatus } from '../main/readwritefile.js';

/**
 * 处理状态变化并发送通知
 * @param {Array} changedUsers - 包含群组ID、Steam ID和状态信息的数组
 */
async function handleStatusChanges(changedUsers) {
  for (const user of changedUsers) {
    const { groupId, steamId } = user;
    try {
      const status = await fetchSteamStatus(steamId);

      status.steamId = steamId;
      status.groupId = groupId;
      // 打印获取到的状态信息
      logger.debug(`获取到的状态信息: ${JSON.stringify(status)}`);
      
      // 调用 getStatusMessage 之前添加日志
      const statusMessage = getStatusMessage(status);
      logger.debug(`传递给 segment.text 的消息: ${statusMessage}`);
      

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
  const statusConfig = readStatus();
  const userConfig = statusConfig[status.groupId] || {}; // 获取群组配置
  
  const apiStatus = userConfig[status.steamId]?.profileStatusClass;
  const webStatus = status.profileStatusClass;
  
  logger.debug(`apiStatus: ${apiStatus}`);
  logger.debug(`webStatus: ${webStatus}`);
  
  // 判断优先级
  let finalStatus = apiStatus;  // 默认使用 API 状态

  if ( apiStatus === 1) {
    logger.debug(`进入0/1判断`);
    if (webStatus === 'in-game' || webStatus === 'In non-Steam game') {
      finalStatus = webStatus;  // 当 API 返回 0 或 1 时，优先使用网页抓取状态
      logger.debug(`已覆盖API状态，使用网页状态: ${finalStatus}`);
    }
  }

  if (finalStatus !== apiStatus) {
    logger.debug(`API状态被覆盖为: ${finalStatus}`);
  }

  logger.debug(`finalStatus值：${finalStatus}`);

  // 删除之前的 profileStatusClass 并重新赋值
  const updatedStatus = {
    ...status,
    profileStatusClass: finalStatus,  // 使用最终决定的状态
  };

  logger.debug(updatedStatus.profileStatusClass);

  let message;

  // 根据最终状态生成消息
  if (typeof updatedStatus.profileStatusClass === 'string') {
    if (updatedStatus.profileStatusClass === 'in-game') {
      message = `${updatedStatus.actualPersonaName} 开始玩 ${updatedStatus.profileInGameName}`;
    } else if (updatedStatus.profileStatusClass === 'In non-Steam game') {
      message = `${updatedStatus.actualPersonaName} 正在玩非 Steam 游戏`;
    } else if (updatedStatus.profileStatusClass === 'offline') {
      message = `${updatedStatus.actualPersonaName} 已离线`;
    } else if (updatedStatus.profileStatusClass === 'online') {
      message = `${updatedStatus.actualPersonaName} 上线了`;
    }
  } else {
    switch (updatedStatus.profileStatusClass) {
      case 0:  // API 返回的状态：离线
        message = `${updatedStatus.actualPersonaName} 已离线`;
        break;
      case 1:  // API 返回的状态：在线
        message = `${updatedStatus.actualPersonaName} 在线`;
        break;
      case 2:  // API 返回的状态：忙碌
        message = `${updatedStatus.actualPersonaName} 正忙`;
        break;
      case 3:  // API 返回的状态：离开
        message = `${updatedStatus.actualPersonaName} 表示暂时离开`;
        break;
      case 4:  // API 返回的状态：打盹
        message = `${updatedStatus.actualPersonaName} 的steam在打盹中`;
        break;
      case 5:  // API 返回的状态：寻找交易
        message = `${updatedStatus.actualPersonaName} 正在py交易`;
        break;
      case 6:  // API 返回的状态：寻找游戏
        message = `${updatedStatus.actualPersonaName} 正在找瑟瑟的游戏戏`;
        break;
      default:
        message = `${updatedStatus.actualPersonaName} 的状态更新了`;
    }
  }

  return message;
}


// 导出处理状态变化的函数
export { handleStatusChanges };