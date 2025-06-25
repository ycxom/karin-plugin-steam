import { karin, logger } from 'node-karin';
import { getSteamIdByQQ, setInventoryMonitoring } from '../lib/db/databaseOps.js';

// 开启本人库存监控
export const enableMyInventoryMonitoring = karin.command(
    /^#开启库存监控$/,
    async (e) => {
        const qqId = e.sender.userId;
        const steamId = await getSteamIdByQQ(qqId);

        if (!steamId) {
            return e.reply('您尚未绑定Steam账号，请先使用 #绑定steam 进行绑定。');
        }

        await setInventoryMonitoring(qqId, true);
        return e.reply('操作成功！您的Steam库存更新将被播报。');
    },
    {
        name: 'enable_my_inventory_monitoring',
        desc: '开启自己的Steam库存变更播报',
        permission: 'all',
    }
);

// 关闭本人库存监控
export const disableMyInventoryMonitoring = karin.command(
    /^#关闭库存监控$/,
    async (e) => {
        const qqId = e.sender.userId;
        const steamId = await getSteamIdByQQ(qqId);

        if (!steamId) {
            return e.reply('您尚未绑定Steam账号，请先使用 #绑定steam 进行绑定。');
        }

        await setInventoryMonitoring(qqId, false);
        return e.reply('操作成功！您的Steam库存更新将不再播报。');
    },
    {
        name: 'disable_my_inventory_monitoring',
        desc: '关闭自己的Steam库存变更播报',
        permission: 'all',
    }
);

export default [enableMyInventoryMonitoring, disableMyInventoryMonitoring];