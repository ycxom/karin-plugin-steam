import { plugin } from 'node-karin';
import { readData, writeData, fetchSteamStatus } from '../lib/steamHelper.js';

export class SteamStatusPlugin extends plugin {
  constructor() {
    super({
      name: 'SteamStatusPlugin',
      dsc: '查询 Steam ID 状态的插件',
      priority: 1000,
      rule: [
        {
          reg: /^#查询Steam (.+)$/,
          fnc: 'querySteamStatus'
        },
        {
          reg: /^#绑定steam (.+)$/,
          fnc: 'bindSteam'
        },
        {
          reg: /^#查看我的steam$/,
          fnc: 'queryMySteam'
        },
        {
          reg: /^#查看@(.+)的steam$/,
          fnc: 'queryOtherSteam'
        }
      ]
    });
  }

  bindSteam(e) {
    const steamName = e.msg.replace(/^#绑定steam /, '').trim();
    const qq = e.sender.user_id;
    const data = readData();
    data[qq] = steamName;
    writeData(data);
    this.reply(`绑定成功：QQ ${qq} -> Steam ${steamName}`);
  }

  async querySteamStatus(e) {
    const playerName = e.msg.replace(/^#查询Steam /, '').trim();
    try {
      const status = await fetchSteamStatus(playerName);
      this.reply(formatSteamStatus(status));
    } catch {
      this.reply('查询失败，请稍后再试');
    }
  }

  async queryMySteam(e) {
    const qq = e.sender.user_id;
    const data = readData();
    const steamName = data[qq];
    if (!steamName) {
      this.reply('未绑定Steam账号。请使用 #绑定steam 用户名');
      return;
    }
    try {
      const status = await fetchSteamStatus(steamName);
      this.reply(formatSteamStatus(status));
    } catch {
      this.reply('查询失败，请稍后再试');
    }
  }

  async queryOtherSteam(e) {
    const match = e.msg.match(/^#查看@(.+)的steam$/);
    if (!match) {
      this.reply('命令格式错误。');
      return;
    }
    const qq = match[1];
    const data = readData();
    const steamName = data[qq];
    if (!steamName) {
      this.reply(`QQ号 ${qq} 未绑定Steam账号。`);
      return;
    }
    try {
      const status = await fetchSteamStatus(steamName);
      this.reply(formatSteamStatus(status));
    } catch {
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
  result += `头像链接: ${status.playerAvatarImg}`;
  return result;
}

export default new SteamStatusPlugin();
