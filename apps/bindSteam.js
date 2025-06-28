// apps/bindSteam.js
import { karin, logger } from 'node-karin';
import { bindSteam, unbindSteam } from '../lib/db/databaseOps.js';
import { getValidatedSteamUser } from '../lib/main/FriendCode.js';

export const bindSteamAccount = karin.command(
  /^#绑定[Ss]team\s*(.+)$/,
  async (e) => {
    const input = e.msg.replace(/^#绑定[Ss]team\s*/, '').trim();
    const qq = e.sender.userId;

    e.reply('正在验证并绑定您的Steam账号，请稍候...', true);

    try {
      const steamUser = await getValidatedSteamUser(input);

      if (steamUser && steamUser.steamid) {
        await bindSteam(qq, steamUser.steamid);

        return e.reply(`✅ 绑定成功！\n您的QQ已关联到Steam用户：【${steamUser.personaname}】`);

      } else {
        return e.reply('❌ 绑定失败！\n请检查您输入的ID、好友代码或自定义URL是否正确，并确保您的Steam个人资料是公开的。');
      }
    } catch (error) {
      logger.error('绑定过程中发生未知错误:', error);
      return e.reply('绑定时发生内部错误，请稍后再试或联系管理员。');
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
    await unbindSteam(qq);
    return e.reply('解绑成功！');
  },
  {
    name: 'unbind_steam',
    desc: '解绑Steam账号',
    priority: 1000,
    permission: 'all'
  }
);

export default [
  bindSteamAccount,
  unbindSteamAccount
];