import { karin, segment } from 'node-karin';
import { readData } from '../lib/main/readwritefile.js';
import {  fetchSteamStatus } from '../lib/main/fetchSteamStatus.js';
import { screenshotSteamProfile, screenshotSteamFriends } from '../lib/common/screenshot.js';

export const queryUserSteam = karin.command(/^#查看[Ss]team$/, async (e) => {
  
    /** 存在at */
    if (e.at.length) {
      const qq = e.at[0]
      const data = readData();
      const steamID = data[qq];
      if (!steamID) {
        e.reply(`QQ号 ${qq} 未绑定Steam账号。`);
        return;
      }
      try {
        const status = await fetchSteamStatus(steamID);
        const result = await screenshotSteamProfile(steamID);
        if (result.error) {
          e.reply(result.error);
        } else if (result.image) {
          e.reply(segment.image(`base64://${result.image}`));
        } else {
          e.reply(formatSteamStatus(status));
        }
      } catch (error) {
        e.reply('查询失败，请稍后再试');
        console.error('Error querying other Steam status:', error);
      }

    } else {
      console.log('未atqq')
      e.reply('请at绑定Steam账号的QQ')
    }
  },{ name: 'queryUserSteam', priority: '1000', permission: 'all'})
  

  export const queryUserSteamFriends = karin.command(/^#查看[Ss]team好友$/, async (e) => {

    /** 存在at */
    if (e.at.length) {
      const qq = e.at[0]
      const data = readData();
      const steamID = data[qq];
      if (!steamID) {
        e.reply(`QQ号 ${qq} 未绑定Steam账号。`);
        return;
      }
      try {
        const result = await screenshotSteamFriends(steamID);
        if (result.error) {
          e.reply(result.error);
        } else if (result.image) {
          e.reply(segment.image(`base64://${result.image}`));
        } else {
          e.reply(formatSteamStatus(status));
        }
      } catch (error) {
        e.reply('查询失败，请稍后再试');
        console.error('Error querying other Steam status:', error);
      }

    } else {
      console.log('未atqq')
      e.reply('请at绑定Steam账号的QQ')
    }
  },{ name: 'queryUserSteamFriends', priority: '1000', permission: 'all'})