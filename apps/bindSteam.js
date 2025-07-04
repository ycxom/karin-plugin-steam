// apps/bindSteam.js
import { karin, logger } from 'node-karin';
import { bindSteam, unbindSteam, getBoundAccountsByQQ, setDefaultSteam, getBoundAccountByAlias } from '../lib/db/databaseOps.js';
import { getValidatedSteamUser } from '../lib/main/FriendCode.js';
import { fetchPlayersSummariesAPI } from '../lib/main/fetchSteamStatus.js';

// 绑定命令
export const bindSteamAccount = karin.command(
  /^#(?:绑定steam|steam绑定)/,
  async (e) => {
    const argsStr = e.msg.replace(/^#(?:绑定steam|steam绑定)\s*/, '').trim();

    if (!argsStr) {
      return e.reply('请提供要绑定的SteamID、好友代码或自定义URL。\n用法: `#绑定steam <ID> [别名 <别名>]`\n如果未提供别名，将使用您的Steam用户名作为别名。');
    }

    const qq = e.sender.userId;
    let steamIdentifier;
    let alias = null;

    const aliasRegex = /\s+(?:别名|as)\s+(.+)$/;
    const aliasMatch = argsStr.match(aliasRegex);

    if (aliasMatch) {
      steamIdentifier = argsStr.substring(0, aliasMatch.index).trim();
      alias = aliasMatch[1].trim();
    } else {
      steamIdentifier = argsStr;
    }

    if (!steamIdentifier) {
      return e.reply('❌ 绑定失败，未提供Steam ID。');
    }

    if (alias && !alias.trim()) {
      return e.reply('❌ 绑定失败！别名不能为空。');
    }

    e.reply('正在验证并绑定您的Steam账号，请稍候...', true);

    try {
      const steamUser = await getValidatedSteamUser(steamIdentifier);
      if (!steamUser || !steamUser.steamid) {
        return e.reply('❌ 绑定失败！\n请检查您输入的ID、好友代码或自定义URL是否正确，并确保您的Steam个人资料是公开的。');
      }

      const existingBindings = await getBoundAccountsByQQ(qq);

      if (existingBindings.some(b => b.steam_id === steamUser.steamid)) {
        return e.reply(`❌ 绑定失败！\n此Steam账号（${steamUser.personaname}）已被您用其他别名绑定过，无需重复绑定。`);
      }

      if (alias) {
        if (existingBindings.some(b => b.alias.toLowerCase() === alias.toLowerCase())) {
          return e.reply(`❌ 绑定失败！\n别名 "${alias}" 已被使用。如果您想更新此别名，请先解绑。`);
        }
      } else {
        // 如果用户未提供别名，使用用户名并确保其唯一性
        alias = steamUser.personaname;
        let counter = 2;
        let originalAlias = alias;
        while (existingBindings.some(b => b.alias.toLowerCase() === alias.toLowerCase())) {
          alias = `${originalAlias}_${counter}`;
          counter++;
        }
      }

      await bindSteam(qq, steamUser.steamid, alias);
      const isDefault = existingBindings.length === 0;

      let replyMsg = `✅ 绑定成功！\n别名【${alias}】已关联到Steam用户：【${steamUser.personaname}】`;
      if (isDefault) {
        replyMsg += '\n此账号已自动设为您的默认账号。';
      }
      return e.reply(replyMsg);

    } catch (error) {
      logger.error('绑定过程中发生未知错误:', error);
      if (error.message && error.message.includes('SQLITE_CONSTRAINT')) {
        return e.reply('❌ 绑定失败！您提供的别名或Steam账号已被绑定。');
      }
      return e.reply('绑定时发生内部错误，请稍后再试或联系管理员。');
    }
  },
  {
    name: 'bind_steam_flexible',
    desc: '绑定Steam账号，可选择性设置别名，如#绑定Steam xxxx [别名]',
    priority: 1000,
    permission: 'all'
  }
);

// 解绑命令
export const unbindSteamAccount = karin.command(
  /^#(?:解绑steam|steam解绑)/,
  async (e) => {
    const qq = e.sender.userId;
    const identifier = e.msg.replace(/^#(?:解绑steam|steam解绑)\s*/, '').trim();

    const accounts = await getBoundAccountsByQQ(qq);
    if (accounts.length === 0) {
      return e.reply('您尚未绑定任何Steam账号。');
    }

    if (!identifier) {
      const steamIds = accounts.map(acc => acc.steam_id);
      const summaries = await fetchPlayersSummariesAPI(steamIds);

      let replyMsg = '请提供要解绑的别名、Steam用户名或SteamID。\n例如：`#解绑steam 大号`\n\n您已绑定的账号有：\n';
      for (const acc of accounts) {
        const summary = summaries.get(acc.steam_id);
        const steamName = summary ? summary.personaname : '（无法获取）';
        replyMsg += `\n- 别名: ${acc.alias}${acc.is_default ? ' (默认)' : ''}`;
        replyMsg += `\n  用户名: ${steamName}`;
        replyMsg += `\n  SteamID: ${acc.steam_id}\n`;
      }
      return e.reply(replyMsg);
    }

    let aliasToUnbind = null;

    const aliasMatch = accounts.find(acc => acc.alias.toLowerCase() === identifier.toLowerCase());
    if (aliasMatch) {
      aliasToUnbind = aliasMatch.alias;
    } else {
      const steamIdMatch = accounts.find(acc => acc.steam_id === identifier);
      if (steamIdMatch) {
        aliasToUnbind = steamIdMatch.alias;
      } else {
        const steamIds = accounts.map(acc => acc.steam_id);
        const summaries = await fetchPlayersSummariesAPI(steamIds);
        for (const [steamId, summary] of summaries.entries()) {
          if (summary.personaname.toLowerCase() === identifier.toLowerCase()) {
            const account = accounts.find(acc => acc.steam_id === steamId);
            if (account) {
              aliasToUnbind = account.alias;
              break;
            }
          }
        }
      }
    }

    if (!aliasToUnbind) {
      return e.reply(`❌ 解绑失败！\n未找到与 "${identifier}" 匹配的绑定。请检查别名、用户名或SteamID是否正确。`);
    }

    try {
      await unbindSteam(qq, aliasToUnbind);
      return e.reply(`✅ 成功解除对【${aliasToUnbind}】的绑定！`);
    } catch (error) {
      logger.error(`解绑别名 ${aliasToUnbind} 失败:`, error);
      return e.reply(`❌ 解绑失败！\n${error.message}`);
    }
  },
  {
    name: 'unbind_steam_flexible',
    desc: '通过别名/用户名/ID解绑Steam账号',
    priority: 1000,
    permission: 'all'
  }
);

export const setDefaultAccount = karin.command(
  /^#(?:设置默认steam|steam默认设置)\s+([^\s]+)$/,
  async (e) => {
    const qq = e.sender.userId;
    const alias = e.regMatch[1];

    const account = await getBoundAccountByAlias(qq, alias);
    if (!account) {
      return e.reply(`❌ 操作失败！\n未找到别名为 "${alias}" 的绑定。`);
    }

    await setDefaultSteam(qq, alias);
    return e.reply(`✅ 操作成功！\n已将别名【${alias}】设为您的默认Steam账号。`);
  },
  {
    name: 'set_default_steam',
    desc: '设置默认的Steam账号',
    priority: 1000,
    permission: 'all'
  }
);


export default [
  bindSteamAccount,
  unbindSteamAccount,
  setDefaultAccount
];
