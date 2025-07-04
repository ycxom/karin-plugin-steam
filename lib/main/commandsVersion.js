import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { __dirname } from '../../utils/dir.js';
import { logger } from 'node-karin';
import { debuglog } from '../debuglog.js';

const dataDir = path.resolve(__dirname, 'data');
const appsDir = path.resolve(__dirname, 'apps');
const md5FilePath = path.join(dataDir, 'apps.md5');

/**
 * 递归获取目录中的所有文件路径
 * @param {string} dirPath 目录路径
 * @returns {string[]} 文件路径数组
 */
function getAllFiles(dirPath) {
    let files = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files = files.concat(getAllFiles(fullPath));
        } else {
            files.push(fullPath);
        }
    }
    return files;
}


/**
 * 检查 'apps' 目录自上次记录以来是否已更改。
 * @returns {Promise<boolean>} - 如果文件已更改，则返回 true，否则返回 false。
 */
export async function hasCommandsChanged() {
    try {
        if (!fs.existsSync(appsDir)) {
            logger.warn('[CommandsCheck] "apps" 目录未找到。');
            return false;
        }

        const files = getAllFiles(appsDir).filter(file => file.endsWith('.js'));
        if (files.length === 0) {
            return false; // 没有可检查的文件
        }

        const hash = crypto.createHash('md5');
        for (const file of files.sort()) { // 排序以确保一致性
            const fileContent = fs.readFileSync(file);
            hash.update(fileContent);
        }
        const currentHash = hash.digest('hex');

        let previousHash = null;
        if (fs.existsSync(md5FilePath)) {
            previousHash = fs.readFileSync(md5FilePath, 'utf8');
        }

        debuglog(`[CommandsCheck] Current Hash: ${currentHash}, Previous Hash: ${previousHash}`);
        return currentHash !== previousHash;

    } catch (error) {
        logger.error('[CommandsCheck] 检查 "apps" 目录版本时出错:', error);
        return true; // 为安全起见，在出错时假定已更改
    }
}

/**
 * 将当前 "apps" 目录内容的哈希值更新并保存到记录文件中。
 */
export function updateCommandsVersion() {
    try {
        if (!fs.existsSync(appsDir)) return;

        const files = getAllFiles(appsDir).filter(file => file.endsWith('.js'));
        if (files.length === 0) return;

        const hash = crypto.createHash('md5');
        for (const file of files.sort()) {
            const fileContent = fs.readFileSync(file);
            hash.update(fileContent);
        }
        const currentHash = hash.digest('hex');

        fs.writeFileSync(md5FilePath, currentHash, 'utf8');
        debuglog('[CommandsCheck] "apps" 目录版本记录已更新。');
    } catch (error) {
        logger.error('[CommandsCheck] 更新 "apps" 目录版本记录失败:', error);
    }
}