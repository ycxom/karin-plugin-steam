import { generateSteamUI } from '../common/generateSteamUI.js';
import { getValidatedSteamUser } from './FriendCode.js';
import { fetchFriendListAPI, fetchPlayersSummariesAPI, fetchPlayerProfileAPI } from './fetchSteamStatus.js';
import { debuglog } from '../debuglog.js'; // **新增导入**

/**
 * 渲染好友列表的核心逻辑函数。
 * @param {string} steamId - 目标用户的64位SteamID。
 * @returns {Promise<string>} - 一个解析为图片Base64字符串的Promise。
 * @throws {Error} - 如果获取或渲染失败，则抛出错误。
 */
export async function renderFriendsListImage(steamId) {
    debuglog(`[renderFriendsListImage] 开始为 SteamID: ${steamId} 渲染好友列表图片。`);

    // 1. 使用API获取好友ID列表
    const friendIDs = await fetchFriendListAPI(steamId);
    debuglog(`[renderFriendsListImage] 获取到 ${friendIDs.length} 个好友ID，准备批量查询摘要信息...`);

    if (!friendIDs || friendIDs.length === 0) {
        const user = await getValidatedSteamUser(steamId);
        throw new Error(`${user ? user.personaname : '该用户'} 没有公开的好友或好友列表为空。`);
    }

    // 2. 批量获取好友的摘要和个人资料（头像框等）
    const playersSummaries = await fetchPlayersSummariesAPI(friendIDs);
    if (playersSummaries.size === 0) {
        throw new Error('未能获取到任何好友的有效状态。');
    }

    const profilePromises = friendIDs
        .filter(id => playersSummaries.has(id))
        .map(id => fetchPlayerProfileAPI(id).then(profile => ({ steamID: id, profile })));

    const profiles = await Promise.all(profilePromises);
    const profileMap = new Map(profiles.map(p => [p.steamID, p.profile]));

    // 3. 整理数据以适配HTML模板
    const steamStatuses = [];
    for (const friendId of friendIDs) {
        const summary = playersSummaries.get(friendId);
        if (!summary) continue;

        const profile = profileMap.get(friendId);
        const personastate = summary.personastate || 0;
        const isInGame = !!summary.gameextrainfo;
        const statusMap = { 1: '在线', 2: '正忙', 3: '离开', 4: '打盹', 5: '想交易', 6: '想玩游戏' };

        let profileStatusClass = 'offline';
        let profileStatusText = '当前离线';

        if (isInGame) {
            profileStatusClass = 'in-game';
            profileStatusText = `正在玩: ${summary.gameextrainfo}`;
        } else if (personastate > 0) {
            profileStatusClass = 'online';
            profileStatusText = statusMap[personastate] || '在线';
        }

        steamStatuses.push({
            actualPersonaName: summary.personaname,
            profileStatus: profileStatusText,
            profileInGameName: summary.gameextrainfo || '',
            playerAvatarImg: summary.avatarfull,
            avatarhash: summary.avatarhash,
            frameImg: profile ? profile.frameImg : null,
            communityitemid: profile ? profile.communityitemid : null,
            profileStatusClass,
            steamid: friendId
        });
    }

    if (steamStatuses.length === 0) {
        throw new Error('未能获取到任何有效的好友状态。');
    }

    debuglog(`[renderFriendsListImage] 准备将以下 ${steamStatuses.length} 条数据送入UI渲染器:`, steamStatuses);
    return generateSteamUI(steamStatuses);
}