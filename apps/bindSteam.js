import { plugin } from 'node-karin';
import { readData, writeData } from '../lib/main/readwritefile.js';
import { getSteamIDFromFriendCode, convertFriendCodeToSteamID64 } from '../lib/main/FriendCode.js';

export class SteamBindPlugin extends plugin {
  constructor() {
    super({
      name: 'SteamBindPlugin',
      dsc: '绑定和解绑Steam账号的插件',
      priority: 1000,
      rule: [
        {
          reg: /^#绑定[Ss]team\s*(.+)$/,
          fnc: 'bindSteamAccount'
        },
        {
          reg: /^#解绑[Ss]team$/,
          fnc: 'unbindSteamAccount'
        }
      ]
    });
  }

  async bindSteamAccount(e) {
    const input = e.msg.replace(/^#绑定[Ss]team\s*/, '').trim();
    const qq = e.sender.user_id;
    
    try {
      let steamID = input;
      if (/^\d{10}$/.test(input)) {
        steamID = convertFriendCodeToSteamID64(input);
      } else if (!/^\d{17}$/.test(input)) {
        steamID = await getSteamIDFromFriendCode(input);
      }

      let data = readData();
      if (!data) {
        data = {};
      }
      data[qq] = steamID;
      writeData(data);

      this.reply(`绑定成功：QQ ${qq} -> SteamID ${steamID}`);
    } catch (error) {
      this.reply('绑定失败，请确认好友代码/steamid/自定义URL正确后重试');
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
