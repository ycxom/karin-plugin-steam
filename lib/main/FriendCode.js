import { Config } from '../config.js';
import pkg from 'https-proxy-agent';
import axios from 'axios';
const { HttpsProxyAgent } = pkg;
const proxy = Config.proxy;

const agent = new HttpsProxyAgent(proxy);

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
  const apiKey = Config.steamApiKey;
  const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${apiKey}&vanityurl=${friendCode}`;
  try {
    const response = await axios.get(url, { httpsAgent: agent });
    if (response.data && response.data.response && response.data.response.steamid) {
      return response.data.response.steamid;
    }
    logger.error(`API Response: ${JSON.stringify(response.data)}`);
    throw new Error('无法转换好友代码为 SteamID');
  } catch (error) {
    logger.error('Error converting friend code to SteamID:', error);
    throw new Error('无法转换好友代码为 SteamID');
  }
}

export function convertFriendCodeToSteamID64(friendCode) {
  logger.info(friendCode)

  const base = 76561197960265728n; // SteamID64 基础值
  const code = BigInt(friendCode);
  return (code + base).toString();
}
