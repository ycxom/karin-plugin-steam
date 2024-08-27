import { plugin, segment } from 'node-karin';
import { screenshotSteamServices, screenshotSteamCharts } from '../lib/common/screenshot.js';

export class SteamPlugin extends plugin {
  constructor() {
    super({
      name: 'SteamPlugin',
      dsc: '查询 Steam ID 状态的插件',
      priority: 1000,
      rule: [
        {
          reg: /^#[S|s]team服务器状态$/,
          fnc: 'SteamServices'
        },
        {
          reg: /^#[S|s]team排行$/,
          fnc: 'SteamCharts'
        }
      ]
    });
  }

  async SteamServices() {
    try {
      const base64Image = await screenshotSteamServices();
      this.reply(segment.image(`base64://${base64Image}`));
    } catch (error) {
      this.reply('帮助页面加载失败，请稍后再试');
      console.error('Error serving help image:', error);
    }
  }


  async SteamCharts() {
      try {
        const base64Image = await screenshotSteamCharts();
        this.reply(segment.image(`base64://${base64Image}`));
      } catch (error) {
        this.reply('帮助页面加载失败，请稍后再试');
        console.error('Error serving help image:', error);
      }
    }
}

export default new SteamPlugin();
