import fs from 'fs';
import Yaml from 'yaml';
import { karin, logger } from 'node-karin';
import path from 'path';
import Config from '../lib/config.js';


const DATA_FILE = path.join(Config.dirPath, 'config/config/data.yaml');

/**
 * 更新 data.yaml 文件，将启动的群聊ID写入并设置状态
 */
function updateGroupNotificationStatus(groupId, status) {
    try {
        let data = {};
        if (fs.existsSync(DATA_FILE)) {
            const fileContents = fs.readFileSync(DATA_FILE, 'utf8');
            data = Yaml.parse(fileContents);
        }

        // 确保steamFreebiesBroadcast结构存在并更新对应群聊的状态
        if (!data.steamFreebiesBroadcast) {
            data.steamFreebiesBroadcast = {};
        }

        // 将groupId写入steamFreebiesBroadcast并设置状态
        data.steamFreebiesBroadcast[groupId] = status;

        const yamlData = Yaml.stringify(data);
        fs.writeFileSync(DATA_FILE, yamlData, 'utf8');
        logger.log(`[updateGroupNotificationStatus] 群聊 ${groupId} 的 Steam 喜加一播报状态已更新为 ${status}`);
    } catch (error) {
        logger.error(`[updateGroupNotificationStatus] 更新群聊状态时出错: ${error.message}`);
    }
}

/**
 * Command: #启动Steam喜加一播报
 */
export const startSteamFreebiesBroadcast = karin.command(
    /^#启动Steam喜加一播报$/,
    async (e) => {
        try {
            const groupId = String(e.group_id); // 获取群聊ID
            updateGroupNotificationStatus(groupId, true);
            e.reply(`Steam 喜加一播报已在本群开启。`);
        } catch (error) {
            logger.error(`启动 Steam 喜加一播报失败: ${error.message}`);
            e.reply('启动 Steam 喜加一播报时发生错误，请稍后再试。');
        }
    },
    {
        name: 'start_steam_freebies_broadcast',
        priority: 1000,
        permission: 'admin' // 只有管理员才能执行此命令
    }
);

/**
 * Command: #关闭Steam喜加一播报
 */
export const stopSteamFreebiesBroadcast = karin.command(
    /^#关闭Steam喜加一播报$/,
    async (e) => {
        try {
            const groupId = String(e.group_id); // 获取群聊ID
            updateGroupNotificationStatus(groupId, false);
            e.reply(`Steam 喜加一播报已在本群关闭。`);
        } catch (error) {
            logger.error(`关闭 Steam 喜加一播报失败: ${error.message}`);
            e.reply('关闭 Steam 喜加一播报时发生错误，请稍后再试。');
        }
    },
    {
        name: 'stop_steam_freebies_broadcast',
        priority: 1000,
        permission: 'admin' // 只有管理员才能执行此命令
    }
);
