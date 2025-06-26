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

// 通过 Steam Web 获取玩家状态 (保留作为后备方案)
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
      return { actualPersonaName, profileStatus, profileInGameName, playerAvatarImg, frameImg, profileStatusClass };
    });
    debuglog('获取到的 Steam 状态:', steamStatus);
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

/**
 * 通过 Steam Web API 批量获取多个玩家的摘要信息
 * @param {string[]} steamIds - 一个包含64位SteamID的。
 * @returns {Promise<Map<string, object>>} - 返回一个Map对象。
 */
export async function fetchPlayersSummariesAPI(steamIds) {
  if (!steamIds || steamIds.length === 0) {
    return new Map();
  }

  const allPlayersMap = new Map();
  const CHUNK_SIZE = 100;

  debuglog(`[fetchPlayersSummariesAPI] 准备为 ${steamIds.length} 个SteamID分块查询...`);

  const promises = [];
  for (let i = 0; i < steamIds.length; i += CHUNK_SIZE) {
    const chunk = steamIds.slice(i, i + CHUNK_SIZE);
    const steamIdsString = chunk.join(',');

    const urlBuilder = (key) => `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${steamIdsString}`;

    const promise = makeResilientSteamApiRequest(urlBuilder)
      .then(data => {
        if (data && data.response && data.response.players) {
          debuglog(`[fetchPlayersSummariesAPI] 成功获取一个数据块，包含 ${data.response.players.length} 个玩家信息。`);
          for (const player of data.response.players) {
            allPlayersMap.set(player.steamid, player);
          }
        }
      })
      .catch(error => {
        logger.error(`[fetchPlayersSummariesAPI] 处理数据块时出错 (起始索引 ${i}):`, error);
      });

    promises.push(promise);
  }

  await Promise.all(promises);

  debuglog(`[fetchPlayersSummariesAPI] 所有数据块处理完毕，共获取了 ${allPlayersMap.size} 个玩家的信息。`);
  return allPlayersMap;
}

/**
 * 通过 appdetails API 获取单个游戏的详细信息
 * @param {string} appId 游戏的AppID
 * @returns {Promise<object|null>} 成功时返回游戏数据对象，失败则返回null
 */
// export async function fetchGameDetails(appId) {
//   const proxy = Config.proxy || '';
//   const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
//   const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=zh-CN`;
//   debuglog(`正在导航到 URL: ${url}`);
//   const axiosConfig = {
//     httpsAgent: agent,
//     headers: {
//       'Accept-Language': 'zh-CN,zh;q=0.9'
//     }
//   };

//   try {
//     const response = await axios.get(url, axiosConfig);
//     const appData = response.data[appId];

//     if (appData && appData.success) {
//       debuglog(`[fetchGameDetails] 成功获取AppID ${appId} 的详细信息:`, appData.data);
//       return appData.data;
//     }
//     logger.warn(`[fetchGameDetails] 获取AppID ${appId} 的详细信息失败或未成功:`, appData);
//     return null;
//   } catch (error) {
//     logger.error(`[fetchGameDetails] 请求AppID ${appId} 的API时出错:`, error.message);
//     return null;
//   }
// }

/**
 * 【最终版API】通过 IStoreBrowseService/GetItems 批量获取游戏/捆绑包的详细信息
 * @param {Array<number|{appid: number}>} items - 要查询的项目ID数组。
 * @param {object} options - 额外的数据请求选项。
 * @returns {Promise<Object<number, object>>} - 返回一个以ID为键，商店项目详情为值的对象。
 */
export async function fetchGameDetails(items = [], options = {}) {
  if (!items || items.length === 0) return {};

  const result = {};
  const proxy = Config.proxy || '';
  const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
  const countryCode = 'CN';
  const language = 'schinese';

  const CHUNK_SIZE = 300;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const requestData = {
      ids: chunk.map(item => (typeof item === 'object' ? item : { appid: item })),
      context: { language, country_code: countryCode },
      data_request: {
        include_assets: true,
        include_basic_info: true,
        include_all_purchase_options: true,
        ...options
      }
    };
    const params = { input_json: JSON.stringify(requestData) };

    try {
      const response = await axios.get('https://api.steampowered.com/IStoreBrowseService/GetItems/v1/', {
        params,
        httpsAgent: agent,
        timeout: 30000
      });
      if (response.data?.response?.store_items) {
        for (const item of response.data.response.store_items) {
          if (item?.success === 1) result[item.id] = item;
        }
      }
    } catch (error) {
      logger.error(`[fetchGameDetails] API请求失败:`, error.message);
    }
  }
  debuglog(`[fetchGameDetails] 成功获取 ${Object.keys(result).length} 个项目详情。`);
  return result;
}


/**
 * 通过官方API高效获取玩家的个人资料信息
 * @param {string} steamId 玩家的64位SteamID
 * @returns {Promise<object|null>} 成功时返回包含玩家信息的对象，失败则返回null
 */
export async function fetchPlayerProfileAPI(steamId) {
  if (!steamId) return null;

  const summaryUrlBuilder = (key) => `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`;
  const equippedUrlBuilder = (key) => `https://api.steampowered.com/IPlayerService/GetProfileItemsEquipped/v1/?key=${key}&steamid=${steamId}`;

  try {
    const [summaryData, equippedData] = await Promise.all([
      makeResilientSteamApiRequest(summaryUrlBuilder),
      makeResilientSteamApiRequest(equippedUrlBuilder)
    ]);

    if (!summaryData?.response?.players?.[0]) return null;

    const player = summaryData.response.players[0];
    const userInfo = {
      actualPersonaName: player.personaname,
      playerAvatarImg: player.avatarfull,
      frameImg: null,
    };

    if (equippedData?.response?.avatar_frame?.image_large) {
      const framePath = equippedData.response.avatar_frame.image_large;
      userInfo.frameImg = `https://cdn.steamstatic.com/steamcommunity/public/images/${framePath}`;
    }
    return userInfo;
  } catch (error) {
    logger.error(`[fetchPlayerProfileAPI] 为 ${steamId} 获取个人资料时出错:`, error);
    return null;
  }
}