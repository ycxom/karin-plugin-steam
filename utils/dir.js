// utils/dir.js
import path from 'path'
import { common } from 'node-karin'

/** 当前文件所在的绝对路径 */
export const __filename = common.absPath(import.meta.url.replace(/^file:(\/\/\/|\/\/)/, ''))

/** 插件根目录路径 */
export const __dirname = path.dirname(path.dirname(__filename))

/** 插件包目录名称 (basename) */
export const basename = path.basename(__dirname)

/** 插件包相对路径 (保持向后兼容，旧方法中用到) */
export const dirPath = './plugins/' + basename