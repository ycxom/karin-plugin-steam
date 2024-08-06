import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import Config from './config.js';
import Handlebars from 'handlebars';

const htmlTemplatePath = path.resolve(`${Config.dirPath}/resources/html/steam_statuses.html`);
const screenshotDir = path.resolve(`${Config.dirPath}/resources/img`);

async function generateSteamUI(steamStatuses) {
  const templateSource = fs.readFileSync(htmlTemplatePath, 'utf8');
  const template = Handlebars.compile(templateSource);
  
  const inGameFriends = steamStatuses.filter(status => status.profileStatusClass === 'in-game');
  const onlineFriends = steamStatuses.filter(status => status.profileStatusClass === 'online');
  const offlineFriends = steamStatuses.filter(status => status.profileStatusClass === 'offline');

  console.debug('渲染前的数据:', {
    inGameFriends,
    onlineFriends,
    offlineFriends
  });

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

  console.debug('生成的 HTML 内容:', htmlContent);

  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const htmlFilePath = path.resolve(screenshotDir, 'steam_statuses_rendered.html');
  fs.writeFileSync(htmlFilePath, htmlContent);

  const browser = await puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  const page = await browser.newPage();
  await page.goto(`file://${htmlFilePath}`, { waitUntil: 'networkidle2' });

  // 添加延迟 1 秒
  await page.waitForTimeout(1000);

  const screenshotPath = path.resolve(screenshotDir, 'steam_statuses.png');
  await page.screenshot({ path: screenshotPath });

  const screenshotBuffer = fs.readFileSync(screenshotPath);
  const base64Image = screenshotBuffer.toString('base64');

  await browser.close();
  return base64Image;
}

export { generateSteamUI };
