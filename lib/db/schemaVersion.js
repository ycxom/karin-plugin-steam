import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { __dirname } from '../../utils/dir.js';
import { logger } from 'node-karin';
import { debuglog } from '../debuglog.js';


const dataDir = path.resolve(__dirname, 'data');
const schemaFilePath = path.resolve(__dirname, 'lib/db/db.js');
const md5FilePath = path.join(dataDir, 'schema.md5');

/**
 * 检查数据库结构定义文件 (db.js) 自上次成功迁移以来是否已更改。
 * @returns {Promise<boolean>} - 如果文件已更改，则返回 true，否则返回 false。
 */
export async function hasSchemaChanged() {
    try {
        if (!fs.existsSync(schemaFilePath)) {
            logger.warn('[SchemaCheck] 结构定义文件 (db.js) 未找到。');
            return false;
        }

        const schemaFileContent = fs.readFileSync(schemaFilePath, 'utf8');
        const currentSchemaHash = crypto.createHash('md5').update(schemaFileContent).digest('hex');

        let previousSchemaHash = null;
        if (fs.existsSync(md5FilePath)) {
            previousSchemaHash = fs.readFileSync(md5FilePath, 'utf8');
        }

        return currentSchemaHash !== previousSchemaHash;
    } catch (error) {
        logger.error('[SchemaCheck] 检查 schema 版本时出错:', error);
        return true; // 为安全起见，在出错时假定已更改
    }
}

/**
 * 将当前 schema 文件的哈希值更新并保存到记录文件中。
 */
export function updateSchemaVersion() {
    try {
        const schemaFileContent = fs.readFileSync(schemaFilePath, 'utf8');
        const currentSchemaHash = crypto.createHash('md5').update(schemaFileContent).digest('hex');
        fs.writeFileSync(md5FilePath, currentSchemaHash, 'utf8');
        debuglog('[SchemaCheck] Schema 版本记录已更新。');
    } catch (error) {
        logger.error('[SchemaCheck] 更新 schema 版本记录失败:', error);
    }
}
