import { plugin ,logger } from 'node-karin';
import { startMonitoring } from '../lib/monitor/monitorSteamStatus.js';
import { readData, writeData, readConfig, writeConfig } from '../lib/main/readwritefile.js';

export class SteamBroadcastPlugin extends plugin {
  constructor() {
    super({
      name: 'SteamBroadcastPlugin',
      dsc: '启动和关闭 Steam 播报的插件',
      priority: 1000,
      rule: [
        {
          reg: /^#启动[S|s]team播报$/,
          fnc: 'startSteamBroadcast',
          permission: 'admin'
        },
        {
          reg: /^#关闭[S|s]team播报$/,
          fnc: 'stopSteamBroadcast',
          permission: 'admin'
        },
        {
          reg: /^#启动[S|s]team播报功能$/,
          fnc: 'enableSteamBroadcastFeature',
          permission: 'master'
        },
        {
          reg: /^#关闭[S|s]team播报功能$/,
          fnc: 'disableSteamBroadcastFeature',
          permission: 'master'
        }
      ]
    });
    this.onLoad(); // 在构造函数中调用 onLoad 方法
  }

  async startSteamBroadcast(e) {
    const groupId = String(e.group_id); // 确保 groupId 是字符串
    logger.log(`[startSteamBroadcast] 收到启动播报请求，群聊ID: ${groupId}`);
    const data = readData();

    if (!data.groups) {
      data.groups = {};
    }

    if (!data.groups[groupId]) {
      data.groups[groupId] = { steamIds: [], enabled: true };
    } else if (data.groups[groupId].enabled) {
      this.reply(`群聊 ${groupId} 已经启动了 Steam 播报`);
      logger.log(`[startSteamBroadcast] 群聊 ${groupId} 已经启动了 Steam 播报`);
      return;
    } else {
      data.groups[groupId].enabled = true;
    }
    writeData(data);

    this.reply(`群聊 ${groupId} 的 Steam 播报已启动`);
    logger.log(`[startSteamBroadcast] 群聊 ${groupId} 的 Steam 播报已启动`);
  }

  async stopSteamBroadcast(e) {
    const groupId = String(e.group_id); // 确保 groupId 是字符串
    logger.log(`[stopSteamBroadcast] 收到关闭播报请求，群聊ID: ${groupId}`);
    const data = readData();

    if (!data.groups || !data.groups[groupId]) {
      this.reply(`群聊 ${groupId} 中没有绑定任何 Steam ID`);
      logger.log(`[stopSteamBroadcast] 群聊 ${groupId} 中没有绑定任何 Steam ID`);
      return;
    }

    data.groups[groupId].enabled = false;
    writeData(data);

    this.reply(`群聊 ${groupId} 的 Steam 播报已关闭`);
    logger.log(`[stopSteamBroadcast] 群聊 ${groupId} 的 Steam 播报已关闭`);
  }

  async enableSteamBroadcastFeature() {
    const config = readConfig();
    config.steamBroadcastEnabled = true;
    writeConfig(config);

    this.reply(`Steam 播报功能已启用`);
    logger.log(`[enableSteamBroadcastFeature] Steam 播报功能已启用`);

    // 启动监听
    startMonitoring(this);
  }

  async disableSteamBroadcastFeature() {
    const config = readConfig();
    config.steamBroadcastEnabled = false;
    writeConfig(config);

    this.reply(`Steam 播报功能已关闭`);
    logger.log(`[disableSteamBroadcastFeature] Steam 播报功能已关闭`);

    // 停止监听
    stopMonitoring();
  }

  async onLoad() {
    const config = readConfig();
    if (config.steamBroadcastEnabled) {
        logger.debug(`[onLoad] 启动全局 Steam 播报监控`);
        startMonitoring(); // 启动全局监控任务
    }
}

}

export default new SteamBroadcastPlugin();
