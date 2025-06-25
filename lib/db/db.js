import path from 'path';
import fs from 'fs';
import sqlite3 from 'node-karin/sqlite3';
import { __dirname } from '../../utils/dir.js';
import { migrateDatabase } from './migration.js';

const dataDir = path.resolve(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'database.db');

const db = new sqlite3.Database(dbPath);

export const schema = [
  `CREATE TABLE IF NOT EXISTS user_steam_bindings (
        qq_id TEXT PRIMARY KEY,
        steam_id TEXT NOT NULL,
        binding_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        inventory_monitoring_enabled INTEGER DEFAULT 1,
        all_groups_broadcast_enabled INTEGER DEFAULT 1,
        all_groups_inventory_enabled INTEGER DEFAULT 1
    );`,
  `CREATE TABLE IF NOT EXISTS group_steam_bindings (
        group_id TEXT,
        steam_id TEXT,
        PRIMARY KEY (group_id, steam_id)
    );`,
  `CREATE TABLE IF NOT EXISTS steam_group_settings (
        group_id TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 0
    );`,
  `CREATE TABLE IF NOT EXISTS steam_status_cache (
        steam_id TEXT PRIMARY KEY,
        status_json TEXT,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
  `CREATE TABLE IF NOT EXISTS steam_freebie_cache (
        id INTEGER PRIMARY KEY CHECK (id = 0),
        data_json TEXT,
        updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
  `CREATE TABLE IF NOT EXISTS steam_game_list (
        appid INTEGER PRIMARY KEY,
        name TEXT
    );`,
  `CREATE TABLE IF NOT EXISTS user_inventory_cache (
        steam_id TEXT PRIMARY KEY,
        game_appids TEXT NOT NULL,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
  `CREATE TABLE IF NOT EXISTS user_group_settings (
        qq_id TEXT,
        group_id TEXT,
        broadcast_enabled INTEGER DEFAULT 1,
        inventory_enabled INTEGER DEFAULT 1,
        PRIMARY KEY (qq_id, group_id)
    );`
];

/**
 * 执行建表语句，确保所有表都存在
 */
function initTables() {
  schema.forEach(sql => db.exec(sql));
}

async function initializeDatabase() {
  initTables();
  await migrateDatabase(db, schema);
}

initializeDatabase().catch(err => {
  console.error("数据库初始化或迁移失败，插件将终止!", err);
  process.exit(1);
});

export default db;