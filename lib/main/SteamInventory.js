// lib/main/SteamInventory.js
import axios from 'axios';
import fs from 'fs';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import schedule from 'node-schedule';
import { logger } from 'node-karin';
import { Config, dirPath } from '../config.js';
import pkg from 'https-proxy-agent';
import sharp from 'sharp';
import { updateGameList, getGameList } from './databaseOps.js';
import { makeResilientSteamApiRequest } from '../common/apiKeyManager.js';

const { HttpsProxyAgent } = pkg;
const TEMPLATE_FILE = `${dirPath}/resources/template/steamGameList.html`;

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
export let appListCache = {};
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
    const urlBuilder = (key) => `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamUserId}&format=json`;

    const data = await makeResilientSteamApiRequest(urlBuilder);

    if (!data) {
        logger.debug(`[fetchSteamLibrary] 获取用户 ${steamUserId} 游戏库失败`);
        return [];
    }

    return data.response.games || [];
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
        // 按游戏时长排序（从高到低）
        games.sort((a, b) => b.playtime_forever - a.playtime_forever);

        // 计算总游戏时长
        const totalPlaytime = games.reduce((total, game) => total + game.playtime_forever, 0);
        const totalHours = Math.floor(totalPlaytime / 60);
        const totalDays = Math.floor(totalHours / 24);

        const templateContent = fs.readFileSync(TEMPLATE_FILE, 'utf8');
        const template = Handlebars.compile(templateContent);

        const gameData = games.map(game => {
            // 计算小时和分钟
            const hours = Math.floor(game.playtime_forever / 60);
            const minutes = game.playtime_forever % 60;

            // 格式化游戏时长显示
            let timeDisplay = '';
            if (hours > 0) {
                timeDisplay += `${hours} 小时`;
                if (minutes > 0) timeDisplay += ` ${minutes} 分钟`;
            } else {
                timeDisplay = minutes > 0 ? `${minutes} 分钟` : '未玩过';
            }

            return {
                title: appListCache[game.appid] || '未知游戏',
                description: `游戏时长: ${timeDisplay}`,
                coverUrl: getGameCoverURL(game.appid),
                playtime: game.playtime_forever // 保留原始分钟数用于排序
            };
        });

        // 准备模板数据
        const templateData = {
            freebies: gameData,
            gameCount: games.length,
            totalHours,
            totalDays,
            // 提供最近两周玩过的游戏数量
            recentlyPlayedCount: games.filter(game => game.playtime_2weeks).length
        };

        const htmlContent = template(templateData);

        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle2' });

        // 设置合适的视口宽度 (1080px)
        const contentHeight = await page.evaluate(() => document.body.scrollHeight);
        await page.setViewport({ width: 1080, height: contentHeight });

        // 等待图片加载完成
        await new Promise(r => setTimeout(r, 2500));

        // 限制最大高度，防止图片过长
        const maxHeight = 4000; // 设置最大高度为4000px
        const actualHeight = Math.min(contentHeight, maxHeight);

        let imageBuffer = await page.screenshot({
            type: 'png',
            height: actualHeight,
            fullPage: false
        });

        await browser.close();

        // 图像处理
        imageBuffer = await sharp(imageBuffer)
            .jpeg({ quality: 85 })
            .toBuffer();

        // 检查图片大小
        const imageSizeMB = imageBuffer.byteLength / (1024 * 1024);
        if (imageSizeMB > 4) {
            logger.warn(`[renderGamesToBase64] 图片大小(${imageSizeMB.toFixed(2)}MB)超过4MB，进行压缩处理`);
            // 如果图片过大，进一步压缩
            imageBuffer = await sharp(imageBuffer)
                .jpeg({ quality: 70 })
                .toBuffer();
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
        logger.log('[karin-plugin-steam] 开始更新Steam游戏库');
        try {
            await fetchAppListFromAPI();
            await initAppList();
            logger.log('[karin-plugin-steam] 游戏库更新完毕');
        } catch (error) {
            logger.error(`[karin-plugin-steam] 更新游戏库失败: ${error.message}`);
        }
    });
}