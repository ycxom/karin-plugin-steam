import puppeteerExtra from 'puppeteer-extra';
import puppeteer from 'puppeteer';
import Config from '../config.js';
import path from 'path';
import { logger } from 'node-karin';
import { getSteamID } from '../main/FriendCode.js';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

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




// 使用 Stealth 插件
puppeteerExtra.use(StealthPlugin());

// handleCloudflareProtection 函数中的修改部分
async function handleCloudflareProtection(page) {
  try {
    console.log('检测 Cloudflare 保护...');

    const timeout = 5000; // 增加到5秒
    const containerSelector = '#RlquG0';
    const clickPosition = { x: 162, y: 344 };
    const maxRetries = 5; // 最大重试次数
    const retryInterval = 5000; // 每次重试之间的间隔时间(ms)

    // 等待包含复选框的容器元素出现
    await page.waitForSelector(containerSelector, { timeout });
    console.log('检测到 Cloudflare 验证容器');
    await page.waitForTimeout(7000); // 可调整等待时间

    // 设置视口大小
    await page.setViewport({ width: 1201, height: 829 });

    for (let i = 0; i < maxRetries; i++) {
      // 尝试移动鼠标并点击指定位置
      await page.mouse.move(clickPosition.x, clickPosition.y);
      await page.waitForTimeout(200); // 等待200ms以模拟用户的鼠标移动
      await page.mouse.down();
      await page.waitForTimeout(100); // 增加点击和释放之间的延迟
      await page.mouse.up();
      console.log(`第 ${i + 1} 次尝试点击位置 (${clickPosition.x}, ${clickPosition.y})`);

      // 增加等待时间以确保复选框加载完成
      await page.waitForTimeout(retryInterval);

      // 打印容器内的内容进行调试
      const containerContent = await page.evaluate(containerSelector => {
        const element = document.querySelector(containerSelector);
        return element ? element.innerHTML : '容器未找到';
      }, containerSelector);
      console.log(containerContent);
    }

    // 检查页面是否包含 name="cf-turnstile-response" 的元素
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
    // 继续抛出错误以便截图函数处理
  }
}

// screenshotSteamCharts 函数中的修改部分
export async function screenshotSteamCharts() {
  const url = 'https://steamdb.info/';

  const browser = await puppeteerExtra.launch({
    headless: false, // 禁用无头模式以便观察
    args: [
      `--proxy-server=${proxy}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  const page = await browser.newPage();

  try {
    // 定义 Windows 11 桌面设备配置
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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36'
    };

    // 模拟定义的设备
    await page.emulate(device);

    console.log(`正在导航到 URL: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' }); // 设置较长的超时时间

    // 处理 Cloudflare 保护
    try {
      await handleCloudflareProtection(page);
    } catch (error) {
      console.warn('Cloudflare 验证未成功，但继续进行截图:', error);
    }

    // 获取页面内容的实际高度
    const contentHeight = await page.evaluate(() => document.body.scrollHeight);

    // 设置视口高度为内容高度
    await page.setViewport({
      width: device.viewport.width,
      height: contentHeight,
      deviceScaleFactor: device.viewport.deviceScaleFactor
    });

    console.log('正在截取整个页面并转换为 base64');
    const screenshotBuffer = await page.screenshot({
      fullPage: true  // 设置为 true 以截取整个页面
    });

    // 将截图缓冲区转换为 base64 编码字符串
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