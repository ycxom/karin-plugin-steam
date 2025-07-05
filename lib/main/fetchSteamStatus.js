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
 * 通过 IPlayerService API 高效获取玩家的个人资料信息
 * @param {string} steamId 玩家的64位SteamID
 * @returns {Promise<object|null>} 成功时返回包含玩家信息的对象，失败则返回null
 */
export async function fetchPlayerProfileAPI(steamId) {
  if (!steamId) {
    debuglog('[fetchPlayerProfileAPI] 传入了无效的 steamId，返回 null。');
    return null;
  }

  debuglog(`[fetchPlayerProfileAPI] 开始为 ${steamId} 获取个人资料...`);

  const summaryUrlBuilder = (key) => `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${steamId}`;
  const equippedUrlBuilder = (key) => `https://api.steampowered.com/IPlayerService/GetProfileItemsEquipped/v1/?key=${key}&steamid=${steamId}`;

  try {
    const [summaryData, equippedData] = await Promise.all([
      makeResilientSteamApiRequest(summaryUrlBuilder),
      makeResilientSteamApiRequest(equippedUrlBuilder)
    ]);

    if (!summaryData?.response?.players?.[0]) {
      logger.warn(`[fetchPlayerProfileAPI] 无法获取 ${steamId} 的摘要信息。`);
      return null;
    }

    const player = summaryData.response.players[0];
    const userInfo = {
      actualPersonaName: player.personaname,
      playerAvatarImg: player.avatarfull,
      avatarhash: player.avatarhash,
      frameImg: null, // 默认设为 null
      communityitemid: null
    };

    const framePath = equippedData?.response?.avatar_frame?.image_large;
    if (framePath && typeof framePath === 'string' && framePath.length > 0) {
      userInfo.frameImg = `https://cdn.steamstatic.com/steamcommunity/public/images/${framePath}`;
      userInfo.communityitemid = equippedData.response.avatar_frame.communityitemid;
    } else {
      debuglog(`[fetchPlayerProfileAPI] 用户 ${steamId} 没有装备头像框或API未返回有效框体路径。`);
    }

    debuglog(`[fetchPlayerProfileAPI] 成功获取 ${steamId} 的API个人资料。`, userInfo);
    return userInfo;

  } catch (error) {
    logger.error(`[fetchPlayerProfileAPI] 为 ${steamId} 获取个人资料时发生严重错误:`, error);
    return null;
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
export async function fetchGameDetails(appId) {
  const proxy = Config.proxy || '';
  const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=zh-CN`;
  debuglog(`正在导航到 URL: ${url}`);
  const axiosConfig = {
    httpsAgent: agent,
    headers: {
      'Accept-Language': 'zh-CN,zh;q=0.9'
    }
  };

  try {
    const response = await axios.get(url, axiosConfig);
    const appData = response.data[appId];

    if (appData && appData.success) {
      debuglog(`[fetchGameDetails] 成功获取AppID ${appId} 的详细信息:`, appData.data);
      return appData.data;
    }
    logger.warn(`[fetchGameDetails] 获取AppID ${appId} 的详细信息失败或未成功:`, appData);
    return null;
  } catch (error) {
    logger.error(`[fetchGameDetails] 请求AppID ${appId} 的API时出错:`, error.message);
    return null;
  }
}


/**
 * 通过 IStoreBrowseService/GetItems 批量获取商店项目的补充信息（如价格）
 * @param {Array<number|{appid: number}|{packageid: number}>} items - 要查询的项目ID数组。
 * @param {object} options - 数据请求选项
 * @returns {Promise<Object<number, object>>} - 返回一个以ID为键，商店项目详情为值的对象。
 */
export async function fetchStoreItemDetails(items = [], options = {}) {
  if (!items || items.length === 0) {
    return {};
  }

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
      context: { language: language, country_code: countryCode },
      data_request: { ...options }
    };

    const params = { input_json: JSON.stringify(requestData) };
    debuglog(`正在发送请求: ${JSON.stringify(requestData)}`);
    try {
      const response = await axios.get('https://api.steampowered.com/IStoreBrowseService/GetItems/v1/', {
        params,
        httpsAgent: agent,
        timeout: 30000
      });
      if (response.data?.response?.store_items) {
        for (const item of response.data.response.store_items) {
          if (item?.success === 1) {
            result[item.id] = item;
          }
        }
      }
    } catch (error) {
      logger.error(`[fetchStoreItemDetails] API请求失败 (块索引 ${i / CHUNK_SIZE}):`, error.message);
    }
  }

  debuglog(`[fetchStoreItemDetails] 成功获取 ${Object.keys(result).length} 个项目补充信息。`);
  return result;
}

/**
 * 通过 Steam Web API 获取指定用户的好友列表。
 * @param {string} steamId - 目标用户的64位SteamID。
 * @returns {Promise<Array<string>>} - 返回一个包含好友SteamID的数组。
 * @throws {Error} 如果好友列表不可见或API请求失败，则抛出错误。
 */
export async function fetchFriendListAPI(steamId) {
  // **新增日志**
  debuglog(`[fetchFriendListAPI] 准备为 SteamID: ${steamId} 获取好友列表...`);
  if (!steamId || !/^\d{17}$/.test(steamId)) {
    debuglog(`[fetchFriendListAPI] 传入的 SteamID "${steamId}" 无效，终止请求。`);
    throw new Error(`无效的SteamID: ${steamId}`);
  }

  const urlBuilder = (key) => `https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key=${key}&steamid=${steamId}&relationship=friend`;

  const data = await makeResilientSteamApiRequest(urlBuilder);

  // **新增日志**
  debuglog(`[fetchFriendListAPI] SteamID: ${steamId} 的API原始返回数据:`, data);

  if (data && data.friendslist && data.friendslist.friends) {
    const friendIds = data.friendslist.friends.map(friend => friend.steamid);
    debuglog(`[fetchFriendListAPI] 成功为 ${steamId} 解析到 ${friendIds.length} 位好友。`);
    return friendIds;
  } else {
    logger.warn(`[fetchFriendListAPI] 未能获取到 SteamID: ${steamId} 的好友列表，可能因为其个人资料或好友列表为私密，或API未返回有效数据。`);
    throw new Error('无法获取好友列表，可能因为对方的个人资料或好友列表为私密。');
  }
}