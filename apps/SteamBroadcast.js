// apps/SteamBroadcast.js
import { karin, logger } from 'node-karin';
import { startMonitoring, stopMonitoring } from '../lib/monitor/monitorSteamStatus.js';
import { startInventoryMonitoring, stopInventoryMonitoring } from '../lib/monitor/monitorInventory.js';
import { setGroupBroadcast, getGroupBroadcastStatus } from '../lib/db/databaseOps.js';
import { writeConfig } from '../lib/main/writefile.js';
import { Config } from '../lib/config.js';

// 启动某群Steam播报（需 admin）
export const startSteamBroadcast = karin.command(
  /^#启动[Ss]team播报$/,
  async (e) => {
    const groupId = String(e.groupId);
    logger.log(`[startSteamBroadcast] 收到启动播报请求，群: ${groupId}`);
    try {
      if (await getGroupBroadcastStatus(groupId)) {
        return e.reply(`群聊 ${groupId} 已经启动了 Steam 播报`);
      }
      await setGroupBroadcast(groupId, true);
      logger.log(`[startSteamBroadcast] 群: ${groupId} 播报启动成功`);
      return e.reply(`群聊 ${groupId} 的 Steam 播报已启动`);
    } catch (error) {
      logger.error(`[startSteamBroadcast] 启动失败:`, error);
      return e.reply('启动 Steam 播报失败，请稍后再试');
    }
  },
  {
    name: 'start_steam_broadcast',
    desc: '启动本群Steam播报功能',
    priority: 1000,
    permission: 'admin'
  }
);

// 关闭某群Steam播报（需 admin）
export const stopSteamBroadcast = karin.command(
  /^#关闭[Ss]team播报$/,
  async (e) => {
    const groupId = String(e.groupId);
    logger.log(`[stopSteamBroadcast] 收到关闭播报请求，群: ${groupId}`);
    try {
      if (!await getGroupBroadcastStatus(groupId)) {
        return e.reply(`群聊 ${groupId} 的 Steam 播报已经关闭`);
      }
      await setGroupBroadcast(groupId, false);
      logger.log(`[stopSteamBroadcast] 群: ${groupId} 播报关闭成功`);
      return e.reply(`群聊 ${groupId} 的 Steam 播报已关闭`);
    } catch (error) {
      logger.error(`[stopSteamBroadcast] 关闭失败:`, error);
      return e.reply('关闭 Steam 播报失败，请稍后再试');
    }
  },
  {
    name: 'stop_steam_broadcast',
    desc: '关闭本群Steam播报功能',
    priority: 1000,
    permission: 'admin'
  }
);

// 全局启用（需 master）
export const enableSteamBroadcastFeature = karin.command(
  /^#启动[Ss]team播报功能$/,
  async (e) => {
    await writeConfig({ steamBroadcastEnabled: true });
    startMonitoring();
    logger.log('[enableSteamBroadcastFeature] 全局Steam播报功能已启用');
    return e.reply('Steam 播报功能已全局启用');
  },
  {
    name: 'enable_steam_broadcast_feature',
    desc: '全局启用Steam播报（主人）',
    priority: 1000,
    permission: 'master',
    event: 'message.group'
  }
);

// 全局禁用（需 master）
export const disableSteamBroadcastFeature = karin.command(
  /^#关闭[Ss]team播报功能$/,
  async (e) => {
    await writeConfig({ steamBroadcastEnabled: false });
    stopMonitoring();
    logger.log('[disableSteamBroadcastFeature] 全局Steam播报功能已关闭');
    return e.reply('Steam 播报功能已全局关闭');
  },
  {
    name: 'disable_steam_broadcast_feature',
    desc: '全局禁用Steam播报（主人）',
    priority: 1000,
    permission: 'master'
  }
);

// 插件初始化（自动检测是否全局启用监控）
onPluginLoad();
export async function onPluginLoad() {
  if (Config.steamBroadcastEnabled) {
    logger.debug('[onPluginLoad] 状态播报已启用，启动状态监控');
    startMonitoring();
  } else {
    logger.debug('[onPluginLoad] 状态播报未全局启用');
  }

  // ✅ 启动库存监控 (可以为其添加独立的配置开关)
  if (Config.inventoryMonitorEnabled) { // 建议在config.yaml中添加此开关
    logger.debug('[onPluginLoad] 库存监控已启用，启动库存监控任务');
    startInventoryMonitoring();
  }
}

// 默认导出
export default [
  startSteamBroadcast,
  stopSteamBroadcast,
  enableSteamBroadcastFeature,
  disableSteamBroadcastFeature
];