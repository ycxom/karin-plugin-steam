import { plugin } from 'node-karin';
import { readData, writeData, getSteamIDFromFriendCode } from '../lib/scrapeSteam.js';

export class SteamStatusPlugin extends plugin {
  constructor() {
    super({
      name: 'SteamStatusPlugin',
      dsc: '查询 Steam ID 状态的插件',
      priority: 1000,
      rule: [
        {
          reg: /^#绑定[S|s]team (.+)$/,
          fnc: 'bindSteam'
        },
        {
          reg: /^#解绑[S|s]team$/,
          fnc: 'unbindSteam'
        }
      ]
    });
  }
  
  async bindSteam(e) {
    const friendCode = e.msg.replace(/^#绑定[S|s]team /, '').trim();
    const qq = e.sender.user_id;
    console.log(` QQ: ${qq} 绑定: ${friendCode}`);
    
    if (!qq) {
      this.reply('绑定失败，无法获取QQ号。');
      return;
    }
    
    try {
      const steamID = await getSteamIDFromFriendCode(friendCode);
      const data = readData();
      if (!data[qq]) {
        data[qq] = {};
      }
      data[qq] = steamID;
      writeData(data);
      this.reply(`绑定成功：QQ ${qq} -> SteamID ${steamID}`);
    } catch (error) {
      this.reply('绑定失败，请检查好友代码是否正确。');
      console.error('Error:', error);
    }
  }

  async unbindSteam(e) {
    const qq = e.sender.user_id.toString();
    const data = readData();
    if (data[qq]) {
      delete data[qq];
      writeData(data);
      this.reply(`解绑成功：QQ ${qq}`);
    } else {
      this.reply(`未找到绑定的Steam账号：QQ ${qq}`);
    }
  }
}

export default new SteamStatusPlugin();
