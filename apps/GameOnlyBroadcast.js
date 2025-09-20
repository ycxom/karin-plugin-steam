// apps/GameOnlyBroadcast.js
import { karin, logger } from 'node-karin';
import { setGroupGameOnlyMode, getGroupGameOnlyMode, getGroupBroadcastStatus } from '../lib/db/databaseOps.js';

// 启动仅游戏播报（需 admin）
export const startGameOnlyBroadcast = karin.command(
  /^#启动仅游戏播报$/,
  async (e) => {
    const groupId = String(e.groupId);
    logger.log(`[startGameOnlyBroadcast] 收到启动仅游戏播报请求，群: ${groupId}`);
    
    try {
      // 检查群是否已启用Steam播报
      const broadcastEnabled = await getGroupBroadcastStatus(groupId);
      if (!broadcastEnabled) {
        return e.reply(`请先使用 #启动Steam播报 启用Steam播报功能`);
      }

      // 检查是否已经启用仅游戏播报
      const gameOnlyMode = await getGroupGameOnlyMode(groupId);
      if (gameOnlyMode) {
        return e.reply(`群聊 ${groupId} 已经启动了仅游戏播报模式`);
      }

      await setGroupGameOnlyMode(groupId, true);
      logger.log(`[startGameOnlyBroadcast] 群: ${groupId} 仅游戏播报启动成功`);
      return e.reply(`群聊 ${groupId} 的仅游戏播报已启动\n现在只会播报游戏开始、结束和切换等游戏相关状态，不会播报上线、离线等其他状态`);
    } catch (error) {
      logger.error(`[startGameOnlyBroadcast] 启动失败:`, error);
      return e.reply('启动仅游戏播报失败，请稍后再试');
    }
  },
  {
    name: 'start_game_only_broadcast',
    desc: '在本群开启仅游戏播报模式，只播报游戏相关状态变化',
    priority: 1000,
    permission: 'admin'
  }
);

// 关闭仅游戏播报（需 admin）
export const stopGameOnlyBroadcast = karin.command(
  /^#关闭仅游戏播报$/,
  async (e) => {
    const groupId = String(e.groupId);
    logger.log(`[stopGameOnlyBroadcast] 收到关闭仅游戏播报请求，群: ${groupId}`);
    
    try {
      const gameOnlyMode = await getGroupGameOnlyMode(groupId);
      if (!gameOnlyMode) {
        return e.reply(`群聊 ${groupId} 的仅游戏播报已经关闭`);
      }

      await setGroupGameOnlyMode(groupId, false);
      logger.log(`[stopGameOnlyBroadcast] 群: ${groupId} 仅游戏播报关闭成功`);
      return e.reply(`群聊 ${groupId} 的仅游戏播报已关闭\n现在将播报所有Steam状态变化（上线、离线、游戏状态等）`);
    } catch (error) {
      logger.error(`[stopGameOnlyBroadcast] 关闭失败:`, error);
      return e.reply('关闭仅游戏播报失败，请稍后再试');
    }
  },
  {
    name: 'stop_game_only_broadcast',
    desc: '在本群关闭仅游戏播报模式，恢复播报所有状态变化',
    priority: 1000,
    permission: 'admin'
  }
);

// 默认导出
export default [
  startGameOnlyBroadcast,
  stopGameOnlyBroadcast
];