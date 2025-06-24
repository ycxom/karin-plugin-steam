import { logger } from 'node-karin';

// ✅ 不再从 db.js 导入任何东西，打破循环

/**
 * 获取一个表的所有列名 (现在接收 db 实例作为参数)
 * @param {object} db - 数据库实例
 * @param {string} tableName 表名
 * @returns {Promise<string[]>}
 */
function getTableColumns(db, tableName) {
    const sql = `PRAGMA table_info(${tableName})`;
    return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
            if (err) {
                if (err.message.includes("no such table")) return resolve([]);
                return reject(err);
            }
            resolve(rows.map(col => col.name));
        });
    });
}

/**
 * 向表中添加一个新的列 (现在接收 db 实例作为参数)
 * @param {object} db - 数据库实例
 * @param {string} tableName 表名
 * @param {string} columnName 新列名
 * @param {string} columnDefinition 列的完整定义
 */
function addColumnToTable(db, tableName, columnName, columnDefinition) {
    const sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`;
    return new Promise((resolve, reject) => {
        db.run(sql, [], function(err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

function parseCreateTableSQL(sql) {
    const tableNameMatch = sql.match(/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?/i);
    if (!tableNameMatch) return null;
    const tableName = tableNameMatch[1];
    const columnsMatch = sql.match(/\(([\s\S]*)\)/);
    if (!columnsMatch) return null;
    const columnsString = columnsMatch[1];
    const columns = new Map();
    const columnParts = columnsString.split(',').map(part => part.trim().replace(/(\r\n|\n|\r)/gm, " ")).filter(Boolean);
    for (const part of columnParts) {
        if (part.toUpperCase().startsWith('PRIMARY KEY') || part.toUpperCase().startsWith('FOREIGN KEY') || part.toUpperCase().startsWith('CONSTRAINT')) {
            continue;
        }
        const firstSpaceIndex = part.indexOf(' ');
        if (firstSpaceIndex === -1) continue;
        const columnName = part.substring(0, firstSpaceIndex).replace(/`/g, '');
        const columnDefinition = part.substring(firstSpaceIndex + 1).trim();
        columns.set(columnName, columnDefinition);
    }
    return { tableName, columns };
}

/**
 * 智能迁移主函数 (现在接收 db 和 schema 作为参数)
 * @param {object} db - 数据库实例
 * @param {string[]} desiredSchemaSQLs - CREATE TABLE 语句数组
 */
export async function migrateDatabase(db, desiredSchemaSQLs) {
    logger.log('[数据库迁移] 开始智能检查数据库结构...');
    try {
        const desiredSchemas = desiredSchemaSQLs.map(parseCreateTableSQL).filter(Boolean);
        for (const desired of desiredSchemas) {
            const { tableName, columns: desiredColumns } = desired;
            logger.debug(`[数据库迁移] 正在检查表: ${tableName}`);
            const existingColumns = await getTableColumns(db, tableName);
            if (existingColumns.length === 0) {
                logger.warn(`[数据库迁移] 表 ${tableName} 不存在或为空，将由 initTables 创建。`);
                continue;
            }
            for (const [columnName, columnDefinition] of desiredColumns.entries()) {
                if (!existingColumns.includes(columnName)) {
                    logger.mark(`[数据库迁移] 在表 ${tableName} 中发现缺失的列: ${columnName}。正在自动添加...`);
                    await addColumnToTable(db, tableName, columnName, columnDefinition);
                    logger.log(`[数据库迁移] 列 ${columnName} 添加成功。`);
                }
            }
        }
        logger.log('[数据库迁移] 数据库结构智能检查完毕。');
    } catch (error) {
        logger.error('[数据库迁移] 自动更新数据库结构时发生严重错误:', error);
        throw error;
    }
}