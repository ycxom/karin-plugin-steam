import { karin, segment, logger } from 'node-karin'
import { getSteamIdByQQ } from '../lib/db/databaseOps.js'
import { fetchSteamStatus } from '../lib/main/fetchSteamStatus.js'
import { screenshotSteamProfile, screenshotSteamFriends } from '../lib/common/screenshot.js'
import { renderLibraryImage } from '../lib/main/SteamInventory.js'

/**
 * #查询steam xxx
 */
export const querySteamStatus = karin.command(
  /^#查询[Ss]team\s*(.+)$/,
  async (e) => {
    const playerIdentifier = e.msg.replace(/^#查询[Ss]team\s*/, '').trim();
    try {
      const status = await fetchSteamStatus(playerIdentifier);
      const result = await screenshotSteamProfile(playerIdentifier);
      if (result.error) {
        return e.reply(result.error);
      } else if (result.image) {
        return e.reply(segment.image(`base64://${result.image}`));
      } else {
        return e.reply(formatSteamStatus(status));
      }
    } catch (error) {
      logger.error('查询 Steam状态失败:', error);
      return e.reply('查询失败，请稍后再试');
    }
  },
  {
    name: 'query_steam_status',
    desc: '查询Steam用户状态',
    priority: 1000,
    permission: 'all'
  }
);

/**
 * #查看我的Steam
 */
export const queryMySteam = karin.command(
  /^#查看我的[Ss]team$/,
  async (e) => {
    const qq = e.sender.userId;
    const steamID = await getSteamIdByQQ(qq);
    if (!steamID) {
      return e.reply('未绑定Steam账号。请使用 #绑定steam 好友代码/steamid/自定义URL');
    }
    try {
      const status = await fetchSteamStatus(steamID);
      const result = await screenshotSteamProfile(steamID);
      if (result.error) {
        return e.reply(result.error);
      } else if (result.image) {
        return e.reply(segment.image(`base64://${result.image}`));
      } else {
        return e.reply(formatSteamStatus(status));
      }
    } catch (error) {
      logger.error('查询自己Steam状态失败:', error);
      return e.reply('查询失败，请稍后再试');
    }
  },
  {
    name: 'query_my_steam',
    desc: '查看已绑定QQ的Steam信息',
    priority: 1000,
    permission: 'all'
  }
);

/**
 * #查询steam好友 xxx
 */
export const querySteamFriends = karin.command(
  /^#查询[Ss]team好友\s*(.+)$/,
  async (e) => {
    const playerIdentifier = e.msg.replace(/^#查询[Ss]team好友\s*/, '').trim();
    try {
      const result = await screenshotSteamFriends(playerIdentifier);
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
    name: 'query_steam_friends',
    desc: '查询Steam好友信息',
    priority: 1000,
    permission: 'all'
  }
);

/**
 * #查看我的steam好友
 */
export const queryMySteamFriends = karin.command(
  /^#查看我的[Ss]team好友$/,
  async (e) => {
    const qq = e.sender.userId;
    const steamID = await getSteamIdByQQ(qq);
    if (!steamID) {
      return e.reply('未绑定Steam账号。请使用 #绑定steam 好友代码/steamid/自定义URL');
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
    name: 'query_my_steam_friends',
    desc: '查看自己Steam好友列表',
    priority: 1000,
    permission: 'all'
  }
);

/**
 * #查看我的steam库存
 */
export const queryMySteamLibrary = karin.command(
  /^#查看我的[Ss]team库存$/,
  async (e) => {
    const qq = e.sender.userId;
    const steamID = await getSteamIdByQQ(qq);
    if (!steamID) {
      return e.reply('未绑定Steam账号。请使用 #绑定steam 好友代码/steamid/自定义URL');
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
    name: 'query_my_steam_library',
    desc: '查看自己Steam的库存游戏',
    priority: 1000,
    permission: 'all'
  }
);

function formatSteamStatus(status) {
  if (!status) return '未找到玩家信息';
  let result = `
玩家名: ${status.actualPersonaName}
状态: ${status.profileStatus}
  `;
  if (status.profileStatus.includes('当前正在游戏')) {
    result += `游戏中: ${status.profileInGameName}\n`;
  }
  result += `头像截图已附上`;
  return result;
}