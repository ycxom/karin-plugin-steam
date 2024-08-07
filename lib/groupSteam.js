import fs from 'fs';
import yaml from 'yaml';
import Config from './config.js';
import { logger } from 'node-karin';
import { getSteamIDFromFriendCode } from './scrapeSteam.js';

const DATA_FILE = `${Config.dirPath}/config/config/data.yaml`;

// 读取数据文件
export function readData() {
  if (fs.existsSync(DATA_FILE)) {
    const fileContents = fs.readFileSync(DATA_FILE, 'utf8');
    const data = yaml.parse(fileContents);
    logger.log('读取到的数据:', data); // 添加调试输出
    return data;
  }
  logger.log('数据文件不存在:', DATA_FILE); // 添加调试输出
  return { groups: {} };
}

// 写入数据文件
export function writeData(data) {
  const yamlStr = yaml.stringify(data);
  fs.writeFileSync(DATA_FILE, yamlStr, 'utf8');
}

// 检查用户是否绑定
export function isUserBound(qq) {
  const data = readData();
  return data[qq] !== undefined;
}

// 加入群聊 Steam
export async function joinGroupSteam(qq, steamID, groupId) {
  if (!/^\d{17}$/.test(steamID)) {
    steamID = await getSteamIDFromFriendCode(steamID);
  }

  const data = readData();
  if (!data.groups) {
    data.groups = {}; // 确保 groups 属性存在
  }
  
  if (!data.groups[groupId]) {
    data.groups[groupId] = { steamIds: [], enabled: false }; // 初始化 groupId
  }

  if (!data.groups[groupId].steamIds.includes(steamID)) {
    data.groups[groupId].steamIds.push(steamID);
    writeData(data);
    return `成功将 Steam ID ${steamID} 加入群聊 ${groupId}`;
  } else {
    return `Steam ID ${steamID} 已经在群聊 ${groupId} 中`;
  }
}


// 退出群聊 Steam
export async function leaveGroupSteam(qq, steamID, groupId) {
  if (!/^\d{17}$/.test(steamID)) {
    steamID = await getSteamIDFromFriendCode(steamID);
  }

  const data = readData();
  const groupData = data.groups[groupId];

  if (!groupData || !groupData.steamIds.includes(steamID)) {
    return `Steam ID ${steamID} 未在群聊 ${groupId} 中绑定`;
  }

  groupData.steamIds = groupData.steamIds.filter(id => id !== steamID);
  writeData(data);
  return `成功将 Steam ID ${steamID} 从群聊 ${groupId} 中移除`;
}

// 查询群聊 Steam
export function queryGroupSteam(groupId) {
  const data = readData();
  const groupData = data.groups[groupId];

  if (!groupData || groupData.steamIds.length === 0) {
    return `群聊 ${groupId} 中没有绑定任何 Steam ID`;
  }
  return groupData.steamIds;
}
