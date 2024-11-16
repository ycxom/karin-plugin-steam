import puppeteerExtra from 'puppeteer-extra';
import puppeteer from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import UserAgent from 'user-agents';  // 引入 user-agents 模块

// 使用 Stealth 插件
puppeteerExtra.use(StealthPlugin());

// Cloudflare 验证处理函数
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
      const randomDelay1 = Math.floor(Math.random() * 5000) + 3000;
      console.log(`等待 ${randomDelay1} 毫秒后模拟移动`);
      await page.waitForTimeout(randomDelay1);

      const randomDistanceX = Math.floor(Math.random() * 50) - 25;
      const randomDistanceY = Math.floor(Math.random() * 50) - 25;
      const randomSteps = Math.floor(Math.random() * 20) + 5;
      const targetX = clickPosition.x + randomDistanceX;
      const targetY = clickPosition.y + randomDistanceY;

      console.log(`鼠标随机移动到 (${targetX}, ${targetY})，速度: ${randomSteps} 步`);
      await page.mouse.move(targetX, targetY, { steps: randomSteps });

      console.log(`精确移动到点击位置 (${clickPosition.x}, ${clickPosition.y})`);
      await page.mouse.move(clickPosition.x, clickPosition.y, { steps: 5 });

      const randomDelay = Math.floor(Math.random() * 2000) + 500;
      console.log(`等待 ${randomDelay} 毫秒后模拟点击`);
      await page.waitForTimeout(randomDelay);

      await page.mouse.click(clickPosition.x, clickPosition.y);
      console.log(`第 ${i + 1} 次尝试点击位置 (${clickPosition.x}, ${clickPosition.y})`);

      await page.waitForTimeout(retryInterval);

      const elementExists = await page.evaluate(containerSelector => {
        const element = document.querySelector(containerSelector);
        return element ? element.innerHTML : '容器未找到';
      }, containerSelector);

      if (!elementExists) break;
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
  const url = 'https://www.browserscan.net/zh/bot-detection';

  const userAgent = new UserAgent().toString();
  console.log(`使用随机用户代理: ${userAgent}`);

  // 启动 Puppeteer 并设置启动选项
  const browser = await puppeteerExtra.launch({
    headless: false,  // 设置为false可以避免部分检测
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins',
      `--user-agent=${userAgent}`,
      '--disable-infobars',
      '--window-size=1200,800',
      '--disable-extensions',
      '--disable-notifications',
      '--disable-popup-blocking',
      '--disable-web-security',
      '--ignore-certificate-errors',
      '--start-maximized',
      '--remote-debugging-port=19223',
      '--no-first-run',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    defaultViewport: null,
  });

  const page = await browser.newPage();

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // 删除 window.chrome
    delete window.chrome;

    // 删除或伪装 DevTools 的痕迹
    Object.defineProperty(window, 'navigator', {
      get: () => undefined,
    });
  });

  // 获取所有页面，关闭默认的空白页（如果存在）
  const pages = await browser.pages();
  if (pages.length > 1 && pages[0].url() === 'about:blank') {
    await pages[0].close();
  }

  try {
    console.log(`正在导航到 URL: ${url}`);
    await page.goto('https://bing.com');
    await page.goto(url, { waitUntil: 'networkidle2' });



    /**
     * 测试状态，暂时绕过cf验证
    
        try {
          await handleCloudflareProtection(page);
        } catch (error) {
          console.warn('Cloudflare 验证未成功，但继续进行截图:', error);
        }
     */
    const contentHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewport({
      width: 1201,
      height: contentHeight,
    });

    console.log('正在截取整个页面并转换为 base64');
    const screenshotBuffer = await page.screenshot({
      fullPage: true,
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