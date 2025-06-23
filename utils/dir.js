import path from 'path'
import { fileURLToPath } from 'url'

// ✅ 使用 Node.js 标准方法获取当前文件的绝对路径
const __filename = fileURLToPath(import.meta.url);

// ✅ 使用 Node.js 标准方法获取插件的根目录绝对路径
// 这是最稳定可靠的方法
export const __dirname = path.dirname(path.dirname(__filename));

// ✅ 获取插件文件夹的名称, e.g., "karin-plugin-steam"
export const basename = path.basename(__dirname);

// ✅ 将 dirPath 直接定义为插件根目录的绝对路径 (__dirname)
// 这样任何地方导入和使用 dirPath 都是安全的
export const dirPath = __dirname;