import pkg from 'https-proxy-agent';
import { makeResilientSteamApiRequest } from '../common/apiKeyManager.js';

const { HttpsProxyAgent } = pkg;

export async function getSteamID(playerIdentifier) {
  // 如果输入的是 5-10 位数字 ID，则转换为 SteamID64
  if (/^\d{5,10}$/.test(playerIdentifier)) {
    playerIdentifier = convertFriendCodeToSteamID64(playerIdentifier);
    logger.info(playerIdentifier);
  } else if (!/^\d{17}$/.test(playerIdentifier)) {
    // 如果输入的不是 17 位数字的 SteamID64，则通过 Friend Code 获取
    playerIdentifier = await getSteamIDFromFriendCode(playerIdentifier);
  }
  return playerIdentifier;
}

export async function getSteamIDFromFriendCode(friendCode) {
  const urlBuilder = (key) => `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${friendCode}`;
  const responseData = await makeResilientSteamApiRequest(urlBuilder);

  try {
    if (responseData && responseData.response && responseData.response.success === 1 && responseData.response.steamid) {
      return responseData.response.steamid;
    } else {
      const reason = responseData?.response?.message || '请求失败或API Key无效';
      logger.error(`API未能成功解析好友代码: ${reason}`);
      throw new Error(`无法转换好友代码为 SteamID`);
    }
  } catch (error) {
    // 重新抛出错误，以便上层调用者能捕获到
    throw new Error('无法转换好友代码为 SteamID');
  }
}

export function convertFriendCodeToSteamID64(friendCode) {
  logger.info(friendCode)

  const base = 76561197960265728n; // SteamID64 基础值
  const code = BigInt(friendCode);
  return (code + base).toString();
}