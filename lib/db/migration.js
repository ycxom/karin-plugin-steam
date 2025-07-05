// lib/db/migration.js
import { logger } from 'node-karin';
import { debuglog } from '../debuglog.js';

// Helper functions to promisify db calls
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
 * [FIXED] Robustly parses a CREATE TABLE statement to extract schema info.
 * This version correctly handles multi-column constraints like PRIMARY KEY and UNIQUE.
 * @param {string} sql - The CREATE TABLE SQL statement.
 * @returns {object|null} - An object with tableName, columns, and primaryKeys, or null on failure.
 */
function parseSchema(sql) {
    const tableNameMatch = sql.match(/CREATE TABLE(?: IF NOT EXISTS)?\s+`?(\w+)`?/i);
    if (!tableNameMatch) return null;
    const tableName = tableNameMatch[1];

    const contentMatch = sql.match(/\(([\s\S]*)\)/);
    if (!contentMatch) return null;

    let content = contentMatch[1];
    const columns = new Map();
    let primaryKeys = [];

    const pkMatch = content.match(/PRIMARY KEY\s*\(([^)]+)\)/i);
    if (pkMatch) {
        primaryKeys = pkMatch[1].split(',').map(k => k.trim().replace(/`/g, ''));
        content = content.replace(pkMatch[0], '');
    }

    const uniqueRegex = /UNIQUE\s*\(([^)]+)\)/gi;
    content = content.replace(uniqueRegex, '');

    const parts = content.split(',').map(p => p.trim().replace(/(\r\n|\n|\r)/gm, " ")).filter(p => p);

    for (const part of parts) {
        const upperPart = part.toUpperCase();

        // Skip any other leftover constraint definitions.
        if (upperPart.startsWith('FOREIGN KEY') || upperPart.startsWith('CONSTRAINT') || upperPart.startsWith('CHECK')) {
            continue;
        }

        const tokens = part.split(/\s+/);
        const name = tokens[0].replace(/`/g, '');
        if (!name) continue;

        const type = tokens[1] || '';
        const isPkInDefinition = upperPart.includes('PRIMARY KEY');
        const notNull = upperPart.includes('NOT NULL');
        const defaultValueMatch = part.match(/DEFAULT\s+('.*?'|[0-9.-]+|NULL|CURRENT_TIMESTAMP)/i);
        const defaultValue = defaultValueMatch ? defaultValueMatch[1] : null;

        columns.set(name, { name, type, notNull, pk: isPkInDefinition, defaultValue });

        if (isPkInDefinition && !primaryKeys.includes(name)) {
            primaryKeys.push(name);
        }
    }

    for (const pkName of primaryKeys) {
        if (columns.has(pkName)) {
            columns.get(pkName).notNull = true;
        }
    }

    return { tableName, columns, primaryKeys };
}


/**
 * From the database, get the schema of an existing table.
 * @param {object} db - The database instance.
 * @param {string} tableName - The name of the table.
 * @returns {Promise<object|null>} - An object with schema info, or null if the table doesn't exist.
 */
async function getExistingSchema(db, tableName) {
    const columns = new Map();
    let primaryKeys = [];

    try {
        const tableInfo = await all(db, `PRAGMA table_info(\`${tableName}\`)`);
        if (tableInfo.length === 0) {
            return null; // Table does not exist.
        }

        for (const col of tableInfo) {
            columns.set(col.name, {
                name: col.name,
                type: col.type,
                notNull: col.notnull === 1,
                pk: col.pk > 0,
                defaultValue: col.dflt_value,
            });
            if (col.pk > 0) {
                primaryKeys[col.pk - 1] = col.name;
            }
        }

        primaryKeys = primaryKeys.filter(Boolean); // Clean up any empty spots

        return { tableName, columns, primaryKeys };
    } catch (error) {
        if (error.message.includes("no such table")) {
            return null;
        }
        throw error;
    }
}

/**
 * Recreate a table to apply complex schema changes, preserving data.
 * @param {object} db - The database instance.
 * @param {string} tableName - The name of the table to recreate.
 * @param {string} createTableSql - The new CREATE TABLE statement.
 * @param {Map} existingColumns - The column info of the old table structure.
 * @param {Map} desiredColumns - The column info of the new table structure.
 */
async function recreateTable(db, tableName, createTableSql, existingColumns, desiredColumns) {
    logger.mark(`[数据库迁移] 检测到表 ${tableName} 结构不兼容，将执行安全重建...`);

    const tempTableName = `${tableName}_old_${Date.now()}`;
    const commonColumns = [...existingColumns.keys()].filter(colName => desiredColumns.has(colName));

    let insertColumnsStr = commonColumns.map(c => `\`${c}\``).join(', ');
    let selectColumnsStr = commonColumns.map(c => `\`${c}\``).join(', ');

    // [FIX] Special handling for adding the 'alias' column during migration.
    if (desiredColumns.has('alias') && !existingColumns.has('alias') && existingColumns.has('steam_id')) {
        insertColumnsStr += ', `alias`';
        selectColumnsStr += ', `steam_id`'; // Use steam_id as the value for the new alias column.
        debuglog(`[数据库迁移] 将为表 ${tableName} 的新 'alias' 列填入 'steam_id' 的值。`);
    }

    try {
        await run(db, 'BEGIN TRANSACTION');

        await run(db, `ALTER TABLE \`${tableName}\` RENAME TO \`${tempTableName}\``);
        debuglog(`[数据库迁移] 1/4: 已将表 ${tableName} 备份为 ${tempTableName}。`);

        await run(db, createTableSql);
        debuglog(`[数据库迁移] 2/4: 已使用新结构创建表 ${tableName}。`);

        if (commonColumns.length > 0 || (desiredColumns.has('alias') && !existingColumns.has('alias'))) {
            const copySql = `INSERT INTO \`${tableName}\` (${insertColumnsStr}) SELECT ${selectColumnsStr} FROM \`${tempTableName}\``;
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
 * The main migration function that intelligently handles database schema changes.
 * @param {object} db - The database instance.
 * @param {string[]} desiredSchemaSQLs - An array of the desired CREATE TABLE statements.
 */
export async function migrateDatabase(db, desiredSchemaSQLs) {
    logger.log('[数据库迁移] 开始智能检查数据库结构...');

    for (const sql of desiredSchemaSQLs) {
        const desiredSchema = parseSchema(sql);
        if (!desiredSchema) {
            logger.warn(`[数据库迁移] 无法解析SQL语句，已跳过: ${sql}`);
            continue;
        }

        const { tableName, columns: desiredColumns } = desiredSchema;
        const existingSchema = await getExistingSchema(db, tableName);

        if (!existingSchema) {
            continue;
        }

        const { columns: existingColumns } = existingSchema;
        let needsRecreation = false;

        for (const colName of existingColumns.keys()) {
            if (!desiredColumns.has(colName)) {
                needsRecreation = true;
                debuglog(`[数据库迁移] 检测到表 ${tableName} 的列 ${colName} 已被移除。`);
                break;
            }
        }
        if (needsRecreation) {
            await recreateTable(db, tableName, sql, existingColumns, desiredColumns);
            continue;
        }

        for (const [colName, desiredCol] of desiredColumns.entries()) {
            if (existingColumns.has(colName)) {
                const existingCol = existingColumns.get(colName);
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
