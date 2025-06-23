// lib/config.js
import { logger, watch, filesByExt, copyConfigSync, requireFileSync } from 'node-karin'
import path from 'path'
import { __dirname, dirPath, basename } from '../utils/dir.js'

let cache;

const dirConfig = path.resolve(__dirname, './config');
const defConfig = path.resolve(__dirname, './config/defSet');

copyConfigSync(defConfig, dirConfig, ['.yaml']);

export const config = (name = 'config') => {
  if (cache) return cache;
  const user = requireFileSync(path.resolve(dirConfig, `${name}.yaml`));
  const def = requireFileSync(path.resolve(defConfig, `${name}.yaml`));
  cache = { ...def, ...user };
  return cache;
};

export const Config = new Proxy({}, {
  get(target, prop) {
    return config()[prop];
  }
});

export const pkg = () => requireFileSync(path.resolve(__dirname, './package.json'));
export { dirPath };

// 监听yaml文件修改
setTimeout(() => {
  filesByExt(dirConfig, '.yaml', 'abs').forEach(file => {
    watch(file, async () => {
      cache = undefined;
      logger.mark(`[${basename}] 配置变动，清空缓存并准备重启相关任务...`);
      try {
        const { restartMonitoring } = await import('./monitor/monitorSteamStatus.js');
        restartMonitoring();
      } catch (err) {
        logger.error('重启监控任务失败:', err);
      }
    });
  });
}, 2000);