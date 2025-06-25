// lib/common/generateSteamUI.js
import puppeteer from 'puppeteer';
import { logger } from 'node-karin';
import path from 'path';
import fs from 'fs';
import { Config, dirPath } from '../config.js';
import Handlebars from 'handlebars';
import { readSteamStatusCache } from '../main/databaseOps.js';
import { fetchSteamStatus } from '../main/fetchSteamStatus.js';

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
        '--disable-web-security', // 统一添加，有助于处理跨域资源
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
    // 模板路径
    const templatePaths = {
      status: path.resolve(`${dirPath}/resources/template/steam_statuses.html`),
      notification: path.resolve(`${dirPath}/resources/template/steam_notification_template.html`),
      inventory: path.resolve(`${dirPath}/resources/template/steam_inventory_notification_template.html`),
    };

    // 读取并编译所有模板
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
    // 通用助手
    Handlebars.registerHelper('eq', (a, b) => a === b);
    Handlebars.registerHelper('or', (...args) => args.slice(0, -1).some(Boolean));
    Handlebars.registerHelper('formatDate', () => new Date().toLocaleString('zh-CN', { hour12: false }));

    // 价格格式化
    Handlebars.registerHelper('formatPrice', (priceOverview) => {
      if (!priceOverview) return '价格未知';
      if (priceOverview.is_free) return '免费游玩';
      if (priceOverview.final_formatted) return priceOverview.final_formatted;
      if (priceOverview.currency === 'CNY' && priceOverview.final) {
        return `¥ ${(priceOverview.final / 100).toFixed(2)}`;
      }
      return '价格未知';
    });

    // 平台图标
    Handlebars.registerHelper('platformIcons', (platforms) => {
      if (!platforms) return '';
      let icons = '';
      if (platforms.windows) icons += '<span class="platform-icon">⊞</span>';
      if (platforms.mac) icons += '<span class="platform-icon"></span>';
      if (platforms.linux) icons += '<span class="platform-icon">🐧</span>';
      return new Handlebars.SafeString(icons);
    });

    // 清理和高亮语言字符串
    Handlebars.registerHelper('cleanLanguages', (langString) => {
      if (!langString) return '无语言信息';
      const cleaned = langString.replace(/<strong>\*<\/strong>/g, '*').replace(/<br>/g, ', ');
      const highlighted = cleaned.replace(/简体中文(\*?)/g, '<span class="lang-highlight">简体中文$1</span>');
      return new Handlebars.SafeString(highlighted);
    });
  },
  /**
   * 渲染指定的模板
   * @param {string} name - 模板名称 (e.g., 'status', 'notification')
   * @param {object} data - 模板所需数据
   * @returns {string} - 渲染后的 HTML 字符串
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
 * 通用的截图函数，封装了 Puppeteer 的核心逻辑
 * @param {string} htmlContent - 要渲染的 HTML 内容
 * @param {object} viewport - 视口设置，如 { width, height }
 * @param {boolean} fullPage - 是否截取完整页面
 * @returns {Promise<string>} - Base64 编码的图片字符串
 */
async function takeScreenshot(htmlContent, viewport, fullPage = false) {
  const browser = await BrowserManager.getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport(viewport);
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' }); // 等待网络空闲，更可靠

    // 如果未指定高度且需要截取全页，则动态计算高度
    if (fullPage && !viewport.height) {
      const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
      await page.setViewport({ ...viewport, height: bodyHeight || 500 });
    }

    // 等待字体和图片加载，给予一个短暂的最终渲染时间
    await page.evaluateHandle('document.fonts.ready');
    await new Promise(r => setTimeout(r, 300)); // 短暂延时作为保险

    const screenshotBuffer = await page.screenshot({ type: 'png', fullPage });
    return screenshotBuffer.toString('base64');
  } finally {
    await page.close(); // 确保页面总是被关闭
  }
}

/**
 * 生成Steam好友状态图
 * @param {Array} steamStatuses - 包含Steam好友状态的数组
 * @returns {Promise<string>} - Base64编码的图片字符串
 */
