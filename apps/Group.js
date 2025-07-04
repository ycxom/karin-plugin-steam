// apps/Group.js
import { karin, segment, logger } from 'node-karin';
import { getBoundAccountByAlias, getDefaultSteamIdByQQ, addSteamIdToGroup, removeSteamIdFromGroup, getSteamIdsInGroup } from '../lib/db/databaseOps.js';
import { fetchPlayersSummariesAPI, fetchPlayerProfileAPI } from '../lib/main/fetchSteamStatus.js';
import { generateSteamUI } from '../lib/common/generateSteamUI.js';
import { debuglog } from '../lib/debuglog.js';

export const joinSteamGroup = karin.command(
  /^#[Ss]team加入群聊/,
  async (e) => {
    const qq = e.sender.userId;
    const groupId = String(e.groupId);
    // 从消息字符串中直接解析参数，更稳定
    const alias = e.msg.replace(/^#[Ss]team加入群聊\s*/, '').trim() || null;
    let steamID;
    let targetAlias;

    if (alias) {
      const account = await getBoundAccountByAlias(qq, alias);
      if (!account) {
        return e.reply(`未找到别名为 "${alias}" 的绑定。`);
      }
      steamID = account.steam_id;
      targetAlias = alias;
    } else {
      steamID = await getDefaultSteamIdByQQ(qq);
      if (!steamID) {
        return e.reply('请先绑定 Steam 账号并设置默认账号，或指定一个别名。');
      }
      targetAlias = '默认账号';
    }

    try {
      await addSteamIdToGroup(groupId, steamID);
      return e.reply(`成功将您的Steam账号（${targetAlias}）加入本群监控列表。`);
    } catch (error) {
      logger.error('加入群聊失败:', error);
      return e.reply('加入群聊失败，请稍后再试。');
    }
  },
  {
    name: 'join_steam_group_alias',
    desc: '将自己绑定的Steam账号加入当前群聊的播报列表',
    priority: 1000,
    permission: 'all'
  }
);

export const leaveSteamGroup = karin.command(
  /^#[Ss]team退出群聊/,
  async (e) => {
    const qq = e.sender.userId;
    const groupId = String(e.groupId);
    // 从消息字符串中直接解析参数
    const alias = e.msg.replace(/^#[Ss]team退出群聊\s*/, '').trim() || null;
    let steamID;
    let targetAlias;

    if (alias) {
      const account = await getBoundAccountByAlias(qq, alias);
      if (!account) {
        return e.reply(`未找到别名为 "${alias}" 的绑定。`);
      }
      steamID = account.steam_id;
      targetAlias = alias;
    } else {
      steamID = await getDefaultSteamIdByQQ(qq);
      if (!steamID) {
        return e.reply('您尚未绑定Steam账号或未设置默认账号，请指定一个别名。');
      }
      targetAlias = '默认账号';
    }

    try {
      await removeSteamIdFromGroup(groupId, steamID);
      return e.reply(`成功将您的Steam账号（${targetAlias}）从本群监控列表中移除。`);
    } catch (error) {
      logger.error('退出群聊失败:', error);
      return e.reply('退出群聊失败，请稍后再试。');
    }
  },
  {
    name: 'leave_steam_group_alias',
    desc: '将自己绑定的Steam账号从当前群聊的播报列表移除',
    priority: 1000,
    permission: 'all'
  }
);

export const querySteamGroup = karin.command(
  /^#查看群聊[Ss]team$/,
  async (e) => {
    const groupId = String(e.groupId);
    try {
      const steamIDs = await getSteamIdsInGroup(groupId);
      if (!steamIDs || steamIDs.length === 0) {
        return e.reply(`本群中没有绑定任何 Steam ID`);
      }

      const playersSummaries = await fetchPlayersSummariesAPI(steamIDs);
      if (playersSummaries.size === 0) {
        return e.reply(`本群中未能获取到任何有效的 Steam 状态。`);
      }

      const steamStatuses = [];
      const profilePromises = [];

      for (const steamID of steamIDs) {
        if (playersSummaries.has(steamID)) {
          profilePromises.push(
            fetchPlayerProfileAPI(steamID).then(profile => ({ steamID, profile }))
          );
        }
      }

      const profiles = await Promise.all(profilePromises);
      const profileMap = new Map(profiles.map(p => [p.steamID, p.profile]));

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
          frameImg: profile ? profile.frameImg : null,
          profileStatusClass: profileStatusClass,
          steamid: steamID
        });
      }

      if (steamStatuses.length === 0) {
        return e.reply(`本群中未能获取到任何有效的 Steam 状态。`);
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

export default [
  joinSteamGroup,
  leaveSteamGroup,
  querySteamGroup
];
