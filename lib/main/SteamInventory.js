import axios from 'axios';
import fs from 'fs';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import schedule from 'node-schedule';
import { logger } from 'node-karin';
import { Config } from '../config.js';
import pkg from 'https-proxy-agent';
import sharp from 'sharp';
import { updateGameList, getGameList } from './databaseOps.js';

const { HttpsProxyAgent } = pkg;
const TEMPLATE_FILE = `${Config.dirPath}/resources/template/steamGameList.html`;

/**
 * 从 Steam API 获取游戏列表并更新数据库
 */
async function fetchAppListFromAPI() {
    const proxy = Config.proxy || '';
    const agent = proxy ? new HttpsProxyAgent(proxy) : null;
    logger.log(`[fetchAppListFromAPI] 使用代理: ${proxy || '无'}`);

    try {
        const options = {};
        if (agent) options.httpsAgent = agent;
        const response = await axios.get('https://api.steampowered.com/ISteamApps/GetAppList/v2/', options);
        const apps = response.data.applist.apps;

        // ✅ 调用 databaseOps 中的函数来处理数据库事务
        await updateGameList(apps);
        logger.log(`[fetchAppListFromAPI] 游戏列表更新完毕，共${apps.length}条`);

    } catch (error) {
        logger.error(`[fetchAppListFromAPI] 出错: ${error.message}`);
        throw error;
    }
}

/**
 * 初始化时加载游戏列表到内存（缓存）
 */
let appListCache = {};
let fetchInProgress = false;

export async function initAppList() {
    if (fetchInProgress) {
        logger.warn('[initAppList] 已有获取进程正在运行，跳过');
        return;
    }

    try {
        fetchInProgress = true;
        const rowsResult = await getGameList();

        logger.debug(`[initAppList] 查询到 ${rowsResult.length} 条数据`);

        if (!rowsResult || rowsResult.length === 0) {
            logger.log(`[initAppList] 数据库为空，将从API获取`);
            await fetchAppListFromAPI();
            await initAppList();
            return;
        }

        // 重置缓存
        appListCache = {};
        rowsResult.forEach(app => {
            if (app && app.appid) {
                appListCache[app.appid] = app.name;
            }
        });

        logger.log(`[initAppList] 游戏数据加载成功，数据量：${Object.keys(appListCache).length}`);
    } catch (err) {
        logger.error(`[initAppList] 出错: ${err.message}`);
        throw err;
    } finally {
        fetchInProgress = false;
    }
}

/**
 * 获取用户 Steam 库
 */
export async function fetchSteamLibrary(steamUserId) {
    const proxy = Config.proxy || '';
    const agent = proxy ? new HttpsProxyAgent(proxy) : null;

    try {
        const options = {};
        if (agent) options.httpsAgent = agent;

        const response = await axios.get(
            `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${Config.steamApiKey}&steamid=${steamUserId}&format=json`,
            options
        );
        return response.data.response.games || [];
    } catch (error) {
        logger.error(`[fetchSteamLibrary] 获取库失败: ${error.message}`);
        throw error;
    }
}

/**
 * 获取游戏封面图片网址
 */
function getGameCoverURL(appid) {
    return `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/header.jpg`;
}

/**
 * 渲染游戏库为图片
 */
export async function renderGamesToBase64(games) {
    try {
        const templateContent = fs.readFileSync(TEMPLATE_FILE, 'utf8');
        const template = Handlebars.compile(templateContent);
        const gameData = games.map(game => ({
            title: appListCache[game.appid] || '未知游戏',
            description: `游戏时长: ${Math.round(game.playtime_forever / 60)} 小时`, // 优化为小时
            coverUrl: getGameCoverURL(game.appid)
        }));
        const htmlContent = template({ freebies: gameData, gameCount: games.length });

        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle2' });
        const contentHeight = await page.evaluate(() => document.body.scrollHeight);
        await page.setViewport({ width: 710, height: contentHeight });
        await new Promise(r => setTimeout(r, 1500));
        let imageBuffer = await page.screenshot({ type: 'png' });
        await browser.close();

        // 图像压缩
        imageBuffer = await sharp(imageBuffer)
            .resize({ width: 610 })
            .jpeg({ quality: 75 })
            .toBuffer();

        // 此循环可能导致过度压缩，可以简化
        if (imageBuffer.byteLength > 4 * 1024 * 1024) {
            logger.warn('[renderGamesToBase64] 压缩后图片仍大于4MB，可能发送失败');
        }

        return imageBuffer.toString('base64');
    } catch (error) {
        logger.error(`[renderGamesToBase64] 渲染失败: ${error.message}`);
        throw error;
    }
}

/**
 * 定时更新任务（每日3点）
 */
export function scheduleDailyUpdate() {
    const rule = new schedule.RecurrenceRule();
    rule.hour = 3;
    rule.minute = 0;
    rule.tz = 'Asia/Shanghai';

    schedule.scheduleJob(rule, async () => {
        logger.log('[每日任务] 开始更新Steam游戏库');
        try {
            await fetchAppListFromAPI();
            await initAppList();
            logger.log('[每日任务] 游戏库更新完毕');
        } catch (error) {
            logger.error(`[每日任务] 更新游戏库失败: ${error.message}`);
        }
    });
}