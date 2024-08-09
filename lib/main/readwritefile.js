import fs from 'fs';
import yaml from 'yaml';
import Config from '../config.js';

const DATA_FILE = `${Config.dirPath}/config/config/data.yaml`;
const STATUS_FILE = `${Config.dirPath}/config/config/status.yaml`;
const CONFIG_FILE = `${Config.dirPath}/config/config/config.yaml`;

export function readData() {
  if (fs.existsSync(DATA_FILE)) {
    const fileContents = fs.readFileSync(DATA_FILE, 'utf8');
    return yaml.parse(fileContents);
  }
  return {};
}

export function writeData(data) {
  const yamlStr = yaml.stringify(data);
  fs.writeFileSync(DATA_FILE, yamlStr, 'utf8');
}

export function readStatus() {
  if (fs.existsSync(STATUS_FILE)) {
    const fileContents = fs.readFileSync(STATUS_FILE, 'utf8');
    return yaml.parse(fileContents);
  }
  return {};
}

export function writeStatus(status) {
  const yamlStr = yaml.stringify(status);
  fs.writeFileSync(STATUS_FILE, yamlStr, 'utf8');
}

export function readConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    const fileContents = fs.readFileSync(CONFIG_FILE, 'utf8');
    return yaml.parse(fileContents);
  }
  return { steamBroadcastEnabled: false }; // 默认值
}

export function writeConfig(config) {
  const yamlStr = yaml.stringify(config);
  fs.writeFileSync(CONFIG_FILE, yamlStr, 'utf8');
}

