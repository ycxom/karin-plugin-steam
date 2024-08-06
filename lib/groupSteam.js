import fs from 'fs';
import yaml from 'yaml';
import Config from './config.js';
import { getSteamIDFromFriendCode } from './scrapeSteam.js';

const DATA_FILE = `${Config.dirPath}/config/config/data.yaml`;

// 读取数据文件
export function readData() {
  if (fs.existsSync(DATA_FILE)) {
    const fileContents = fs.readFileSync(DATA_FILE, 'utf8');
    const data = yaml.parse(fileContents);
    console.log('读取到的数据:', data); // 添加调试输出
    return data;
  }
  console.log('数据文件不存在:', DATA_FILE); // 添加调试输出
  return {};
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
export async function joinGroupSteam(steamID, groupId) {
  if (!/^\d{17}$/.test(steamID)) {
    steamID = await getSteamIDFromFriendCode(steamID);
  }

  const data = readData();
  if (!data.groups) {
    data.groups = {};
  }
  if (!data.groups[groupId]) {
    data.groups[groupId] = [];
  }
  if (!data.groups[groupId].includes(steamID)) {
    data.groups[groupId].push(steamID);
    writeData(data);
    return `成功将 Steam ID ${steamID} 加入群聊 ${groupId}`;
  } else {
    return `Steam ID ${steamID} 已经在群聊 ${groupId} 中`;
  }
}

// 退出群聊 Steam
export async function leaveGroupSteam(steamID, groupId) {
  if (!/^\d{17}$/.test(steamID)) {
    steamID = await getSteamIDFromFriendCode(steamID);
  }

  const data = readData();
  const groupData = data.groups && data.groups[groupId];

  if (!groupData || !groupData.includes(steamID)) {
    return `Steam ID ${steamID} 未在群聊 ${groupId} 中绑定`;
  }

  data.groups[groupId] = groupData.filter(id => id !== steamID);
  writeData(data);
  return `成功将 Steam ID ${steamID} 从群聊 ${groupId} 中移除`;
}

// 查询群聊 Steam
export function queryGroupSteam(groupId) {
  const data = readData();
  if (!data.groups || !data.groups[groupId] || data.groups[groupId].length === 0) {
    return `群聊 ${groupId} 中没有绑定任何 Steam ID`;
  }
  return data.groups[groupId];
}