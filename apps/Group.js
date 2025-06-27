// apps/Group.js
import { karin, segment, logger } from 'node-karin';
import { getSteamIdByQQ, addSteamIdToGroup, removeSteamIdFromGroup, getSteamIdsInGroup } from '../lib/db/databaseOps.js';
import { fetchPlayersSummariesAPI, fetchPlayerProfileAPI } from '../lib/main/fetchSteamStatus.js';
import { generateSteamUI } from '../lib/common/generateSteamUI.js';
import { debuglog } from '../lib/debuglog.js';

/**
 * #steam加入群聊
 */
export const joinSteamGroup = karin.command(
  /^#[Ss]team加入群聊$/,
  async (e) => {
    const qq = e.sender.userId
    const groupId = String(e.groupId);
    const steamID = await getSteamIdByQQ(qq);
    debuglog(`{steamID}: ${steamID}, QQ: ${qq}, Group ID: ${groupId}`);
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
 * #查看群聊steam (已优化)
 */
export const querySteamGroup = karin.command(
  /^#查看群聊[Ss]team$/,
  async (e) => {
    const groupId = String(e.groupId);
    try {
      const steamIDs = await getSteamIdsInGroup(groupId);
      if (!steamIDs || steamIDs.length === 0) {
        return e.reply(`群聊 ${groupId} 中没有绑定任何 Steam ID`);
      }

      // 1. 使用新API批量获取用户信息
      const playersSummaries = await fetchPlayersSummariesAPI(steamIDs);
      if (playersSummaries.size === 0) {
        return e.reply(`群聊 ${groupId} 中未能获取到任何有效的 Steam 状态。`);
      }

      const steamStatuses = [];
      const profilePromises = [];

      // 2. 准备并行获取头像框等详细信息
      for (const steamID of steamIDs) {
        if (playersSummaries.has(steamID)) {
          profilePromises.push(
            fetchPlayerProfileAPI(steamID).then(profile => ({ steamID, profile }))
          );
        }
      }

      const profiles = await Promise.all(profilePromises);
      const profileMap = new Map(profiles.map(p => [p.steamID, p.profile]));

      // 3. 构建UI所需的数据结构
      for (const steamID of steamIDs) {
        const summary = playersSummaries.get(steamID);
        if (!summary) continue;

        const profile = profileMap.get(steamID);
        const personastate = summary.personastate || 0;
        const isInGame = !!summary.gameextrainfo;

        let profileStatusClass = 'offline';
        let profileStatusText = '当前离线';

        const statusMap = {
          1: '在线', 2: '正忙', 3: '离开', 4: '打盹',
          5: '想交易', 6: '想玩游戏'
        };

        if (isInGame) {
          profileStatusClass = 'in-game';
          profileStatusText = '当前正在游戏';
        } else if (personastate > 0) {
          profileStatusClass = 'online';
          profileStatusText = statusMap[personastate] || '在线';
        }

        steamStatuses.push({
          actualPersonaName: summary.personaname,
          profileStatus: profileStatusText,
          profileInGameName: summary.gameextrainfo || '',
          playerAvatarImg: summary.avatarfull,
          frameImg: profile ? profile.frameImg : null, // 使用 fetchPlayerProfileAPI 获取的数据
          profileStatusClass: profileStatusClass,
          steamid: steamID
        });
      }

      if (steamStatuses.length === 0) {
        return e.reply(`群聊 ${groupId} 中未能获取到任何有效的 Steam 状态。`);
      }

      // 4. 生成并发送图片
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