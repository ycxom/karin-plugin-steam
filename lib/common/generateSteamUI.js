// lib/common/generateSteamUI.js
import puppeteer from 'puppeteer';
import { logger } from 'node-karin';
import path from 'path';
import fs from 'fs';
import { Config, dirPath } from '../config.js';
import Handlebars from 'handlebars';
import { readSteamStatusCache } from '../db/databaseOps.js';
import { fetchSteamStatus, fetchGameDetails } from '../main/fetchSteamStatus.js';

/**
 * 浏览器管理器
 * @summary 管理一个单一的、可复用的 Puppeteer 浏览器实例，避免重复启动和关闭。
 */
const BrowserManager = {
  browser: null,
  /**
   * 启动并返回一个浏览器实例。如果已存在则直接返回。
   * @returns {Promise<import('puppeteer').Browser>}
   */
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
    // 优雅地关闭浏览器
    process.on('beforeExit', async () => {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    });
    return this.browser;
  },
  /**
   * 关闭浏览器实例
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
};

/**
 * 模板管理器
 * @summary 预编译 Handlebars 模板并注册所有助手，提高效率。
 */
const TemplateManager = {
  templates: {},
  /**
   * 初始化，加载并编译所有模板，注册助手。
   */
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
  /**
   * 注册所有 Handlebars 助手
   */
  registerHelpers() {
    Handlebars.registerHelper('eq', (a, b) => a === b);
    Handlebars.registerHelper('or', (...args) => args.slice(0, -1).some(Boolean));
    Handlebars.registerHelper('formatDate', () => new Date().toLocaleString('zh-CN', { hour12: false }));

    Handlebars.registerHelper('formatPrice', (priceOverview) => {
      if (!priceOverview) return '价格未知';
      if (priceOverview.is_free) return '免费游玩';
      if (priceOverview.final_formatted) return priceOverview.final_formatted;
      if (priceOverview.currency === 'CNY' && priceOverview.final) {
        return `¥ ${(priceOverview.final / 100).toFixed(2)}`;
      }
      return '价格未知';
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
      if (!langString) return '无语言信息';
      const cleaned = langString.replace(/<strong>\*<\/strong>/g, '*').replace(/<br>/g, ', ');
      const highlighted = cleaned.replace(/简体中文(\*?)/g, '<span class="lang-highlight">简体中文$1</span>');
      return new Handlebars.SafeString(highlighted);
    });
  },
  /**
   * 渲染指定的模板
   */
  render(name, data) {
    if (!this.templates[name]) {
      throw new Error(`模板 ${name} 未找到或编译失败。`);
    }
    return this.templates[name](data);
  }
};

TemplateManager.initialize();

/**
 * 通用的截图函数
 */
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


/**
 * 生成Steam好友状态图
 */
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

/**
 * ✨【已修复】生成一组独立的Steam通知图片 (并行处理)
 */
export async function generateSteamNotification(groupId, notifications, gameDetailsCache = new Map()) {
  const screenshotTasks = notifications.map(async (notification) => {
    try {
      const finalTemplateData = { ...notification };

      if (Config.enableAvatarFrame) {
        try {
          const webStatus = await fetchSteamStatus(notification.steamid);
          if (webStatus && webStatus.frameImg) {
            finalTemplateData.frameImg = webStatus.frameImg;
          }
        } catch (webFetchError) {
          logger.warn(`[generateSteamNotification] 为补充头像框信息抓取网页失败 (SteamID: ${notification.steamid})，将无头像框继续渲染: ${webFetchError.message}`);
        }
      }
      // --- 修复结束 ---

      // --- 数据统一步骤（不影响头像框） ---
      if (!finalTemplateData.playerAvatarImg && finalTemplateData.avatarfull) {
        finalTemplateData.playerAvatarImg = finalTemplateData.avatarfull;
      }
      if (!finalTemplateData.actualPersonaName && finalTemplateData.personaname) {
        finalTemplateData.actualPersonaName = finalTemplateData.personaname;
      }
      if (!finalTemplateData.profileInGameName && finalTemplateData.gameextrainfo) {
        finalTemplateData.profileInGameName = finalTemplateData.gameextrainfo;
      }

      // --- 获取游戏详情 ---
      let gameDetails = null;
      if (finalTemplateData.gameid) {
        gameDetails = gameDetailsCache.has(finalTemplateData.gameid)
          ? gameDetailsCache.get(finalTemplateData.gameid)
          : await fetchGameDetails(finalTemplateData.gameid);
      }

      // --- 状态文本判断逻辑 ---
      const currentState = finalTemplateData.personastate;
      const isInGame = finalTemplateData.profileStatusClass === 'in-game';
      const statusMessages = { 0: '离线', 1: '在线', 2: '忙碌', 3: '离开', 4: '打盹', 5: '想交易', 6: '想玩游戏' };

      finalTemplateData.profileStatus = isInGame
        ? ((currentState > 1 && statusMessages[currentState]) ? statusMessages[currentState] : '')
        : (statusMessages[currentState] || '未知状态');

      finalTemplateData.profileInGameName = gameDetails?.name || finalTemplateData.profileInGameName;
      finalTemplateData.gamelogo = gameDetails?.header_image || finalTemplateData.gamelogo || '';

      const htmlContent = TemplateManager.render('notification', { notifications: [finalTemplateData] });
      return await takeScreenshot(htmlContent, { width: 450, height: 208 });

    } catch (err) {
      logger.error(`[generateSteamNotification] 生成单条通知图失败 (SteamID: ${notification.steamId}):`, err);
      return null;
    }
  });

  return (await Promise.all(screenshotTasks)).filter(Boolean);
}

/**
 * 【已修复】生成包含游戏详细信息的库存更新通知图片
 */
export async function generateInventoryUpdateImage(steamId, newGamesDetails) {
  try {
    let userInfo = {};
    if (Config.enableAvatarFrame) {
      try {
        userInfo = await fetchSteamStatus(steamId);
      } catch (fetchError) {
        logger.warn(`[generateInventoryUpdateImage] 实时获取 ${steamId} 网页信息失败: ${fetchError.message}，将从缓存中回退。`);
      }
    }

    // 如果实时获取失败，则从缓存中读取
    if (!userInfo) {
      const cachedInfo = await readSteamStatusCache(steamId);
      if (cachedInfo) {
        userInfo = {
          actualPersonaName: cachedInfo.personaname,
          playerAvatarImg: cachedInfo.avatarfull,
          // 缓存中没有头像框信息
          frameImg: ''
        };
      } else {
        // 如果连缓存都没有，提供一个最终的保底值
        userInfo = { actualPersonaName: '一位用户', playerAvatarImg: '', frameImg: '' };
      }
    }

    // 【核心修复】将头像框信息 (frameImg) 传递给模板
    const templateData = {
      userName: userInfo.actualPersonaName || '未知用户',
      userAvatarUrl: userInfo.playerAvatarImg || '',
      userAvatarFrameUrl: userInfo.frameImg || '', // 新增此行
      newGames: newGamesDetails,
      backgroundUrl: newGamesDetails[0]?.background_raw || '',
    };

    const htmlContent = TemplateManager.render('inventory', templateData);
    return await takeScreenshot(htmlContent, { width: 520 }, true);
  } catch (error) {
    logger.error(`[generateInventoryUpdateImage] 为 ${steamId} 生成库存通知图失败:`, error);
    return null;
  }
}
