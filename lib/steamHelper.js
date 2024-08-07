import axios from 'axios';
import cheerio from 'cheerio';
import fs from 'fs';
import yaml from 'yaml';
import Config from './config.js';
import pkg from 'https-proxy-agent';

const { HttpsProxyAgent } = pkg;
const proxy = Config.Config.proxy;
const agent = new HttpsProxyAgent(proxy);

const DATA_FILE = 'config/data.yaml';

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
    
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      },
      httpsAgent: agent
    });
    const html = response.data;
    const $ = cheerio.load(html);

    const actualPersonaName = $('.actual_persona_name').text().trim();
    const profileStatus = $('.profile_in_game_header').text().trim() || $('.profile_header_badgeinfo').text().trim();
    const profileInGameName = $('.profile_in_game_name').text().trim();
    const playerAvatarImg = $('.playerAvatarAutoSizeInner img').attr('src');

    if (!actualPersonaName) {
      return null;
    }

    return {
      actualPersonaName,
      profileStatus,
      profileInGameName,
      playerAvatarImg
    };
  } catch (error) {
    console.error('Error fetching the page:', error);
    throw error;
  }
}
