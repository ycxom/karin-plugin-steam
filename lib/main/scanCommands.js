import { dirPath } from '../config.js';
import path from 'path';
import fs from 'fs';
import { debuglog } from '../debuglog.js';
import { hasCommandsChanged, updateCommandsVersion } from './commandsVersion.js';
import { logger } from 'node-karin';

const appsDir = path.resolve(dirPath, 'apps');
const commandsCachePath = path.resolve(dirPath, 'data/commands.json');

/**
 * 动态扫描 'apps' 目录并解析命令信息, 优先从缓存读取
 * @returns {Promise<{all: Array, admin: Array, master: Array}>}
 */
export async function scanCommands() {
    const useCache = fs.existsSync(commandsCachePath) && !(await hasCommandsChanged());

    if (useCache) {
        try {
            debuglog('[scanCommands] "apps" 目录未变更，从缓存加载命令...');
            const cachedCommands = JSON.parse(fs.readFileSync(commandsCachePath, 'utf-8'));
            return cachedCommands;
        } catch (error) {
            logger.warn('[scanCommands] 读取命令缓存失败，将重新扫描:', error);
        }
    }

    debuglog('[scanCommands] "apps" 目录已变更或缓存不存在，开始扫描...');
    const files = fs.readdirSync(appsDir).filter(file => file.endsWith('.js'));
    const commands = { all: [], admin: [], master: [] };

    // 主正则表达式，捕获触发器（无论何种形式）和完整的 options 对象字符串
    const commandRegex = /karin\.command\(\s*(\/.+?\/[igmsu]*|'[^']+'|"[^"]+")\s*,\s*async[\s\S]+?({[\s\S]*?permission\s*:\s*['"][^'"]+['"][\s\S]*?})\s*\);/g;

    // **关键修复**：辅助正则表达式现在同时支持单引号和双引号
    const descRegex = /desc\s*:\s*['"]([^'"]+)['"]/;
    const permissionRegex = /permission\s*:\s*['"]([^'"]+)['"]/;

    for (const file of files) {
        const content = fs.readFileSync(path.join(appsDir, file), 'utf-8');
        let match;
        while ((match = commandRegex.exec(content)) !== null) {
            const rawTriggerWithDelimiters = match[1];
            const optionsStr = match[2];

            const permissionMatch = optionsStr.match(permissionRegex);

            if (permissionMatch) {
                let permission = permissionMatch[1];
                if (permission === 'everyone') {
                    permission = 'all';
                }

                if (commands[permission]) {
                    const descMatch = optionsStr.match(descRegex);
                    const desc = descMatch ? descMatch[1] : '（无描述）';

                    const rawTrigger = rawTriggerWithDelimiters.replace(/^\/|\/[igmsu]*$/g, '').replace(/^['"]|['"]$/g, '');

                    // **关键修复**：再次优化 usage 清理逻辑
                    const trigger = `#` + rawTrigger
                        .replace(/^\^#?/, '')          // 移除开头的 ^ 或 ^#
                        .replace(/\$$/, '')             // 移除结尾的 $
                        .replace(/\[Ss\]team/g, 'Steam') // 标准化
                        .replace(/\(\?:([^)]+)\)/g, (_, g1) => g1.split('|').join('/')) // (?:a|b) -> a/b
                        .replace(/\(([^|?*+(){}[\].^$]+)\|([^|?*+(){}[\].^$]+)\)/g, '$1/$2') // (a|b) -> a/b (更安全的版本)
                        .replace(/\?/, '')              // 移除可选的 '?' 字符
                        .replace(/\\s\+/g, ' ')         // \s+ -> space
                        .replace(/\\s\*/g, ' ')         // \s* -> space
                        .replace(/\(\[\^\\s\]\+\)/g, '<别名/ID>') // ([^\s]+) -> <别名/ID>
                        .replace(/\(\.\*\)/g, '[参数]')      // (.*) -> [参数]
                        .replace(/\(\.\+\)/g, '[参数]')      // (.+) -> [参数]
                        .replace(/\s+/g, ' ')          // 合并多个空格
                        .trim();                        // 清理首尾

                    commands[permission].push({
                        usage: trigger,
                        desc: desc
                    });
                }
            }
        }
    }

    try {
        if (!fs.existsSync(path.dirname(commandsCachePath))) {
            fs.mkdirSync(path.dirname(commandsCachePath), { recursive: true });
        }
        fs.writeFileSync(commandsCachePath, JSON.stringify(commands, null, 2), 'utf-8');
        updateCommandsVersion();
        debuglog('[scanCommands] 命令扫描完成，并已更新缓存和版本记录。');
    } catch (error) {
        logger.error('[scanCommands] 写入命令缓存或版本记录失败:', error);
    }

    return commands;
}