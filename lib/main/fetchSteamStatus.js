// lib/main/fetchSteamStatus.js
import { parseStringPromise } from 'xml2js';
import puppeteer from 'puppeteer';
import { Config } from '../config.js';
import pkg from 'https-proxy-agent';
import axios from 'axios';
import { logger } from 'node-karin';
import { makeResilientSteamApiRequest } from '../common/apiKeyManager.js';
import { debuglog } from '../debuglog.js';

const { HttpsProxyAgent } = pkg;

// 通过 Steam Web 获取玩家状态
export async function fetchSteamStatus(playerIdentifier) {
  const url = `https://steamcommunity.com/profiles/${playerIdentifier}`;

  const browser = await puppeteer.launch({
    args: [
      `--proxy-server=${Config.proxy || ''}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  try {
    const page = await browser.newPage();
    debuglog(`打开页面: ${url}`);
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

    debuglog('获取到的 Steam 状态:', steamStatus); // 添加调试输出

    return steamStatus;
  } catch (error) {
    logger.error('抓取页面时出错:', error);
    throw error;
  } finally {
    debuglog('关闭浏览器');
    await browser.close();
  }
}


// 通过 Steam XML 获取玩家状态
export async function fetchSteamStatusXML(playerIdentifier, retries = 3) {
  const url = `https://steamcommunity.com/profiles/${playerIdentifier}/?xml=2`;
  const proxy = Config.proxy || '';
  const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      httpsAgent: agent
    });

    debuglog(`原始数据: ${response.data}`);

    if (response.data.includes('<html') || response.data.includes('<!DOCTYPE html>')) {
      throw new Error('Received HTML page instead of XML data');
    }

    const cleanedData = response.data
      .replace(/&(?!(?:apos|quot|[gl]t|amp);|#)/g, '&amp;')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '');

    debuglog(`清理后的数据: ${cleanedData}`);

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
  const urlBuilder = (key) => `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${steamId}`;

  const data = await makeResilientSteamApiRequest(urlBuilder);

  if (!data) {
    debuglog(`获取 Steam ID ${steamId} 的API状态失败`);
    return null;
  }

  const players = data.response.players;
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
    logger.warn(`Steam ID ${steamId} 未在API返回中找到`);
    return null;
  }
}



/**
 * 通过 Steam Web API 批量获取多个玩家的摘要信息。
 * 这个函数是 `fetchSteamStatusAPI` 的优化版本，它利用了 Steam API 单次可查询100个用户的特性。
 * 它会自动处理ID分块，并行请求，并整合结果，从而极大地减少API调用次数。
 *
 * @param {string[]} steamIds - 一个包含64位SteamID的【数组】。
 * @returns {Promise<Map<string, object>>} - 返回一个Map对象。
 * - 键 (Key): 玩家的 steamId (string) 
 * - 值 (Value): Steam API返回的玩家信息对象 (object)
 */
export async function fetchPlayersSummariesAPI(steamIds) {
  // 如果没有传入ID，直接返回一个空的Map
  if (!steamIds || steamIds.length === 0) {
    return new Map();
  }

  const allPlayersMap = new Map();
  const CHUNK_SIZE = 100; // Steam API 规定每次请求的ID上限

  debuglog(`[fetchPlayersSummariesAPI] 准备为 ${steamIds.length} 个SteamID分块查询...`);

  const promises = [];
  // 将 steamIds 数组按 CHUNK_SIZE 进行分块
  for (let i = 0; i < steamIds.length; i += CHUNK_SIZE) {
    const chunk = steamIds.slice(i, i + CHUNK_SIZE);
    const steamIdsString = chunk.join(',');

    const urlBuilder = (key) => `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${steamIdsString}`;

    // 将请求添加到Promise数组中，以便后续并行处理
    const promise = makeResilientSteamApiRequest(urlBuilder)
      .then(data => {
        if (data && data.response && data.response.players) {
          debuglog(`[fetchPlayersSummariesAPI] 成功获取一个数据块，包含 ${data.response.players.length} 个玩家信息。`);
          for (const player of data.response.players) {
            // 将获取到的玩家数据存入Map中
            allPlayersMap.set(player.steamid, player);
          }
        }
      })
      .catch(error => {
        logger.error(`[fetchPlayersSummariesAPI] 处理数据块时出错 (起始索引 ${i}):`, error);
      });

    promises.push(promise);
  }

  // 并行执行所有的API请求
  await Promise.all(promises);

  debuglog(`[fetchPlayersSummariesAPI] 所有数据块处理完毕，共获取了 ${allPlayersMap.size} 个玩家的信息。`);
  return allPlayersMap;
}




// fetchGameDetails(2781370);
/**
 * 通过Steam商店API获取单个游戏的详细信息
 * @param {string} appId 游戏的AppID
 * @returns {Promise<object|null>} 成功时返回游戏数据对象，失败则返回null
 */
export async function fetchGameDetails(appId) {
  const proxy = Config.proxy || '';
  const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=zh-CN`;
  debuglog(`正在导航到 URL: ${url}`);
  const axiosConfig = {
    httpsAgent: agent,
    headers: {
      // 设置偏好的语言为简体中文
      'Accept-Language': 'zh-CN,zh;q=0.9'
    }
  };

  try {
    // 在请求时传入新的配置
    const response = await axios.get(url, axiosConfig);
    const appData = response.data[appId];

    if (appData && appData.success) {
      debuglog(`[fetchGameDetails] 成功获取AppID ${appId} 的详细信息:`, appData.data);
      return appData.data; // 返回包含游戏详情的 data 对象
    }
    logger.warn(`[fetchGameDetails] 获取AppID ${appId} 的详细信息失败或未成功:`, appData);
    return null;
  } catch (error) {
    logger.error(`[fetchGameDetails] 请求AppID ${appId} 的API时出错:`, error.message);
    return null;
  }
}