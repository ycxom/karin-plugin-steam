import { plugin, segment } from 'node-karin';
import { serveBase64ImageForHelp } from '../lib/common/screenshot.js';

export class SteamStatusPlugin extends plugin {
  constructor() {
    super({
      name: 'SteamStatusPlugin',
      dsc: '查询 Steam ID 状态的插件',
      priority: 1000,
      rule: [
        {
          reg: /^#[Ss]team帮助$/,
          fnc: 'showHelp'
        },
      ]
    });
  }

  async showHelp() {
    try {
      const base64Image = await serveBase64ImageForHelp();
      this.reply(segment.image(`base64://${base64Image}`));
    } catch (error) {
      this.reply('帮助页面加载失败，请稍后再试');
      console.error('Error serving help image:', error);
    }
  }
}

export default new SteamStatusPlugin();
