// lib/common/generateSteamUI.js
import puppeteer from 'puppeteer';
import { logger } from 'node-karin';
import path from 'path';
import fs from 'fs';
import { Config, dirPath } from '../config.js';
import Handlebars from 'handlebars';
import { readSteamStatusCache } from '../main/databaseOps.js';

const proxy = Config.proxy;

// 注册常见模板助手
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('or', (...args) => args.slice(0, -1).some(Boolean));

const htmlTemplatePath = path.resolve(`${dirPath}/resources/template/steam_statuses.html`);
const notificationTemplatePath = path.resolve(`${dirPath}/resources/template/steam_notification_template.html`);

// 生成Steam群状态UI图
async function generateSteamUI(steamStatuses) {
  const templateSource = fs.readFileSync(htmlTemplatePath, 'utf8');
  const template = Handlebars.compile(templateSource);

  // 按状态分类朋友
  const inGameFriends = steamStatuses.filter(status => status.profileStatusClass === 'in-game');
  const onlineFriends = steamStatuses.filter(status => status.profileStatusClass === 'online');
  const offlineFriends = steamStatuses.filter(status => status.profileStatusClass === 'offline');

  const htmlContent = template({
    inGameFriends,
    onlineFriends,
    offlineFriends
  });

  const browser = await puppeteer.launch({
    args: [`--proxy-server=${proxy}`, '--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle2' });

  const contentHeight = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewport({ width: 610, height: contentHeight });
  await new Promise(r => setTimeout(r, 1000));

  const screenshotBuffer = await page.screenshot();
  const base64Image = screenshotBuffer.toString('base64');

  await browser.close();
  return base64Image;
}

// 生成Steam通知UI图 (数据库读取缓存替换原readStatus方法)
async function generateSteamNotification(groupId, notifications) {
  const templateSource = fs.readFileSync(notificationTemplatePath, 'utf8');
  const template = Handlebars.compile(templateSource);

  // 从数据库加载Steam状态缓存(原先从yaml读取)
  const userConfig = {};
  for (const notification of notifications) {
    const cachedStatus = await readSteamStatusCache(notification.steamId);
    userConfig[notification.steamId] = cachedStatus || {};
  }

  const mergedNotifications = notifications.map(notification => {
    const steamId = notification.steamId;
    const apiStatus = userConfig[steamId]?.profileStatusClass;
    let webStatus = notification.profileStatusClass;

    // 确认最终显示状态
    let finalStatus = apiStatus !== undefined ? apiStatus : webStatus;
    if (apiStatus === 1 && (webStatus === 'in-game' || webStatus === 'In non-Steam game')) {
      finalStatus = webStatus;
    }

    const statusMessages = { 0: '离线', 1: '在线', 2: '忙碌', 3: '离开', 4: '打盹', 5: '寻找交易', 6: '寻找游戏' };
    let message = typeof finalStatus === 'number' ? statusMessages[finalStatus] || '未知状态' : notification.profileStatus;

    return {
      ...notification,
      profileStatusClass: finalStatus,
      profileStatus: message,
      gamelogo: userConfig[steamId]?.gamelogo || 'default_image.jpg'
    };
  });

  const htmlContent = template({ notifications: mergedNotifications });

  const browser = await puppeteer.launch({
    args: [`--proxy-server=${proxy}`, '--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 450, height: 208 });
  await page.setContent(htmlContent, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  const screenshotBuffer = await page.screenshot();
  const base64Image = screenshotBuffer.toString('base64');

  await browser.close();
  return base64Image;
}

export { generateSteamUI, generateSteamNotification };