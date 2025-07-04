// apps/SteamGameList.js
import { karin, logger, segment } from 'node-karin';
import { getBoundAccountByAlias, getDefaultSteamIdByQQ } from '../lib/db/databaseOps.js';
import { getValidatedSteamUser } from '../lib/main/FriendCode.js';
import { renderLibraryImage } from '../lib/main/SteamInventory.js';

// #查询steam库存 [别名/用户ID] - 用于查询自己或公共ID
export const queryPublicOrMyLibraryCommand = karin.command(
    /^#查询[Ss]team库存/,
    async (e) => {
        // 此命令仅在没有 @ 任何人时触发
        if (e.at && e.at.length > 0) {
            return;
        }

        const identifier = e.msg.replace(/^#查询[Ss]team库存\s*/, '').trim();
        const senderId = e.sender.userId;
        let steamIdToQuery = null;

        try {
            // 如果有输入，先尝试作为自己的别名查找
            if (identifier) {
                const account = await getBoundAccountByAlias(senderId, identifier);
                if (account) {
                    steamIdToQuery = account.steam_id;
                } else {
                    // 如果不是自己的别名，则作为公共ID或URL处理
                    const steamUser = await getValidatedSteamUser(identifier);
                    if (steamUser) {
                        steamIdToQuery = steamUser.steamid;
                    }
                }
            } else {
                // 如果没有输入，查询自己的默认账号
                steamIdToQuery = await getDefaultSteamIdByQQ(senderId);
                if (!steamIdToQuery) {
                    return e.reply('您尚未绑定任何Steam账号，请使用 `#绑定steam` 命令进行绑定，或在查询时提供一个别名/ID。');
                }
            }

            if (!steamIdToQuery) {
                return e.reply(`无法找到与 "${identifier}" 相关的Steam用户。`);
            }

            e.reply("正在生成库存图片，请稍候...", true);
            const base64Content = await renderLibraryImage(steamIdToQuery);
            e.reply(segment.image(`base64://${base64Content}`), true);

        } catch (error) {
            logger.error(`[queryPublicOrMyLibraryCommand] 获取库存信息时发生错误:`, error);
            e.reply(`获取Steam游戏库信息时发生错误: ${error.message}`);
        }
    },
    { name: 'query_public_or_my_library', priority: 1001, permission: 'everyone' }
);

// #查看Steam库存 @QQ号 [别名] - 用于查询他人
export const queryUserLibraryCommand = karin.command(
    /^#查看[Ss]team库存/,
    async (e) => {
        // 此命令仅在 @ 某人时触发
        if (!e.at || e.at.length === 0) {
            return;
        }

        const targetQQ = e.at[0];
        const alias = e.msg.replace(/^#查看[Ss]team库存\s*/, '').trim();
        let steamID = null;

        try {
            if (alias) {
                // 如果提供了别名，查询对方的指定别名账号
                const account = await getBoundAccountByAlias(targetQQ, alias);
                if (!account) {
                    return e.reply(`用户 ${targetQQ} 没有绑定名为“${alias}”的别名。`);
                }
                steamID = account.steam_id;
            } else {
                // 如果没有提供别名，查询对方的默认账号
                steamID = await getDefaultSteamIdByQQ(targetQQ);
                if (!steamID) {
                    return e.reply(`QQ号 ${targetQQ} 未绑定Steam账号或未设置默认账号。`);
                }
            }

            e.reply(`正在生成 Ta 的库存图片，请稍候...`, true);
            const base64Content = await renderLibraryImage(steamID);
            logger.log(`[queryUserLibraryCommand] 为QQ用户 ${targetQQ} 发送游戏库信息`);
            e.reply(segment.image(`base64://${base64Content}`), true);

        } catch (error) {
            logger.error('[queryUserLibraryCommand] 查询库存失败:', error);
            e.reply('查询失败，请稍后再试');
        }
    },
    { name: 'query_user_library', priority: 1000, permission: 'all' }
);

export default [
    queryPublicOrMyLibraryCommand,
    queryUserLibraryCommand
];
