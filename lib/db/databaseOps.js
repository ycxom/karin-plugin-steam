import db from './db.js';
import { debuglog } from '../debuglog.js';

// 用户绑定相关操作
export function bindSteam(qqId, steamId) {
    const sql = 'REPLACE INTO user_steam_bindings (qq_id, steam_id) VALUES (?, ?)';
    return new Promise((resolve, reject) => {
        db.run(sql, [String(qqId), steamId], function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

export function unbindSteam(qqId) {
    const sql = 'DELETE FROM user_steam_bindings WHERE qq_id = ?';
    return new Promise((resolve, reject) => {
        db.run(sql, [String(qqId)], function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

export function getSteamIdByQQ(qqId) {
    const sql = 'SELECT steam_id FROM user_steam_bindings WHERE qq_id = ?';
    return new Promise((resolve, reject) => {
        db.get(sql, [String(qqId)], (err, row) => {
            if (err) return reject(err);
            resolve(row ? row.steam_id : null);
        });
    });
}

export function getQQBySteamId(steamId) {
    const sql = 'SELECT qq_id FROM user_steam_bindings WHERE steam_id = ?';
    return new Promise((resolve, reject) => {
        db.get(sql, [steamId], (err, row) => {
            if (err) return reject(err);
            resolve(row ? row.qq_id : null);
        });
    });
}


// 群组与Steam成员管理
export function addSteamIdToGroup(groupId, steamId) {
    const sql = 'INSERT OR IGNORE INTO group_steam_bindings (group_id, steam_id) VALUES (?, ?)';
    return new Promise((resolve, reject) => {
        db.run(sql, [String(groupId), steamId], function (err) {
            if (err) return reject(err);
            resolve(this.changes);
        });
    });
}

export function removeSteamIdFromGroup(groupId, steamId) {
    const sql = 'DELETE FROM group_steam_bindings WHERE group_id = ? AND steam_id = ?';
    return new Promise((resolve, reject) => {
        db.run(sql, [String(groupId), steamId], function (err) {
            if (err) return reject(err);
            resolve(this.changes);
        });
    });
}

export function getSteamIdsInGroup(groupId) {
    const sql = 'SELECT steam_id FROM group_steam_bindings WHERE group_id = ?';
    return new Promise((resolve, reject) => {
        db.all(sql, [String(groupId)], (err, rows) => {
            if (err) return reject(err);
            resolve(rows.map(row => row.steam_id));
        });
    });
}

// 群组广播设置
export function setGroupBroadcast(groupId, enabled) {
    const sql = 'REPLACE INTO steam_group_settings (group_id, enabled) VALUES (?, ?)';
    return new Promise((resolve, reject) => {
        db.run(sql, [String(groupId), enabled ? 1 : 0], function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

export function getGroupBroadcastStatus(groupId) {
    const sql = 'SELECT enabled FROM steam_group_settings WHERE group_id = ?';
    return new Promise((resolve, reject) => {
        db.get(sql, [String(groupId)], (err, row) => {
            if (err) return reject(err);
            resolve(row ? Boolean(row.enabled) : false);
        });
    });
}

export function getAllEnabledGroups() {
    const sql = 'SELECT group_id FROM steam_group_settings WHERE enabled = 1';
    return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows.map(row => row.group_id));
        });
    });
}

// 状态缓存
export function updateSteamStatusCache(steam_id, status_json) {
    const sql = 'REPLACE INTO steam_status_cache (steam_id, status_json, last_updated) VALUES (?, ?, ?)';
    return new Promise((resolve, reject) => {
        db.run(sql, [steam_id, JSON.stringify(status_json), Date.now()], function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

export function readSteamStatusCache(steam_id) {
    const sql = 'SELECT status_json FROM steam_status_cache WHERE steam_id = ?';
    return new Promise((resolve, reject) => {
        db.get(sql, [steam_id], (err, row) => {
            if (err) return reject(err);
            resolve(row ? JSON.parse(row.status_json) : null);
        });
    });
}

export function readAllSteamStatusCache() {
    const sql = 'SELECT steam_id, status_json FROM steam_status_cache';
    return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
            if (err) return reject(err);
            const result = {};
            rows.forEach(r => { result[r.steam_id] = JSON.parse(r.status_json); });
            resolve(result);
        });
    });
}

// 喜加一缓存
export function readFreebiesCache() {
    const sql = 'SELECT data_json FROM steam_freebie_cache WHERE id = 0';
    return new Promise((resolve, reject) => {
        db.get(sql, [], (err, row) => {
            if (err) return reject(err);
            resolve(row ? JSON.parse(row.data_json) : []);
        });
    });
}

export function writeFreebiesCache(data) {
    const sql = 'REPLACE INTO steam_freebie_cache (id, data_json, updated) VALUES (0, ?, CURRENT_TIMESTAMP)';
    return new Promise((resolve, reject) => {
        db.run(sql, [JSON.stringify(data)], function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

// 游戏列表更新
export function updateGameList(apps) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION', err => { if (err) return reject(err); });

            const stmt = db.prepare('REPLACE INTO steam_game_list (appid, name) VALUES (?, ?)');
            for (const app of apps) {
                stmt.run(app.appid, app.name, err => { if (err) return reject(err); });
            }
            stmt.finalize(err => { if (err) return reject(err); });

            db.run('COMMIT', (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                }
                resolve();
            });
        });
    });
}

export function getGameList() {
    const sql = 'SELECT appid, name, name_zh FROM steam_game_list';
    return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

/**
 * 更新游戏的中文名称
 * @param {number} appid 游戏ID
 * @param {string} chineseName 游戏中文名
 */
export function updateGameChineseName(appid, chineseName) {
    // 仅在中文名为空时更新，避免重复写入
    const sql = 'UPDATE steam_game_list SET name_zh = ? WHERE appid = ? AND (name_zh IS NULL OR name_zh = "")';
    return new Promise((resolve, reject) => {
        db.run(sql, [chineseName, appid], function (err) {
            if (err) return reject(err);
            if (this.changes > 0) {
                debuglog(`[数据库] 已更新游戏 ${appid} 的中文名为 "${chineseName}"`);
            }
            resolve(this);
        });
    });
}

// 用户库存缓存
export function readInventoryCache(steamId) {
    const sql = 'SELECT game_appids FROM user_inventory_cache WHERE steam_id = ?';
    return new Promise((resolve, reject) => {
        db.get(sql, [steamId], (err, row) => {
            if (err) return reject(err);
            // 如果有记录，则按逗号分割成数组；否则返回空数组
            resolve(row ? row.game_appids.split(',') : []);
        });
    });
}


export function writeInventoryCache(steamId, appids) {
    const appidsString = appids.join(',');
    const sql = 'REPLACE INTO user_inventory_cache (steam_id, game_appids) VALUES (?, ?)';
    return new Promise((resolve, reject) => {
        db.run(sql, [steamId, appidsString], function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}


/**
 * 设置用户的库存监控状态
 * @param {string} qqId 用户的QQ号
 * @param {boolean} enabled 是否启用
 */
export function setInventoryMonitoring(qqId, enabled) {
    const sql = 'UPDATE user_steam_bindings SET inventory_monitoring_enabled = ? WHERE qq_id = ?';
    return new Promise((resolve, reject) => {
        // 将布尔值转换为 1 或 0
        db.run(sql, [enabled ? 1 : 0, String(qqId)], function (err) {
            if (err) return reject(err);
            resolve(this.changes); // 返回影响的行数，用于判断是否成功
        });
    });
}

/**
 * 获取所有开启了库存监控的用户的SteamID
 * @returns {Promise<string[]>}
 */
export function getAllSteamIdsWithInventoryMonitoringEnabled() {
    // inventory_monitoring_enabled IS NOT 0 这个条件可以正确处理新用户(值为1)和老用户(值为NULL)
    const sql = 'SELECT steam_id FROM user_steam_bindings WHERE inventory_monitoring_enabled IS NOT 0';
    return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows.map(row => row.steam_id));
        });
    });
}

/**
 * 获取所有的群聊-SteamID绑定关系
 * @returns {Promise<Array<{group_id: string, steam_id: string}>>}
 */
export function getAllGroupBindings() {
    const sql = 'SELECT group_id, steam_id FROM group_steam_bindings';
    return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

// --- 新增用户控制功能 ---

// 设置用户在特定群聊的播报开关
export function setUserGroupBroadcast(qqId, groupId, enabled) {
    const sql = 'REPLACE INTO user_group_settings (qq_id, group_id, broadcast_enabled) VALUES (?, ?, ?)';
    return new Promise((resolve, reject) => {
        db.run(sql, [String(qqId), String(groupId), enabled ? 1 : 0], function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

// 获取用户在特定群聊的播报状态
export function getUserGroupBroadcast(qqId, groupId) {
    const sql = 'SELECT broadcast_enabled FROM user_group_settings WHERE qq_id = ? AND group_id = ?';
    return new Promise((resolve, reject) => {
        db.get(sql, [String(qqId), String(groupId)], (err, row) => {
            if (err) return reject(err);
            resolve(row ? Boolean(row.broadcast_enabled) : true); // 默认为开启
        });
    });
}

// 设置用户在特定群聊的库存播报开关
export function setUserGroupInventoryBroadcast(qqId, groupId, enabled) {
    const sql = 'REPLACE INTO user_group_settings (qq_id, group_id, inventory_enabled) VALUES (?, ?, ?)';
    return new Promise((resolve, reject) => {
        db.run(sql, [String(qqId), String(groupId), enabled ? 1 : 0], function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

// 获取用户在特定群聊的库存播报状态
export function getUserGroupInventoryBroadcast(qqId, groupId) {
    const sql = 'SELECT inventory_enabled FROM user_group_settings WHERE qq_id = ? AND group_id = ?';
    return new Promise((resolve, reject) => {
        db.get(sql, [String(qqId), String(groupId)], (err, row) => {
            if (err) return reject(err);
            resolve(row ? Boolean(row.inventory_enabled) : true); // 默认为开启
        });
    });
}

// 设置用户在所有群聊的状态播报总开关
export function setUserAllGroupsBroadcast(qqId, enabled) {
    const sql = 'UPDATE user_steam_bindings SET all_groups_broadcast_enabled = ? WHERE qq_id = ?';
    return new Promise((resolve, reject) => {
        db.run(sql, [enabled ? 1 : 0, String(qqId)], function (err) {
            if (err) return reject(err);
            resolve(this.changes);
        });
    });
}

// 获取用户在所有群聊的状态播报总开关状态
export function getUserAllGroupsBroadcast(qqId) {
    const sql = 'SELECT all_groups_broadcast_enabled FROM user_steam_bindings WHERE qq_id = ?';
    return new Promise((resolve, reject) => {
        db.get(sql, [String(qqId)], (err, row) => {
            if (err) return reject(err);
            resolve(row ? Boolean(row.all_groups_broadcast_enabled) : true); // 默认为开启
        });
    });
}

// 设置用户在所有群聊的库存播报总开关
export function setUserAllGroupsInventoryBroadcast(qqId, enabled) {
    const sql = 'UPDATE user_steam_bindings SET all_groups_inventory_enabled = ? WHERE qq_id = ?';
    return new Promise((resolve, reject) => {
        db.run(sql, [enabled ? 1 : 0, String(qqId)], function (err) {
            if (err) return reject(err);
            resolve(this.changes);
        });
    });
}

// 获取用户在所有群聊的库存播报总开关状态
export function getUserAllGroupsInventoryBroadcast(qqId) {
    const sql = 'SELECT all_groups_inventory_enabled FROM user_steam_bindings WHERE qq_id = ?';
    return new Promise((resolve, reject) => {
        db.get(sql, [String(qqId)], (err, row) => {
            if (err) return reject(err);
            resolve(row ? Boolean(row.all_groups_inventory_enabled) : true); // 默认为开启
        });
    });
}