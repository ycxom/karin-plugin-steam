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
    logger.log(`Navigating to URL: ${url}`);
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

    logger.log(`Waiting for selector: ${avatarSelector}`);
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

    logger.log(`Waiting for selector: ${miniprofileSelector}`);
    await page.waitForSelector(miniprofileSelector);

    const screenshotDir = path.resolve(`${Config.dirPath}/resources/img`);
    const screenshotPath = path.resolve(screenshotDir, `steam_profile_${steamID}.png`);
    
    // Ensure the directory exists
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    logger.log(`Taking screenshot and saving to: ${screenshotPath}`);
    const screenshotBuffer = await page.screenshot({
      path: screenshotPath,
      clip: await page.evaluate(selector => {
        const element = document.querySelector(selector);
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }, miniprofileSelector)
    });

    logger.log(`Screenshot saved as ${screenshotPath}`);
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
    logger.log(`Navigating to URL: ${url}`);
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

    logger.log(`Waiting for selector: ${friendsSelector}`);
    await page.waitForSelector(friendsSelector);

    const screenshotDir = path.resolve(`${Config.dirPath}/resources/img`);
    const screenshotPath = path.resolve(screenshotDir, `steam_friends_${steamID}.png`);
    
    // Ensure the directory exists
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    logger.log(`Taking screenshot and saving to: ${screenshotPath}`);
    const screenshotBuffer = await page.screenshot({
      path: screenshotPath,
      clip: await page.evaluate(selector => {
        const element = document.querySelector(selector);
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }, friendsSelector)
    });

    logger.log(`Screenshot saved as ${screenshotPath}`);
    const base64Image = screenshotBuffer.toString('base64');
    return { image: base64Image };
  } catch (error) {
    console.error('Error taking screenshot:', error);
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

  await page.waitForTimeout(2000);

  try {
    await page.setViewport({
      width: 610,
      height: 950
    });

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