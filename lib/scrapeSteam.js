import puppeteer from 'puppeteer';
import cheerio from 'cheerio';
import fs from 'fs';
import yaml from 'yaml';
import Config from './config.js';
import pkg from 'https-proxy-agent';
import axios from 'axios'; // 添加这一行

const { HttpsProxyAgent } = pkg;
const proxy = Config.Config.proxy;
const agent = new HttpsProxyAgent(proxy);

const DATA_FILE = `${Config.dirPath}/config/config/data.yaml`;

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

export async function fetchSteamStatus(playerIdentifier) {
  const isNumericId = /^\d+$/.test(playerIdentifier);
  const url = isNumericId
    ? `https://steamcommunity.com/profiles/${playerIdentifier}`
    : `https://steamcommunity.com/id/${playerIdentifier}`;
    
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

    console.debug('获取到的 Steam 状态:', steamStatus); // 添加调试输出

    return steamStatus;
  } catch (error) {
    console.error('Error fetching the page:', error);
    throw error;
  } finally {
    await browser.close();
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
