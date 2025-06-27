// apps/SteamGameList.js
import { karin, logger, segment } from 'node-karin';
import { getSteamIdByQQ } from '../lib/db/databaseOps.js';
import { getSteamID } from '../lib/main/FriendCode.js';
import { renderLibraryImage } from '../lib/main/SteamInventory.js';

// 指令：#查询steam库存 用户ID
export const steamLibraryCommand = karin.command(
    /^#查询[Ss]team库存\s*(.+)$/,
    async (e) => {
        const playerIdentifier = e.msg.replace(/^#查询[Ss]team库存\s*/, '').trim();
        logger.log(`[steamLibraryCommand] 收到指令, 输入: ${playerIdentifier}`);
        try {
            const steamUserId = await getSteamID(playerIdentifier);
            logger.log(`[steamLibraryCommand] 获取到 SteamID: ${steamUserId}`);

            e.reply("正在生成您的库存图片，请稍候...", true);
            const base64Content = await renderLibraryImage(steamUserId);

            logger.log(`[steamLibraryCommand] 准备发送游戏库信息`);
            e.reply(segment.image(`base64://${base64Content}`), true);
        } catch (error) {
            logger.error(`[steamLibraryCommand] 获取库存信息时发生错误:`, error);
            e.reply(`获取Steam游戏库信息时发生错误: ${error.message}`);
        }
    },
    { name: 'steam_library', priority: 1000, permission: 'everyone' }
);

// 指令：#查看Steam库存 @QQ号
export const steamUserLibraryCommand = karin.command(
    /^#查看[Ss]team库存$/,
    async (e) => {
        if (!e.at || e.at.length === 0) {
            return; // 如果没有@人，则忽略，让 #查看我的steam库存 处理
        }
        const qq = e.at[0];
        const steamID = await getSteamIdByQQ(qq);
        if (!steamID) {
            return e.reply(`QQ号 ${qq} 未绑定Steam账号。`);
        }
        try {
            e.reply(`正在生成 Ta 的库存图片，请稍候...`, true);
            const base64Content = await renderLibraryImage(steamID);
            logger.log(`[steamUserLibraryCommand] 为QQ用户 ${qq} 发送游戏库信息`);
            e.reply(segment.image(`base64://${base64Content}`), true);
        } catch (error) {
            logger.error('[steamUserLibraryCommand] 查询库存失败:', error);
            e.reply('查询失败，请稍后再试');
        }
    },
    { name: 'steamUserLibraryCommand', priority: 1000, permission: 'all' }
);