import db from './db.js';
import { debuglog } from '../debuglog.js';

// --- 用户绑定相关操作 ---

export function bindSteam(qqId, steamId, alias) {
    return new Promise(async (resolve, reject) => {
        const existingBindings = await getBoundAccountsByQQ(qqId);
        const isDefault = existingBindings.length === 0 ? 1 : 0;

        const sql = 'INSERT INTO user_steam_bindings (qq_id, steam_id, alias, is_default, binding_time) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)';
        db.run(sql, [String(qqId), steamId, alias, isDefault], function (err) {
            if (err) {
                // 将数据库层面的约束错误直接拒绝，由上层处理
                return reject(err);
            }
            resolve(this);
        });
    });
}

export function unbindSteam(qqId, alias) {
    return new Promise(async (resolve, reject) => {
        const bindingToRemove = await getBoundAccountByAlias(qqId, alias);
        if (!bindingToRemove) {
            return reject(new Error('未找到指定别名的绑定。'));
        }

        const sql = 'DELETE FROM user_steam_bindings WHERE qq_id = ? AND alias = ?';
        db.run(sql, [String(qqId), alias], async function (err) {
            if (err) return reject(err);

            if (this.changes > 0 && bindingToRemove.is_default) {
                const remainingBindings = await getBoundAccountsByQQ(qqId);
                if (remainingBindings.length > 0) {
                    await setDefaultSteam(qqId, remainingBindings[0].alias);
                }
            }
            resolve(this);
        });
    });
}

export function setDefaultSteam(qqId, alias) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            db.run('UPDATE user_steam_bindings SET is_default = 0 WHERE qq_id = ?', [String(qqId)], (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                }
                const sql = 'UPDATE user_steam_bindings SET is_default = 1 WHERE qq_id = ? AND alias = ?';
                db.run(sql, [String(qqId), alias], function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                    }
                    db.run('COMMIT', (err) => {
                        if (err) return reject(err);
                        resolve(this);
                    });
                });
            });
        });
    });
}

