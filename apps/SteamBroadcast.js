import { plugin ,logger } from 'node-karin';
import { startMonitoring, stopMonitoring } from '../lib/steamMonitor.js';
import fs from 'fs';
import yaml from 'yaml';
import Config from '../lib/config.js';

const DATA_FILE = `${Config.dirPath}/config/config/data.yaml`;

export class SteamBroadcastPlugin extends plugin {
  constructor() {
    super({
      name: 'SteamBroadcastPlugin',
      dsc: '启动和关闭 Steam 播报的插件',
      priority: 1000,
      rule: [
        {
          reg: /^#启动steam播报$/,
          fnc: 'startSteamBroadcast'
        },
        {
          reg: /^#关闭steam播报$/,
          fnc: 'stopSteamBroadcast'
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
      this.reply(e, `群聊 ${groupId} 已经启动了 Steam 播报`);
      logger.log(`[startSteamBroadcast] 群聊 ${groupId} 已经启动了 Steam 播报`);
      return;
    } else {
      data.groups[groupId].enabled = true;
    }
    writeData(data);

    startMonitoring(this); // 传递插件实例给监控函数
    this.reply(e, `群聊 ${groupId} 的 Steam 播报已启动`);
    logger.log(`[startSteamBroadcast] 群聊 ${groupId} 的 Steam 播报已启动`);
  }

  async stopSteamBroadcast(e) {
    const groupId = String(e.group_id); // 确保 groupId 是字符串
    logger.log(`[stopSteamBroadcast] 收到关闭播报请求，群聊ID: ${groupId}`);
    const data = readData();

    if (!data.groups || !data.groups[groupId]) {
      this.reply(e, `群聊 ${groupId} 中没有绑定任何 Steam ID`);
      logger.log(`[stopSteamBroadcast] 群聊 ${groupId} 中没有绑定任何 Steam ID`);
      return;
    }

    data.groups[groupId].enabled = false;
    writeData(data);

    stopMonitoring();
    this.reply(e, `群聊 ${groupId} 的 Steam 播报已关闭`);
    logger.log(`[stopSteamBroadcast] 群聊 ${groupId} 的 Steam 播报已关闭`);
  }

  async onLoad() {
    const data = readData();
    if (data.groups) {
      for (const groupId in data.groups) {
        if (data.groups[groupId].enabled) {
          logger.log(`[onLoad] 启动群聊 ${groupId} 的 Steam 播报`);
          startMonitoring(this); // 传递插件实例给监控函数
        }
      }
    }
  }
}

function readData() {
  if (fs.existsSync(DATA_FILE)) {
    const fileContents = fs.readFileSync(DATA_FILE, 'utf8');
    return yaml.parse(fileContents);
  }
  return {};
}

function writeData(data) {
  const yamlStr = yaml.stringify(data);
  fs.writeFileSync(DATA_FILE, yamlStr, 'utf8');
}

export default new SteamBroadcastPlugin();
export { readData, writeData };
