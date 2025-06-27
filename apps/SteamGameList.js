// apps/SteamGameList.js
import { karin, logger, segment } from 'node-karin';
import { getSteamIdByQQ } from '../lib/db/databaseOps.js';
import { getSteamID } from '../lib/main/FriendCode.js';
// import { initAppList, fetchSteamLibrary, renderGamesToBase64, scheduleDailyUpdate } from '../lib/main/SteamInventory.js';
import { initAppList, fetchSteamLibrary, renderGamesToBase64 } from '../lib/main/SteamInventory.js';

// 指令：#查询steam库存 用户ID
export const steamLibraryCommand = karin.command(
    /^#查询[Ss]team库存\s*(.+)$/,
    async (e) => {
        const playerIdentifier = e.msg.replace(/^#查询[Ss]team库存\s*/, '').trim();
        logger.log(`[steamLibraryCommand] 收到指令 #查询Steam库存, 输入参数: ${playerIdentifier}`);

        try {
            const steamUserId = await getSteamID(playerIdentifier);
            logger.log(`[steamLibraryCommand] 获取到 SteamID: ${steamUserId}`);

            const games = await fetchSteamLibrary(steamUserId);
            if (games && games.length > 0) {
                const base64Content = await renderGamesToBase64(games);
                logger.log(`[steamLibraryCommand] 准备发送游戏库信息到群聊`);
                e.reply(segment.image(`base64://${base64Content}`));
            } else {
                logger.warn(`[steamLibraryCommand] 用户 ${steamUserId} 没有游戏或获取游戏库失败。`);
                e.reply(`用户 ${steamUserId} 没有游戏或获取游戏库失败。`);
            }
        } catch (error) {
            logger.error(`[steamLibraryCommand] 获取 Steam 游戏库信息时发生错误: ${error.message}`);
            e.reply(`获取 Steam 游戏库信息时发生错误: ${error.message}`);
        }
    },
    {
        name: 'steam_library',
        priority: 1000,
        permission: 'everyone'
    }
);

// 指令：#查看Steam库存 @QQ号
export const steamUserLibraryCommand = karin.command(
    /^#查看[Ss]team库存$/,
    async (e) => {
        if (e.at.length) {
            const qq = e.at[0];
            const steamID = await getSteamIdByQQ(qq);

            if (!steamID) {
                e.reply(`QQ号 ${qq} 未绑定Steam账号。`);
                return;
            }

            try {
                const games = await fetchSteamLibrary(steamID);
                if (games && games.length > 0) {
                    const base64Content = await renderGamesToBase64(games);
                    logger.log(`[steamUserLibraryCommand] 为QQ用户 ${qq} 发送游戏库信息`);
                    e.reply(segment.image(`base64://${base64Content}`));
                } else {
                    logger.warn(`[steamUserLibraryCommand] 用户 ${steamID} 没有游戏或获取游戏库失败。`);
                    e.reply(`用户 ${steamID} 没有游戏或获取游戏库失败。`);
                }
            } catch (error) {
                logger.error('[steamUserLibraryCommand] 查询 Steam 库存失败:', error);
                e.reply('查询失败，请稍后再试');
            }
        } else {
            logger.warn('[steamUserLibraryCommand] 未检测到 @QQ号');
            e.reply('请 @ 绑定Steam账号的QQ');
        }
    },
    {
        name: 'steamUserLibraryCommand',
        priority: 1000,
        permission: 'all'
    }
);
