import { logger, segment, karin } from 'node-karin';
import {fetchSteamFreebies,renderHtml,captureScreenshotAsBase64,generateSteamLinksMessage,scheduleXXHUpdate} from '../lib/common/xxhFree.js'
/**
 * Command: #steam喜加一
 */
export const steamFreebies = karin.command(
    /^#[Ss]team喜加一$/,
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

/**
 * 启动定时更新
 */
// scheduleXXHUpdate()