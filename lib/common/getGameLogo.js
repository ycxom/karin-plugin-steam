import { getCachedImageAsBase64 } from './getCachedImage.js';

/**
 * 封装了获取游戏封面图（header.jpg）的全部逻辑。
 * 它会自动尝试多种已知的URL格式，直到成功获取图片为止。
 * @param {object|null} details - 从Steam API获取的游戏详情对象。
 * @param {string|number} appId - 游戏的AppID。
 * @returns {Promise<string>} 一个解析为Base64图片字符串的Promise。
 */
export async function getGameLogoAsBase64(details, appId) {
    const urlsToTry = [];
    // const t = details?.assets?.t ? `?t=${details.assets.t}` : '';

    // // cdn.akamai.steamstatic.com 格式
    // if (details?.assets?.header && details?.assets?.asset_url_format) {
    //     const path = details.assets.asset_url_format.replace('${FILENAME}', details.assets.header);
    //     urlsToTry.push(`https://cdn.akamai.steamstatic.com/${path}`);
    // }

    if (details?.header_image) {
        urlsToTry.push(details.header_image);
    }

    // shared.akamai.steamstatic.com 备用格式
    if (details?.assets?.header && details?.assets?.asset_url_format) {
        const path = details.assets.asset_url_format.replace('${FILENAME}', details.assets.header);
        urlsToTry.push(`https://cdn.akamai.steamstatic.com/${path}`);
    }

    // 最传统的 steamcdn-a.akamaihd.net 回退格式
    urlsToTry.push(`https://steamcdn-a.akamaihd.net/steam/apps/${appId}/header.jpg`);

    const cacheKey = `header_${appId}`;

    return getCachedImageAsBase64(urlsToTry, cacheKey);
}