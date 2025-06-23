import { karin, segment } from 'node-karin';
import { screenshotSteamServices } from '../lib/common/screenshot.js';
import { screenshotSteamCharts } from '../lib/common/SteamDBscreenshot.js';

/**
 * #steam服务器状态
 */
export const steamServices = karin.command(
  /^#查看?[Ss]team服务器状态$/,
  async (e) => {
    try {
      const base64Image = await screenshotSteamServices();
      return e.reply(segment.image(`base64://${base64Image}`));
    } catch (error) {
      logger.error('Error serving steam services image:', error);
      return e.reply('服务器状态截图失败，请稍后再试');
    }
  },
  {
    name: 'steam_services',
    desc: 'Steam服务器状态截图',
    priority: 1000,
    permission: 'all'
  }
);

/**
 * #steam排行
 */
export const steamCharts = karin.command(
  /^#[Ss]team排行$/,
  async (e) => {
    try {
      const base64Image = await screenshotSteamCharts();
      return e.reply(segment.image(`base64://${base64Image}`));
    } catch (error) {
      logger.error('Error serving steam charts image:', error);
      return e.reply('Steam排行页面截图失败，请稍后再试');
    }
  },
  {
    name: 'steam_charts',
    desc: 'Steam排行榜截图',
    priority: 1000,
    permission: 'all'
  }
);

export default [steamServices, steamCharts];