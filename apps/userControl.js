import { karin, logger } from 'node-karin';
import {
    getBoundAccountsByQQ,
    setUserGroupBroadcast,
    setUserGroupInventoryBroadcast,
    setUserAllGroupsBroadcast,
    setUserAllGroupsInventoryBroadcast
} from '../lib/db/databaseOps.js';

export const toggleMyGroupSteamBroadcast = karin.command(
    /^#(开启|关闭)本群我的[Ss]team播报/,
    async (e) => {
        const qqId = e.sender.userId;
        const groupId = e.groupId;
        const enabled = e.msg.includes('开启');
        const alias = e.msg.replace(/^#(开启|关闭)本群我的[Ss]team播报\s*/, '').trim();

        const bindings = await getBoundAccountsByQQ(qqId);
        if (bindings.length === 0) {
            return e.reply('您尚未绑定任何Steam账号。');
        }

        if (alias && !bindings.some(b => b.alias === alias)) {
            return e.reply(`未找到别名为【${alias}】的绑定。`);
        }

        const targetAlias = alias || 'global';
        await setUserGroupBroadcast(qqId, groupId, enabled, targetAlias);

        const targetText = alias ? `别名为【${alias}】的账号` : '所有已绑定账号';
        e.reply(`操作成功！您在本群对 ${targetText} 的Steam状态播报已${enabled ? '开启' : '关闭'}。`);
    },
    {
        name: 'toggle_my_group_steam_broadcast_alias',
        desc: '开启/关闭 ‘我’的Steam状态变化在本群的通知（可指定别名）',
        permission: 'all',
    }
);

export const toggleMyGroupInventoryBroadcast = karin.command(
    /^#(开启|关闭)本群我的[Ss]team库播报/,
    async (e) => {
        const qqId = e.sender.userId;
        const groupId = e.groupId;
        const enabled = e.msg.includes('开启');
        const alias = e.msg.replace(/^#(开启|关闭)本群我的[Ss]team库播报\s*/, '').trim();

        const bindings = await getBoundAccountsByQQ(qqId);
        if (bindings.length === 0) {
            return e.reply('您尚未绑定任何Steam账号。');
        }

        if (alias && !bindings.some(b => b.alias === alias)) {
            return e.reply(`未找到别名为【${alias}】的绑定。`);
        }

        const targetAlias = alias || 'global';
        await setUserGroupInventoryBroadcast(qqId, groupId, enabled, targetAlias);

        const targetText = alias ? `别名为【${alias}】的账号` : '所有已绑定账号';
        e.reply(`操作成功！您在本群对 ${targetText} 的Steam库更新播报已${enabled ? '开启' : '关闭'}。`);
    },
    {
        name: 'toggle_my_group_inventory_broadcast_alias',
        desc: '开启/关闭 ‘我’的游戏库新增在本群的通知（可指定别名）',
        permission: 'all',
    }
);

export const toggleAllMySteamBroadcast = karin.command(
    /^#(开启|关闭)全部我的[Ss]team播报/,
    async (e) => {
        const qqId = e.sender.userId;
        const enabled = e.msg.includes('开启');
        const alias = e.msg.replace(/^#(开启|关闭)全部我的[Ss]team播报\s*/, '').trim();

        const bindings = await getBoundAccountsByQQ(qqId);
        if (bindings.length === 0) {
            return e.reply('您尚未绑定任何Steam账号。');
        }

        if (alias && !bindings.some(b => b.alias === alias)) {
            return e.reply(`未找到别名为【${alias}】的绑定。`);
        }

        const targetAlias = alias || 'global';
        await setUserAllGroupsBroadcast(qqId, enabled, targetAlias);

        const targetText = alias ? `别名为【${alias}】的账号` : '所有已绑定账号';
        e.reply(`操作成功！您在所有群对 ${targetText} 的Steam状态播报总开关已${enabled ? '开启' : '关闭'}。`);
    },
    {
        name: 'toggle_all_my_steam_broadcast_alias',
        desc: '（总开关）开启/关闭 ‘我’在所有群的状态播报（可指定别名）',
        permission: 'all',
    }
);

export const toggleAllMyInventoryBroadcast = karin.command(
    /^#(开启|关闭)全部我的[Ss]team库播报/,
    async (e) => {
        const qqId = e.sender.userId;
        const enabled = e.msg.includes('开启');
        const alias = e.msg.replace(/^#(开启|关闭)全部我的[Ss]team库播报\s*/, '').trim();

        const bindings = await getBoundAccountsByQQ(qqId);
        if (bindings.length === 0) {
            return e.reply('您尚未绑定任何Steam账号。');
        }

        if (alias && !bindings.some(b => b.alias === alias)) {
            return e.reply(`未找到别名为【${alias}】的绑定。`);
        }

        const targetAlias = alias || 'global';
        await setUserAllGroupsInventoryBroadcast(qqId, enabled, targetAlias);

        const targetText = alias ? `别名为【${alias}】的账号` : '所有已绑定账号';
        e.reply(`操作成功！您在所有群对 ${targetText} 的Steam库更新播报总开关已${enabled ? '开启' : '关闭'}。`);
    },
    {
        name: 'toggle_all_my_inventory_broadcast_alias',
        desc: '（总开关）开启/关闭 ‘我’在所有群的库存播报（可指定别名）',
        permission: 'all',
    }
);

export default [
    toggleMyGroupSteamBroadcast,
    toggleMyGroupInventoryBroadcast,
    toggleAllMySteamBroadcast,
    toggleAllMyInventoryBroadcast
];
