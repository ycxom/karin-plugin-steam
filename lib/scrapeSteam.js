import puppeteer from 'puppeteer';
import fs from 'fs';
import yaml from 'yaml';
import Config from './config.js';
import pkg from 'https-proxy-agent';
import axios from 'axios';
import { logger } from 'node-karin';
import { parseStringPromise } from 'xml2js';

const { HttpsProxyAgent } = pkg;
const proxy = Config.Config.proxy;
const agent = new HttpsProxyAgent(proxy);

const DATA_FILE = `${Config.dirPath}/config/config/data.yaml`;
const STATUS_FILE = `${Config.dirPath}/config/config/status.yaml`;
const CONFIG_FILE = `${Config.dirPath}/config/config/config.yaml`;

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

export function readStatus() {
  if (fs.existsSync(STATUS_FILE)) {
    const fileContents = fs.readFileSync(STATUS_FILE, 'utf8');
    return yaml.parse(fileContents);
  }
  return {};
}

export function writeStatus(status) {
  const yamlStr = yaml.stringify(status);
  fs.writeFileSync(STATUS_FILE, yamlStr, 'utf8');
}

export function readConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    const fileContents = fs.readFileSync(CONFIG_FILE, 'utf8');
    return yaml.parse(fileContents);
  }
  return { steamBroadcastEnabled: false }; // 默认值
}

export function writeConfig(config) {
  const yamlStr = yaml.stringify(config);
  fs.writeFileSync(CONFIG_FILE, yamlStr, 'utf8');
}

export async function fetchSteamStatus(playerIdentifier) {
  const url = `https://steamcommunity.com/profiles/${playerIdentifier}`
    
  const browser = await puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    const steamStatus = await page.evaluate(() => {
      const actualPersonaName = document.querySelector('.actual_persona_name')?.innerText.trim() || '未知用户';
      const profileStatus = document.querySelector('.profile_in_game_header')?.innerText.trim() || '当前离线';
      const profileInGameName = document.querySelector('.profile_in_game_name')?.innerText.trim() || '';
      const playerAvatarImg = document.querySelector('.playerAvatarAutoSizeInner img[src*="avatars.akamai.steamstatic.com"]')?.src || '默认头像链接';
      const frameImg = document.querySelector('.playerAvatarAutoSizeInner .profile_avatar_frame img')?.src;

      let profileStatusClass = 'offline';
      if (profileStatus.includes('当前正在游戏')) {
        profileStatusClass = 'in-game';
      } else if (profileStatus.includes('在线')) {
        profileStatusClass = 'online';
      }

      return {
        actualPersonaName,
        profileStatus,
        profileInGameName,
        playerAvatarImg,
        frameImg,
        profileStatusClass
      };
    });

    logger.debug('获取到的 Steam 状态:', steamStatus); // 添加调试输出

    return steamStatus;
  } catch (error) {
    console.error('Error fetching the page:', error);
    throw error;
  } finally {
    await browser.close();
  }
}


export async function fetchSteamStatusXML(playerIdentifier, retries = 3) {
  const url = `https://steamcommunity.com/profiles/${playerIdentifier}/?xml=1`;
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      httpsAgent: agent
    });

    logger.debug(`原始数据: ${response.data}`);

    if (response.data.includes('<html') || response.data.includes('<!DOCTYPE html>')) {
      throw new Error('Received HTML page instead of XML data');
    }

    const cleanedData = response.data
      .replace(/&(?!(?:apos|quot|[gl]t|amp);|#)/g, '&amp;')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '');

    logger.debug(`清理后的数据: ${cleanedData}`);

    const data = await parseStringPromise(cleanedData);

    const onlineState = data.profile.onlineState[0];
    const stateMessage = data.profile.stateMessage[0];
    const actualPersonaName = data.profile.steamID[0];

    return {
      actualPersonaName,
      onlineState,
      stateMessage,
    };
  } catch (error) {
    if (retries > 0) {
      logger.warn(`Error fetching XML data, retrying... (${MAX_RETRIES - retries + 1}/${MAX_RETRIES})`);
      return fetchSteamStatus(playerIdentifier, retries - 1);
    } else {
      logger.error(`Error fetching XML data: ${error.message}`);
      throw error;
    }
  }
}


export async function getSteamIDFromFriendCode(friendCode) {
  const apiKey = Config.Config.steamApiKey;
  const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${apiKey}&vanityurl=${friendCode}`;
  try {
    const response = await axios.get(url, { httpsAgent: agent });
    if (response.data && response.data.response && response.data.response.steamid) {
      return response.data.response.steamid;
    }
    console.error(`API Response: ${JSON.stringify(response.data)}`);
    throw new Error('无法转换好友代码为 SteamID');
  } catch (error) {
    console.error('Error converting friend code to SteamID:', error);
    throw new Error('无法转换好友代码为 SteamID');
  }
}

export function convertFriendCodeToSteamID64(friendCode) {
  console.log(friendCode)

  const base = 76561197960265728n; // SteamID64 基础值
  const code = BigInt(friendCode);
  return (code + base).toString();
}
