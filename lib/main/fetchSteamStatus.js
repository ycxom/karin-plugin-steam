import { parseStringPromise } from 'xml2js';
import puppeteer from 'puppeteer';
import Config from '../config.js';
import pkg from 'https-proxy-agent';
import axios from 'axios';
import { logger } from 'node-karin';


const { HttpsProxyAgent } = pkg;
const proxy = Config.Config.proxy;
const agent = new HttpsProxyAgent(proxy);


// 通过 Steam Web 获取玩家状态
export async function fetchSteamStatus(playerIdentifier) {
  const url = `https://steamcommunity.com/profiles/${playerIdentifier}`;
    
  const browser = await puppeteer.launch({
    args: [
      `--proxy-server=${proxy}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  try {
    const page = await browser.newPage();
    logger.debug(`打开页面: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    // 提取其他页面数据和返回最终结果
    const steamStatus = await page.evaluate(() => {
      const actualPersonaName = document.querySelector('.actual_persona_name')?.innerText.trim() || '未知用户';
      const profileStatus = document.querySelector('.profile_in_game_header')?.innerText.trim() || '当前离线';
      const profileInGameName = document.querySelector('.profile_in_game_name')?.innerText.trim() || '';
      const playerAvatarImgList = document.querySelectorAll('.playerAvatarAutoSizeInner img');
      const playerAvatarImg = playerAvatarImgList.length > 0 ? playerAvatarImgList[playerAvatarImgList.length - 1].src : '默认头像链接';

      const frameImg = document.querySelector('.playerAvatarAutoSizeInner .profile_avatar_frame img')?.src;

      let profileStatusClass = 'offline';
      if (profileStatus.includes('当前正在游戏')) {
        profileStatusClass = 'in-game';
      } else if (profileStatus.includes('非 Steam 游戏中')) {
        profileStatusClass = 'In non-Steam game';
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
    logger.error('抓取页面时出错:', error);
    throw error;
  } finally {
    logger.debug('关闭浏览器');
    await browser.close();
  }
}


// 通过 Steam XML 获取玩家状态
export async function fetchSteamStatusXML(playerIdentifier, retries = 3) {
    const url = `https://steamcommunity.com/profiles/${playerIdentifier}/?xml=2`;
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
        logger.warn(`Error fetching XML data, retrying... (${3 - retries + 1}/${3})`);
        return fetchSteamStatus(playerIdentifier, retries - 1);
      } else {
        logger.error(`Error fetching XML data: ${error.message}`);
        throw error;
      }
    }
  }
  

  // 通过 Steam API 获取玩家状态
export async function fetchSteamStatusAPI(steamId) {
  const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${Config.Config.steamApiKey}&steamids=${steamId}`;
  try {
      const response = await axios.get(url, {
          timeout: 30000,
          httpsAgent: agent
      });

      const players = response.data.response.players;
      if (players && players.length > 0) {
          const player = players[0];
          return {
            personaname: player.personaname,
            profileStatusClass: player.personastate, 
            gameextrainfo: player.gameextrainfo || '',
            gameid: player.gameid || '',
            stateMessage: player.gameextrainfo ? `Playing ${player.gameextrainfo}` : 'Online',
            gamelogo: player.gameid ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${player.gameid}/capsule_184x69.jpg` : 'default_image.jpg'
        };
      } else {
          console.warn(`Steam ID ${steamId} 未找到`);
          return null;
      }
  } catch (error) {
      console.error(`通过 Steam API 获取状态时出错:`, error);
      return null;
  }
}
