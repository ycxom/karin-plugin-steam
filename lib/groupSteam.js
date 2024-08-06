import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import Config from './config.js';

const DATA_FILE = `${Config.dirPath}/config/config/data.yaml`;


export function isUserBound(qq) {
    const data = readData();
    return data[qq] !== undefined;
}


export function leaveGroupSteam(steamID, groupId) {
    const data = readData();
    const groupData = data.groups && data.groups[groupId];
  
    if (!groupData || !groupData.includes(steamID)) {
      return `Steam ID ${steamID} 未在群聊 ${groupId} 中绑定`;
    }
  
    data.groups[groupId] = groupData.filter(id => id !== steamID);
    writeData(data);
    return `成功将 Steam ID ${steamID} 从群聊 ${groupId} 中移除`;
}

  
export function readData() {
  if (fs.existsSync(DATA_FILE)) {
    const fileContents = fs.readFileSync(DATA_FILE, 'utf8');
    return yaml.parse(fileContents);
  }
  return {};
}

export function writeData(data) {
  const yamlStr = yaml.stringify(data);
  fs.writeFileSync(DATA_FILE, yamlStr, 'utf8');
}

export function joinGroupSteam(steamID, groupId) {
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

export function queryGroupSteam(groupId) {
  const data = readData();
  if (!data.groups || !data.groups[groupId] || data.groups[groupId].length === 0) {
    return `群聊 ${groupId} 中没有绑定任何 Steam ID`;
  }
  return data.groups[groupId];
}
