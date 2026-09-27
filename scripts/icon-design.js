/**
 * 图标来源解析 —— 唯一真源是两个 SVG 文件：
 *   src/app/icon.svg        完整版（界面品牌标识、窗口/安装包图标、favicon）
 *   src/app/icon-tray.svg   托盘/小尺寸简化版（去掉对勾、任务条加粗）
 *
 * 之所以放在 src/app：Next.js 的图标文件约定会把 icon.svg 直接作为站点图标，
 * 界面里也能通过 /icon.svg 引用，一处定义同时喂给浏览器、界面和安装包，
 * 避免再出现「EXE 图标换了、应用内没换」的脱节。
 *
 * 生成物由 npm run build:icon 产出；改了 SVG 必须重跑该命令。
 */
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const APP_ICON_PATH = path.join(projectRoot, 'src', 'app', 'icon.svg');
const TRAY_ICON_PATH = path.join(projectRoot, 'src', 'app', 'icon-tray.svg');

const APP_ICON_VIEWBOX = '0 0 256 256';
const TRAY_ICON_VIEWBOX = '0 0 256 256';

function readSvg(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`找不到图标源文件：${filePath}（npm run build:icon 依赖它）`);
  }
  const svg = fs.readFileSync(filePath, 'utf8');
  if (!svg.includes('<svg')) throw new Error(`图标源文件不是有效的 SVG：${filePath}`);
  return svg;
}

/** 完整版图标 SVG 源码。 */
function appIconSvg() {
  return readSvg(APP_ICON_PATH);
}

/** 托盘/小尺寸简化版图标 SVG 源码。 */
function trayIconSvg() {
  return readSvg(TRAY_ICON_PATH);
}

module.exports = {
  appIconSvg,
  trayIconSvg,
  APP_ICON_PATH,
  TRAY_ICON_PATH,
  APP_ICON_VIEWBOX,
  TRAY_ICON_VIEWBOX,
};
