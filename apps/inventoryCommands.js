import { karin, logger } from 'node-karin';
import { getBoundAccountsByQQ, setInventoryMonitoring } from '../lib/db/databaseOps.js';

// 开启本人库存监控
export const enableMyInventoryMonitoring = karin.command(
    /^#开启库存监控/,
    async (e) => {
        const qqId = e.sender.userId;
        const alias = e.msg.replace(/^#开启库存监控\s*/, '').trim();

        const bindings = await getBoundAccountsByQQ(qqId);
        if (bindings.length === 0) {
            return e.reply('您尚未绑定任何Steam账号，请先使用 #绑定steam 进行绑定。');
        }

        // 如果用户提供了别名，但别名不存在，则提示错误
        if (alias && !bindings.some(b => b.alias === alias)) {
            return e.reply(`未找到别名为【${alias}】的绑定。`);
        }

        // 如果没有提供别名，则目标为 'global'，否则为指定的别名
        const targetAlias = alias || 'global';

        await setInventoryMonitoring(qqId, true, targetAlias);
        const targetText = alias ? `别名为【${alias}】的账号` : '所有已绑定账号';
        return e.reply(`操作成功！${targetText} 的Steam库存更新将被播报。`);
    },
    {
        name: 'enable_my_inventory_monitoring_alias',
        desc: '开启自己的Steam库存变更播报，可指定别名或不指定(全体)',
        permission: 'all',
    }
);

// 关闭本人库存监控
export const disableMyInventoryMonitoring = karin.command(
    /^#关闭库存监控/,
    async (e) => {
        const qqId = e.sender.userId;
        const alias = e.msg.replace(/^#关闭库存监控\s*/, '').trim();

        const bindings = await getBoundAccountsByQQ(qqId);
        if (bindings.length === 0) {
            return e.reply('您尚未绑定任何Steam账号。');
        }

        if (alias && !bindings.some(b => b.alias === alias)) {
            return e.reply(`未找到别名为【${alias}】的绑定。`);
        }

        const targetAlias = alias || 'global';

        await setInventoryMonitoring(qqId, false, targetAlias);
        const targetText = alias ? `别名为【${alias}】的账号` : '所有已绑定账号';
        return e.reply(`操作成功！${targetText} 的Steam库存更新将不再播报。`);
    },
    {
        name: 'disable_my_inventory_monitoring_alias',
        desc: '关闭自己的Steam库存变更播报，可指定别名或不指定(全体)',
        permission: 'all',
    }
);

export default [enableMyInventoryMonitoring, disableMyInventoryMonitoring];
