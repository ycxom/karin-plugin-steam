import { getSteamIDFromFriendCode } from './FriendCode.js';
import { getSteamIdByQQ, addSteamIdToGroup, removeSteamIdFromGroup, getSteamIdsInGroup } from '../db/databaseOps.js';

/**
 * 检查用户是否已绑定Steam账号
 * @param {string | number} qq 用户的QQ号
 * @returns {Promise<boolean>} 如果绑定了返回 true，否则 false
 */
export async function isUserBound(qq) {
  const steamId = await getSteamIdByQQ(qq);
  return !!steamId;
}

/**
 * 将一个Steam账号加入到群聊监控列表
 * @param {string} steamIdentifier 好友码或SteamID64
 * @param {string} groupId 群号
 * @returns {Promise<string>} 操作结果的消息
 */
export async function joinGroupSteam(steamIdentifier, groupId) {
  let steamID = steamIdentifier;
  // 如果输入不是标准的SteamID64，则尝试从好友码转换
  if (!/^\d{17}$/.test(steamID)) {
    try {
      steamID = await getSteamIDFromFriendCode(steamID);
      if (!steamID) throw new Error('无效的好友码或自定义URL。');
    } catch (error) {
      return `无法解析输入的标识符: ${error.message}`;
    }
  }

  const changes = await addSteamIdToGroup(groupId, steamID);
  if (changes > 0) {
    return `成功将 Steam ID ${steamID} 加入群聊 ${groupId}`;
  } else {
    return `Steam ID ${steamID} 已存在于群聊 ${groupId} 中，无需重复添加。`;
  }
}

/**
 * 将一个Steam账号从群聊监控列表移除
 * @param {string} steamIdentifier 好友码或SteamID64
 * @param {string} groupId 群号
 * @returns {Promise<string>} 操作结果的消息
 */
export async function leaveGroupSteam(steamIdentifier, groupId) {
  let steamID = steamIdentifier;
  if (!/^\d{17}$/.test(steamID)) {
    try {
      steamID = await getSteamIDFromFriendCode(steamID);
      if (!steamID) throw new Error('无效的好友码或自定义URL。');
    } catch (error) {
      return `无法解析输入的标识符: ${error.message}`;
    }
  }

  const changes = await removeSteamIdFromGroup(groupId, steamID);
  if (changes > 0) {
    return `成功将 Steam ID ${steamID} 从群聊 ${groupId} 中移除`;
  } else {
    return `Steam ID ${steamID} 原本就不在群聊 ${groupId} 的监控列表中。`;
  }
}

/**
 * 查询群聊中所有已绑定的Steam账号
 * @param {string} groupId 群号
 * @returns {Promise<string|string[]>} 成功时返回Steam ID数组，失败或无数据时返回提示消息
 */
export async function queryGroupSteam(groupId) {
  const steamIds = await getSteamIdsInGroup(groupId);

  if (!steamIds || steamIds.length === 0) {
    return `群聊 ${groupId} 中没有绑定任何 Steam ID`;
  }
  return steamIds;
}