import { karin, logger } from 'node-karin';
import { getSteamIdByQQ, setUserGroupBroadcast, setUserGroupInventoryBroadcast, setUserAllGroupsBroadcast, setUserAllGroupsInventoryBroadcast } from '../lib/db/databaseOps.js';

// 开启/关闭本群我的Steam播报
export const toggleMyGroupSteamBroadcast = karin.command(
    /^#(开启|关闭)本群我的steam播报$/,
    async (e) => {
        const qqId = e.sender.userId;
        const groupId = e.groupId;
        const enabled = e.msg.includes('开启');

        const steamId = await getSteamIdByQQ(qqId);
        if (!steamId) {
            return e.reply('您尚未绑定Steam账号，请先使用 #绑定steam 进行绑定。');
        }

        await setUserGroupBroadcast(qqId, groupId, enabled);
        e.reply(`操作成功！您在本群的Steam状态播报已${enabled ? '开启' : '关闭'}。`);
    },
    {
        name: 'toggle_my_group_steam_broadcast',
        desc: '开启或关闭在本群的个人Steam状态播报',
        permission: 'all',
    }
);

// 开启/关闭本群我的Steam库播报
export const toggleMyGroupInventoryBroadcast = karin.command(
    /^#(开启|关闭)本群我的steam库播报$/,
    async (e) => {
        const qqId = e.sender.userId;
        const groupId = e.groupId;
        const enabled = e.msg.includes('开启');

        const steamId = await getSteamIdByQQ(qqId);
        if (!steamId) {
            return e.reply('您尚未绑定Steam账号，请先使用 #绑定steam 进行绑定。');
        }

        await setUserGroupInventoryBroadcast(qqId, groupId, enabled);
        e.reply(`操作成功！您在本群的Steam库更新播报已${enabled ? '开启' : '关闭'}。`);
    },
    {
        name: 'toggle_my_group_inventory_broadcast',
        desc: '开启或关闭在本群的个人Steam库更新播报',
        permission: 'all',
    }
);

// 开启/关闭全部我的Steam播报
export const toggleAllMySteamBroadcast = karin.command(
    /^#(开启|关闭)全部我的steam播报$/,
    async (e) => {
        const qqId = e.sender.userId;
        const enabled = e.msg.includes('开启');

        const steamId = await getSteamIdByQQ(qqId);
        if (!steamId) {
            return e.reply('您尚未绑定Steam账号，请先使用 #绑定steam 进行绑定。');
        }

        await setUserAllGroupsBroadcast(qqId, enabled);
        e.reply(`操作成功！您在所有群的Steam状态播报总开关已${enabled ? '开启' : '关闭'}。`);
    },
    {
        name: 'toggle_all_my_steam_broadcast',
        desc: '开启或关闭在所有群的个人Steam状态播报',
        permission: 'all',
    }
);

// 开启/关闭全部我的Steam库播报
export const toggleAllMyInventoryBroadcast = karin.command(
    /^#(开启|关闭)全部我的steam库播报$/,
    async (e) => {
        const qqId = e.sender.userId;
        const enabled = e.msg.includes('开启');

        const steamId = await getSteamIdByQQ(qqId);
        if (!steamId) {
            return e.reply('您尚未绑定Steam账号，请先使用 #绑定steam 进行绑定。');
        }

        await setUserAllGroupsInventoryBroadcast(qqId, enabled);
        e.reply(`操作成功！您在所有群的Steam库更新播报总开关已${enabled ? '开启' : '关闭'}。`);
    },
    {
        name: 'toggle_all_my_inventory_broadcast',
        desc: '开启或关闭在所有群的个人Steam库更新播报',
        permission: 'all',
    }
);

export default [
    toggleMyGroupSteamBroadcast,
    toggleMyGroupInventoryBroadcast,
    toggleAllMySteamBroadcast,
    toggleAllMyInventoryBroadcast
];