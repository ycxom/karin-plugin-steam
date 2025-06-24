// apps/Group.js
import { karin, segment, logger } from 'node-karin';
import { getSteamIdByQQ, addSteamIdToGroup, removeSteamIdFromGroup, getSteamIdsInGroup } from '../lib/main/databaseOps.js';
import { fetchSteamStatus } from '../lib/main/fetchSteamStatus.js';
import { generateSteamUI } from '../lib/common/generateSteamUI.js';

/**
 * #steam加入群聊
 */
export const joinSteamGroup = karin.command(
  /^#[Ss]team加入群聊$/,
  async (e) => {
    const qq = e.sender.userId
    const groupId = String(e.groupId);
    const steamID = await getSteamIdByQQ(qq);
    logger.debug(`{steamID}: ${steamID}, QQ: ${qq}, Group ID: ${groupId}`);
    if (!steamID) {
      return e.reply('请先绑定 Steam 账号，再加入群聊。');
    }
    try {
      await addSteamIdToGroup(groupId, steamID); // 推荐加 await
      return e.reply(`成功将 Steam ID ${steamID} 加入群聊 ${groupId}`);
    } catch (error) {
      logger.error('加入群聊失败:', error);
      return e.reply('加入群聊失败，请稍后再试。');
    }
  },
  {
    name: 'join_steam_group',
    desc: '将已绑定Steam账号加入群Steam成员列表',
    priority: 1000,
    permission: 'all'
  }
);

/**
 * #steam退出群聊
 */
export const leaveSteamGroup = karin.command(
  /^#[Ss]team退出群聊$/,
  async (e) => {
    const qq = e.sender.userId;
    const groupId = String(e.groupId);
    const steamID = await getSteamIdByQQ(qq);
    if (!steamID) {
      return e.reply('您尚未绑定 Steam 账号。');
    }
    try {
      await removeSteamIdFromGroup(groupId, steamID);
      return e.reply(`成功将 Steam ID ${steamID} 从群聊 ${groupId} 中移除`);
    } catch (error) {
      logger.error('退出群聊失败:', error);
      return e.reply('退出群聊失败，请稍后再试。');
    }
  },
  {
    name: 'leave_steam_group',
    desc: '将已绑定Steam账号从群成员移除',
    priority: 1000,
    permission: 'all'
  }
);

/**
 * #查看群聊steam
 */
export const querySteamGroup = karin.command(
  /^#查看群聊[Ss]team$/,
  async (e) => {
    const groupId = String(e.groupId);
    try {
      const steamIDs = await getSteamIdsInGroup(groupId); // 这里最好当成异步
      if (!steamIDs || steamIDs.length === 0) {
        return e.reply(`群聊 ${groupId} 中没有绑定任何 Steam ID`);
      }
      const steamStatuses = [];
      for (const steamID of steamIDs) {
        try {
          const status = await fetchSteamStatus(steamID);
          if (status) steamStatuses.push(status);
        } catch (err) {
          logger.error(`获取SteamID ${steamID} 状态失败:`, err);
        }
      }
      if (steamStatuses.length === 0) {
        return e.reply(`群聊 ${groupId} 中未能获取有效的 Steam 状态`);
      }
      const base64Image = await generateSteamUI(steamStatuses);
      return e.reply(segment.image(`base64://${base64Image}`));
    } catch (error) {
      logger.error('生成群聊 Steam UI 失败:', error);
      return e.reply('生成 Steam 状态 UI 失败，请稍后再试');
    }
  },
  {
    name: 'query_steam_group',
    desc: '汇总显示本群绑定Steam成员状态',
    priority: 1000,
    permission: 'all'
  }
);

// 推荐用默认导出多个命令数组
export default [
  joinSteamGroup,
  leaveSteamGroup,
  querySteamGroup
];