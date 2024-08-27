import fs from 'fs';
import yaml from 'yaml';
import Config from '../config.js';

const DATA_FILE = `${Config.dirPath}/data/data.yaml`;
const STATUS_FILE = `${Config.dirPath}/data/status.yaml`;
const CONFIG_FILE = `${Config.dirPath}/config/config/config.yaml`;
const OUTPUT_FILE = `${Config.dirPath}/data/xhhSteam.yaml`;

//读取data.yaml
export function readData() {
  if (fs.existsSync(DATA_FILE)) {
    const fileContents = fs.readFileSync(DATA_FILE, 'utf8');
    return yaml.parse(fileContents);
  }
  return {};
}

//写入data.yaml
export function writeData(data) {
  const yamlStr = yaml.stringify(data);
  fs.writeFileSync(DATA_FILE, yamlStr, 'utf8');
}


//读取status.yaml
export function readStatus() {
  if (fs.existsSync(STATUS_FILE)) {
    const fileContents = fs.readFileSync(STATUS_FILE, 'utf8');
    return yaml.parse(fileContents);
  }
  return {};
}

//写入status.yaml
export function writeStatus(status) {
  const yamlStr = yaml.stringify(status);
  fs.writeFileSync(STATUS_FILE, yamlStr, 'utf8');
}


//读取config.yaml
export function readConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    const fileContents = fs.readFileSync(CONFIG_FILE, 'utf8');
    return yaml.parse(fileContents);
  }
  return { steamBroadcastEnabled: false }; // 默认值
}

//写入config.yaml
export function writeConfig(config) {
  const yamlStr = yaml.stringify(config);
  fs.writeFileSync(CONFIG_FILE, yamlStr, 'utf8');
}

/**
 * 读取所有开启了Steam喜加一播报的群聊
 */
export function getEnabledGroups() {
  if (fs.existsSync(DATA_FILE)) {
      const data = yaml.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      return Object.keys(data.steamFreebiesBroadcast || {}).filter(groupId => data.steamFreebiesBroadcast[groupId]);
  }
  return [];
}


/**
 * 将数据写入到文件
 */
export function writeDataToFile(data) {
  const yamlData = yaml.stringify(data);
  fs.writeFileSync(OUTPUT_FILE, yamlData, 'utf8');
  logger.log(`[writeDataToFile] 数据已写入 ${OUTPUT_FILE}`);
}

/**
* 从文件中读取数据
*/
export function readDataFromFile() {
  if (fs.existsSync(OUTPUT_FILE)) {
      const fileContents = fs.readFileSync(OUTPUT_FILE, 'utf8');
      return yaml.parse(fileContents);
  }
  return [];
}