export async function generateSteamUI(steamStatuses) {
  try {
    const inGameFriends = steamStatuses.filter(status => status.profileStatusClass === 'in-game')
      .sort((a, b) => a.profileInGameName?.localeCompare(b.profileInGameName || '') || 0);

    const onlineFriends = steamStatuses.filter(status => status.profileStatusClass === 'online')
      .sort((a, b) => a.actualPersonaName.localeCompare(b.actualPersonaName));

    const offlineFriends = steamStatuses.filter(status => status.profileStatusClass === 'offline');

    const MAX_OFFLINE_FRIENDS = 10;
    const limitedOfflineFriends = offlineFriends.slice(0, MAX_OFFLINE_FRIENDS);

    const htmlContent = TemplateManager.render('status', {
      inGameFriends,
      onlineFriends,
      offlineFriends: limitedOfflineFriends,
      totalOfflineFriends: offlineFriends.length,
      hasMoreOfflineFriends: offlineFriends.length > MAX_OFFLINE_FRIENDS,
    });

    // 初始宽度固定，高度动态计算
    return await takeScreenshot(htmlContent, { width: 610 }, true);
  } catch (error) {
    logger.error(`[generateSteamUI] 生成Steam好友状态图失败: ${error.message}`);
    throw error;
  }
}

/**
 * ✨ 生成一组独立的Steam通知图片 (并行处理)
 * @param {string} groupId - 群聊ID
 * @param {Array} notifications - 包含Steam状态的通知数组
 * @returns {Promise<string[]>} - 包含多张图片Base64编码的【数组】
 */
export async function generateSteamNotification(groupId, notifications) {
  const screenshotTasks = notifications.map(async (notification) => {
    try {
      const cachedStatus = await readSteamStatusCache(notification.steamId) || {};
      const apiStatus = cachedStatus?.personaState; // 使用数字状态码
      let webStatus = notification.profileStatusClass;
      let finalStatusClass = webStatus;

      // 逻辑简化：优先使用web端游戏状态
      if (apiStatus === 1 && (webStatus === 'in-game' || webStatus === 'In non-Steam game')) {
        finalStatusClass = webStatus;
      }

      const statusMessages = { 0: '离线', 1: '在线', 2: '忙碌', 3: '离开', 4: '打盹', 5: '想交易', 6: '想玩游戏' };
      const profileStatus = typeof apiStatus === 'number' ? statusMessages[apiStatus] : notification.profileStatus;

      const singleNotificationData = {
        ...notification,
        profileStatusClass: finalStatusClass,
        profileStatus: profileStatus,
        gamelogo: cachedStatus?.gamelogo || 'default_image.jpg'
      };

      const htmlContent = TemplateManager.render('notification', { notifications: [singleNotificationData] });
      return await takeScreenshot(htmlContent, { width: 450, height: 208 });
    } catch (err) {
      logger.error(`[generateSteamNotification] 生成单条通知图失败 (SteamID: ${notification.steamId}):`, err);
      return null;
    }
  });

  const results = await Promise.all(screenshotTasks);
  return results.filter(Boolean);
}

/**
 * 生成包含游戏详细信息的库存更新通知图片
 * @param {string} steamId - 用户的SteamID
 * @param {object[]} newGamesDetails - 新增游戏的详细信息对象数组
 * @returns {Promise<string|null>} - Base64编码的图片字符串或null
 */
export async function generateInventoryUpdateImage(steamId, newGamesDetails) {
  try {
    const status = await fetchSteamStatus(steamId);
    if (!status) throw new Error('无法获取用户信息');

    const templateData = {
      userName: status.actualPersonaName || '未知用户',
      userAvatarUrl: status.playerAvatarImg || '',
      newGames: newGamesDetails,
      backgroundUrl: newGamesDetails[0]?.background_raw || '',
    };

    const htmlContent = TemplateManager.render('inventory', templateData);

    // 初始宽度固定，高度动态计算
    return await takeScreenshot(htmlContent, { width: 520 }, true);
  } catch (error) {
    logger.error(`[generateInventoryUpdateImage] 为 ${steamId} 生成库存通知图失败:`, error);
    return null;
  }
}