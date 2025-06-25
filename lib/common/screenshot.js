import puppeteer from 'puppeteer';
import { Config, dirPath } from '../config.js';
import path from 'path';
import fs from 'fs';
import Handlebars from 'handlebars';
import axios from 'axios';
import { logger } from 'node-karin';
import { getSteamID } from '../main/FriendCode.js';
import { debuglog } from '../debuglog.js';

// ... 其他截图函数 (screenshotSteamProfile, etc.) 保持不变 ...
export async function screenshotSteamProfile(playerIdentifier) {
  const steamID = await getSteamID(playerIdentifier);
  const url = `https://steamcommunity.com/profiles/${steamID}`;

  const browser = await puppeteer.launch({
    args: [
      `--proxy-server=${Config.proxy || ''}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  const page = await browser.newPage();

  try {
    debuglog(`正在导航到 URL: ${url}`);
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

    debuglog(`等待选择器: ${avatarSelector}`);
    await page.waitForSelector(avatarSelector);

    // 将鼠标移动到头像上以触发迷你个人资料加载
    const avatarElement = await page.$(avatarSelector);
    const avatarBoundingBox = await avatarElement.boundingBox();
    await page.mouse.move(
      avatarBoundingBox.x + avatarBoundingBox.width / 2,
      avatarBoundingBox.y + avatarBoundingBox.height / 2
    );
    // 等待1.5秒以确保迷你个人资料完全加载
    await new Promise(r => setTimeout(r, 1500))

    debuglog(`等待选择器: ${miniprofileSelector}`);
    await page.waitForSelector(miniprofileSelector);

    debuglog(`正在截取屏幕并转换为 base64`);
    const screenshotBuffer = await page.screenshot({
      clip: await page.evaluate(selector => {
        const element = document.querySelector(selector);
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }, miniprofileSelector)
    });

    // 将截图缓冲区转换为 base64 编码
    const base64Image = screenshotBuffer.toString('base64');
    debuglog(`截图成功捕获`);

    return { image: base64Image };
  } catch (error) {
    logger.error('截屏时出错:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

//steam好友截图部分
export async function screenshotSteamFriends(playerIdentifier) {
  const steamID = await getSteamID(playerIdentifier);
  const url = `https://steamcommunity.com/profiles/${steamID}/friends/`;

  const browser = await puppeteer.launch({
    args: [
      `--proxy-server=${Config.proxy || ''}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  const page = await browser.newPage();

  try {
    debuglog(`正在导航到 URL: ${url}`);
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

    debuglog(`等待选择器: ${friendsSelector}`);
    await page.waitForSelector(friendsSelector);

    debuglog(`正在截取屏幕并转换为 base64`);
    const screenshotBuffer = await page.screenshot({
      clip: await page.evaluate(selector => {
        const element = document.querySelector(selector);
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }, friendsSelector)
    });

    // 将截图缓冲区转换为 base64 编码
    const base64Image = screenshotBuffer.toString('base64');
    debuglog(`截图成功捕获`);

    return { image: base64Image };
  } catch (error) {
    logger.error('截屏时出错:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export async function screenshotSteamServices() {
  const url = `https://steamstat.us/`;

  const browser = await puppeteer.launch({
    args: [
      `--proxy-server=${Config.proxy || ''}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  const page = await browser.newPage();

  try {
    // 自定义 Windows 11 桌面设备配置
    const device = {
      name: 'Windows 11 Desktop',
      viewport: {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: true
      },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36'
    };

    // 应用设备仿真
    await page.emulate(device);

    debuglog(`正在导航到 URL: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    await page.setViewport({
      width: 1920,
      height: 0,
      deviceScaleFactor: 2
    });

    const contentHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewport({
      width: 1920,
      height: contentHeight,
      deviceScaleFactor: 2
    });

    const firstServiceSelector = '.services-container .services:nth-child(1)';

    // 等待并捕获页面截图（用于调试）
    await new Promise(r => setTimeout(r, 5000)); // 可调整等待时间
    await page.screenshot({ path: 'debug_full_page.png', fullPage: true });

    debuglog(`等待选择器: ${firstServiceSelector}`);
    await page.waitForSelector(firstServiceSelector, { timeout: 10000 });

    debuglog(`正在截取屏幕并转换为 base64`);
    const screenshotBuffer = await page.screenshot({
      clip: await page.evaluate(selector => {
        const element = document.querySelector(selector);
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }, firstServiceSelector)
    });

    const base64Image = screenshotBuffer.toString('base64');
    debuglog(`截图成功捕获`);

    return base64Image;
  } catch (error) {
    logger.error('截屏时出错:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * 动态扫描 'apps' 目录并解析命令信息
 * @returns {{all: Array, admin: Array, master: Array}}
 */
function scanCommands() {
  const appsDir = path.resolve(dirPath, 'apps');
  const files = fs.readdirSync(appsDir).filter(file => file.endsWith('.js'));
  const commands = { all: [], admin: [], master: [] };

  const commandRegex = /karin\.command\(\s*\/\^(.+?)\$\/i?s?m?g?,\s*async\s*\([\s\S]*?\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\{[\s\S]*?desc:\s*'([^']*)'[\s\S]*?permission:\s*'([^']*)'[\s\S]*?\}\s*\);/g;

  for (const file of files) {
    const content = fs.readFileSync(path.join(appsDir, file), 'utf-8');
    let match;
    while ((match = commandRegex.exec(content)) !== null) {
      const permission = match[3];
      if (commands[permission]) {
        const trigger = match[1]
          .replace(/\[Ss\]team/g, 'Steam')
          .replace(/\\s\*/g, ' ')
          .replace(/\(\.\+\)/g, '...')
          .replace(/\(\?:@\s\*\\d\+\s\*\)\?/g, '[@对方]')
          .replace(/\s*$/, '');

        commands[permission].push({
          usage: `#${trigger}`,
          desc: match[2]
        });
      }
    }
  }
  debuglog('扫描到的命令:', commands);
  return commands;
}

/**
 * 获取Base64格式的随机背景图，失败则使用本地后备图片
 * @returns {Promise<string>}
 */
async function getRandomBackgroundAsBase64() {
  // 1. 尝试从网络获取
  try {
    const response = await axios.get('https://ai.ycxom.top:3002/wallpaper/portrait', {
      timeout: 2000, // 设置5秒超时
      responseType: 'arraybuffer'
    });
    const base64 = Buffer.from(response.data, 'binary').toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    debuglog('[Help Menu] 获取网络背景图失败:', error.message);
    debuglog('[Help Menu] 正在尝试加载本地后备背景图...');

    // 2. 网络获取失败，尝试加载本地后备图片
    try {
      // 定义后备图片路径
      const fallbackImagePath = path.resolve(dirPath, 'resources', 'img', '100738933_p0.jpg');

      // 检查文件是否存在
      if (fs.existsSync(fallbackImagePath)) {
        const fileBuffer = fs.readFileSync(fallbackImagePath);
        const base64 = fileBuffer.toString('base64');
        debuglog('[Help Menu] 成功加载本地后备背景图。');
        return `data:image/jpeg;base64,${base64}`;
      } else {
        debuglog(`[Help Menu] 本地后备背景图不存在: ${fallbackImagePath}`);
        return ''; // 本地图片也不存在，返回空
      }
    } catch (localError) {
      debuglog('[Help Menu] 加载本地后备背景图时发生错误:', localError.message);
      return ''; // 加载本地图片也失败了，返回空
    }
  }
}

/**
 * 渲染动态帮助菜单图
 */
export async function serveBase64ImageForHelp() {
  const templatePath = path.resolve(dirPath, 'resources/template/help.html');

  try {
    const [commands, backgroundDataUri, templateSource] = await Promise.all([
      scanCommands(),
      getRandomBackgroundAsBase64(),
      fs.promises.readFile(templatePath, 'utf8')
    ]);

    const template = Handlebars.compile(templateSource);
    const htmlContent = template({
      commands,
      backgroundDataUri
    });

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await page.setViewport({ width: 800, height: 600 });

    const finalHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewport({ width: 800, height: finalHeight + 20 });

    await new Promise(r => setTimeout(r, 500)); // 等待渲染

    const screenshotBuffer = await page.screenshot({ type: 'png' });
    await browser.close();

    return screenshotBuffer.toString('base64');

  } catch (error) {
    logger.error('Error generating help image:', error);
    throw error;
  }
}
