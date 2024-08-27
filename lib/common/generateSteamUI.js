import puppeteer from 'puppeteer';
import { logger } from 'node-karin';
import path from 'path';
import fs from 'fs';
import Config from '../config.js';
import Handlebars from 'handlebars';
import { readStatus } from '../main/readwritefile.js';

const proxy = Config.Config.proxy;

// 注册eq helper
Handlebars.registerHelper('eq', function(a, b) {
  return a === b;
});

Handlebars.registerHelper('or', function(a, b) {
  return a || b;
});

Handlebars.registerHelper('or', function() {
  return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);
});

const htmlTemplatePath = path.resolve(`${Config.dirPath}/resources/template/steam_statuses.html`);
const notificationTemplatePath = path.resolve(`${Config.dirPath}/resources/template/steam_notification_template.html`);

//steam群聊渲染
async function generateSteamUI(steamStatuses) {
  const templateSource = fs.readFileSync(htmlTemplatePath, 'utf8');
  const template = Handlebars.compile(templateSource);

  // 分类朋友的状态
  const inGameFriends = steamStatuses.filter(status => status.profileStatusClass === 'in-game');
  const onlineFriends = steamStatuses.filter(status => status.profileStatusClass === 'online');
  const offlineFriends = steamStatuses.filter(status => status.profileStatusClass === 'offline');

  logger.debug('渲染前的数据:', {
    inGameFriends,
    onlineFriends,
    offlineFriends
  });

  // 渲染 HTML 内容
  const htmlContent = template({ 
    inGameFriends: inGameFriends.map(friend => ({
      ...friend,
      actualPersonaName: friend.actualPersonaName || '未知用户',
      playerAvatarImg: friend.playerAvatarImg || '默认头像链接',
      profileStatus: friend.profileStatus || '离线'
    })),
    onlineFriends: onlineFriends.map(friend => ({
      ...friend,
      actualPersonaName: friend.actualPersonaName || '未知用户',
      playerAvatarImg: friend.playerAvatarImg || '默认头像链接',
      profileStatus: friend.profileStatus || '在线'
    })),
    offlineFriends: offlineFriends.map(friend => ({
      ...friend,
      actualPersonaName: friend.actualPersonaName || '未知用户',
      playerAvatarImg: friend.playerAvatarImg || '默认头像链接',
      profileStatus: friend.profileStatus || '离线'
    }))
  });

  logger.debug('生成的 HTML 内容:', htmlContent);

  const browser = await puppeteer.launch({
    args: [
      `--proxy-server=${proxy}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  const page = await browser.newPage();

  // 加载生成的 HTML 内容
  await page.setContent(htmlContent, { waitUntil: 'networkidle2' });

  // 设置视口大小
  await page.setViewport({
    width: 610,
    height: 0
  });

  // 获取页面内容的实际高度并设置视口高度
  const contentHeight = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewport({
    width: 610,
    height: contentHeight
  });

  // 等待 1 秒以确保页面完全加载
  await page.waitForTimeout(1000);

  // 截取屏幕并转换为 base64 编码
  const screenshotBuffer = await page.screenshot();
  const base64Image = screenshotBuffer.toString('base64');

  await browser.close();
  return base64Image;
}

//渲染steam通知
async function generateSteamNotification(groupId, notifications) {
  const templateSource = fs.readFileSync(notificationTemplatePath, 'utf8');
  const template = Handlebars.compile(templateSource);

  const statusConfig = readStatus();
  const userConfig = statusConfig[groupId] || {};

  logger.debug(`获取到userconfig: ${JSON.stringify(userConfig)}`);

  const mergedNotifications = notifications.map(notification => {
    const steamId = notification.steamId;
    const apiStatus = userConfig[steamId]?.profileStatusClass;
    const webStatus = notification.profileStatusClass;
    
    logger.debug(`apiStatus: ${apiStatus}`)
    logger.debug(`webStatus: ${webStatus}`)
    
    // 判断优先级
    let finalStatus = apiStatus;  // 默认使用 API 状态

    if (apiStatus === 1) {
      logger.debug(`进入0/1判断`);
      if (webStatus === 'in-game' || webStatus === 'In non-Steam game') {
        finalStatus = webStatus;  // 当 API 返回 0 或 1 时，优先使用网页抓取状态
        logger.debug(`已覆盖API状态，使用网页状态: ${finalStatus}`);
      }
    }
  
    if (finalStatus !== apiStatus) {
      logger.debug(`API状态被覆盖为: ${finalStatus}`);
    }
  
    logger.debug(`finalStatus值：${finalStatus}`);
    // 删除之前的 profileStatusClass
    delete notification.profileStatusClass;

    let message = notification.profileStatus;

    switch (finalStatus) {
      case 0:  // API 返回的状态：离线
        message = `离线`;
      break;
      case 2:  // API 返回的状态：忙碌
        message = `忙碌`;
        break;
      case 3:  // API 返回的状态：离开
        message = `离开`;
        break;
      case 4:  // API 返回的状态：打盹
        message = `打盹`;
        break;
      case 5:  // API 返回的状态：寻找交易
        message = `寻找交易`;
        break;
      case 6:  // API 返回的状态：寻找游戏
        message = `寻找游戏`;
        break;
      default:
        logger.log(`未匹配到状态，保留原始 profileStatus`);
        break;
    }

    return {
      ...notification,
      profileStatusClass: finalStatus,  // 使用最终决定的状态
      profileStatus: message,
      gamelogo: userConfig[steamId]?.gamelogo || 'default_image.jpg',
    };
  });

  // 打印 mergedNotifications 对象内容
  logger.debug(`获取到的合并状态: ${JSON.stringify(mergedNotifications)}`);

  const htmlContent = template({ notifications: mergedNotifications });

  logger.debug('生成的 HTML 内容:', htmlContent);

  const browser = await puppeteer.launch({
    args: [
      `--proxy-server=${proxy}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  const page = await browser.newPage();

  await page.setViewport({ width: 450, height: 208 });
  
  await page.setContent(htmlContent, { waitUntil: 'networkidle2' });

  // 添加延迟 1 秒
  await page.waitForTimeout(1000);

 // 截取屏幕并转换为 base64 编码
 const screenshotBuffer = await page.screenshot();
 const base64Image = screenshotBuffer.toString('base64');

 await browser.close();
 return base64Image;
}

export { generateSteamUI, generateSteamNotification };
