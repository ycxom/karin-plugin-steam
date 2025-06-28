// lib/main/FriendCode.js
import { logger } from 'node-karin';
import { makeResilientSteamApiRequest } from '../common/apiKeyManager.js';
// 引入新需要的函数
import { fetchPlayerProfileAPI } from './fetchSteamStatus.js';

/**
 * 将任意用户输入（好友代码、自定义URL、SteamID64）转换为一个经过验证的 Steam 用户对象。
 * @param {string} playerIdentifier 用户的输入。
 * @returns {Promise<object|null>} 如果成功，返回一个包含 {steamid, personaname, ...} 的对象；如果失败或用户不存在，返回 null。
 */
export async function getValidatedSteamUser(playerIdentifier) {
  let steamID = playerIdentifier;

  // 如果输入的是好友代码（通常为8-10位数字），先转换为SteamID64
  if (/^\d{8,10}$/.test(playerIdentifier)) {
    steamID = convertFriendCodeToSteamID64(playerIdentifier);
  }
  // 如果输入的不是17位标准SteamID64，则尝试通过自定义URL解析
  else if (!/^\d{17}$/.test(playerIdentifier)) {
    try {
      const vanityUrlBuilder = (key) => `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${playerIdentifier}`;
      const vanityData = await makeResilientSteamApiRequest(vanityUrlBuilder);
      if (vanityData?.response?.success === 1 && vanityData.response.steamid) {
        steamID = vanityData.response.steamid;
      } else {
        throw new Error(vanityData?.response?.message || '无法解析自定义URL');
      }
    } catch (error) {
      logger.error(`[getValidatedSteamUser] 解析自定义URL "${playerIdentifier}" 失败:`, error.message);
      return null; // 解析失败，直接返回null
    }
  }

  // 使用获取到的SteamID64进行最终验证和资料获取
  try {
    const userProfile = await fetchPlayerProfileAPI(steamID);
    if (userProfile && userProfile.actualPersonaName) {
      // 返回完整的用户对象，而不仅仅是ID
      return {
        steamid: steamID,
        personaname: userProfile.actualPersonaName,
        ...userProfile // 附加其他信息
      };
    } else {
      logger.warn(`[getValidatedSteamUser] SteamID "${steamID}" 无法获取到公开的用户资料。`);
      return null;
    }
  } catch (error) {
    logger.error(`[getValidatedSteamUser] 通过SteamID "${steamID}" 获取资料时出错:`, error);
    return null;
  }
}


/**
 * (此函数保持不变)
 * 将好友代码（短ID）转换为SteamID64。
 * @param {string} friendCode
 * @returns {string}
 */
export function convertFriendCodeToSteamID64(friendCode) {
  logger.info(`将好友代码 ${friendCode} 转换为 SteamID64...`);
  const base = 76561197960265728n; // SteamID64 基础值
  const code = BigInt(friendCode);
  return (code + base).toString();
}