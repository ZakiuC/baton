const fs = require('node:fs');
const path = require('node:path');

/**
 * 版本号一致性检查。
 * 单一真源是 package.json 的 version（electron-builder 与应用内 app.getVersion()
 * 都读它），src/lib/version.ts 的 APP_VERSION 供渲染进程展示，两者必须相同。
 * 同时校验更新记录的格式，避免「改了版本号却忘了写记录」。
 */

const projectRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const versionSource = fs.readFileSync(path.join(projectRoot, 'src', 'lib', 'version.ts'), 'utf8');

const problems = [];

const appVersionMatch = versionSource.match(/export const APP_VERSION = '([^']+)'/);
if (!appVersionMatch) {
  problems.push('src/lib/version.ts 缺少 APP_VERSION 导出');
} else if (appVersionMatch[1] !== packageJson.version) {
  problems.push(
    `版本号不一致：package.json 是 ${packageJson.version}，src/lib/version.ts 是 ${appVersionMatch[1]}`,
  );
}

if (!/^\d+\.\d+\.\d+$/.test(packageJson.version)) {
  problems.push(`package.json 的 version 必须符合 SemVer（当前：${packageJson.version}）`);
}

// 更新记录：版本号必须严格递减、不得重复，且最新一条要与当前版本一致。
const changelogVersions = [...versionSource.matchAll(/^\s{4}version: '([^']+)',/gm)].map((m) => m[1]);
if (changelogVersions.length === 0) {
  problems.push('src/lib/version.ts 的 CHANGELOG 为空');
} else {
  if (changelogVersions[0] !== packageJson.version) {
    problems.push(
      `CHANGELOG 顶部应为当前版本 ${packageJson.version}，实际是 ${changelogVersions[0]}`,
    );
  }
  const seen = new Set();
  for (const [index, version] of changelogVersions.entries()) {
    if (seen.has(version)) problems.push(`CHANGELOG 中版本 ${version} 重复`);
    seen.add(version);
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      problems.push(`CHANGELOG 中版本号不符合 SemVer：${version}`);
    }
    const previous = changelogVersions[index - 1];
    if (previous) {
      const compare = (a, b) => {
        const left = a.split('.').map(Number);
        const right = b.split('.').map(Number);
        for (let i = 0; i < 3; i += 1) {
          if (left[i] !== right[i]) return left[i] - right[i];
        }
        return 0;
      };
      if (compare(version, previous) >= 0) {
        problems.push(`CHANGELOG 必须按版本从新到旧排列：${previous} 之后出现了 ${version}`);
      }
    }
  }
}

// 交付锚点：能取到 git 信息时，要求存在与当前版本对应的 tag（如 v1.3.0）。
// 这正是「版本要提交进仓库」这条规则的自动检查——升了版本却没打 tag 会在这里暴露。
// 没有 git 或没有 .git 时跳过，避免影响从压缩包解出的源码。
function readGitTag() {
  try {
    const { execFileSync } = require('node:child_process');
    const output = execFileSync('git', ['tag', '--list'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

const tags = readGitTag();
if (tags === null) {
  console.log('[版本检查] 未检测到 git，跳过 tag 检查');
} else {
  const expectedTag = `v${packageJson.version}`;
  if (!tags.includes(expectedTag)) {
    problems.push(
      `缺少版本 tag ${expectedTag}；发版流程要求「升版本号 + 提交 + 打 tag」，`
      + `执行：git tag -a ${expectedTag} -m "Baton ${packageJson.version}"`,
    );
  }
}

if (problems.length > 0) {
  console.error('[版本检查] 未通过：');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log(
    `[版本检查] 通过：package.json 与 version.ts 均为 ${packageJson.version}，`
    + `CHANGELOG 共 ${changelogVersions.length} 条且顺序正确`
    + (tags === null ? '' : `，已存在 tag v${packageJson.version}`),
  );
}
