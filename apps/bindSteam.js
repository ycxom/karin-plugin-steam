import { karin } from 'node-karin';
import { bindSteam, unbindSteam } from '../lib/db/databaseOps.js';
import { getSteamIDFromFriendCode, convertFriendCodeToSteamID64 } from '../lib/main/FriendCode.js';

export const bindSteamAccount = karin.command(
  /^#绑定[Ss]team\s*(.+)$/,
  async (e) => {
    const input = e.msg.replace(/^#绑定[Ss]team\s*/, '').trim();
    const qq = e.sender.userId;
    try {
      let steamID = input;
      if (/^\d{10}$/.test(input)) {
        steamID = convertFriendCodeToSteamID64(input);
      } else if (!/^\d{17}$/.test(input)) {
        steamID = await getSteamIDFromFriendCode(input);
      }
      await bindSteam(qq, steamID);   // 建议加 await
      return e.reply(`绑定成功：QQ ${qq} -> SteamID ${steamID}`);
    } catch (error) {
      logger.error('绑定出错:', error);
      return e.reply('绑定失败，请检查输入！');
    }
  },
  {
    name: 'bind_steam',
    desc: '绑定Steam账号',
    priority: 1000,
    permission: 'all'
  }
);

export const unbindSteamAccount = karin.command(
  /^#解绑[Ss]team$/,
  async (e) => {
    const qq = e.sender.userId;
    await unbindSteam(qq);  // 建议加 await
    return e.reply('解绑成功！');
  },
  {
    name: 'unbind_steam',
    desc: '解绑Steam账号',
    priority: 1000,
    permission: 'all'
  }
);

// 推荐默认导出
export default [
  bindSteamAccount,
  unbindSteamAccount
];