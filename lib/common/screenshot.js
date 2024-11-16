import puppeteer from 'puppeteer';
import Config from '../config.js';
import path from 'path';
import { logger } from 'node-karin';
import { getSteamID } from '../main/FriendCode.js';


const proxy = Config.Config.proxy;

//steam小卡片截图部分
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

//steam好友截图部分
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

/*
// 使用 Stealth 插件
puppeteerExtra.use(StealthPlugin());

// handleCloudflareProtection 函数保持不变
async function handleCloudflareProtection(page) {
  try {
    console.log('检测 Cloudflare 保护...');
    const timeout = 5000;
    const containerSelector = 'body > div.container > div.muted-banner.cf-error';
    const clickPosition = { x: 162, y: 344 };
    const maxRetries = 5;
    const retryInterval = 5000;

    await page.waitForSelector(containerSelector, { timeout });
    console.log('检测到 Cloudflare 验证容器');
    await page.waitForTimeout(7000);

    await page.setViewport({ width: 1201, height: 829 });

    for (let i = 0; i < maxRetries; i++) {
      // 添加随机延迟，模拟人类停顿
      const randomDelay1 = Math.floor(Math.random() * 5000) + 3000; // 随机延迟 3000 - 5000ms
      console.log(`等待 ${randomDelay1} 毫秒后模拟移动`);
      await page.waitForTimeout(randomDelay1);

      // 模拟鼠标移动到附近随机位置
      console.log(`模拟鼠标移动到接近点击位置 (${clickPosition.x}, ${clickPosition.y})`);

      // 随机生成滑动速度、方向和距离
      const randomDistanceX = Math.floor(Math.random() * 50) - 25; // 随机水平偏移 (-25 到 25 像素)
      const randomDistanceY = Math.floor(Math.random() * 50) - 25; // 随机垂直偏移 (-25 到 25 像素)
      const randomSteps = Math.floor(Math.random() * 20) + 5; // 随机步数 (5 到 25 步)
      const targetX = clickPosition.x + randomDistanceX; // 目标 x 位置
      const targetY = clickPosition.y + randomDistanceY; // 目标 y 位置

      console.log(`鼠标随机移动到 (${targetX}, ${targetY})，速度: ${randomSteps} 步`);
      await page.mouse.move(targetX, targetY, { steps: randomSteps }); // 随机滑动速度和距离

      // 最后一步精确移动到目标点击位置
      console.log(`精确移动到点击位置 (${clickPosition.x}, ${clickPosition.y})`);
      await page.mouse.move(clickPosition.x, clickPosition.y, { steps: 5 }); // 精确移动到目标位置

      // 添加随机延迟，模拟人类停顿
      const randomDelay = Math.floor(Math.random() * 2000) + 500; // 随机延迟 500 - 2500ms
      console.log(`等待 ${randomDelay} 毫秒后模拟点击`);
      await page.waitForTimeout(randomDelay);

      // 模拟点击
      await page.mouse.down();
      await page.waitForTimeout(100); // 模拟点击停顿
      await page.mouse.up();
      console.log(`第 ${i + 1} 次尝试点击位置 (${clickPosition.x}, ${clickPosition.y})`);

      await page.waitForTimeout(retryInterval);

      await page.evaluate(containerSelector => {
        const element = document.querySelector(containerSelector);
        return element ? element.innerHTML : '容器未找到';
      }, containerSelector);
    }

    const responseExists = await page.evaluate(() => {
      return document.querySelector('input[name="cf-turnstile-response"]') !== null;
    });

    if (!responseExists) {
      console.warn('在规定时间内未能完成 Cloudflare 验证');
    } else {
      console.log('Cloudflare 保护验证完成');
    }

  } catch (error) {
    console.error('处理 Cloudflare 保护时出错:', error);
  }
}

// screenshotSteamCharts 函数
export async function screenshotSteamCharts() {
  //const url = 'https://steamdb.info/';
  const url = 'https://www.browserscan.net/zh/bot-detection';


  // 生成随机用户代理
  const userAgent = new UserAgent();
  console.log(`使用随机用户代理: ${userAgent.toString()}`);

  // 启动 Puppeteer 并设置启动选项
  const browser = await puppeteer.launch({
    headless: true,  // 设置为true可以运行无头模式
    args: [
      '--no-sandbox',  // 禁用沙盒
      '--disable-gpu',  // 禁用GPU加速
      '--incognito',  // 启用隐私模式
      '--disable-blink-features=AutomationControlled',  // 隐藏自动化标志
      '--disable-features=IsolateOrigins',
      `--user-agent=${userAgent.toString()}`,  // 使用自定义用户代理
      '--disable-infobars',  // 隐藏Chrome“受自动化控制”的提示
      '--window-size=1200,800',  // 设置窗口大小
    ],
    ignoreDefaultArgs: ['--enable-automation'],  // 移除自动化标志
    // 使用 excludeSwitches 类似的功能隐藏自动化参数
    defaultViewport: null,  // 禁用默认视口设置
  });

  // 使用 protectedBrowser 来保护 Puppeteer 实例，生成随机指纹
  const protectedBrowserInstance = await protectedBrowser(browser, { /* 可选配置 options *//* });
  const page = await protectedBrowserInstance.newProtectedPage();

  // 移除 navigator.webdriver 自动化标志
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,  // 移除自动化标志
    });
  });


  try {
    const device = {
      name: 'Windows 11 Desktop',
      viewport: {
        width: 1201,
        height: 829,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: true
      },
      userAgent: userAgent.toString(), // 使用随机生成的用户代理
    };

    await page.emulate(device);  // 设置设备模拟
    console.log(`正在导航到 URL: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    try {
      await handleCloudflareProtection(page);  // 执行 Cloudflare 防护
    } catch (error) {
      console.warn('Cloudflare 验证未成功，但继续进行截图:', error);
    }

    const contentHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewport({
      width: device.viewport.width,
      height: contentHeight,
      deviceScaleFactor: device.viewport.deviceScaleFactor
    });

    console.log('正在截取整个页面并转换为 base64');
    const screenshotBuffer = await page.screenshot({
      fullPage: true
    });

    const base64Image = screenshotBuffer.toString('base64');
    console.log('截图成功捕获整个页面');
    return base64Image;

  } catch (error) {
    console.error('截屏时出错:', error);
    throw error;

  } finally {
    await browser.close();
  }
}
*/

//steam services截图部分

export async function screenshotSteamServices() {
  const url = `https://steamstat.us/`;

  const browser = await puppeteer.launch({
    args: [
      `--proxy-server=${proxy}`,
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

    logger.debug(`正在导航到 URL: ${url}`);
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
    await page.waitForTimeout(5000); // 可调整等待时间
    await page.screenshot({ path: 'debug_full_page.png', fullPage: true });

    logger.debug(`等待选择器: ${firstServiceSelector}`);
    await page.waitForSelector(firstServiceSelector, { timeout: 10000 });

    logger.debug(`正在截取屏幕并转换为 base64`);
    const screenshotBuffer = await page.screenshot({
      clip: await page.evaluate(selector => {
        const element = document.querySelector(selector);
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }, firstServiceSelector)
    });

    const base64Image = screenshotBuffer.toString('base64');
    logger.debug(`截图成功捕获`);

    return base64Image;
  } catch (error) {
    console.error('截屏时出错:', error);
    throw error;
  } finally {
    await browser.close();
  }
}



//菜单
export async function serveBase64ImageForHelp() {
  const file_url = `file://${path.resolve(Config.dirPath, 'resources/template/help.html')}`;
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