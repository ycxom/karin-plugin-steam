// lib/main/db.js
import path from 'path';
import fs from 'fs';
import sqlite3 from 'node-karin/sqlite3';
import { __dirname } from '../../utils/dir.js';

const dataDir = path.resolve(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'database.db');

const db = new sqlite3.Database(dbPath);

function initTables() {
  // 一处管理所有 CREATE TABLE
  const schema = [
    `CREATE TABLE IF NOT EXISTS user_steam_bindings (
      qq_id TEXT PRIMARY KEY,
      steam_id TEXT NOT NULL,
      binding_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    );`
  ];
  schema.forEach(sql => db.exec(sql));
}

// 只需初始化一次
initTables();

export default db;