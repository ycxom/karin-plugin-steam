import { plugin, segment } from 'node-karin';
import { screenshotSteamServices } from '../lib/common/screenshot.js';
import { screenshotSteamCharts } from '../lib/common/SteamDBscreenshot.js';

export class SteamPlugin extends plugin {
  constructor() {
    super({
      name: 'SteamPlugin',
      dsc: '查询 Steam ID 状态的插件',
      priority: 1000,
      rule: [
        {
          reg: /^#[Ss]team服务器状态$/,
          fnc: 'SteamServices'
        },
        {
          reg: /^#[Ss]team排行$/,//未完成的功能，没能成功过cf盾，请求大佬帮帮
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
