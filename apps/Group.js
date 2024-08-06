import { plugin, segment } from 'node-karin';
import { readData, writeData, fetchSteamStatus } from '../lib/scrapeSteam.js';
import { generateSteamUI } from '../lib/generateSteamUI.js';

export class SteamStatusPlugin extends plugin {
  constructor() {
    super({
      name: 'SteamStatusPlugin',
      dsc: '查询 Steam ID 状态的插件',
      priority: 1000,
      rule: [
        {
          reg: /^#steam加入群聊$/,
          fnc: 'joinSteamGroup'
        },
        {
          reg: /^#steam退出群聊$/,
          fnc: 'leaveSteamGroup'
        },
        {
          reg: /^#查看群聊里的steam$/,
          fnc: 'queryGroupSteam'
        }
      ]
    });
  }

  async joinSteamGroup(e) {
    const qqId = String(e.user_id); // 确保 qqId 是字符串
    const groupId = String(e.group_id); // 确保 groupId 是字符串
    const data = readData();

    if (!data[qqId] || !data[qqId].steamId) {
      this.reply('请先绑定 Steam 账号，再加入群聊。');
      return;
    }

    if (!data.groups) {
      data.groups = {};
    }

    if (!data.groups[groupId]) {
      data.groups[groupId] = [];
    }

    if (!data.groups[groupId].includes(data[qqId].steamId)) {
      data.groups[groupId].push(data[qqId].steamId);
    }

    writeData(data);
    this.reply('成功加入 Steam 群聊。');
  }

  async leaveSteamGroup(e) {
    const qqId = String(e.user_id); // 确保 qqId 是字符串
    const groupId = String(e.group_id); // 确保 groupId 是字符串
    const data = readData();

    if (!data.groups || !data.groups[groupId]) {
      this.reply('您尚未加入该群聊。');
      return;
    }

    const index = data.groups[groupId].indexOf(data[qqId].steamId);
    if (index > -1) {
      data.groups[groupId].splice(index, 1);
      writeData(data);
      this.reply('成功退出 Steam 群聊。');
    } else {
      this.reply('您尚未加入该群聊。');
    }
  }

  async queryGroupSteam(e) {
    const groupId = String(e.group_id); // 确保 groupId 是字符串
    const data = readData();

    if (!data.groups || !data.groups[groupId] || data.groups[groupId].length === 0) {
      this.reply(`群聊 ${groupId} 中没有绑定有效的 Steam ID`);
      return;
    }

    const steamStatuses = [];
    for (const steamId of data.groups[groupId]) {
      try {
        const status = await fetchSteamStatus(steamId);
        if (status) {
          steamStatuses.push(status);
        }
      } catch (error) {
        console.error(`Error fetching status for Steam ID ${steamId}:`, error);
      }
    }

    if (steamStatuses.length === 0) {
      this.reply(`群聊 ${groupId} 中没有绑定有效的 Steam ID`);
      return;
    }

    try {
      const base64Image = await generateSteamUI(steamStatuses);
      this.reply(segment.image(`base64://${base64Image}`));
    } catch (error) {
      console.error('Error generating Steam UI:', error);
      this.reply('生成 Steam 状态 UI 失败，请稍后再试');
    }
  }
}

export default new SteamStatusPlugin();
