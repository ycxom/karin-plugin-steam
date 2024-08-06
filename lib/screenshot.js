import puppeteer from 'puppeteer';
import Config from './config.js';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import HttpsProxyAgent from 'https-proxy-agent';

const proxy = Config.Config.proxy;
const agent = new HttpsProxyAgent(proxy);

async function getSteamID(playerIdentifier) {
  // 如果输入的是数字 ID，则直接返回
  if (/^\d+$/.test(playerIdentifier)) {
    return playerIdentifier;
  }

  // 否则，假定是 Vanity URL，调用 Steam API 解析
  const apiKey = Config.Config.steamApiKey;
  const response = await axios.get(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${apiKey}&vanityurl=${playerIdentifier}`, {
    httpsAgent: agent
  });
  if (response.data && response.data.response && response.data.response.steamid) {
    return response.data.response.steamid;
  }
  throw new Error('无法转换好友代码为 SteamID');
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
    console.log(`Navigating to URL: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Set viewport to double the original size
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2
    });

    const avatarSelector = '.playerAvatarAutoSizeInner';
    const miniprofileSelector = '.miniprofile_container';

    // Check for error
    if (await page.$('.error_ctn')) {
      const errorMessage = await page.$eval('.sectionText', el => el.textContent.trim());
      return { error: errorMessage };
    }

    console.log(`Waiting for selector: ${avatarSelector}`);
    await page.waitForSelector(avatarSelector);

    // Move mouse to the avatar to trigger the miniprofile to load
    const avatarElement = await page.$(avatarSelector);
    const avatarBoundingBox = await avatarElement.boundingBox();
    await page.mouse.move(
      avatarBoundingBox.x + avatarBoundingBox.width / 2,
      avatarBoundingBox.y + avatarBoundingBox.height / 2
    );
    // Wait for 1 second to ensure miniprofile is fully loaded
    await page.waitForTimeout(1000);

    console.log(`Waiting for selector: ${miniprofileSelector}`);
    await page.waitForSelector(miniprofileSelector);

    const screenshotDir = path.resolve(`${Config.dirPath}/resources/img`);
    const screenshotPath = path.resolve(screenshotDir, `steam_profile_${steamID}.png`);
    
    // Ensure the directory exists
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    console.log(`Taking screenshot and saving to: ${screenshotPath}`);
    const screenshotBuffer = await page.screenshot({
      path: screenshotPath,
      clip: await page.evaluate(selector => {
        const element = document.querySelector(selector);
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }, miniprofileSelector)
    });

    console.log(`Screenshot saved as ${screenshotPath}`);
    const base64Image = screenshotBuffer.toString('base64');
    return { image: base64Image };
  } catch (error) {
    console.error('Error taking screenshot:', error);
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
    console.log(`Navigating to URL: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Set viewport to double the original size
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2
    });

    const friendsSelector = '.profile_friends.search_results';

    // Check for error
    if (await page.$('.error_ctn')) {
      const errorMessage = await page.$eval('.sectionText', el => el.textContent.trim());
      return { error: errorMessage };
    }

    console.log(`Waiting for selector: ${friendsSelector}`);
    await page.waitForSelector(friendsSelector);

    const screenshotDir = path.resolve(`${Config.dirPath}/resources/img`);
    const screenshotPath = path.resolve(screenshotDir, `steam_friends_${steamID}.png`);
    
    // Ensure the directory exists
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    console.log(`Taking screenshot and saving to: ${screenshotPath}`);
    const screenshotBuffer = await page.screenshot({
      path: screenshotPath,
      clip: await page.evaluate(selector => {
        const element = document.querySelector(selector);
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }, friendsSelector)
    });

    console.log(`Screenshot saved as ${screenshotPath}`);
    const base64Image = screenshotBuffer.toString('base64');
    return { image: base64Image };
  } catch (error) {
    console.error('Error taking screenshot:', error);
    throw error;
  } finally {
    await browser.close();
  }
}
