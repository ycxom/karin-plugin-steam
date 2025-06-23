import { karin, segment } from 'node-karin';
import { serveBase64ImageForHelp } from '../lib/common/screenshot.js';

export const steamHelp = karin.command(
  /^#[Ss]team帮助$/,
  async (e) => {
    try {
      const base64Image = await serveBase64ImageForHelp();
      return e.reply(segment.image(`base64://${base64Image}`));
    } catch (error) {
      logger.error('Error serving help image:', error);
      return e.reply('帮助页面加载失败，请稍后再试');
    }
  },
  {
    name: 'steam_help',
    desc: 'Steam帮助图片',
    priority: 1000,
    permission: 'all'
  }
);

export default [steamHelp];