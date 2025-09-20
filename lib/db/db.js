import path from 'path';
import fs from 'fs';
import sqlite3 from 'node-karin/sqlite3';
import { __dirname } from '../../utils/dir.js';
import { migrateDatabase } from './migration.js';
import { hasSchemaChanged, updateSchemaVersion } from './schemaVersion.js'; // 导入新函数
import { logger } from 'node-karin';

const dataDir = path.resolve(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'database.db');
const db = new sqlite3.Database(dbPath);

export const schema = [
  `CREATE TABLE IF NOT EXISTS user_steam_bindings (
        qq_id TEXT NOT NULL,
        steam_id TEXT NOT NULL,
        alias TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        binding_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        inventory_monitoring_enabled INTEGER DEFAULT 1,
        all_groups_broadcast_enabled INTEGER DEFAULT 1,
        all_groups_inventory_enabled INTEGER DEFAULT 1,
        PRIMARY KEY (qq_id, alias),
        UNIQUE (qq_id, steam_id)
    );`,
  `CREATE TABLE IF NOT EXISTS group_steam_bindings (
        group_id TEXT,
        steam_id TEXT,
        PRIMARY KEY (group_id, steam_id)
    );`,
  `CREATE TABLE IF NOT EXISTS steam_group_settings (
        group_id TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 0,
        game_only_mode INTEGER DEFAULT 0
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
        name TEXT,
        name_zh TEXT
    );`,
  `CREATE TABLE IF NOT EXISTS user_inventory_cache (
        steam_id TEXT PRIMARY KEY,
        game_appids TEXT NOT NULL,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
  `CREATE TABLE IF NOT EXISTS user_group_settings (
        qq_id TEXT,
        group_id TEXT,
        steam_alias TEXT,
        broadcast_enabled INTEGER,
        inventory_enabled INTEGER,
        PRIMARY KEY (qq_id, group_id, steam_alias)
    );`
];

/**
 * 执行建表语句，确保所有表都存在
 */
function initTables() {
  db.serialize(() => {
    schema.forEach(sql => db.exec(sql, (err) => {
      if (err && !err.message.includes('already exists')) {
        logger.error('数据库表初始化失败:', err);
      }
    }));
  });
}

/**
 * 带有MD5校验的数据库初始化和迁移函数
 */
async function initializeDatabase() {
  try {
    initTables();

    if (await hasSchemaChanged()) {
      logger.mark('[数据库] 检测到 schema 文件变更，将执行数据库结构更新...');

      await migrateDatabase(db, schema);
      updateSchemaVersion();

    } else {
      logger.info('[数据库] schema 文件未变更，跳过结构更新检查。');
    }
  } catch (error) {
    logger.error("数据库初始化或迁移过程中发生严重错误:", error);
    throw error;
  }
}

// 导出 promise，以便其他模块可以等待数据库准备就绪
export const dbReady = initializeDatabase().catch(err => {
  logger.error("数据库初始化或迁移失败，插件将终止!", err);
  process.exit(1);
});

export default db;
