import { plugin, segment } from 'node-karin';
import { readData, fetchSteamStatus } from '../lib/scrapeSteam.js';
import { screenshotSteamProfile, screenshotSteamFriends } from '../lib/screenshot.js';

export class SteamStatusPlugin extends plugin {
  constructor() {
    super({
      name: 'SteamStatusPlugin',
      dsc: '查询 Steam ID 状态的插件',
      priority: 1000,
      rule: [
        {
          reg: /^#查询[S|s]team (.+)$/,
          fnc: 'querySteamStatus'
        },
        {
          reg: /^#查看我的[S|s]team$/,
          fnc: 'queryMySteam'
        },
        {
          reg: /^#查看(?:\[at:(\d+)\]|(\d+))的steam$/,
          fnc: 'queryOtherSteam'
        },
        {
          reg: /^#查询[S|s]team好友 (.+)$/,
          fnc: 'querySteamFriends'
        }       
      ]
    });
  }

  async querySteamStatus(e) {
    const playerIdentifier = e.msg.replace(/^#查询[S|s]team /, '').trim();
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
      this.reply('未绑定Steam账号。请使用 #绑定steam 好友代码');
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

  async queryOtherSteam(e) {
    const match = e.msg.match(/^#查看(?:\[at:(\d+)\]|(\d+))的steam$/);
    if (!match) {
      this.reply('命令格式错误。');
      return;
    }
    const qq = match[1] || match[2];
    const data = readData();
    const steamID = data[qq];
    if (!steamID) {
      this.reply(`QQ号 ${qq} 未绑定Steam账号。`);
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
      console.error('Error querying other Steam status:', error);
    }
  }

  async querySteamFriends(e) {
    const playerIdentifier = e.msg.replace(/^#查询[S|s]team好友 /, '').trim();
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
