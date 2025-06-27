// lib/main/SteamInventory.js
import fs from 'fs';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import { logger } from 'node-karin';
import { Config, dirPath } from '../config.js';
import sharp from 'sharp';
import { updateGameList, getGameList } from '../db/databaseOps.js';
import { makeResilientSteamApiRequest } from '../common/apiKeyManager.js';
import schedule from 'node-schedule';
import { debuglog } from '../debuglog.js';
import axios from 'axios';
import pkg from 'https-proxy-agent';
import { fetchPlayerProfileAPI } from './fetchSteamStatus.js';
import { getCachedImageAsBase64 } from '../common/getCachedImage.js';
import { getRandomBackgroundAsBase64 } from '../common/screenshot.js';

const { HttpsProxyAgent } = pkg;
const TEMPLATE_FILE = `${dirPath}/resources/template/steamGameList.html`;


export async function fetchAppListFromAPI() {
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

        debuglog(`[initAppList] 查询到 ${rowsResult.length} 条数据`);

        if (!rowsResult || rowsResult.length === 0) {
            logger.log(`[initAppList] 数据库为空，将从API获取`);
            await fetchAppListFromAPI();
            await initAppList();
            return;
        }

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

export async function fetchSteamLibrary(steamUserId) {
    const urlBuilder = (key) => `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamUserId}&format=json&include_appinfo=1&include_played_free_games=1`;
    const data = await makeResilientSteamApiRequest(urlBuilder);
    if (!data?.response?.games) {
        debuglog(`[fetchSteamLibrary] 获取用户 ${steamUserId} 游戏库失败或库为空`);
        return [];
    }
    return data.response.games;
}

export async function renderLibraryImage(steamUserId) {
    try {
        const [userProfile, games] = await Promise.all([
            fetchPlayerProfileAPI(steamUserId),
            fetchSteamLibrary(steamUserId)
        ]);

        if (!userProfile) throw new Error("无法获取用户个人资料");

        const [backgroundDataUri, userAvatarImg, frameImg] = await Promise.all([
            getRandomBackgroundAsBase64(),
            getCachedImageAsBase64(userProfile.playerAvatarImg, userProfile.playerAvatarImg),
            userProfile.frameImg ? getCachedImageAsBase64(userProfile.frameImg, userProfile.frameImg) : Promise.resolve(null)
        ]);

        userProfile.playerAvatarImg = userAvatarImg;
        userProfile.frameImg = frameImg;

        games.sort((a, b) => b.playtime_forever - a.playtime_forever);
        const totalPlaytime = games.reduce((total, game) => total + game.playtime_forever, 0);
        const totalHours = Math.floor(totalPlaytime / 60);

        const numGames = games.length;
        const columns = numGames > 0 ? Math.max(2, Math.min(Math.ceil(Math.sqrt(numGames)), 10)) : 1;

        const stats = {
            gameCount: numGames,
            totalHours: totalHours,
            totalDays: Math.floor(totalHours / 24),
            recentlyPlayedCount: games.filter(game => game.playtime_2weeks).length,
            columns: columns
        };

        const gameDataPromises = games.map(async (game, index) => {
            const hours = Math.floor(game.playtime_forever / 60);
            const minutes = game.playtime_forever % 60;
            let timeDisplay = (hours > 0) ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
            if (game.playtime_forever === 0) timeDisplay = '未开始';

            const coverUrl = `https://steamcdn-a.akamaihd.net/steam/apps/${game.appid}/header.jpg`;
            const coverBase64 = await getCachedImageAsBase64(coverUrl, `header_${game.appid}`);

            return {
                title: appListCache[game.appid] || '未知游戏',
                playtimeFormatted: timeDisplay,
                coverUrl: coverBase64,
                highlight: index < 10
            };
        });

        const gameData = await Promise.all(gameDataPromises);

        const templateContent = fs.readFileSync(TEMPLATE_FILE, 'utf8');
        const template = Handlebars.compile(templateContent);
        const htmlContent = template({
            user: userProfile,
            stats,
            games: gameData,
            backgroundDataUri,
            formatDate: () => new Date().toLocaleString('zh-CN', { hour12: false })
        });

        const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();

        // --- 核心优化：提升渲染宽度 ---
        const viewportWidth = 2540; // 2440px 内容区 + 50px*2 内边距
        await page.setViewport({ width: viewportWidth, height: 1200 });
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        const finalHeight = await page.evaluate(() => document.body.scrollHeight);
        const maxHeight = 8000;
        await page.setViewport({ width: viewportWidth, height: Math.min(finalHeight, maxHeight) + 20 });

        await new Promise(r => setTimeout(r, 300));

        // --- 核心优化：提升图片质量 ---
        const imageBuffer = await page.screenshot({ type: 'jpeg', quality: 92 });
        await browser.close();

        return imageBuffer.toString('base64');

    } catch (error) {
        logger.error(`[renderLibraryImage] 渲染库存失败 for ${steamUserId}:`, error);
        throw error;
    }
}