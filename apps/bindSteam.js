import { plugin } from 'node-karin';
import { readData, writeData, getSteamIDFromFriendCode } from '../lib/scrapeSteam.js';

export class SteamBindPlugin extends plugin {
  constructor() {
    super({
      name: 'SteamBindPlugin',
      dsc: '绑定和解绑Steam账号的插件',
      priority: 1000,
      rule: [
        {
          reg: /^#绑定[S|s]team (.+)$/,
          fnc: 'bindSteamAccount'
        },
        {
          reg: /^#解绑[S|s]team$/,
          fnc: 'unbindSteamAccount'
        }
      ]
    });
  }

  async bindSteamAccount(e) {
    const friendCode = e.msg.replace(/^#绑定[S|s]team /, '').trim();
    const qq = e.sender.user_id;
    
    try {
      let steamID = friendCode;
      if (!/^\d{17}$/.test(friendCode)) {
        steamID = await getSteamIDFromFriendCode(friendCode);
      }
      let data = readData();
      if (!data) {
        data = {};
      }
      data[qq] = steamID;
      writeData(data);

      this.reply(`绑定成功：QQ ${qq} -> SteamID ${steamID}`);
    } catch (error) {
      this.reply('绑定失败，请确认好友代码正确后重试');
      console.error('Error binding Steam account:', error);
    }
  }

  unbindSteamAccount(e) {
    const qq = e.sender.user_id;
    let data = readData();
    
    if (data[qq]) {
      delete data[qq];
      writeData(data);
      this.reply('解绑成功！');
    } else {
      this.reply('您未绑定Steam账号。');
    }
  }
}

export default new SteamBindPlugin();
