import { karin, logger, segment } from 'node-karin';
import { readData } from '../lib/main/readwritefile.js';
import { getSteamID } from '../lib/main/FriendCode.js';
import { initAppList, fetchSteamLibrary, renderGamesToBase64, scheduleDailyUpdate } from '../lib/main/SteamInventory.js';

// 定义指令 #查询steam
export const steamLibraryCommand = karin.command(
    /^#查询[Ss]team库存\s*(.+)$/,
    async (e) => {
        const playerIdentifier = e.msg.replace(/^#查询[Ss]team库存\s*/, '').trim();
        logger.log(`[steamLibraryCommand] 收到指令 #查询Steam库存, 输入参数: ${playerIdentifier}`);
        
        try {
            const steamUserId = await getSteamID(playerIdentifier);
            logger.log(`[steamLibraryCommand] 获取到 SteamID: ${steamUserId}`);
            
            const games = await fetchSteamLibrary(steamUserId);
            logger.log(`[steamLibraryCommand] 成功获取游戏库数据`);

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

export const steamUserLibraryCommand = karin.command(/^#查看steam库存$/, async (e) => {

    /** 存在at */
    if (e.at.length) {
        const qq = e.at[0]
        const data = readData();
        const steamID = data[qq];
        if (!steamID) {
            e.reply(`QQ号 ${qq} 未绑定Steam账号。`);
            return;
        }
        try {
            const steamUserId = await fetchSteamLibrary(steamID);

            if (steamUserId && steamUserId.length > 0) {
                const base64Content = await renderGamesToBase64(steamUserId);
                logger.log(`[steamLibraryCommand] 准备发送游戏库信息到群聊`);
                e.reply(segment.image(`base64://${base64Content}`));
            } else {
                logger.warn(`[steamLibraryCommand] 用户 ${steamUserId} 没有游戏或获取游戏库失败。`);
                e.reply(`用户 ${steamUserId} 没有游戏或获取游戏库失败。`);
            }
        } catch (error) {
            e.reply('查询失败，请稍后再试');
            console.error('Error querying other Steam status:', error);
        }

    } else {
        console.log('未atqq')
        e.reply('请at绑定Steam账号的QQ')
    }
}, { name: 'steamUserLibraryCommand', priority: '1000', permission: 'all' })


// 在启动时初始化游戏列表并安排定时任务
initAppList()
    .then(() => {
        logger.log('[Karin-plugin-steam] 游戏列表初始化成功');
        scheduleDailyUpdate();
        logger.log('[Karin-plugin-steam] 每日游戏列表更新任务已安排');
    })
    .catch(err => logger.error(`[Karin-plugin-steam] 游戏列表初始化失败: ${err.message}`));