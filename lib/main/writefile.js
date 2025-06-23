// lib/main/writefile.js
import fs from 'fs';
import yaml from 'yaml';
import { dirPath } from '../config.js';

const CONFIG_FILE = `${dirPath}/config/config.yaml`;

/**
 * 将配置对象写入 config.yaml 文件
 * @param {object} config
 */
export function writeConfig(config) {
  // 为了安全，可以先读取旧的配置，再合并新的
  let oldConfig = {};
  if (fs.existsSync(CONFIG_FILE)) {
    oldConfig = yaml.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  }
  const newConfig = { ...oldConfig, ...config };
  const yamlStr = yaml.stringify(newConfig);
  fs.writeFileSync(CONFIG_FILE, yamlStr, 'utf8');
}