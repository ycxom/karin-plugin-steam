import { plugin, segment } from 'node-karin';
import { readData, writeData, fetchSteamStatus } from '../lib/scrapeSteam.js';
import { screenshotSteamProfile, screenshotSteamFriends } from '../lib/screenshot.js';
import { joinGroupSteam, queryGroupSteam, isUserBound } from '../lib/groupSteam.js';
import axios from 'axios';
import HttpsProxyAgent from 'https-proxy-agent';
import Config from '../lib/config.js';

const proxy = Config.Config.proxy;
const agent = new HttpsProxyAgent(proxy);

export class SteamStatusPlugin extends plugin {
  constructor() {
    super({
      name: 'SteamStatusPlugin',
      dsc: '查询 Steam ID 状态的插件',
      priority: 1000,
      rule: [
        {
          reg: /^#查询[S|s]team (.+)$/,
          fnc: 'querySteamStatus'
        },
        {
          reg: /^#绑定[S|s]team (.+)$/,
          fnc: 'bindSteam'
        },
        {
          reg: /^#解绑[S|s]team$/,
          fnc: 'unbindSteam'
        },
        {
          reg: /^#查看我的[S|s]team$/,
          fnc: 'queryMySteam'
        },
        {
          reg: /^#查看(?:\[at:(\d+)\]|(\d+))的steam$/,
          fnc: 'queryOtherSteam'
        },
        {
          reg: /^#查询[S|s]team好友 (.+)$/,
          fnc: 'querySteamFriends'
        },
        {
          reg: /^#[S|s]team加入群聊$/,
          fnc: 'joinGroupSteam'
        },
        {
          reg: /^#查看群聊里的[S|s]team$/,
          fnc: 'queryGroupSteam'
        },
        {
          reg: /^#[S|s]team退出群聊$/,
          fnc: 'leaveGroupSteam'
        }        
      ]
    });
  }

