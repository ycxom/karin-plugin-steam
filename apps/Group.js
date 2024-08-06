import { plugin, segment } from 'node-karin';
import { readData, fetchSteamStatus } from '../lib/scrapeSteam.js';
import { generateSteamUI } from '../lib/generateSteamUI.js';
import { joinGroupSteam, leaveGroupSteam, queryGroupSteam } from '../lib/groupSteam.js';

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
          reg: /^#查看群聊steam$/,
          fnc: 'querySteamGroup'
        }
      ]
    });
  }

  async joinSteamGroup(e) {
    const qq = e.sender.user_id;
    const groupId = String(e.group_id); // 确保 groupId 是字符串
    const data = readData();

    if (!data[qq]) {
      this.reply('请先绑定 Steam 账号，再加入群聊。');
      return;
    }

    try {
      const result = await joinGroupSteam(data[qq], groupId);
      this.reply(result);
    } catch (error) {
      this.reply('加入群聊失败，请稍后再试。');
      console.error('Error joining Steam group:', error);
    }
  }

  async leaveSteamGroup(e) {
    const qq = e.sender.user_id;
    const groupId = String(e.group_id); // 确保 groupId 是字符串
    const data = readData();

    if (!data[qq]) {
      this.reply('您尚未绑定 Steam 账号。');
      return;
    }

    try {
      const result = await leaveGroupSteam(data[qq], groupId);
      this.reply(result);
    } catch (error) {
      this.reply('退出群聊失败，请稍后再试。');
      console.error('Error leaving Steam group:', error);
    }
  }

  async querySteamGroup(e) {
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
