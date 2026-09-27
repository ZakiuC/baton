const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const directoryMode = process.argv.includes('--dir');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const configuredOutput = process.env.BATON_BUILD_DIR;
const outputDirectory = path.resolve(
  configuredOutput || path.join(os.tmpdir(), 'baton-builds', timestamp),
);

function runNodeScript(label, scriptPath, args) {
  console.log(`\n[构建] ${label}`);
  execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });
}

function collectFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  }
  return files;
}

if (outputDirectory === projectRoot || fs.existsSync(outputDirectory)) {
  throw new Error(`构建输出目录必须是一个尚不存在的新目录：${outputDirectory}`);
}

fs.mkdirSync(path.dirname(outputDirectory), { recursive: true });
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('请通过 npm run build:electron 或 npm run build:electron:dir 启动构建');
runNodeScript('构建 Next.js standalone', npmCli, ['run', 'build']);

const builderArgs = [
  'electron-builder',
  '--win',
  ...(directoryMode ? ['--dir'] : []),
  `-c.directories.output=${outputDirectory}`,
];
runNodeScript(
  '生成 Electron 产物',
  require.resolve('electron-builder/out/cli/cli.js'),
  builderArgs.slice(1),
);

if (directoryMode) {
  const unpackedRoot = path.join(outputDirectory, 'win-unpacked');
  const requiredFiles = [
    path.join(unpackedRoot, 'Baton.exe'),
    path.join(unpackedRoot, 'resources', 'standalone', 'server.js'),
    path.join(unpackedRoot, 'resources', 'standalone', '.next', 'static'),
    path.join(unpackedRoot, 'resources', 'standalone', 'node_modules', 'next', 'package.json'),
  ];
  for (const requiredPath of requiredFiles) {
    if (!fs.existsSync(requiredPath)) throw new Error(`打包产物缺失：${requiredPath}`);
  }

  // public/ 是可选的：本项目没有需要从 public 提供的静态文件时它会是空的，
  // 而 electron-builder 会丢弃空目录，属正常情况，不算产物缺失。
  const publicTarget = path.join(unpackedRoot, 'resources', 'standalone', 'public');
  const hasPublicAssets = fs.existsSync(path.join(projectRoot, 'public'))
    && fs.readdirSync(path.join(projectRoot, 'public')).some((name) => name !== '.gitkeep');
  if (hasPublicAssets && !fs.existsSync(publicTarget)) {
    throw new Error(`源仓库 public/ 有静态文件，但产物中缺少：${publicTarget}`);
  }

  const runtimeRoot = path.join(unpackedRoot, 'resources', 'standalone');
  const runtimeFiles = collectFiles(runtimeRoot);
  const wasmFiles = runtimeFiles.filter((file) => path.basename(file) === 'sql-wasm.wasm');
  const databaseFiles = runtimeFiles.filter((file) => /(^|[\\/])tracker\.db(?:$|[.-])/i.test(file));
  if (wasmFiles.length !== 1) {
    throw new Error(`打包产物中的 sql-wasm.wasm 数量应为 1，实际为 ${wasmFiles.length}`);
  }
  if (databaseFiles.length !== 0) {
    throw new Error(`打包产物不得包含数据库文件：${databaseFiles.join(', ')}`);
  }
  console.log(`[构建] 目录产物自检通过：运行依赖完整，数据库文件 ${databaseFiles.length} 个`);
}

console.log(`\n[构建] 完成，产物位于：${outputDirectory}`);
