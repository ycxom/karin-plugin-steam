// lib/common/generateSteamUI.js
import puppeteer from 'puppeteer';
import { logger } from 'node-karin';
import path from 'path';
import fs from 'fs';
import { Config, dirPath } from '../config.js';
import Handlebars from 'handlebars';
import { readSteamStatusCache } from '../db/databaseOps.js';
import { fetchSteamStatus, fetchPlayerProfileAPI } from '../main/fetchSteamStatus.js';
import axios from 'axios';
import pkg from 'https-proxy-agent';
import { debuglog } from '../debuglog.js';

const { HttpsProxyAgent } = pkg;

/**
 * 浏览器管理器
 */
const BrowserManager = {
  browser: null,
  async getBrowser() {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }
    this.browser = await puppeteer.launch({
      args: [
        `--proxy-server=${Config.proxy || ''}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
      ],
    });
    process.on('beforeExit', async () => {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    });
    return this.browser;
  },
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
};

/**
 * 模板管理器
 */
const TemplateManager = {
  templates: {},
  initialize() {
    const templatePaths = {
      status: path.resolve(`${dirPath}/resources/template/steam_statuses.html`),
      notification: path.resolve(`${dirPath}/resources/template/steam_notification_template.html`),
      inventory: path.resolve(`${dirPath}/resources/template/steam_inventory_notification_template.html`),
    };

    for (const key in templatePaths) {
      try {
        const source = fs.readFileSync(templatePaths[key], 'utf8');
        this.templates[key] = Handlebars.compile(source);
      } catch (error) {
        logger.error(`[TemplateManager] 编译模板 ${key} 失败:`, error);
      }
    }
    this.registerHelpers();
  },
  registerHelpers() {
    Handlebars.registerHelper('eq', (a, b) => a === b);
    Handlebars.registerHelper('or', (...args) => args.slice(0, -1).some(Boolean));
    Handlebars.registerHelper('formatDate', () => new Date().toLocaleString('zh-CN', { hour12: false }));

    Handlebars.registerHelper('formatPrice', (priceOverview) => {
      if (!priceOverview) return '价格未知';
      return priceOverview.formatted_final_price || priceOverview.final_formatted || '免费或未知';
    });

    Handlebars.registerHelper('platformIcons', (platforms) => {
      if (!platforms) return '';
      let icons = '';
      if (platforms.windows) icons += '<span class="platform-icon">⊞</span>';
      if (platforms.mac) icons += '<span class="platform-icon"></span>';
      if (platforms.linux) icons += '<span class="platform-icon">🐧</span>';
      return new Handlebars.SafeString(icons);
    });

    Handlebars.registerHelper('cleanLanguages', (langString) => {
      if (typeof langString !== 'string' || !langString) return '无语言信息';
      const cleaned = langString.replace(/<strong>\*<\/strong>/g, '*').replace(/<br>/g, ', ');
      const highlighted = cleaned.replace(/简体中文(\*?)/g, '<span class="lang-highlight">简体中文$1</span>');
      return new Handlebars.SafeString(highlighted);
    });
  },
  render(name, data) {
    if (!this.templates[name]) {
      throw new Error(`模板 ${name} 未找到或编译失败。`);
    }
    return this.templates[name](data);
  }
};

TemplateManager.initialize();

/**
 * 获取网络图片并转换为Base64 Data URI
 */
async function imageUrlToBase64(url) {
  if (!url) {
    debuglog('[imageUrlToBase64] URL为空，跳过转换。');
    return '';
  }
  try {
    const proxy = Config.proxy || '';
    const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      httpsAgent: agent,
      timeout: 15000
    });
    const base64 = Buffer.from(response.data, 'binary').toString('base64');
    const mimeType = response.headers['content-type'] || 'image/jpeg';
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    logger.warn(`[imageUrlToBase64] 转换图片失败: ${url}`, error.message);
    return '';
  }
}

async function takeScreenshot(htmlContent, viewportOptions, fullPage = false) {
  const browser = await BrowserManager.getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const finalViewport = { ...viewportOptions };
    if (fullPage && !finalViewport.height) {
      finalViewport.height = await page.evaluate(() => document.body.scrollHeight) || 500;
    }
    if (!finalViewport.height) {
      finalViewport.height = 500;
    }
    await page.setViewport(finalViewport);
    await page.evaluateHandle('document.fonts.ready');
    await new Promise(r => setTimeout(r, 300));
    const screenshotBuffer = await page.screenshot({ type: 'png', fullPage });
    return screenshotBuffer.toString('base64');
  } catch (error) {
    logger.error(`[takeScreenshot] 截图失败: ${error.message}`, { viewport: viewportOptions, fullPage });
    throw error;
  } finally {
    await page.close();
  }
}

export async function generateSteamUI(steamStatuses) {
  try {
    const inGameFriends = steamStatuses.filter(status => status.profileStatusClass === 'in-game').sort((a, b) => a.profileInGameName?.localeCompare(b.profileInGameName || '') || 0);
    const onlineFriends = steamStatuses.filter(status => status.profileStatusClass === 'online').sort((a, b) => a.actualPersonaName.localeCompare(b.actualPersonaName));
    const offlineFriends = steamStatuses.filter(status => status.profileStatusClass === 'offline');
    const limitedOfflineFriends = offlineFriends.slice(0, 10);
    const htmlContent = TemplateManager.render('status', {
      inGameFriends,
      onlineFriends,
      offlineFriends: limitedOfflineFriends,
      totalOfflineFriends: offlineFriends.length,
      hasMoreOfflineFriends: offlineFriends.length > 10,
    });
    return await takeScreenshot(htmlContent, { width: 610 }, true);
  } catch (error) {
    logger.error(`[generateSteamUI] 生成Steam好友状态图失败: ${error.message}`);
    throw error;
  }
}

export async function generateSteamNotification(groupId, notifications, gameDetailsCache = {}) {
  const screenshotTasks = notifications.map(async (notification) => {
    try {
      let finalTemplateData = { ...notification };

      // 优先使用高效的 API 获取用户信息
      try {
        const apiUserInfo = await fetchPlayerProfileAPI(notification.steamid);
        if (apiUserInfo) {
          finalTemplateData = { ...finalTemplateData, ...apiUserInfo };
          if (!Config.enableAvatarFrame) {
            finalTemplateData.frameImg = null;
          }
        }
      } catch (apiError) {
        logger.warn(`[generateSteamNotification] API获取 ${notification.steamid} 用户信息失败: ${apiError.message}`);
      }

      const gameDetails = gameDetailsCache[finalTemplateData.gameid] || null;

      const currentState = finalTemplateData.personastate;
      const isInGame = finalTemplateData.profileStatusClass === 'in-game';
      const statusMessages = { 0: '离线', 1: '在线', 2: '忙碌', 3: '离开', 4: '打盹', 5: '想交易', 6: '想玩游戏' };

      finalTemplateData.profileStatus = isInGame
        ? ((currentState > 1 && statusMessages[currentState]) ? statusMessages[currentState] : '')
        : (statusMessages[currentState] || '未知状态');

      finalTemplateData.profileInGameName = gameDetails?.name || finalTemplateData.gameextrainfo;

      // 准备图片URL进行转换
      const imageUrlsToConvert = {
        playerAvatarImg: finalTemplateData.playerAvatarImg,
        frameImg: finalTemplateData.frameImg,
        gamelogo: gameDetails?.assets?.header
          ? `https://cdn.akamai.steamstatic.com/steam/apps/${gameDetails.appid}/${gameDetails.assets.header}`
          : (finalTemplateData.gamelogo || '')
      };

      const base64Images = {};
      for (const key in imageUrlsToConvert) {
        base64Images[key] = await imageUrlToBase64(imageUrlsToConvert[key]);
      }

      const templateData = { ...finalTemplateData, ...base64Images };

      const htmlContent = TemplateManager.render('notification', { notifications: [templateData] });
      return await takeScreenshot(htmlContent, { width: 450, height: 208 });

    } catch (err) {
      logger.error(`[generateSteamNotification] 生成单条通知图失败 (SteamID: ${notification.steamid}):`, err);
      return null;
    }
  });

  return (await Promise.all(screenshotTasks)).filter(Boolean);
}

