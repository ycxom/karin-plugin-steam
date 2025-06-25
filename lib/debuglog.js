import { logger } from 'node-karin';
import { Config } from './config.js';

/**
 * 一个更智能的调试日志函数 (A smarter debug log function)
 * - 自动检查调试模式 (Config.debug)。
 * - 自动将对象(Object)和数组(Array)转换为格式化的JSON字符串，使其更易于阅读。
 * - 可以像 console.log 一样接收并优雅地处理多个参数。
 */
export async function debuglog(...args) {
    // 1. 只有在调试模式开启时才继续执行
    if (!Config.debug) {
        return;
    }

    // 2. 智能地处理每一个传入的参数
    const processedArgs = args.map(arg => {
        // 如果参数是一个对象（包括数组），并且不是 null
        if (typeof arg === 'object' && arg !== null) {
            // 将其转换为格式优美的JSON字符串。
            // JSON.stringify 的第二和第三个参数 (null, 2) 是为了美化输出，使其带有2个空格的缩进。
            return JSON.stringify(arg, null, 2);
        }
        // 如果是字符串、数字等其他类型，则直接返回，保持原样
        return arg;
    });

    // 3. 使用基础的 logger (node-karin) 来输出经过处理后的信息
    // 这里的 logger.fnc 可能是用来统一格式化（比如添加时间戳或颜色）的
    logger.warn(logger.fnc(...processedArgs));
}