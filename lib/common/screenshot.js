import puppeteer from 'puppeteer';
import Config from '../config.js';
import path from 'path';
import fs from 'fs';
import { logger } from 'node-karin';
import { getSteamIDFromFriendCode, convertFriendCodeToSteamID64 } from '../main/FriendCode.js';

const proxy = Config.Config.proxy;

async function getSteamID(playerIdentifier) {
  // 如果输入的是数字 ID，则直接返回
  if (/^\d{10}$/.test(playerIdentifier)) {
    playerIdentifier = convertFriendCodeToSteamID64(playerIdentifier);
    console.log(playerIdentifier)
  } else if (!/^\d{17}$/.test(playerIdentifier)) {
    playerIdentifier = await getSteamIDFromFriendCode(playerIdentifier);
  }
  return playerIdentifier;
}

export async function screenshotSteamProfile(playerIdentifier) {
  const steamID = await getSteamID(playerIdentifier);
  const url = `https://steamcommunity.com/profiles/${steamID}`;

  const browser = await puppeteer.launch({
    args: [
      `--proxy-server=${proxy}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  const page = await browser.newPage();

  try {
    logger.debug(`正在导航到 URL: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    // 将视口设置为原始大小的两倍
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2
    });

    const avatarSelector = '.playerAvatarAutoSizeInner';
    const miniprofileSelector = '.miniprofile_container';

    // 检查是否存在错误提示
    if (await page.$('.error_ctn')) {
      const errorMessage = await page.$eval('.sectionText', el => el.textContent.trim());
      return { error: errorMessage };
    }

    logger.debug(`等待选择器: ${avatarSelector}`);
    await page.waitForSelector(avatarSelector);

    // 将鼠标移动到头像上以触发迷你个人资料加载
    const avatarElement = await page.$(avatarSelector);
    const avatarBoundingBox = await avatarElement.boundingBox();
    await page.mouse.move(
      avatarBoundingBox.x + avatarBoundingBox.width / 2,
      avatarBoundingBox.y + avatarBoundingBox.height / 2
    );
    // 等待1.5秒以确保迷你个人资料完全加载
    await page.waitForTimeout(1500);

    logger.debug(`等待选择器: ${miniprofileSelector}`);
    await page.waitForSelector(miniprofileSelector);

    logger.debug(`正在截取屏幕并转换为 base64`);
    const screenshotBuffer = await page.screenshot({
      clip: await page.evaluate(selector => {
        const element = document.querySelector(selector);
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }, miniprofileSelector)
    });

    // 将截图缓冲区转换为 base64 编码
    const base64Image = screenshotBuffer.toString('base64');
    logger.debug(`截图成功捕获`);

    return { image: base64Image };
  } catch (error) {
    console.error('截屏时出错:', error);
    throw error;
  } finally {
    await browser.close();
  }
}


export async function screenshotSteamFriends(playerIdentifier) {
  const steamID = await getSteamID(playerIdentifier);
  const url = `https://steamcommunity.com/profiles/${steamID}/friends/`;

  const browser = await puppeteer.launch({
    args: [
      `--proxy-server=${proxy}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  const page = await browser.newPage();

  try {
    logger.debug(`正在导航到 URL: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    // 将视口设置为原始大小的两倍
    await page.setViewport({
      width: 1920,
      height: 0,
      deviceScaleFactor: 2
    });

    // 获取页面内容的实际高度
    const contentHeight = await page.evaluate(() => {
      return document.body.scrollHeight;
    });

    // 将视口高度设置为内容高度
    await page.setViewport({
      width: 1920,
      height: contentHeight,
      deviceScaleFactor: 2
    });

    const friendsSelector = '.profile_friends.search_results';

    // 检查是否存在错误提示
    if (await page.$('.error_ctn')) {
      const errorMessage = await page.$eval('.sectionText', el => el.textContent.trim());
      return { error: errorMessage };
    }

    logger.debug(`等待选择器: ${friendsSelector}`);
    await page.waitForSelector(friendsSelector);

    logger.debug(`正在截取屏幕并转换为 base64`);
    const screenshotBuffer = await page.screenshot({
      clip: await page.evaluate(selector => {
        const element = document.querySelector(selector);
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }, friendsSelector)
    });

    // 将截图缓冲区转换为 base64 编码
    const base64Image = screenshotBuffer.toString('base64');
    logger.debug(`截图成功捕获`);

    return { image: base64Image };
  } catch (error) {
    console.error('截屏时出错:', error);
    throw error;
  } finally {
    await browser.close();
  }
}


export async function serveBase64ImageForHelp() {
  const file_url = `file://${path.resolve(Config.dirPath, 'resources/html/help.html')}`;
  const browser = await puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  const page = await browser.newPage();
  await page.goto(file_url, { waitUntil: 'networkidle2' });

  try {
    await page.setViewport({
      width: 610,
      height: 0
    });

    // 获取页面内容的实际高度
    const contentHeight = await page.evaluate(() => {
      return document.body.scrollHeight;
    });

    // 将视口高度设置为内容高度
    await page.setViewport({
      width: 610,
      height: contentHeight + 60
    });

    await page.waitForTimeout(2000);

    const screenshotBuffer = await page.screenshot();
    const base64Image = screenshotBuffer.toString('base64');

    return base64Image;
  } catch (error) {
    console.error('Error serving help image:', error);
    throw error;
  } finally {
    await browser.close();
  }
}