export function getBoundAccountsByQQ(qqId) {
    const sql = 'SELECT steam_id, alias, is_default FROM user_steam_bindings WHERE qq_id = ? ORDER BY binding_time ASC';
    return new Promise((resolve, reject) => {
        db.all(sql, [String(qqId)], (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

export function getBoundAccountByAlias(qqId, alias) {
    const sql = 'SELECT steam_id, alias, is_default FROM user_steam_bindings WHERE qq_id = ? AND alias = ?';
    return new Promise((resolve, reject) => {
        db.get(sql, [String(qqId), alias], (err, row) => {
            if (err) return reject(err);
            resolve(row || null);
        });
    });
}

export function getDefaultSteamIdByQQ(qqId) {
    const sql = 'SELECT steam_id FROM user_steam_bindings WHERE qq_id = ? AND is_default = 1';
    return new Promise((resolve, reject) => {
        db.get(sql, [String(qqId)], (err, row) => {
            if (err) return reject(err);
            if (row) return resolve(row.steam_id);
            // 如果没有默认的，返回第一个绑定的
            db.get('SELECT steam_id FROM user_steam_bindings WHERE qq_id = ? ORDER BY binding_time ASC LIMIT 1', [String(qqId)], (err, firstRow) => {
                if (err) return reject(err);
                resolve(firstRow ? firstRow.steam_id : null);
            });
        });
    });
}

export function getSteamIdsByQQ(qqId) {
    const sql = 'SELECT steam_id FROM user_steam_bindings WHERE qq_id = ?';
    return new Promise((resolve, reject) => {
        db.all(sql, [String(qqId)], (err, rows) => {
            if (err) return reject(err);
            resolve(rows.map(row => row.steam_id));
        });
    });
}

export function getQQBySteamId(steamId) {
    const sql = 'SELECT qq_id FROM user_steam_bindings WHERE steam_id = ?';
    return new Promise((resolve, reject) => {
        db.all(sql, [steamId], (err, rows) => {
            if (err) return reject(err);
            resolve(rows.map(row => row.qq_id));
        });
    });
}

// --- 用户播报控制 ---

export function setUserGroupBroadcast(qqId, groupId, enabled, alias = 'global') {
    const sql = 'REPLACE INTO user_group_settings (qq_id, group_id, steam_alias, broadcast_enabled) VALUES (?, ?, ?, ?)';
    return new Promise((resolve, reject) => {
        db.run(sql, [String(qqId), String(groupId), alias, enabled ? 1 : 0], function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

export function getUserGroupBroadcast(qqId, groupId, alias) {
    const sql = 'SELECT broadcast_enabled FROM user_group_settings WHERE qq_id = ? AND group_id = ? AND steam_alias = ?';
    return new Promise((resolve, reject) => {
        db.get(sql, [String(qqId), String(groupId), alias], (err, row) => {
            if (err) return reject(err);
            resolve(row ? Boolean(row.broadcast_enabled) : true);
        });
    });
}

export function setUserGroupInventoryBroadcast(qqId, groupId, enabled, alias = 'global') {
    const sql = 'REPLACE INTO user_group_settings (qq_id, group_id, steam_alias, inventory_enabled) VALUES (?, ?, ?, ?)';
    return new Promise((resolve, reject) => {
        db.run(sql, [String(qqId), String(groupId), alias, enabled ? 1 : 0], function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

export function getUserGroupInventoryBroadcast(qqId, groupId, alias) {
    const sql = 'SELECT inventory_enabled FROM user_group_settings WHERE qq_id = ? AND group_id = ? AND steam_alias = ?';
    return new Promise((resolve, reject) => {
        db.get(sql, [String(qqId), String(groupId), alias], (err, row) => {
            if (err) return reject(err);
            resolve(row ? Boolean(row.inventory_enabled) : true);
        });
    });
}

export function setUserAllGroupsBroadcast(qqId, enabled, alias) {
    const targetAlias = alias === 'global' ? '%' : alias;
    const sql = `UPDATE user_steam_bindings SET all_groups_broadcast_enabled = ? WHERE qq_id = ? AND alias LIKE ?`;
    return new Promise((resolve, reject) => {
        db.run(sql, [enabled ? 1 : 0, String(qqId), targetAlias], function (err) {
            if (err) return reject(err);
            resolve(this.changes);
        });
    });
}

export function getUserAllGroupsBroadcast(qqId, alias) {
    const sql = 'SELECT all_groups_broadcast_enabled FROM user_steam_bindings WHERE qq_id = ? AND alias = ?';
    return new Promise((resolve, reject) => {
        db.get(sql, [String(qqId), alias], (err, row) => {
            if (err) return reject(err);
            resolve(row ? Boolean(row.all_groups_broadcast_enabled) : true);
        });
    });
}

export function setUserAllGroupsInventoryBroadcast(qqId, enabled, alias) {
    const targetAlias = alias === 'global' ? '%' : alias;
    const sql = `UPDATE user_steam_bindings SET all_groups_inventory_enabled = ? WHERE qq_id = ? AND alias LIKE ?`;
    return new Promise((resolve, reject) => {
        db.run(sql, [enabled ? 1 : 0, String(qqId), targetAlias], function (err) {
            if (err) return reject(err);
            resolve(this.changes);
        });
    });
}

export function getUserAllGroupsInventoryBroadcast(qqId, alias) {
    const sql = 'SELECT all_groups_inventory_enabled FROM user_steam_bindings WHERE qq_id = ? AND alias = ?';
    return new Promise((resolve, reject) => {
        db.get(sql, [String(qqId), alias], (err, row) => {
            if (err) return reject(err);
            resolve(row ? Boolean(row.all_groups_inventory_enabled) : true);
        });
    });
}


// --- 其它函数保持不变 ---

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

export function updateGameChineseName(appid, chineseName) {
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

export function readInventoryCache(steamId) {
    const sql = 'SELECT game_appids FROM user_inventory_cache WHERE steam_id = ?';
    return new Promise((resolve, reject) => {
        db.get(sql, [steamId], (err, row) => {
            if (err) return reject(err);
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

export function setInventoryMonitoring(qqId, enabled, alias) {
    const targetAlias = alias === 'global' ? '%' : alias;
    const sql = `UPDATE user_steam_bindings SET inventory_monitoring_enabled = ? WHERE qq_id = ? AND alias LIKE ?`;
    return new Promise((resolve, reject) => {
        db.run(sql, [enabled ? 1 : 0, String(qqId), targetAlias], function (err) {
            if (err) return reject(err);
            resolve(this.changes);
        });
    });
}

export function getAllSteamIdsWithInventoryMonitoringEnabled() {
    const sql = `
        SELECT T1.steam_id, T1.alias, T1.qq_id
        FROM user_steam_bindings T1
        WHERE T1.inventory_monitoring_enabled = 1
    `;
    return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

export function getAllGroupBindings() {
    const sql = 'SELECT group_id, steam_id FROM group_steam_bindings';
    return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}
