// lib/common/generateSteamUI.js
import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import { logger } from 'node-karin';
import { debuglog } from '../debuglog.js';
import { Config, dirPath } from '../config.js';
import { getGameLogoAsBase64 } from './getGameLogo.js';
import { readSteamStatusCache } from '../db/databaseOps.js';
import { getCachedImageAsBase64 } from './getCachedImage.js';
import { fetchPlayerProfileAPI } from '../main/fetchSteamStatus.js';
import { getRandomBackgroundAsBase64, getLocalImageAsBase64 } from './screenshot.js';


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
      if (platforms.windows) icons += '<span class="platform-icon">🪟</span>';
      if (platforms.mac) icons += '<span class="platform-icon">🍎</span>';
      if (platforms.linux) icons += '<span class="platform-icon">🐧</span>';
      return new Handlebars.SafeString(icons);
    });

    Handlebars.registerHelper('cleanLanguages', (langString) => {
      if (typeof langString !== 'string' || !langString) return '无语言信息';
      const cleaned = langString.replace(/<strong>\*<\/strong>/g, '*').replace(/<br>/g, ', ');
      const highlighted = cleaned.replace(/简体中文(\*?)/g, '<span class="lang-highlight">简体中文$1</span>')
        .replace(/繁体中文(\*?)/g, '<span class="lang-highlight">繁体中文$1</span>');
      return new Handlebars.SafeString(highlighted);
    });

    Handlebars.registerHelper('contentDescriptorName', (id) => {
      const descriptors = {
        1: "成人内容",
        2: "暴力内容",
        3: "血腥内容",
        4: "性内容",
        5: "频繁脏话"
      };
      return descriptors[id] || "内容警告";
    });

    Handlebars.registerHelper('lt', (a, b) => a < b);
  },
  render(name, data) {
    if (!this.templates[name]) {
      throw new Error(`模板 ${name} 未找到或编译失败。`);
    }
    return this.templates[name](data);
  }
};

TemplateManager.initialize();

async function takeScreenshot(htmlContent, viewportOptions, fullPage = false) {
  const browser = await BrowserManager.getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const initialViewport = {
      width: 800,
      height: 600,
      ...viewportOptions
    };
    await page.setViewport(initialViewport);

    await page.evaluateHandle('document.fonts.ready');

    const finalHeight = await page.evaluate(() => document.body.scrollHeight);

    if (finalHeight > 0) {
      await page.setViewport({ ...initialViewport, height: finalHeight });
    }

    await new Promise(r => setTimeout(r, 500));

    const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false });
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
    const processFriendList = async (friends) => {
      for (const friend of friends) {
        const avatarCacheKey = friend.avatarhash || friend.playerAvatarImg;
        friend.playerAvatarImg = await getCachedImageAsBase64(friend.playerAvatarImg, avatarCacheKey);
        if (friend.frameImg) {
          friend.frameImg = await getCachedImageAsBase64(friend.frameImg, friend.frameImg);
        }
      }
      return friends;
    };

    const [backgroundDataUri, logoDataUri] = await Promise.all([
      getRandomBackgroundAsBase64(),
      getLocalImageAsBase64('img/250px-Steam_icon_logo.svg.png')
    ]);

    const inGameFriends = await processFriendList(steamStatuses.filter(status => status.profileStatusClass === 'in-game').sort((a, b) => a.profileInGameName?.localeCompare(b.profileInGameName || '') || 0));
    const onlineFriends = await processFriendList(steamStatuses.filter(status => status.profileStatusClass === 'online').sort((a, b) => a.actualPersonaName.localeCompare(b.actualPersonaName)));
    const offlineFriends = await processFriendList(steamStatuses.filter(status => status.profileStatusClass === 'offline').slice(0, 15)); // 限制离线好友数量

    const htmlContent = TemplateManager.render('status', {
      inGameFriends,
      onlineFriends,
      offlineFriends,
      backgroundDataUri,
      logoDataUri
    });

    return await takeScreenshot(htmlContent, { width: 800, height: 600 });
  } catch (error) {
    logger.error(`[generateSteamUI] 生成Steam好友状态图失败: ${error.message}`);
    throw error;
  }
}

/**
 * 生成一组独立的Steam通知图片 (并行处理)
 */
