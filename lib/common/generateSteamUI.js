// lib/common/generateSteamUI.js
import puppeteer from 'puppeteer';
import { logger } from 'node-karin';
import path from 'path';
import fs from 'fs';
import { Config, dirPath } from '../config.js';
import Handlebars from 'handlebars';
import { readSteamStatusCache } from '../main/databaseOps.js';
import { fetchSteamStatus } from '../main/fetchSteamStatus.js';

// 注册常见模板助手
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('or', (...args) => args.slice(0, -1).some(Boolean));

// 注册日期格式化助手
Handlebars.registerHelper('formatDate', function () {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
});

const htmlTemplatePath = path.resolve(`${dirPath}/resources/template/steam_statuses.html`);
const notificationTemplatePath = path.resolve(`${dirPath}/resources/template/steam_notification_template.html`);

/**
 * 生成Steam好友状态图
 * @param {Array} steamStatuses - 包含Steam好友状态的数组
 * @returns {Promise<string>} - Base64编码的图片字符串
 */
export async function generateSteamUI(steamStatuses) {
  try {
    const templateSource = fs.readFileSync(htmlTemplatePath, 'utf8');
    const template = Handlebars.compile(templateSource);

    // 按状态分类朋友
    const inGameFriends = steamStatuses.filter(status => status.profileStatusClass === 'in-game');
    const onlineFriends = steamStatuses.filter(status => status.profileStatusClass === 'online');
    const offlineFriends = steamStatuses.filter(status => status.profileStatusClass === 'offline');

    // 按照游戏名称排序游戏中的朋友
    inGameFriends.sort((a, b) => {
      if (a.profileInGameName && b.profileInGameName) {
        return a.profileInGameName.localeCompare(b.profileInGameName);
      }
      return 0;
    });

    // 按名称排序其他朋友
    onlineFriends.sort((a, b) => a.actualPersonaName.localeCompare(b.actualPersonaName));

    // 默认只显示部分离线朋友以避免图片过长
    const MAX_OFFLINE_FRIENDS = 10;
    const limitedOfflineFriends = offlineFriends.slice(0, MAX_OFFLINE_FRIENDS);
    const hasMoreOfflineFriends = offlineFriends.length > MAX_OFFLINE_FRIENDS;

    const htmlContent = template({
      inGameFriends,
      onlineFriends,
      offlineFriends: limitedOfflineFriends,
      totalOfflineFriends: offlineFriends.length,
      hasMoreOfflineFriends
    });

    const browser = await puppeteer.launch({
      args: [`--proxy-server=${Config.proxy || ''}`, '--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle2' });

    // 计算实际内容高度
    const contentHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewport({ width: 610, height: contentHeight });

    // 给图片加载更多时间
    await new Promise(r => setTimeout(r, 1500));

    const screenshotBuffer = await page.screenshot({
      type: 'png',
      fullPage: true
    });

    const base64Image = screenshotBuffer.toString('base64');
    await browser.close();

    return base64Image;
  } catch (error) {
    logger.error(`[generateSteamUI] 生成Steam好友状态图失败: ${error.message}`);
    throw error;
  }
}

/**
 * ✨ 生成一组独立的Steam通知图片
 * @param {string} groupId - 群聊ID
 * @param {Array} notifications - 包含Steam状态的通知数组
 * @returns {Promise<string[]>} - 包含多张图片Base64编码的【数组】
 */
export async function generateSteamNotification(groupId, notifications) {
  const templateSource = fs.readFileSync(notificationTemplatePath, 'utf8');
  const template = Handlebars.compile(templateSource);

  const browser = await puppeteer.launch({
    args: [`--proxy-server=${Config.proxy || ''}`, '--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  const imageB64s = []; // 用于存储所有图片的Base64

  for (const notification of notifications) {
    try {
      const cachedStatus = await readSteamStatusCache(notification.steamId) || {};
      const apiStatus = cachedStatus?.profileStatusClass;
      let webStatus = notification.profileStatusClass;
      let finalStatus = apiStatus !== undefined ? apiStatus : webStatus;
      if (apiStatus === 1 && (webStatus === 'in-game' || webStatus === 'In non-Steam game')) {
        finalStatus = webStatus;
      }
      const statusMessages = { 0: '离线', 1: '在线', 2: '忙碌', 3: '离开', 4: '打盹', 5: '寻找交易', 6: '寻找游戏' };
      let message = typeof finalStatus === 'number' ? statusMessages[finalStatus] || '未知状态' : notification.profileStatus;
      const singleNotificationData = {
        ...notification,
        profileStatusClass: finalStatus,
        profileStatus: message,
        gamelogo: cachedStatus?.gamelogo || 'default_image.jpg'
      };

      // ✅ 每次都只生成包含【一条】通知的HTML
      const htmlContent = template({ notifications: [singleNotificationData] });

      await page.setViewport({ width: 450, height: 208 }); // 对于单条通知，固定高度是合适的
      await page.setContent(htmlContent, { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 500)); // 缩短单张图的等待时间

      const screenshotBuffer = await page.screenshot();
      imageB64s.push(screenshotBuffer.toString('base64'));

    } catch (err) {
      logger.error(`[generateSteamNotification] 生成单条通知图失败 (SteamID: ${notification.steamId}):`, err);
    }
  }

  await browser.close();
  return imageB64s;
}
/**
 * 生成库存更新通知图片
 * @param {string} steamId - 发生库存更新的用户的SteamID
 * @param {Array<{appId: string, name: string}>} newGames - 新增游戏的对象数组
 * @returns {Promise<string>} - Base64编码的图片字符串
 */
export async function generateInventoryUpdateImage(steamId, newGames) {
  const inventoryTemplatePath = path.resolve(`${dirPath}/resources/template/steam_inventory_notification_template.html`);
  const templateSource = fs.readFileSync(inventoryTemplatePath, 'utf8');
  const template = Handlebars.compile(templateSource);

  try {
    // 获取Steam用户信息
    const status = await fetchSteamStatus(steamId);
    if (!status) throw new Error('无法获取用户信息');

    const primaryGameAppId = newGames[0].appId;

    let backgroundUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${primaryGameAppId}/library_hero.jpg`;

    // 备用背景图URL选项
    const fallbackBackgrounds = [
      `https://cdn.akamai.steamstatic.com/steam/apps/${primaryGameAppId}/header.jpg`,
      `https://cdn.akamai.steamstatic.com/steam/apps/${primaryGameAppId}/page_bg_generated.jpg`,
      `https://cdn.akamai.steamstatic.com/steam/apps/${primaryGameAppId}/page.bg.jpg`
    ];

    const templateData = {
      userName: status.actualPersonaName || '未知用户',
      userAvatarUrl: status.playerAvatarImg || '',
      newGames: newGames,
      gameCount: newGames.length,
      backgroundUrl: backgroundUrl,
      timestamp: new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
    };

    const htmlContent = template(templateData);

    const browser = await puppeteer.launch({
      args: [`--proxy-server=${Config.proxy || ''}`, '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 450, height: 600 } // 设置固定初始高度
    });

    const page = await browser.newPage();

    // 使用错误处理来检测背景图加载失败的情况
    await page.setRequestInterception(true);

    page.on('request', request => {
      request.continue();
    });

    page.on('requestfailed', async (request) => {
      const url = request.url();
      // 如果主背景图加载失败，尝试加载备用图片
      if (url === backgroundUrl) {
        logger.warn(`背景图加载失败: ${url}, 尝试备用图片`);
        // 尝试更新背景图为备用图片
        for (const fallbackUrl of fallbackBackgrounds) {
          await page.evaluate((url) => {
            const bgImg = document.querySelector('.background-image');
            if (bgImg) bgImg.src = url;
          }, fallbackUrl);

          // 等待一下看是否加载成功
          await new Promise(r => setTimeout(r, 500));
          const isLoaded = await page.evaluate(() => {
            const bgImg = document.querySelector('.background-image');
            return bgImg && bgImg.complete && bgImg.naturalWidth !== 0;
          });

          if (isLoaded) break;
        }
      }
    });

    await page.setContent(htmlContent, { waitUntil: 'networkidle2' });

    // 给图片加载更多时间
    await new Promise(r => setTimeout(r, 1500));

    // 获取实际内容高度并调整视口
    const contentHeight = await page.evaluate(() => {
      return Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight
      );
    });

    await page.setViewport({ width: 450, height: contentHeight });

    // 再次等待以确保渲染完成
    await new Promise(r => setTimeout(r, 500));

    const screenshotBuffer = await page.screenshot({
      type: 'png',
      fullPage: true
    });

    await browser.close();

    return screenshotBuffer.toString('base64');
  } catch (error) {
    logger.error(`[generateInventoryUpdateImage] 为 ${steamId} 生成库存通知图失败:`, error);
    return null;
  }
}