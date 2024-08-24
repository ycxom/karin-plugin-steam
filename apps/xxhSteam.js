import fs from 'fs';
import { logger, Bot, segment, karin } from 'node-karin';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import puppeteer from 'puppeteer';
import schedule from 'node-schedule';  // 添加这一行导入 schedule 模块
import Config from '../lib/config.js';
import Handlebars from 'handlebars'; 
import { getEnabledGroups ,writeDataToFile, readDataFromFile } from '../lib/main/readwritefile.js';


const RSS_URL = 'https://rsshub.rssforever.com/xiaoheihe/add2cart/steam';
const TEMPLATE_FILE = `${Config.dirPath}/resources/html/steamFreebiesTemplate.html`;


/**
 * 获取小黑盒 Steam 喜加一信息
 */
async function fetchSteamFreebies() {
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
function renderHtml(freebies) {
    const template = fs.readFileSync(TEMPLATE_FILE, 'utf8');
    const compiledTemplate = Handlebars.compile(template);
    return compiledTemplate({ freebies });
}

/**
 * 使用 Puppeteer 渲染 HTML 并返回 Base64 编码的截图
 */
async function captureScreenshotAsBase64(htmlContent) {
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
function generateSteamLinksMessage(freebies) {
    let message = '以下是最新的 Steam 喜加一链接：\n\n';
    freebies.forEach(freebie => {
        message += `🎁 ${freebie.title}\n链接: ${freebie.link}\n\n`;
    });
    return message;
}

/**
 * 监控数据变化并发送更新到已开启播报的群聊
 */
async function monitorAndSendUpdates() {
    const newData = await fetchSteamFreebies();
    const oldData = readDataFromFile();

    if (JSON.stringify(newData) !== JSON.stringify(oldData)) {
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
 * 定时任务，设置为每天00:02执行
 */
schedule.scheduleJob('0 0 * * *', async () => {
    logger.log('[scheduleJob] 开始定时任务获取 Steam 喜加一信息');
    await monitorAndSendUpdates();
});

/**
 * Command: #steam喜加一
 */
export const steamFreebies = karin.command(
    /^#Steam喜加一$/,
    async (e) => {
        try {
            const freebies = await fetchSteamFreebies();
            if (freebies && freebies.length > 0) {
                const htmlContent = renderHtml(freebies);
                const screenshotBase64 = await captureScreenshotAsBase64(htmlContent);
                const linksMessage = generateSteamLinksMessage(freebies);

                // 发送文本和截图
                e.reply([
                    segment.text(linksMessage),
                    segment.image(`base64://${screenshotBase64}`)
                ]);
            } else {
                e.reply('未找到最新的 Steam 喜加一信息，请稍后再试。');
            }
        } catch (error) {
            logger.error(`获取 Steam 喜加一信息失败: ${error.message}`);
            e.reply('获取 Steam 喜加一信息时发生错误，请稍后再试。');
        }
    },
    {
        name: 'steam_freebies',
        priority: 1000,
        permission: 'everyone'
    }
);
