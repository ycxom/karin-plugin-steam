import { dirPath } from '../config.js';
import path from 'path';
import fs from 'fs';
import { debuglog } from '../debuglog.js';

/**
 * 动态扫描 'apps' 目录并解析命令信息
 * @returns {{all: Array, admin: Array, master: Array}}
 */
export function scanCommands() {
    const appsDir = path.resolve(dirPath, 'apps');
    const files = fs.readdirSync(appsDir).filter(file => file.endsWith('.js'));
    const commands = { all: [], admin: [], master: [] };

    const commandRegex = /karin\.command\(\s*\/\^(.+?)\$\/i?s?m?g?,\s*async\s*\([\s\S]*?\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\{[\s\S]*?desc:\s*'([^']*)'[\s\S]*?permission:\s*'([^']*)'[\s\S]*?\}\s*\);/g;

    for (const file of files) {
        const content = fs.readFileSync(path.join(appsDir, file), 'utf-8');
        let match;
        while ((match = commandRegex.exec(content)) !== null) {
            const permission = match[3];
            if (commands[permission]) {
                const trigger = match[1]
                    .replace(/\[Ss\]team/g, 'Steam')
                    .replace(/\\s\*/g, ' ')
                    .replace(/\(\.\+\)/g, '...')
                    .replace(/\(\?:@\s\*\\d\+\s\*\)\?/g, '[@对方]')
                    .replace(/\s*$/, '');

                commands[permission].push({
                    usage: `${trigger}`,
                    desc: match[2]
                });
            }
        }
    }
    debuglog('扫描到的命令:', commands);
    return commands;
}