export async function generateSteamNotification(groupId, notifications, gameDetailsCache = {}) {
  const screenshotTasks = notifications.map(async (notification) => {
    try {
      const finalTemplateData = { ...notification };
      let apiUserInfo = null;

      if (Config.enableAvatarFrame) {
        try {
          apiUserInfo = await fetchPlayerProfileAPI(notification.steamid);
          if (apiUserInfo?.frameImg) {
            const frameUrl = apiUserInfo.frameImg;
            const frameCacheKey = apiUserInfo.communityitemid || frameUrl;
            finalTemplateData.frameImg = await getCachedImageAsBase64(frameUrl, frameCacheKey);
          }
        } catch (apiError) {
          logger.warn(`[generateSteamNotification] API获取头像框失败 (SteamID: ${notification.steamid})，错误: ${apiError.message}`);
        }
      }

      const avatarUrl = finalTemplateData.avatarfull || finalTemplateData.playerAvatarImg;
      const avatarCacheKey = (apiUserInfo && apiUserInfo.avatarhash) ? apiUserInfo.avatarhash : avatarUrl;
      finalTemplateData.playerAvatarImg = await getCachedImageAsBase64(avatarUrl, avatarCacheKey);

      if (!finalTemplateData.actualPersonaName && finalTemplateData.personaname) {
        finalTemplateData.actualPersonaName = finalTemplateData.personaname;
      }

      const gameDetails = gameDetailsCache[finalTemplateData.gameid] || null;

      const currentState = finalTemplateData.personastate;
      const isInGame = finalTemplateData.profileStatusClass === 'in-game';
      const statusMessages = { 0: '离线', 1: '在线', 2: '忙碌', 3: '离开', 4: '打盹', 5: '想交易', 6: '想玩游戏' };

      finalTemplateData.profileStatus = isInGame
        ? ((currentState > 1 && statusMessages[currentState]) ? statusMessages[currentState] : '')
        : (statusMessages[currentState] || '未知状态');

      finalTemplateData.profileInGameName = gameDetails?.name || finalTemplateData.gameextrainfo;

      finalTemplateData.gamelogo = await getGameLogoAsBase64(gameDetails, finalTemplateData.gameid);

      const htmlContent = TemplateManager.render('notification', { notifications: [finalTemplateData] });
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
    let apiUserInfo = null;
    try {
      apiUserInfo = await fetchPlayerProfileAPI(steamId);
      if (apiUserInfo?.actualPersonaName) {
        userInfo = apiUserInfo;
      }
    } catch (apiError) {
      logger.warn(`[generateInventoryUpdateImage] API获取 ${steamId} 用户信息失败: ${apiError.message}，将从缓存中回退。`);
    }

    if (!userInfo.actualPersonaName) {
      const cachedInfo = await readSteamStatusCache(steamId);
      userInfo = cachedInfo
        ? { actualPersonaName: cachedInfo.personaname, playerAvatarImg: cachedInfo.avatarfull, ...cachedInfo }
        : { actualPersonaName: '一位用户', playerAvatarImg: '' };
    }

    const avatarCacheKey = (apiUserInfo && apiUserInfo.avatarhash) ? apiUserInfo.avatarhash : userInfo.playerAvatarImg;
    const frameCacheKey = (apiUserInfo && apiUserInfo.communityitemid) ? apiUserInfo.communityitemid : userInfo.frameImg;

    const [userAvatarBase64, userAvatarFrameBase64] = await Promise.all([
      getCachedImageAsBase64(userInfo.playerAvatarImg, avatarCacheKey),
      Config.enableAvatarFrame ? getCachedImageAsBase64(userInfo.frameImg, frameCacheKey) : Promise.resolve('')
    ]);

    debuglog('[generateInventoryUpdateImage] 接收到的游戏详情数据:', newGamesDetails);

    const processedGames = [];
    for (const game of newGamesDetails) {
      if (!game) continue;

      const appId = game.id || game.steam_appid;
      debuglog(`[generateInventoryUpdateImage] 正在处理 AppID: ${appId}`, game);

      const headerBase64 = await getGameLogoAsBase64(game, appId);
      let backgroundUrl = game.background_raw || '';
      if (game.assets?.page_background_path) {
        backgroundUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/${game.assets.page_background_path}`;
      }

      const screenshots = Array.isArray(game.screenshots) ? game.screenshots : [];

      const [screenshotsBase64, backgroundBase64] = await Promise.all([
        getCachedImageAsBase64([headerUrl, `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/header.jpg`], `header_${appId}_${t}`),
        Promise.all(screenshots.slice(0, 4).map(ss => getCachedImageAsBase64(ss.path_thumbnail, `${appId}-ss-${path.basename(ss.path_thumbnail)}`))),
        getCachedImageAsBase64(backgroundUrl, `${appId}-bg-${t}`)
      ]);

      let adaptedPriceOverview = null;
      if (game.best_purchase_option) {
        adaptedPriceOverview = {
          final_formatted: game.best_purchase_option.formatted_final_price,
          initial_formatted: game.best_purchase_option.formatted_original_price,
          discount_percent: game.best_purchase_option.discount_pct
        };
      } else if (game.price_overview) {
        adaptedPriceOverview = {
          final_formatted: game.price_overview.final_formatted,
          initial_formatted: game.price_overview.initial_formatted,
          discount_percent: game.price_overview.discount_percent
        };
      }

      processedGames.push({
        ...game,
        name: game.name || '未知游戏',
        header_image: headerBase64,
        backgroundUrl: backgroundBase64,
        price_overview: adaptedPriceOverview,
        screenshots: screenshotsBase64.map(b64 => ({ path_thumbnail: b64 })),
        developers: game.developers || [],
        publishers: game.publishers || [],
        short_description: game.short_description || '',
        supported_languages: game.supported_languages || '',
        is_free: game.is_free || false,
        dlc: game.dlc || [],
        recommendations: game.recommendations || null,
        achievements: game.achievements || null,
        content_descriptors: game.content_descriptors || null,
        appid: appId
      });
    }

    const templateData = {
      userName: userInfo.actualPersonaName || '未知用户',
      userAvatarUrl: userAvatarBase64,
      userAvatarFrameUrl: userAvatarFrameBase64,
      newGames: processedGames,
      backgroundUrl: processedGames.length > 0 ? processedGames[0].backgroundUrl : ''
    };

    const htmlContent = TemplateManager.render('inventory', templateData);
    return await takeScreenshot(htmlContent, { width: 520 }, true);
  } catch (error) {
    logger.error(`[generateInventoryUpdateImage] 为 ${steamId} 生成库存通知图失败:`, error);
    throw error;
  }
}