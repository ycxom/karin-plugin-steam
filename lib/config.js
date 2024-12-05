import { logger } from 'node-karin';
import chokidar from 'chokidar';
import fs from 'fs';
import Yaml from 'yaml';
import path from 'path';
import { pathToFileURL } from 'url';
import { dirPath } from '../index.js'; // 确保 dirPath 被正确导入

/** 配置文件 */
class Config {
  constructor() {
    this.dirPath = dirPath;
    this.Cfg = {};
    /** 监听文件 */
    this.watcher = { config: {}, defSet: {} };
    this.initCfg();
  }

  /** 初始化配置 */
  initCfg() {
    const pathConfig = `${dirPath}/config/config/`;

    // 确保目录存在,怎么空目录还会不创建呢
    const configDir = path.dirname(pathConfig + `config.yaml`); //直接指向文件
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const pathDef = `${dirPath}/config/defSet/`;

    // 复制配置文件
    const files = fs.readdirSync(pathDef).filter(file => file.endsWith('.yaml'));
    for (const file of files) {
      if (!fs.existsSync(`${pathConfig}${file}`)) fs.copyFileSync(`${pathDef}${file}`, `${pathConfig}${file}`);
    }
  }

  /** 基本配置 */
  get Config() {
    return { ...this.getdefSet('config'), ...this.getConfig('config') };
  }

  /** pm2 配置 */
  get pm2() {
    return this.Config.pm2;
  }

  /** package.json */
  get package() {
    if (this._package) return this._package;
    this._package = JSON.parse(fs.readFileSync(this.dirPath + '/package.json', 'utf8'));
    return this._package;
  }

  /**
   * @param app 功能
   * @param name 配置文件名称
   */
  getdefSet(name) {
    return this.getYaml('defSet', name);
  }

  /** 用户配置 */
  getConfig(name) {
    return this.getYaml('config', name);
  }

  /**
   * 获取配置 yaml
   * @param type 默认配置-defSet，用户配置-config
   * @param name 名称
   */
  getYaml(type, name) {
    const file = `${this.dirPath}/config/${type}/${name}.yaml`;
    const key = `${type}.${name}`;
    if (this.Cfg[key]) return this.Cfg[key];
    try {
      this.Cfg[key] = Yaml.parse(fs.readFileSync(file, 'utf8'));
      this.watch(file, name, type);
    } catch (error) {
      logger.error(`读取配置文件失败 [${file}]: ${error.message}`);
      this.Cfg[key] = {};
    }
    return this.Cfg[key];
  }

  /** 监听配置文件 */
  watch(file, name, type = 'defSet') {
    const key = `${type}.${name}`;
    if (this.watcher[key]) { return; }
    const watcher = chokidar.watch(file);
    watcher.on('change', async () => {
      delete this.Cfg[key];
      logger.mark(`[修改配置文件][${type}][${name}]`);
      if (this[`change_${name}`]) this[`change_${name}`]();
      await this.reloadModules([
        path.resolve(this.dirPath, 'lib/monitor/monitorSteamStatus.js'),
        // 其他需要重载的文件路径
      ]); // 调用重载函数并传递要重载的文件路径
    });
    this.watcher[key] = watcher;
  }

  /** 重载相关模块 */
  async reloadModules(modulesToReload) {
    // 停止当前监控任务
    try {
      const { stopMonitoring } = await import(`${pathToFileURL(path.resolve(this.dirPath, 'lib/monitor/monitorSteamStatus.js')).href}`);
      stopMonitoring();
    } catch (error) {
      logger.error(`无法停止监控任务: ${error.message}`);
    }

    for (const modulePath of modulesToReload) {
      try {
        // 将路径转换为 file:// URL
        const fileUrl = pathToFileURL(modulePath).href;
        // 动态导入模块
        await import(`${fileUrl}?update=${Date.now()}`);
        logger.mark(`[已重新加载模块]`);
      } catch (error) {
        logger.error(`无法重新加载模块 [${modulePath}]: ${error.message}`);
      }
    }

    // 重新启动监控任务
    try {
      const { startMonitoring } = await import(`${pathToFileURL(path.resolve(this.dirPath, 'lib/monitor/monitorSteamStatus.js')).href}`);
      startMonitoring();
    } catch (error) {
      logger.error(`无法重新启动监控任务: ${error.message}`);
    }
  }
}

export default new Config(); // 导出实例