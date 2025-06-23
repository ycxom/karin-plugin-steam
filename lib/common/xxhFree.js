import fs from 'fs';
import { logger, Bot, segment, karin } from 'node-karin';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import puppeteer from 'puppeteer';
import schedule from 'node-schedule';
import { Config } from '../config.js';
import Handlebars from 'handlebars';
// ✅ 修复点 1: 从 databaseOps 导入所有需要的数据库函数
import { getAllEnabledGroups, readFreebiesCache, writeFreebiesCache } from '../main/databaseOps.js';

const RSS_URL = 'https://rsshub.rssforever.com/xiaoheihe/add2cart/steam';
const TEMPLATE_FILE = `${Config.dirPath}/resources/template/steamFreebiesTemplate.html`;

/**
 * 获取最新Steam喜加一数据
 */
export async function fetchSteamFreebies() {
    try {
        const response = await axios.get(RSS_URL);
        if (response.status !== 200) throw new Error('无法访问 RSS 链接');
        const result = await parseStringPromise(response.data);
        const items = result.rss.channel[0].item || [];

        return items.map(item => {
            const description = item.description[0];
            const extract = (regex) => (description.match(regex) || [])[1] || '';

            return {
                title: item.title[0],
                description: description.replace(/<[^>]*>/g, '').trim(),
                link: item.link[0],
                pubDate: item.pubDate[0],
                imgSrc: extract(/<img src="(.*?)"/),
                rating: extract(/评分: (.*?)<br>/),
                chineseSupport: extract(/支持中文: (.*?)<br>/),
                deadline: extract(/截止时间: (.*?)<br>/)
            };
        });
    } catch (err) {
        logger.error(`[fetchSteamFreebies] 出错: ${err.message}`);
        throw err;
    }
}

/**
 * 渲染 HTML 页面
 */
export function renderHtml(freebies) {
    const template = fs.readFileSync(TEMPLATE_FILE, 'utf8');
    const compiled = Handlebars.compile(template);
    return compiled({ freebies });
}

/**
 * 生成 Puppeteer 截图 (base64)
 */
export async function captureScreenshotAsBase64(html) {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const base64 = await page.screenshot({ encoding: 'base64', fullPage: true });
    await browser.close();
    return base64;
}

/**
 * 封装 Steam 喜加一链接消息
 */
export function generateSteamLinksMessage(freebies) {
    return freebies.reduce((msg, freebie) =>
        msg + `🎁 ${freebie.title}\n链接: ${freebie.link}\n\n`,
        '以下是最新的 Steam 喜加一链接：\n\n');
}

/**
 * 深度比较对象差异
 */
function deepEqual(obj1, obj2) {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
}

/**
 * 喜加一数据监控并推送更新
 */
async function monitorAndSendUpdates() {
    try {
        const newData = await fetchSteamFreebies();
        // ✅ 修复点 3: 使用 await 调用异步函数
        const oldData = await readFreebiesCache();

        if (!deepEqual(newData, oldData)) {
            logger.log('[Steam喜加一] 检测到数据有更新，开始推送');

            const html = renderHtml(newData);
            const imgBase64 = await captureScreenshotAsBase64(html);
            const text = generateSteamLinksMessage(newData);
            // ✅ 修复点 4: 使用 await 调用异步函数
            const groups = await getAllEnabledGroups();

            for (const groupId of groups) {
                const contact = { scene: 'group', peer: groupId };
                const elements = [segment.text(text), segment.image(`base64://${imgBase64}`)];
                // Bot.sendMsg 是异步的，但如果不需要等待它完成可以不加 await
                Bot.sendMsg(Config.qq || karin.getAllBotID()[1], contact, elements);
            }

            // ✅ 修复点 5: 使用 await 调用异步函数
            await writeFreebiesCache(newData);
        } else {
            logger.log('[Steam喜加一] 数据没有更新');
        }
    } catch (err) {
        logger.error('[Steam喜加一] 获取或推送失败:', err.message);
    }
}

/**
 * 开启每日每30分钟一次的定时任务
 */
export function scheduleXXHUpdate() {
    // 这里的 return true; 会导致后面的定时任务代码不执行，您可能需要移除它
    // return true; 
    schedule.scheduleJob('*/30 * * * *', () => {
        logger.log('[Steam喜加一定时任务] 执行中');
        monitorAndSendUpdates();
    });
}