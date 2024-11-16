import axios from 'axios';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import schedule from 'node-schedule';
import { logger } from 'node-karin';
import Config from '../config.js';
import pkg from 'https-proxy-agent';
import sharp from 'sharp' ; // 用于图像压缩

const { HttpsProxyAgent } = pkg;
const GAMELIST_FILE = `${Config.dirPath}/data/Steam/GameList.yaml`;
const TEMPLATE_FILE = `${Config.dirPath}/resources/template/steamGameList.html`;

// 全局变量存储所有游戏信息
let appList = {};

/**
 * 从 Steam API 获取游戏列表
 */
async function fetchAppListFromAPI() {
    const proxy = Config.Config.proxy;
    const agent = new HttpsProxyAgent(proxy);
    logger.log(`[fetchAppListFromAPI] 使用代理: ${proxy}`);

    try {
        const response = await axios.get('https://api.steampowered.com/ISteamApps/GetAppList/v2/', {
            httpsAgent: agent
        });
        appList = response.data.applist.apps.reduce((map, app) => {
            map[app.appid] = app.name;
            return map;
        }, {});
        logger.log(`[fetchAppListFromAPI] 成功从 Steam API 获取游戏列表，游戏数量: ${Object.keys(appList).length}`);

        // 确保目录存在
        const dirPath = path.dirname(GAMELIST_FILE);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        // 保存到文件
        const yamlStr = yaml.dump(appList);
        fs.writeFileSync(GAMELIST_FILE, yamlStr, 'utf8');
        logger.log(`[fetchAppListFromAPI] 成功将游戏列表保存到文件: ${GAMELIST_FILE}`);
    } catch (error) {
        logger.error(`[fetchAppListFromAPI] 加载游戏列表时出错: ${error.message}`);
        throw error;
    }
}

/**
 * 初始化游戏列表
 */
export async function initAppList() {
    if (fs.existsSync(GAMELIST_FILE)) {
        logger.log(`[initAppList] 从文件加载游戏列表: ${GAMELIST_FILE}`);
        const fileContents = fs.readFileSync(GAMELIST_FILE, 'utf8');
        appList = yaml.load(fileContents);
        logger.log(`[initAppList] 成功从文件加载游戏列表，游戏数量: ${Object.keys(appList).length}`);
    } else {
        try {
            await fetchAppListFromAPI();
        } catch (error) {
            logger.error(`[initAppList] 从 Steam API 获取游戏列表失败，进行重试: ${error.message}`);
            // 进行重试，最多重试3次
            for (let i = 0; i < 3; i++) {
                try {
                    await fetchAppListFromAPI();
                    break; // 成功后退出重试循环
                } catch (retryError) {
                    logger.error(`[initAppList] 重试加载游戏列表时出错 (第 ${i + 1} 次重试): ${retryError.message}`);
                    if (i === 2) throw retryError; // 如果是最后一次重试，抛出错误
                }
            }
        }
    }
}

/**
 * 获取指定 Steam 用户的游戏库信息
 */
export async function fetchSteamLibrary(steamUserId) {
    try {
        // 创建代理
        const proxy = Config.Config.proxy;
        const agent = new HttpsProxyAgent(proxy);
        logger.log(`[fetchSteamLibrary] 使用代理: ${proxy}`);

        // 通过代理发送请求
        logger.log(`正在发送请求到 Steam API, SteamID: ${steamUserId}`);
        const response = await axios.get(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${Config.Config.steamApiKey}&steamid=${steamUserId}&format=json`, {
            httpsAgent: agent
        });

        logger.log(`[fetchSteamLibrary] 请求已发送，状态码: ${response.status}`);
        if (response.status !== 200) {
            logger.error(`[fetchSteamLibrary] 无法访问 Steam API，状态码: ${response.status}`);
            throw new Error('无法访问 Steam API');
        }

        const games = response.data.response.games;
        logger.log(`[fetchSteamLibrary] 成功获取游戏库数据，游戏数量: ${games.length}`);
        return games;
    } catch (error) {
        logger.error(`[fetchSteamLibrary] 获取 Steam 游戏库信息时出错: ${error.message}`);
        throw error;
    }
}

/**
 * 获取游戏封面图 URL
 */
function getGameCoverURL(appid) {
    return `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/header.jpg`;
}

/**
 * 渲染游戏库为HTML并转换为base64图片
 */
export async function renderGamesToBase64(games) {
    try {
        const templateContent = fs.readFileSync(TEMPLATE_FILE, 'utf8');
        const template = Handlebars.compile(templateContent);

        const gameData = games.map(game => ({
            title: appList[game.appid] || '未知游戏',
            description: `总游戏时间: ${game.playtime_forever} 分钟`,
            coverUrl: getGameCoverURL(game.appid)
        }));

        const htmlContent = template({ freebies: gameData, gameCount: games.length });

        // 使用 Puppeteer 渲染 HTML 为图片
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle2' });

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
                height: contentHeight
            });

            await page.waitForTimeout(2000);

            // 生成 PNG 格式的截图
            const screenshotBuffer = await page.screenshot({ type: 'png' });

            // 使用 sharp 将 PNG 转换为 JPEG 并压缩
            let base64Image = await sharp(screenshotBuffer)
                .resize({ width: 720 }) // 调整宽度以减小图像尺寸
                .jpeg({ quality: 80 })  // 转换为 JPEG 并降低质量
                .toBuffer();

            // 如果图像大小超过 4MB，则进一步压缩
            let imageSize = Buffer.byteLength(base64Image);
            while (imageSize > 4 * 1024 * 1024) {  // 4MB
                base64Image = await sharp(base64Image)
                    .resize({ width: 610 })
                    .jpeg({ quality: 70 })  // 降低 JPEG 的质量
                    .toBuffer();

                imageSize = Buffer.byteLength(base64Image);
            }

            base64Image = base64Image.toString('base64');

            await browser.close();

            return base64Image;
        } catch (error) {
            await browser.close();
            throw error;
        }
    } catch (error) {
        logger.error(`[renderGamesToBase64] 渲染游戏库为HTML时出错: ${error.message}`);
        throw error;
    }
}

/**
 * 定时任务：每天凌晨3点更新游戏列表
 */
export function scheduleDailyUpdate() {
    schedule.scheduleJob('0 3 * * *', async () => {
        logger.log('[Karin-plugin-steam] 开始每日游戏列表更新');
        try {
            await fetchAppListFromAPI();
            logger.log('[Karin-plugin-steam] 游戏列表更新成功');
        } catch (error) {
            logger.error(`[Karin-plugin-steam] 游戏列表更新失败: ${error.message}`);
        }
    });
}