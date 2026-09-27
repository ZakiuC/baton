const fs = require('node:fs');
const path = require('node:path');

/**
 * 首屏回退值与默认主题必须逐令牌一致。
 * globals.css 的 :root 是主题引导脚本执行前的回退值；themes.ts 的 default
 * 主题是脚本执行后的最终值。两者漂移时首屏会先画出另一套颜色，而且没人会发现。
 * 本脚本把这种漂移变成构建期可失败的检查。
 */

const projectRoot = path.resolve(__dirname, '..');
const cssPath = path.join(projectRoot, 'src', 'app', 'globals.css');
const defaultThemePath = path.join(projectRoot, 'src', 'lib', 'themes.ts');

function readCssRootVariables() {
  const css = fs.readFileSync(cssPath, 'utf8');
  const block = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (!block) throw new Error('未能在 globals.css 中定位 :root 变量块');
  const variables = new Map();
  for (const declaration of block[1].split(';')) {
    const separator = declaration.indexOf(':');
    if (separator === -1) continue;
    const name = declaration.slice(0, separator).trim();
    const value = declaration.slice(separator + 1).trim();
    if (name.startsWith('--') && value) variables.set(name, value);
  }
  return variables;
}

/**
 * 只解析 `const DEFAULT: Theme = { ...DARK[2], vars: { ... } }` 这一段，
 * 并把它显式声明的令牌叠加到 linear-dark 之上——与运行时的对象展开语义一致。
 */
function readDefaultThemeVariables() {
  const source = fs.readFileSync(defaultThemePath, 'utf8');
  const defaultIndex = source.indexOf('const DEFAULT');
  if (defaultIndex === -1) throw new Error('未能在 themes.ts 中定位 DEFAULT 主题');

  const varsIndex = source.indexOf('vars: {', defaultIndex);
  const linearIndex = source.indexOf("id: 'linear-dark'");
  const linearVarsIndex = source.indexOf('vars: {', linearIndex);
  const readPairs = (from) => {
    const end = source.indexOf('\n  },', from);
    const body = source.slice(source.indexOf('{', from) + 1, end === -1 ? source.length : end);
    const pairs = new Map();
    for (const match of body.matchAll(/'(--[\w-]+)'\s*:\s*'([^']*)'/g)) {
      pairs.set(match[1], match[2]);
    }
    return pairs;
  };

  return new Map([...readPairs(linearVarsIndex), ...readPairs(varsIndex)]);
}

function main() {
  const cssVariables = readCssRootVariables();
  const themeVariables = readDefaultThemeVariables();
  const problems = [];

  for (const [name, value] of themeVariables) {
    if (!cssVariables.has(name)) {
      problems.push(`${name} 只在默认主题中定义，globals.css 的 :root 缺少回退值（当前回退到其它主题的取值）`);
      continue;
    }
    if (cssVariables.get(name) !== value) {
      problems.push(`${name} 取值不一致\n      globals.css: ${cssVariables.get(name)}\n      themes.ts  : ${value}`);
    }
  }

  // completeTheme 会重算这些令牌，主题里本来就不该重复声明。
  const derivedByCompleteTheme = new Set([
    '--t-border-light',
    '--t-bg-hover-mid',
    '--t-bg-subtler',
    '--t-danger-subtler',
    '--t-success-subtle',
    '--t-card-shadow-hover',
    '--t-radius-card',
    '--t-radius-control',
    '--t-border-strong',
    '--t-accent-foreground',
    '--t-danger-foreground',
    '--t-ring',
  ]);
  for (const name of cssVariables.keys()) {
    if (themeVariables.has(name) || derivedByCompleteTheme.has(name)) continue;
    problems.push(`${name} 在 globals.css 的 :root 中存在，但默认主题既未声明也不由 completeTheme 派生`);
  }

  if (problems.length > 0) {
    console.error('[主题令牌] 默认主题与 :root 回退值不一致：');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[主题令牌] 通过：默认主题 ${themeVariables.size} 个令牌与 globals.css :root 完全一致（:root 共 ${cssVariables.size} 个）`);
}

main();
