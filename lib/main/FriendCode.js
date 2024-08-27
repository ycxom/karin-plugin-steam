import Config from '../config.js';
import pkg from 'https-proxy-agent';
import axios from 'axios';


const { HttpsProxyAgent } = pkg;
const proxy = Config.Config.proxy;
const agent = new HttpsProxyAgent(proxy);

export async function getSteamID(playerIdentifier) {
  // 如果输入的是数字 ID，则直接返回
  if (/^\d{10}$/.test(playerIdentifier)) {
    playerIdentifier = convertFriendCodeToSteamID64(playerIdentifier);
    console.log(playerIdentifier)
  } else if (!/^\d{17}$/.test(playerIdentifier)) {
    playerIdentifier = await getSteamIDFromFriendCode(playerIdentifier);
  }
  return playerIdentifier;
}

export async function getSteamIDFromFriendCode(friendCode) {
    const apiKey = Config.Config.steamApiKey;
    const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${apiKey}&vanityurl=${friendCode}`;
    try {
      const response = await axios.get(url, { httpsAgent: agent });
      if (response.data && response.data.response && response.data.response.steamid) {
        return response.data.response.steamid;
      }
      console.error(`API Response: ${JSON.stringify(response.data)}`);
      throw new Error('无法转换好友代码为 SteamID');
    } catch (error) {
      console.error('Error converting friend code to SteamID:', error);
      throw new Error('无法转换好友代码为 SteamID');
    }
  }
  
  export function convertFriendCodeToSteamID64(friendCode) {
    console.log(friendCode)
  
    const base = 76561197960265728n; // SteamID64 基础值
    const code = BigInt(friendCode);
    return (code + base).toString();
  }
  