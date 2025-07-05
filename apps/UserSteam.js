import { karin, segment, logger } from 'node-karin';
import { getBoundAccountByAlias, getDefaultSteamIdByQQ, getBoundAccountsByQQ } from '../lib/db/databaseOps.js';
import { fetchSteamStatus, fetchPlayersSummariesAPI } from '../lib/main/fetchSteamStatus.js';
import { screenshotSteamProfile } from '../lib/common/screenshot.js';
import { renderFriendsListImage } from '../lib/main/friendsRenderer.js';
import { getValidatedSteamUser } from '../lib/main/FriendCode.js';

// #查看Steam [@用户] [别名]
export const queryUserSteam = karin.command(
  /#查看[Ss]team(?!\s*好友|\s*绑定|\s*库存)/,
  async (e) => {
    if (!e.at || e.at.length === 0) {
      return;
    }

    const targetQQ = e.at[0];
    const alias = e.msg
      .replace(/#查看[Ss]team\s*/, '')
      .trim();

    let steamID = null;

    try {
      if (alias) {
        const account = await getBoundAccountByAlias(targetQQ, alias);
        if (!account) {
          return e.reply(`用户 ${targetQQ} 没有绑定名为“${alias}”的别名。`);
        }
        steamID = account.steam_id;
      } else {
        steamID = await getDefaultSteamIdByQQ(targetQQ);
        if (!steamID) {
          return e.reply(`QQ号 ${targetQQ} 未绑定Steam账号或未设置默认账号。`);
        }
      }

      const result = await screenshotSteamProfile(steamID);

      if (result.error) {
        return e.reply(result.error);
      } else if (result.image) {
        return e.reply(segment.image(`base64://${result.image}`));
      } else {
        const status = await fetchSteamStatus(steamID);
        return e.reply(`玩家名: ${status.actualPersonaName}\n状态: ${status.profileStatus}`);
      }
    } catch (error) {
      logger.error(`[queryUserSteam] 查询QQ:${targetQQ} Steam状态出错:`, error);
      return e.reply('查询失败，请稍后再试');
    }
  },
  {
    name: 'queryUserSteam',
    desc: '查看自己或@他人已绑定的所有Steam',
    priority: 1002,
    permission: 'all'
  }
);

// #查看Steam好友 [@用户] [别名]
export const queryUserSteamFriends = karin.command(
  /#查看[Ss]team好友/,
  async (e) => {
    if (!e.at || e.at.length === 0) {
      return;
    }

    const targetQQ = e.at[0];
    const alias = e.msg
      .replace(/#查看[Ss]team好友\s*/, '')
      .trim();

    let steamID = null;

    try {
      if (alias) {
        const account = await getBoundAccountByAlias(targetQQ, alias);
        if (!account) {
          return e.reply(`用户 ${targetQQ} 没有绑定名为“${alias}”的别名。`);
        }
        steamID = account.steam_id;
      } else {
        steamID = await getDefaultSteamIdByQQ(targetQQ);
        if (!steamID) {
          return e.reply(`QQ号 ${targetQQ} 未绑定Steam账号或未设置默认账号。`);
        }
      }

      const steamUser = await getValidatedSteamUser(steamID);
      // 如果获取失败，提供一个回退的名称
      const steamNickname = steamUser ? steamUser.personaname : `玩家(ID:${steamID})`;

      e.reply(`正在获取 Steam 用户【${steamNickname}】的好友列表，请稍候...`, true);

      const base64Image = await renderFriendsListImage(steamID);
      return e.reply(segment.image(`base64://${base64Image}`));

    } catch (error) {
      logger.error(`[queryUserSteamFriends] 查询QQ:${targetQQ} 好友情况出错:`, error);
      return e.reply(`查询好友列表失败：${error.message}`);
    }
  },
  {
    name: 'queryUserSteamFriends',
    desc: '查看自己或@他人已绑定的所有Steam好友列表',
    priority: 1001,
    permission: 'all'
  }
);

// 查询绑定列表命令
export const queryBoundAccounts = karin.command(
  /#(?:查看|查询)(?:我的)?(?:[Ss]team绑定|绑定[Ss]team)/,
  async (e) => {
    let targetQQ = e.sender.userId;
    let isQueryingSelf = true;

    // 提取参数，可能是 @ 或者 QQ号
    const args = e.msg.replace(/#(?:查看|查询)(?:我的)?(?:[Ss]team绑定|绑定[Ss]team)\s*/, '').trim();

    if (e.at && e.at.length > 0) {
      targetQQ = e.at[0];
      isQueryingSelf = false;
    } else if (args && /^\d{5,12}$/.test(args)) {
      targetQQ = args;
      isQueryingSelf = false;
    }

    const accounts = await getBoundAccountsByQQ(targetQQ);
    if (accounts.length === 0) {
      const who = isQueryingSelf ? '您' : `用户 ${targetQQ}`;
      return e.reply(`${who}尚未绑定任何Steam账号。`);
    }

    const steamIds = accounts.map(acc => acc.steam_id);
    const summaries = await fetchPlayersSummariesAPI(steamIds);

    const who = isQueryingSelf ? '您' : `用户 ${targetQQ}`;
    let replyMsg = `${who}已绑定的Steam账号：\n`;
    for (const acc of accounts) {
      const summary = summaries.get(acc.steam_id);
      const steamName = summary ? summary.personaname : '（无法获取）';

      replyMsg += `\n- 别名: ${acc.alias}${acc.is_default ? ' (默认)' : ''}`;
      replyMsg += `\n  用户名: ${steamName}`;
      replyMsg += `\n  SteamID: ${acc.steam_id}`;
    }
    return e.reply(replyMsg);
  },
  {
    name: 'query_bound_steam_accounts',
    desc: '查看自己或@他人已绑定的所有Steam账号列表',
    priority: 1000,
    permission: 'all'
  }
);

export default [
  queryUserSteam,
  queryUserSteamFriends,
  queryBoundAccounts
];