  async bindSteam(e) {
    const friendCode = e.msg.replace(/^#绑定steam /, '').trim();
    const qq = e.sender.user_id;
    try {
      const steamID = await getSteamIDFromFriendCode(friendCode);
      const data = readData();
      data[qq] = steamID;
      writeData(data);
      this.reply(`绑定成功：QQ ${qq} -> SteamID ${steamID}`);
    } catch (error) {
      this.reply('绑定失败，请检查好友代码是否正确。');
    }
  }

  async unbindSteam(e) {
    const qq = e.sender.user_id;
    const data = readData();
    if (data[qq]) {
      delete data[qq];
      writeData(data);
      this.reply(`解绑成功：QQ ${qq}`);
    } else {
      this.reply(`未找到绑定的Steam账号：QQ ${qq}`);
    }
  }

  async querySteamStatus(e) {
    const playerIdentifier = e.msg.replace(/^#查询[S|s]team /, '').trim();
    try {
      const status = await fetchSteamStatus(playerIdentifier);
      const result = await screenshotSteamProfile(playerIdentifier);
      if (result.error) {
        this.reply(result.error);
      } else if (result.image) {
        this.reply(segment.image(`base64://${result.image}`));
      } else {
        this.reply(formatSteamStatus(status));
      }
    } catch {
      this.reply('查询失败，请稍后再试');
    }
  }

  async queryMySteam(e) {
    const qq = e.sender.user_id;
    const data = readData();
    const steamID = data[qq];
    if (!steamID) {
      this.reply('未绑定Steam账号。请使用 #绑定steam 好友代码');
      return;
    }
    try {
      const status = await fetchSteamStatus(steamID);
      const result = await screenshotSteamProfile(steamID);
      if (result.error) {
        this.reply(result.error);
      } else if (result.image) {
        this.reply(segment.image(`base64://${result.image}`));
      } else {
        this.reply(formatSteamStatus(status));
      }
    } catch {
      this.reply('查询失败，请稍后再试');
    }
  }

  async queryOtherSteam(e) {
    const match = e.msg.match(/^#查看(?:\[at:(\d+)\]|(\d+))的steam$/);
    if (!match) {
      this.reply('命令格式错误。');
      return;
    }
    const qq = match[1] || match[2];
    const data = readData();
    const steamID = data[qq];
    if (!steamID) {
      this.reply(`QQ号 ${qq} 未绑定Steam账号。`);
      return;
    }
    try {
      const status = await fetchSteamStatus(steamID);
      const result = await screenshotSteamProfile(steamID);
      if (result.error) {
        this.reply(result.error);
      } else if (result.image) {
        this.reply(segment.image(`base64://${result.image}`));
      } else {
        this.reply(formatSteamStatus(status));
      }
    } catch {
      this.reply('查询失败，请稍后再试');
    }
  }
  async querySteamFriends(e) {
    const playerIdentifier = e.msg.replace(/^#查询[S|s]team好友 /, '').trim();

    try {
      const result = await screenshotSteamFriends(playerIdentifier);
      if (result.error) {
        this.reply(result.error);
      } else if (result.image) {
        this.reply(segment.image(`base64://${result.image}`));
      }
    } catch (error) {
      console.error('Error querying steam friends:', error);
      this.reply('查询失败，请稍后再试');
    }
  }


  async joinGroupSteam(e) {
    const groupId = e.group_id;
    const qq = e.sender.user_id;
  
    const data = readData();
    const steamID = data[qq];
  
    if (!steamID) {
      this.reply('请先绑定 Steam ID，再加入群聊');
      return;
    }
  
    const message = joinGroupSteam(steamID, groupId);
    this.reply(message);
  }
  

  async queryGroupSteam(e) {
    const groupId = e.group_id;
    const steamIDs = queryGroupSteam(groupId);
    if (typeof steamIDs === 'string') {
      this.reply(steamIDs);
      return;
    }

    let replyMessage = `群聊 ${groupId} 中绑定的 Steam ID 状态：\n`;

    for (const steamID of steamIDs) {
      try {
        const status = await fetchSteamStatus(steamID);
        replyMessage += `${status.actualPersonaName} - ${status.profileStatus}\n`;
      } catch (error) {
        replyMessage += `Steam ID ${steamID} 查询失败\n`;
      }
    }

    this.reply(replyMessage);
  }

  async leaveGroupSteam(e) {
    const groupId = e.group_id;
    const qq = e.sender.user_id;
  
    const data = readData();
    const steamID = data[qq];
  
    if (!steamID) {
      this.reply('您还没有绑定 Steam ID，无法退出群聊');
      return;
    }
  
    const groupData = data.groups && data.groups[groupId];
    if (!groupData || !groupData.includes(steamID)) {
      this.reply('您的 Steam ID 未在此群聊中绑定');
      return;
    }
  
    data.groups[groupId] = groupData.filter(id => id !== steamID);
    writeData(data);
    this.reply(`成功将 Steam ID ${steamID} 从群聊 ${groupId} 中移除`);
  }
}


function formatSteamStatus(status) {
  if (!status) {
    return '未找到玩家';
  }
  let result = `
玩家名: ${status.actualPersonaName}
状态: ${status.profileStatus}
  `;
  if (status.profileStatus.includes('当前正在游戏')) {
    result += `游戏中: ${status.profileInGameName}\n`;
  }
  result += `头像截图已附上`;
  return result;
}

async function getSteamIDFromFriendCode(friendCode) {
  const apiKey = Config.Config.steamApiKey; // 在 config.yaml 中添加 Steam API Key
  const response = await axios.get(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${apiKey}&vanityurl=${friendCode}`, {
    httpsAgent: agent
  });
  if (response.data && response.data.response && response.data.response.steamid) {
    return response.data.response.steamid;
  }
  throw new Error('无法转换好友代码为 SteamID');
}

export default new SteamStatusPlugin();
