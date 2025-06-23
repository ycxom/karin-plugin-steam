// apps/UserSteam.js
import { karin, segment, logger } from 'node-karin';
import { getSteamIdByQQ } from '../lib/main/databaseOps.js';
import { fetchSteamStatus } from '../lib/main/fetchSteamStatus.js';
import { screenshotSteamProfile, screenshotSteamFriends } from '../lib/common/screenshot.js';

// 查询指定QQ用户 Steam 个人资料
export const queryUserSteam = karin.command(/^#查看[Ss]team$/, async (e) => {
  if (e.at.length) {
    const qq = e.at[0];
    const steamID = await getSteamIdByQQ(qq);

    if (!steamID) {
      e.reply(`QQ号 ${qq} 未绑定Steam账号。请先绑定后再试。`);
      return;
    }

    try {
      const status = await fetchSteamStatus(steamID);
      const result = await screenshotSteamProfile(steamID);

      if (result.error) {
        e.reply(result.error);
      } else if (result.image) {
        e.reply(segment.image(`base64://${result.image}`));
      } else {
        e.reply(formatSteamStatus(status));
      }

    } catch (error) {
      logger.error(`[queryUserSteam] 查询QQ:${qq} Steam状态出错:`, error);
      e.reply('查询失败，请稍后再试');
    }

  } else {
    logger.warn('[queryUserSteam] 未检测到 @的QQ号');
    e.reply('请@你想要查询Steam账号的QQ用户');
  }
}, { name: 'queryUserSteam', priority: 1000, permission: 'all' });

// 查询指定QQ用户 Steam 好友情况
export const queryUserSteamFriends = karin.command(/^#查看[Ss]team好友$/, async (e) => {
  if (e.at.length) {
    const qq = e.at[0];
    const steamID = await getSteamIdByQQ(qq);

    if (!steamID) {
      e.reply(`QQ号 ${qq} 未绑定Steam账号。请先绑定后再试。`);
      return;
    }

    try {
      const result = await screenshotSteamFriends(steamID);

      if (result.error) {
        e.reply(result.error);
      } else if (result.image) {
        e.reply(segment.image(`base64://${result.image}`));
      } else {
        e.reply('未能生成Steam好友截图');
      }

    } catch (error) {
      logger.error(`[queryUserSteamFriends] 查询QQ:${qq} 好友情况出错:`, error);
      e.reply('查询失败，请稍后再试');
    }

  } else {
    logger.warn('[queryUserSteamFriends] 未检测到 @的QQ号');
    e.reply('请@你想要查询Steam好友的QQ用户');
  }
}, { name: 'queryUserSteamFriends', priority: 1000, permission: 'all' });

// 辅助函数，格式化文本信息
function formatSteamStatus(status) {
  if (!status) return '未找到该玩家的信息';

  let result = `
玩家名: ${status.actualPersonaName}
当前状态: ${status.profileStatus}
  `;

  if (status.profileStatus.includes('当前正在游戏')) {
    result += `游戏中: ${status.profileInGameName}\n`;
  }

  result += `头像截图已附上`;
  return result;
}