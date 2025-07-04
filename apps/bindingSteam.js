// apps/bindingSteam.js (修复版)
import { karin, segment, logger } from 'node-karin';
import { getBoundAccountByAlias, getDefaultSteamIdByQQ } from '../lib/db/databaseOps.js';
import { fetchSteamStatus } from '../lib/main/fetchSteamStatus.js';
import { screenshotSteamProfile, screenshotSteamFriends } from '../lib/common/screenshot.js';
import { renderLibraryImage } from '../lib/main/SteamInventory.js';
import { getValidatedSteamUser } from '../lib/main/FriendCode.js';

// 辅助函数，用于安全地获取目标 Steam ID
async function getTargetSteamId(e, identifier) {
  const qq = e.sender.userId;
  if (identifier) {
    const account = await getBoundAccountByAlias(qq, identifier);
    if (account) {
      return account.steam_id;
    }
    return identifier;
  }

  const steamID = await getDefaultSteamIdByQQ(qq);
  if (!steamID) {
    e.reply('您尚未绑定任何Steam账号或未设置默认账号。\n请使用 `#绑定steam <ID> 别名 <别名>` 进行绑定，或在查询时指定别名/ID。');
    return null;
  }
  return steamID;
}

// #查询steam [别名/ID]
export const querySteamStatus = karin.command(
  // 使用负向先行断言避免与更具体的命令冲突
  /^#查询[Ss]team(?!\s*好友|\s*库存)/,
  async (e) => {
    const playerIdentifier = e.msg.replace(/^#查询[Ss]team\s*/, '').trim() || null;
    try {
      const targetId = await getTargetSteamId(e, playerIdentifier);
      if (!targetId) return;

      const validatedUser = await getValidatedSteamUser(targetId);
      if (!validatedUser) {
        return e.reply(`无法找到用户 "${targetId}" 或其个人资料为私密。`);
      }

      const result = await screenshotSteamProfile(validatedUser.steamid);
      if (result.error) {
        return e.reply(result.error);
      } else if (result.image) {
        return e.reply(segment.image(`base64://${result.image}`));
      } else {
        const status = await fetchSteamStatus(validatedUser.steamid);
        return e.reply(`玩家名: ${status.actualPersonaName}\n状态: ${status.profileStatus}`);
      }
    } catch (error) {
      logger.error('查询 Steam状态失败:', error);
      return e.reply('查询失败，请稍后再试');
    }
  },
  {
    name: 'query_steam_status_alias',
    desc: '查询自己或他人的Steam状态，可@用户或使用ID/别名',
    priority: 1001, // 优先级略低于更具体的命令
    permission: 'all'
  }
);

// #查看我的steam [别名]
export const queryMySteam = karin.command(
  // 使用负向先行断言来避免与更具体的命令冲突
  /^#查看我的[Ss]team(?!\s*库存|\s*好友)/,
  async (e) => {
    const alias = e.msg.replace(/^#查看我的[Ss]team\s*/, '').trim() || null;
    const qq = e.sender.userId;
    let steamID;

    if (alias) {
      const account = await getBoundAccountByAlias(qq, alias);
      if (!account) {
        return e.reply(`未找到别名为 "${alias}" 的绑定。`);
      }
      steamID = account.steam_id;
    } else {
      steamID = await getDefaultSteamIdByQQ(qq);
      if (!steamID) {
        return e.reply('未绑定Steam账号或未设置默认账号。请使用 `#绑定steam <ID> 别名 <别名>` 或指定别名。');
      }
    }

    try {
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
      logger.error('查询自己Steam状态失败:', error);
      return e.reply('查询失败，请稍后再试');
    }
  },
  {
    name: 'query_my_steam_alias',
    desc: '查看自己绑定的默认或指定别名的Steam账号状态',
    priority: 1001, // 优先级略低于更具体的命令
    permission: 'all'
  }
);

// #查询steam好友 [别名/ID]
export const querySteamFriends = karin.command(
  /^#查询[Ss]team好友/,
  async (e) => {
    const playerIdentifier = e.msg.replace(/^#查询[Ss]team好友\s*/, '').trim() || null;
    try {
      const targetId = await getTargetSteamId(e, playerIdentifier);
      if (!targetId) return;

      const validatedUser = await getValidatedSteamUser(targetId);
      if (!validatedUser) {
        return e.reply(`无法找到用户 "${targetId}" 或其个人资料为私密。`);
      }

      const result = await screenshotSteamFriends(validatedUser.steamid);
      if (result.error) {
        return e.reply(result.error);
      } else if (result.image) {
        return e.reply(segment.image(`base64://${result.image}`));
      }
    } catch (error) {
      logger.error('查询 Steam好友失败:', error);
      return e.reply('查询失败，请稍后再试');
    }
  },
  {
    name: 'query_steam_friends_alias',
    desc: '截图查询自己或他人的Steam好友列表',
    priority: 1000,
    permission: 'all'
  }
);

// #查看我的steam好友 [别名]
export const queryMySteamFriends = karin.command(
  /^#查看我的[Ss]team好友/,
  async (e) => {
    const alias = e.msg.replace(/^#查看我的[Ss]team好友\s*/, '').trim() || null;
    const qq = e.sender.userId;
    let steamID;

    if (alias) {
      const account = await getBoundAccountByAlias(qq, alias);
      if (!account) {
        return e.reply(`未找到别名为 "${alias}" 的绑定。`);
      }
      steamID = account.steam_id;
    } else {
      steamID = await getDefaultSteamIdByQQ(qq);
      if (!steamID) {
        return e.reply('未绑定Steam账号或未设置默认账号。请使用 `#绑定steam <ID> 别名 <别名>` 或指定别名。');
      }
    }

    try {
      const result = await screenshotSteamFriends(steamID);
      if (result.error) {
        return e.reply(result.error);
      } else if (result.image) {
        return e.reply(segment.image(`base64://${result.image}`));
      }
    } catch (error) {
      logger.error('查询自己Steam好友失败:', error);
      return e.reply('查询失败，请稍后再试');
    }
  },
  {
    name: 'query_my_steam_friends_alias',
    desc: '查看自己绑定的默认或指定别名的Steam好友列表',
    priority: 1000,
    permission: 'all'
  }
);

// #查看我的steam库存 [别名]
export const queryMySteamLibrary = karin.command(
  /^#查看我的[Ss]team库存/,
  async (e) => {
    const alias = e.msg.replace(/^#查看我的[Ss]team库存\s*/, '').trim() || null;
    const qq = e.sender.userId;
    let steamID;

    if (alias) {
      const account = await getBoundAccountByAlias(qq, alias);
      if (!account) {
        return e.reply(`未找到别名为 "${alias}" 的绑定。`);
      }
      steamID = account.steam_id;
    } else {
      steamID = await getDefaultSteamIdByQQ(qq);
      if (!steamID) {
        return e.reply('未绑定Steam账号或未设置默认账号。请使用 `#绑定steam <ID> 别名 <别名>` 或指定别名。');
      }
    }

    try {
      e.reply("正在生成您的库存图片，请稍候...", true);
      const base64Content = await renderLibraryImage(steamID);
      logger.log(`[queryMySteamLibrary] 准备发送游戏库信息`);
      return e.reply(segment.image(`base64://${base64Content}`), true);
    } catch (error) {
      logger.error('查询 Steam 库存失败:', error);
      return e.reply('查询失败，请稍后再试');
    }
  },
  {
    name: 'query_my_steam_library_alias',
    desc: '查看自己Steam的库存游戏，可指定别名',
    priority: 1000,
    permission: 'all'
  }
);

export default [
  querySteamStatus,
  queryMySteam,
  querySteamFriends,
  queryMySteamFriends,
  queryMySteamLibrary
];