/**
 * 生成包含游戏详细信息的库存更新通知图片
 */
export async function generateInventoryUpdateImage(steamId, newGamesDetails) {
  try {
    let userInfo = {};

    try {
      const apiUserInfo = await fetchPlayerProfileAPI(steamId);
      if (apiUserInfo?.actualPersonaName) {
        userInfo = apiUserInfo;
        if (!Config.enableAvatarFrame) {
          userInfo.frameImg = null;
        }
      }
    } catch (apiError) {
      logger.warn(`[generateInventoryUpdateImage] API获取 ${steamId} 用户信息失败: ${apiError.message}，将回退。`);
    }

    if (!userInfo.actualPersonaName) {
      logger.warn(`[generateInventoryUpdateImage] API未能获取用户信息，回退到网页抓取/缓存...`);
      try {
        userInfo = await fetchSteamStatus(steamId);
      } catch (fetchError) {
        logger.warn(`[generateInventoryUpdateImage] 网页抓取 ${steamId} 信息也失败: ${fetchError.message}，将从缓存中回退。`);
        const cachedInfo = await readSteamStatusCache(steamId);
        userInfo = cachedInfo
          ? { actualPersonaName: cachedInfo.personaname, playerAvatarImg: cachedInfo.avatarfull, frameImg: cachedInfo.frameImg || '' }
          : { actualPersonaName: '一位用户', playerAvatarImg: '', frameImg: '' };
      }
    }

    const [userAvatarBase64, userAvatarFrameBase64] = await Promise.all([
      imageUrlToBase64(userInfo.playerAvatarImg),
      imageUrlToBase64(userInfo.frameImg)
    ]);

    const firstGame = newGamesDetails[0];
    const backgroundUrlToFetch = firstGame?.assets?.raw_page_background
      ? `https://cdn.akamai.steamstatic.com/steam/apps/${firstGame.appid}/${firstGame.assets.raw_page_background}`
      : '';
    const backgroundBase64 = await imageUrlToBase64(backgroundUrlToFetch);

    const processedGames = await Promise.all(newGamesDetails.map(async game => {
      const assets = game.assets || {};
      const basic_info = game.basic_info || {};
      const screenshots = game.screenshots?.all_ages || [];

      const [headerBase64, screenshotsBase64] = await Promise.all([
        imageUrlToBase64(assets.header ? `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/${assets.header}` : ''),
        Promise.all(screenshots.slice(0, 3).map(ss => imageUrlToBase64(ss.path_thumbnail)))
      ]);

      return {
        name: game.name || '未知游戏',
        header_image: headerBase64,
        price_overview: game.best_purchase_option || game.price_overview || null,
        developers: (game.developers || []).map(d => typeof d === 'object' ? d.name : d),
        publishers: (game.publishers || []).map(p => typeof p === 'object' ? p.name : p),
        short_description: basic_info.short_description || game.short_description || '',
        screenshots: screenshotsBase64.map(b64 => ({ path_thumbnail: b64 })),
        supported_languages: Array.isArray(basic_info.supported_languages) ? basic_info.supported_languages.map(l => l.name).join(', ') : (basic_info.supported_languages || 'N/A'),
        platforms: game.platforms || {},
        genres: basic_info.genres || [],
        metacritic: game.ratings?.metacritic || null,
        release_date: game.release_date || {},
        background_raw: game.assets?.raw_page_background || '' // 确保此字段存在
      };
    }));

    const templateData = {
      userName: userInfo.actualPersonaName || '未知用户',
      userAvatarUrl: userAvatarBase64,
      userAvatarFrameUrl: userAvatarFrameBase64,
      newGames: processedGames,
      backgroundUrl: backgroundBase64,
    };

    const htmlContent = TemplateManager.render('inventory', templateData);
    return await takeScreenshot(htmlContent, { width: 520 }, true);
  } catch (error) {
    logger.error(`[generateInventoryUpdateImage] 为 ${steamId} 生成库存通知图失败:`, error);
    throw error;
  }
}