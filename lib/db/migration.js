import { logger } from 'node-karin';
import { debuglog } from '../debuglog.js';

function run(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function all(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

/**
 * 解析 CREATE TABLE 语句以提取表结构信息。
 * @param {string} sql - CREATE TABLE SQL 语句。
 * @returns {object|null} - 包含表名、列信息和主键的对象，如果解析失败则返回 null。
 */
function parseSchema(sql) {
    const tableNameMatch = sql.match(/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?/i);
    if (!tableNameMatch) return null;
    const tableName = tableNameMatch[1];

    const columns = new Map();
    let primaryKeys = [];
    const columnDefsMatch = sql.match(/\(([\s\S]*)\)/);
    if (!columnDefsMatch) return null;

    const columnDefs = columnDefsMatch[1];
    const parts = columnDefs.split(',').map(p => p.trim().replace(/(\r\n|\n|\r)/gm, " "));

    for (const part of parts) {
        const upperPart = part.toUpperCase();
        if (upperPart.startsWith('PRIMARY KEY')) {
            const pkMatch = upperPart.match(/\((.*)\)/);
            if (pkMatch) {
                primaryKeys = pkMatch[1].split(',').map(k => k.trim().replace(/`/g, ''));
            }
            continue;
        }

        if (upperPart.startsWith('FOREIGN KEY') || upperPart.startsWith('CONSTRAINT') || upperPart.startsWith('UNIQUE')) {
            continue;
        }

        const tokens = part.split(/\s+/);
        const name = tokens[0].replace(/`/g, '');
        const type = tokens[1] || '';

        const pk = upperPart.includes('PRIMARY KEY');
        let notNull = upperPart.includes('NOT NULL');

        const defaultValueMatch = part.match(/DEFAULT\s+('.*?'|\d+\.\d+|\d+|NULL|CURRENT_TIMESTAMP)/i);
        const defaultValue = defaultValueMatch ? defaultValueMatch[1] : null;

        columns.set(name, { name, type, notNull, pk, defaultValue });
        if (pk) {
            primaryKeys.push(name);
        }
    }

    // 最终修复：确保所有主键列都被正确标记为 NOT NULL
    for (const pkName of primaryKeys) {
        if (columns.has(pkName)) {
            columns.get(pkName).notNull = true;
        }
    }

    return { tableName, columns, primaryKeys };
}

/**
 * 从数据库中获取现有表的结构。
 * @param {object} db - 数据库实例。
 * @param {string} tableName - 表名。
 * @returns {Promise<object|null>} - 包含表结构信息的对象，如果表不存在则返回 null。
 */
async function getExistingSchema(db, tableName) {
    const columns = new Map();
    let primaryKeys = [];

    try {
        const tableInfo = await all(db, `PRAGMA table_info(\`${tableName}\`)`);
        if (tableInfo.length === 0) {
            return null; // 表不存在
        }

        for (const col of tableInfo) {
            columns.set(col.name, {
                name: col.name,
                type: col.type,
                notNull: col.notnull === 1,
                pk: col.pk > 0,
                defaultValue: col.dflt_value,
            });
        }

        const pkInfo = await all(db, `PRAGMA primary_key_list(\`${tableName}\`)`);
        primaryKeys = pkInfo.sort((a, b) => a.seq - b.seq).map(pk => pk.name);

        return { tableName, columns, primaryKeys };
    } catch (error) {
        if (error.message.includes("no such table")) {
            return null;
        }
        throw error;
    }
}

/**
 * 通过重建表来应用复杂的结构变更，并保留数据。
 * @param {object} db - 数据库实例。
 * @param {string} tableName - 要重建的表名。
 * @param {string} createTableSql - 新的 CREATE TABLE 语句。
 * @param {Map} existingColumns - 旧表结构的列信息。
 * @param {Map} desiredColumns - 新表结构的列信息。
 */
async function recreateTable(db, tableName, createTableSql, existingColumns, desiredColumns) {
    logger.mark(`[数据库迁移] 检测到表 ${tableName} 结构不兼容，将执行安全重建...`);

    const commonColumns = [...existingColumns.keys()].filter(colName => desiredColumns.has(colName));
    const commonColumnsStr = commonColumns.map(c => `\`${c}\``).join(', ');
    const tempTableName = `${tableName}_old_${Date.now()}`;

    try {
        await run(db, 'BEGIN TRANSACTION');

        await run(db, `ALTER TABLE \`${tableName}\` RENAME TO \`${tempTableName}\``);
        debuglog(`[数据库迁移] 1/4: 已将表 ${tableName} 备份为 ${tempTableName}。`);

        await run(db, createTableSql);
        debuglog(`[数据库迁移] 2/4: 已使用新结构创建表 ${tableName}。`);

        if (commonColumns.length > 0) {
            const copySql = `INSERT INTO \`${tableName}\` (${commonColumnsStr}) SELECT ${commonColumnsStr} FROM \`${tempTableName}\``;
            await run(db, copySql);
            debuglog(`[数据库迁移] 3/4: 已从备份表复制数据。`);
        } else {
            logger.warn(`[数据库迁移] 3/4: 新旧表无共同列，未复制任何数据。`);
        }

        await run(db, `DROP TABLE \`${tempTableName}\``);
        debuglog(`[数据库迁移] 4/4: 已删除备份表。`);

        await run(db, 'COMMIT');
        debuglog(`[数据库迁移] 表 ${tableName} 重建成功！`);
    } catch (error) {
        try {
            await run(db, 'ROLLBACK');
        } catch (rollbackError) {
            logger.error(`[数据库迁移] 事务回滚失败:`, rollbackError);
        }
        logger.error(`[数据库迁移] 重建表 ${tableName} 时发生严重错误，已回滚事务:`, error);
        throw error;
    }
}

/**
 * 智能处理数据库结构变更的主迁移函数。
 * @param {object} db - 数据库实例。
 * @param {string[]} desiredSchemaSQLs - 期望的数据库表结构（CREATE TABLE 语句数组）。
 */
export async function migrateDatabase(db, desiredSchemaSQLs) {
    logger.log('[数据库迁移] 开始智能检查数据库结构...');

    for (const sql of desiredSchemaSQLs) {
        const desiredSchema = parseSchema(sql);
        if (!desiredSchema) {
            logger.warn(`[数据库迁移] 无法解析SQL语句，已跳过: ${sql}`);
            continue;
        }

        const { tableName, columns: desiredColumns, primaryKeys: desiredPKs } = desiredSchema;
        const existingSchema = await getExistingSchema(db, tableName);

        if (!existingSchema) {
            continue;
        }

        const { columns: existingColumns, primaryKeys: existingPKs } = existingSchema;

        let needsRecreation = false;

        if (JSON.stringify(existingPKs.sort()) !== JSON.stringify(desiredPKs.sort())) {
            needsRecreation = true;
            debuglog(`[数据库迁移] 检测到表 ${tableName} 的主键发生变化。`);
        }

        if (!needsRecreation) {
            for (const [colName, existingCol] of existingColumns.entries()) {
                if (!desiredColumns.has(colName)) {
                    needsRecreation = true;
                    debuglog(`[数据库迁移] 检测到表 ${tableName} 的列 ${colName} 已被移除。`);
                    break;
                }
                const desiredCol = desiredColumns.get(colName);
                if (existingCol.type.toUpperCase() !== desiredCol.type.toUpperCase() || existingCol.notNull !== desiredCol.notNull) {
                    needsRecreation = true;
                    debuglog(`[数据库迁移] 检测到表 ${tableName} 的列 ${colName} 的定义发生变化。`);
                    break;
                }
            }
        }

        if (needsRecreation) {
            await recreateTable(db, tableName, sql, existingColumns, desiredColumns);
            continue;
        }

        for (const [colName, desiredCol] of desiredColumns.entries()) {
            if (!existingColumns.has(colName)) {
                debuglog(`[数据库迁移] 在表 ${tableName} 中发现新列: ${colName}。正在自动添加...`);
                try {
                    const colDef = `\`${desiredCol.name}\` ${desiredCol.type} ${desiredCol.notNull ? 'NOT NULL' : ''} ${desiredCol.defaultValue ? `DEFAULT ${desiredCol.defaultValue}` : ''}`;
                    await run(db, `ALTER TABLE \`${tableName}\` ADD COLUMN ${colDef}`);
                    debuglog(`[数据库迁移] 列 ${colName} 添加成功。`);
                } catch (addColError) {
                    logger.error(`[数据库迁移] 添加列 ${colName} 到表 ${tableName} 失败:`, addColError);
                }
            }
        }
    }
    logger.log('[数据库迁移] 数据库结构智能检查完毕。');
}
