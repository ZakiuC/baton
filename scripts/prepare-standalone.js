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

copyDirectory(
  path.join(projectRoot, '.next', 'static'),
  path.join(standaloneRoot, '.next', 'static'),
  '静态资源',
);
copyDirectory(
  path.join(projectRoot, 'public'),
  path.join(standaloneRoot, 'public'),
  '公共资源',
);

const staticPath = path.join(standaloneRoot, '.next', 'static');
if (!fs.existsSync(staticPath)) {
  throw new Error(`standalone 静态资源准备失败：${staticPath}`);
}

console.log('[standalone] 资源准备完成');
