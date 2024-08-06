import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import Config from './config.js';

const screenshotDir = path.resolve(`${Config.dirPath}/config/img`);

async function generateSteamUI(steamStatuses) {
  const htmlContent = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          .container { max-width: 800px; margin: auto; padding: 20px; }
          .friend { border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; display: flex; align-items: center; }
          .avatar { width: 64px; height: 64px; margin-right: 20px; }
          .details { flex: 1; }
          .name { font-size: 18px; font-weight: bold; }
          .status { color: gray; }
        </style>
      </head>
      <body>
        <div class="container">
          ${steamStatuses.map(status => `
            <div class="friend">
              <img class="avatar" src="${status.playerAvatarImg}" alt="Avatar">
              <div class="details">
                <div class="name">${status.actualPersonaName}</div>
                <div class="status">${status.profileStatus}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </body>
    </html>
  `;

  const htmlFilePath = path.resolve(screenshotDir, 'steam_statuses.html');
  fs.writeFileSync(htmlFilePath, htmlContent);

  const browser = await puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  const page = await browser.newPage();
  await page.goto(`file://${htmlFilePath}`, { waitUntil: 'networkidle2' });

  const screenshotPath = path.resolve(screenshotDir, 'steam_statuses.png');
  await page.screenshot({ path: screenshotPath });

  const screenshotBuffer = fs.readFileSync(screenshotPath);
  const base64Image = screenshotBuffer.toString('base64');

  await browser.close();
  return base64Image;
}

export { generateSteamUI };
