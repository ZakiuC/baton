const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const standaloneRoot = path.join(projectRoot, '.next', 'standalone');

/**
 * 先删除目标再整目录复制：electron-builder 打包的是 .next/standalone，
 * 若只做覆盖式复制，源侧已删除的旧文件会永远残留进产物。
 */
function copyDirectory(source, destination, label) {
  if (!fs.existsSync(source)) {
    throw new Error(`待复制的${label}不存在：${source}`);
  }
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
  console.log(`[standalone] 已同步${label}：${destination}`);
}

const serverPath = path.join(standaloneRoot, 'server.js');
if (!fs.existsSync(serverPath)) {
  throw new Error(`未找到 standalone 服务入口：${serverPath}`);
}

/**
 * 判断目录里是否有真实内容（忽略 .gitkeep 这类占位文件）。
 * 空目录在打包时会被 electron-builder 丢弃，因此不能把它当成「资源已就位」。
 */
function hasRealContent(directory) {
  if (!fs.existsSync(directory)) return false;
  return fs.readdirSync(directory).some((name) => name !== '.gitkeep');
}

copyDirectory(
  path.join(projectRoot, '.next', 'static'),
  path.join(standaloneRoot, '.next', 'static'),
  '静态资源',
);

// public/ 允许为空：本项目没有需要从 public 提供的静态文件
// （站点图标与品牌标识都在 src/app 下，由 Next 直接处理）。
// 为空时不同步也不校验——否则会产生一个空目录，而 electron-builder 打包时
// 又会把它丢掉，导致产物自检误报「缺少 public」。
const publicSource = path.join(projectRoot, 'public');
const publicTarget = path.join(standaloneRoot, 'public');
if (hasRealContent(publicSource)) {
  copyDirectory(publicSource, publicTarget, '公共资源');
} else {
  fs.rmSync(publicTarget, { recursive: true, force: true });
  console.log('[standalone] public/ 为空，跳过公共资源同步');
}

const staticPath = path.join(standaloneRoot, '.next', 'static');
if (!fs.existsSync(staticPath)) {
  throw new Error(`standalone 静态资源准备失败：${staticPath}`);
}

console.log('[standalone] 资源准备完成');
