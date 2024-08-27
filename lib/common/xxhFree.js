import fs from 'fs';
import { logger, Bot, segment, karin } from 'node-karin';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import puppeteer from 'puppeteer';
import schedule from 'node-schedule';
import Config from '../config.js';
import Handlebars from 'handlebars';
import { getEnabledGroups, writeDataToFile, readDataFromFile } from '../main/readwritefile.js';

const RSS_URL = 'https://rsshub.rssforever.com/xiaoheihe/add2cart/steam';
const TEMPLATE_FILE = `${Config.dirPath}/resources/template/steamFreebiesTemplate.html`;

/**
 * 获取小黑盒 Steam 喜加一信息
 */
export async function fetchSteamFreebies() {
    try {
        const response = await axios.get(RSS_URL);
        if (response.status !== 200) {
            throw new Error('无法访问RSS订阅链接');
        }

        // 解析XML内容
        const result = await parseStringPromise(response.data);

        // 从解析的内容中提取需要的信息
        const items = result.rss.channel[0].item;
        const freebies = items.map(item => ({
            title: item.title[0],
            description: item.description[0],
            link: item.link[0],
            pubDate: item.pubDate[0]
        }));

        return freebies;
    } catch (error) {
        logger.error(`[fetchSteamFreebies] 获取 Steam 喜加一信息时出错: ${error.message}`);
        throw error;
    }
}

/**
 * 渲染HTML
 */
export function renderHtml(freebies) {
    const template = fs.readFileSync(TEMPLATE_FILE, 'utf8');
    const compiledTemplate = Handlebars.compile(template);
    return compiledTemplate({ freebies });
}

/**
 * 使用 Puppeteer 渲染 HTML 并返回 Base64 编码的截图
 */
export async function captureScreenshotAsBase64(htmlContent) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // 设置页面内容
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // 截图并返回 base64 编码
    const screenshotBase64 = await page.screenshot({ encoding: 'base64', fullPage: true });

    await browser.close();
    return screenshotBase64;
}

/**
 * 生成喜加一链接消息
 */
export function generateSteamLinksMessage(freebies) {
    let message = '以下是最新的 Steam 喜加一链接：\n\n';
    freebies.forEach(freebie => {
        message += `🎁 ${freebie.title}\n链接: ${freebie.link}\n\n`;
    });
    return message;
}

/**
 * 深度比较两个对象
 */
function deepEqual(obj1, obj2) {
    if (obj1 === obj2) return true;
    if (obj1 == null || obj2 == null) return false;
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;

    let keys1 = Object.keys(obj1);
    let keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (let key of keys1) {
        if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) return false;
    }

    return true;
}

/**
 * 监控数据变化并发送更新到已开启播报的群聊
 */
async function monitorAndSendUpdates() {
    const newData = await fetchSteamFreebies();
    const oldData = readDataFromFile();

    // 增加调试日志，查看新旧数据
    logger.log('[monitorAndSendUpdates] 新数据:', JSON.stringify(newData, null, 2));
    logger.log('[monitorAndSendUpdates] 旧数据:', JSON.stringify(oldData, null, 2));

    if (!deepEqual(newData, oldData)) {
        // 数据发生变化，发送更新
        logger.log('[monitorAndSendUpdates] 检测到数据变化，发送更新');

        const htmlContent = renderHtml(newData);
        const screenshotBase64 = await captureScreenshotAsBase64(htmlContent);
        const textMessage = generateSteamLinksMessage(newData);

        const enabledGroups = getEnabledGroups();
        for (const groupId of enabledGroups) {
            const contact = {
                scene: 'group',
                peer: groupId,
            };

            const elements = [
                segment.text(textMessage),
                segment.image(`base64://${screenshotBase64}`)
            ];

            Bot.sendMsg(Config.Config.qq, contact, elements);
        }

        // 更新文件内容
        writeDataToFile(newData);
    } else {
        logger.log('[monitorAndSendUpdates] 数据没有变化');
    }
}

/**
 * 定时任务，设置为每天00:00执行
 */
export function scheduleXXHUpdate() {
    schedule.scheduleJob('0 0 * * *', async () => {
        logger.log('[Karin-plugin-steam] 开始定时任务获取 Steam 喜加一信息');
        await monitorAndSendUpdates();
    });
}