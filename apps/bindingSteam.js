import { plugin, segment } from 'node-karin';
import { readData } from '../lib/main/readwritefile.js';
import {  fetchSteamStatus } from '../lib/main/fetchSteamStatus.js';
import { screenshotSteamProfile, screenshotSteamFriends } from '../lib/common/screenshot.js';
import { fetchSteamLibrary, renderGamesToBase64 } from '../lib/main/SteamInventory.js';

export class SteamStatusPlugin extends plugin {
  constructor() {
    super({
      name: 'SteamStatusPlugin',
      dsc: '查询 Steam ID 状态的插件',
      priority: 1000,
      rule: [
        {
          reg: /^#查询[Ss]team\s*(.+)$/,
          fnc: 'querySteamStatus'
        },
        {
          reg: /^#查看我的[Ss]team$/,
          fnc: 'queryMySteam'
        },
        {
          reg: /^#查询[Ss]team好友\s*(.+)$/,
          fnc: 'querySteamFriends'
        },
        {
          reg: /^#查看我的[Ss]team好友$/,
          fnc: 'queryMySteamFriends'
        },
        {
          reg: /^#查看我的[Ss]team库存$/,
          fnc: 'queryMysteamLibraryCommand'
        }
      ]
    });
  }

  async querySteamStatus(e) {
    const playerIdentifier = e.msg.replace(/^#查询[Ss]team\s*/,'').trim();
    try {
      const status = await fetchSteamStatus(playerIdentifier);
      const result = await screenshotSteamProfile(playerIdentifier);
      if (result.error) {
        this.reply(result.error);
      } else if (result.image) {
        this.reply(segment.image(`base64://${result.image}`));
      } else {
        this.reply(formatSteamStatus(status));
      }
    } catch (error) {
      this.reply('查询失败，请稍后再试');
      console.error('Error querying Steam status:', error);
    }
  }

  async queryMySteam(e) {
    const qq = e.sender.user_id;
    const data = readData();
    const steamID = data[qq];
    if (!steamID) {
      this.reply('未绑定Steam账号。请使用 #绑定steam 好友代码/steamid/自定义URL');
      return;
    }
    try {
      const status = await fetchSteamStatus(steamID);
      const result = await screenshotSteamProfile(steamID);
      if (result.error) {
        this.reply(result.error);
      } else if (result.image) {
        this.reply(segment.image(`base64://${result.image}`));
      } else {
        this.reply(formatSteamStatus(status));
      }
    } catch (error) {
      this.reply('查询失败，请稍后再试');
      console.error('Error querying my Steam status:', error);
    }
  }


  async querySteamFriends(e) {
    const playerIdentifier = e.msg.replace(/^#查询[Ss]team好友\s*/,'').trim();
    try {
      const result = await screenshotSteamFriends(playerIdentifier);
      if (result.error) {
        this.reply(result.error);
      } else if (result.image) {
        this.reply(segment.image(`base64://${result.image}`));
      }
    } catch (error) {
      console.error('Error querying steam friends:', error);
      this.reply('查询失败，请稍后再试');
    }
  }
  async queryMySteamFriends(e) {
    const qq = e.sender.user_id;
    const data = readData();
    const steamID = data[qq];
    if (!steamID) {
      this.reply('未绑定Steam账号。请使用 #绑定steam 好友代码/steamid/自定义URL');
      return;
    }
    try {
      const result = await screenshotSteamFriends(steamID);
      if (result.error) {
        this.reply(result.error);
      } else if (result.image) {
        this.reply(segment.image(`base64://${result.image}`));
      }
    } catch (error) {
      console.error('Error querying my Steam friends:', error);
      this.reply('查询失败，请稍后再试');
    }
  }


  async queryMysteamLibraryCommand(e) {
    const qq = e.sender.user_id;
    const data = readData();
    const steamID = data[qq];
    if (!steamID) {
      this.reply('未绑定Steam账号。请使用 #绑定steam 好友代码/steamid/自定义URL');
      return;
    }
    try {
      const steamUserId = await fetchSteamLibrary(steamID);

      if (steamUserId && steamUserId.length > 0) {
          const base64Content = await renderGamesToBase64(steamUserId);
          logger.log(`[steamLibraryCommand] 准备发送游戏库信息到群聊`);
          e.reply(segment.image(`base64://${base64Content}`));
      } else {
          logger.warn(`[steamLibraryCommand] 用户 ${steamUserId} 没有游戏或获取游戏库失败。`);
          e.reply(`用户 ${steamUserId} 没有游戏或获取游戏库失败。`);
      }
    } catch (error) {
      this.reply('查询失败，请稍后再试');
      console.error('Error querying my Steam status:', error);
    }
  }
}
function formatSteamStatus(status) {
  if (!status) {
    return '未找到玩家';
  }
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

export default new SteamStatusPlugin();
