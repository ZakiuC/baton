const { createHash, randomUUID } = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const projectPackageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
);
/** 应用展示名取自 src/lib/version.ts，避免在断言里写死名称。 */
const expectedAppName = (() => {
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'lib', 'version.ts'), 'utf8');
  const match = source.match(/export const APP_NAME_FULL = '([^']+)'/);
  if (!match) throw new Error('未能从 src/lib/version.ts 读取 APP_NAME_FULL');
  return match[1];
})();
const standaloneDirectory = path.join(projectRoot, '.next', 'standalone');
const serverPath = path.join(standaloneDirectory, 'server.js');
const productionDatabase = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'baton', 'data', 'tracker.db')
  : null;
const keepTemporaryData = process.env.BATON_KEEP_TEMP === '1';

/**
 * 默认清理本轮临时目录；失败时保留现场供排查，需要强制保留时设置
 * BATON_KEEP_TEMP=1。只删除带前缀且位于系统临时目录内的目录。
 */
function cleanupTemporaryRoot(temporaryRoot) {
  if (keepTemporaryData) return;
  const resolved = path.resolve(temporaryRoot);
  const temporaryDirectory = path.resolve(os.tmpdir());
  if (!path.basename(resolved).startsWith('baton-ui-smoke-')) return;
  if (!resolved.startsWith(temporaryDirectory + path.sep)) return;
  try {
    fs.rmSync(resolved, { recursive: true, force: true });
  } catch {
    // 清理失败不影响冒烟结论。
  }
}

function fingerprint(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath, { bigint: true });
  return {
    hash: createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
    size: stat.size.toString(),
    mtimeNs: stat.mtimeNs.toString(),
  };
}

function sameFingerprint(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function reserveLocalPort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else if (!port || port === 3111) resolve(reserveLocalPort());
        else resolve(port);
      });
    });
  });
}

async function waitForServer(baseUrl, child, getLogs) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`standalone 服务提前退出，退出码 ${child.exitCode}\n${getLogs()}`);
    }
    try {
      const response = await fetch(new URL('/api/dashboard', baseUrl), {
        signal: AbortSignal.timeout(2_000),
      });
      const payload = response.ok ? await response.json() : null;
      if (
        payload?.stats
        && Array.isArray(payload.projects)
        && Array.isArray(payload.urgentItems)
        && Array.isArray(payload.recentActivity)
      ) return;
    } catch {
      // 服务尚未就绪，继续轮询。
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`standalone 服务启动超时\n${getLogs()}`);
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off('exit', finish);
      resolve();
    }, timeoutMs);
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    child.once('exit', finish);
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await waitForExit(child, 5_000);
  if (child.exitCode !== null) return;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    child.kill('SIGKILL');
  }
  await waitForExit(child, 5_000);
}

async function run() {
  if (!fs.existsSync(serverPath)) {
    throw new Error('未找到 .next/standalone/server.js，请先运行 npm run build');
  }
  if (!fs.existsSync(path.join(standaloneDirectory, '.next', 'static'))) {
    throw new Error('standalone 缺少 .next/static，请先运行完整的 npm run build');
  }

  const electronExecutable = require('electron');
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baton-ui-smoke-'));
  const temporaryDataDirectory = path.join(temporaryRoot, 'data');
  const temporaryProfileDirectory = path.join(temporaryRoot, 'electron-profile');
  fs.mkdirSync(temporaryDataDirectory, { recursive: true });
  fs.mkdirSync(temporaryProfileDirectory, { recursive: true });

  const resolvedTemporaryData = path.resolve(temporaryDataDirectory);
  const resolvedProductionData = productionDatabase
    ? path.resolve(path.dirname(productionDatabase))
    : null;
  if (resolvedProductionData && resolvedTemporaryData === resolvedProductionData) {
    throw new Error('安全检查失败：UI 测试数据目录不能是生产数据目录');
  }
  const resolvedTemporaryRoot = path.resolve(temporaryRoot);
  const systemTemporaryDirectory = path.resolve(os.tmpdir());
  if (!path.basename(resolvedTemporaryRoot).startsWith('baton-ui-smoke-')
    || !resolvedTemporaryRoot.startsWith(systemTemporaryDirectory + path.sep)) {
    throw new Error(`安全检查失败：临时根目录必须位于系统临时目录内且带前缀：${resolvedTemporaryRoot}`);
  }

  const productionBefore = fingerprint(productionDatabase);
  const port = await reserveLocalPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let serviceLogs = '';
  let runnerLogs = '';
  let server = null;
  let runner = null;
  let failure = null;

  try {
    server = spawn(electronExecutable, [serverPath], {
      cwd: standaloneDirectory,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        APP_DATA_DIR: temporaryDataDirectory,
        HOSTNAME: '127.0.0.1',
        PORT: String(port),
        NODE_ENV: 'production',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const collectServiceLog = (chunk) => {
      serviceLogs = `${serviceLogs}${chunk}`.slice(-20_000);
    };
    server.stdout.on('data', collectServiceLog);
    server.stderr.on('data', collectServiceLog);
    await waitForServer(baseUrl, server, () => serviceLogs);

    // runner 必须是真正的 Electron 主进程：若继承 ELECTRON_RUN_AS_NODE，
    // require('electron') 只会返回模块路径字符串，测试会以难以理解的方式失败。
    const runnerEnvironment = {
      ...process.env,
      BATON_UI_SMOKE_URL: baseUrl,
      BATON_UI_SMOKE_PROFILE: temporaryProfileDirectory,
    };
    delete runnerEnvironment.ELECTRON_RUN_AS_NODE;
    runner = spawn(electronExecutable, [__filename, '--electron-runner'], {
      cwd: projectRoot,
      env: runnerEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const collectRunnerLog = (chunk) => {
      const output = String(chunk);
      runnerLogs = `${runnerLogs}${output}`.slice(-40_000);
      process.stdout.write(output);
    };
    runner.stdout.on('data', collectRunnerLog);
    runner.stderr.on('data', collectRunnerLog);
    const runnerExitCode = await new Promise((resolve, reject) => {
      runner.once('error', reject);
      runner.once('exit', (code) => resolve(code));
    });
    if (runnerExitCode !== 0) {
      throw new Error(`Electron UI 冒烟退出码为 ${runnerExitCode}\n${runnerLogs}`);
    }
  } catch (error) {
    failure = error;
  } finally {
    await stopChild(runner);
    await stopChild(server);
  }

  const productionAfter = fingerprint(productionDatabase);
  if (!sameFingerprint(productionAfter, productionBefore)) {
    const safetyError = new Error(
      `生产数据库指纹发生变化，测试判定失败\n测试前：${JSON.stringify(productionBefore)}\n测试后：${JSON.stringify(productionAfter)}`,
    );
    if (!failure) failure = safetyError;
  }

  if (failure) throw failure;
  console.log(`[UI 冒烟] 随机本机端口：${port}`);
  console.log(`[UI 冒烟] 生产数据库指纹未变化：${productionBefore?.hash ?? '生产库不存在'}`);
  cleanupTemporaryRoot(temporaryRoot);
  if (keepTemporaryData) {
    console.log(`[UI 冒烟] 隔离数据按要求保留在：${temporaryRoot}`);
  }
}

async function runElectronSuite() {
  const electronModule = require('electron');
  if (typeof electronModule === 'string' || !electronModule.app) {
    throw new Error(
      'UI 冒烟必须以真正的 Electron 主进程运行：检测到 ELECTRON_RUN_AS_NODE 生效，'
      + 'require("electron") 返回的是模块路径而不是 Electron API。',
    );
  }
  const { app, BrowserWindow, ipcMain, session } = electronModule;
  const baseUrl = process.env.BATON_UI_SMOKE_URL;
  const profileDirectory = process.env.BATON_UI_SMOKE_PROFILE;
  if (!baseUrl || !profileDirectory) throw new Error('Electron UI 冒烟缺少隔离运行参数');

  app.setPath('userData', path.resolve(profileDirectory));

  // 复刻 electron/main.js 的主题存储：preload 通过同步 IPC 在首屏前取主题。
  // 这里必须用真实 preload 与同样的 IPC 契约，否则主题相关断言等于没测。
  const settingsPath = path.join(path.resolve(profileDirectory), 'settings.json');
  const readSettings = () => {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      return {};
    }
  };
  const writeSettings = (patch) => {
    const merged = { ...readSettings(), ...patch };
    fs.writeFileSync(settingsPath, JSON.stringify(merged), 'utf8');
    return merged;
  };
  if (!fs.existsSync(settingsPath)) writeSettings({ theme: 'default', autoLaunch: false, minimizeToTray: true });
  ipcMain.on('theme:get', (event) => {
    event.returnValue = readSettings().theme || 'default';
  });
  // preload 还会同步取版本号；漏注册会让渲染进程打出
  // 「sendSync ... without listeners」并可能一直等下去。
  ipcMain.on('app:get-version', (event) => {
    event.returnValue = projectPackageJson.version;
  });
  // preload 暴露的整份契约都要有 handler，否则设置页会打出未注册 handler 的错误。
  const settingsState = { autoLaunch: false, minimizeToTray: true, ...readSettings() };
  ipcMain.handle('get-settings', () => ({ ...settingsState, ...readSettings() }));
  ipcMain.handle('get-auto-launch', () => Boolean(readSettings().autoLaunch));
  ipcMain.handle('set-auto-launch', (_event, value) => {
    if (typeof value !== 'boolean') throw new Error('开机自启设置必须是布尔值');
    writeSettings({ autoLaunch: value });
    return value;
  });
  // 必须与 electron/main.js 的 set-settings 保持同样的语义：
  // 整体先校验、写主题、按需处理 autoLaunch。历史上 setAutoLaunch(undefined)
  // 会抛错并吞掉同一批里的主题写入，测试若不复刻这条路径就抓不到该缺陷。
  ipcMain.handle('set-settings', async (_event, settings) => {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new Error('设置格式无效');
    }
    if (settings.autoLaunch !== undefined && typeof settings.autoLaunch !== 'boolean') {
      throw new Error('开机自启设置必须是布尔值');
    }
    if (settings.minimizeToTray !== undefined && typeof settings.minimizeToTray !== 'boolean') {
      throw new Error('托盘设置必须是布尔值');
    }
    if (settings.theme === undefined && settings.autoLaunch === undefined && settings.minimizeToTray === undefined) {
      return { ...settingsState, ...readSettings() };
    }
    if (settings.theme !== undefined) writeSettings({ theme: String(settings.theme) });
    if (settings.autoLaunch !== undefined) {
      // 复刻真实实现：setAutoLaunch(undefined) 会抛错。
      const value = settings.autoLaunch;
      if (typeof value !== 'boolean') throw new Error('开机自启设置必须是布尔值');
      writeSettings({ autoLaunch: value });
    }
    if (settings.minimizeToTray !== undefined) writeSettings({ minimizeToTray: settings.minimizeToTray });
    return { ...settingsState, ...readSettings() };
  });
  const preloadPath = path.join(projectRoot, 'electron', 'preload.js');
  const settingsFile = settingsPath;

  await app.whenReady();

  let assertions = 0;
  let valueFallbacks = 0;
  const consoleErrors = [];
  const allowedConsoleErrorIndexes = new Set();
  const runtimeErrors = [];
  let forcedFailure = null;
  let forcedFailureHits = 0;

  const check = (condition, message) => {
    assertions += 1;
    if (!condition) throw new Error(`断言失败：${message}`);
  };
  const equal = (actual, expected, message) => {
    assertions += 1;
    if (actual !== expected) {
      throw new Error(`断言失败：${message}；期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
    }
  };
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const requestUrl = new URL(details.url);
    if (
      forcedFailure
      && forcedFailure.remaining > 0
      && requestUrl.origin === baseUrl
      && requestUrl.pathname === forcedFailure.pathname
      && details.method === forcedFailure.method
    ) {
      forcedFailure.remaining -= 1;
      forcedFailureHits += 1;
      callback({ cancel: true });
      return;
    }
    callback({});
  });

  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#FAFAFB',
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });
  const webContents = window.webContents;
  /** 是否已附加 DevTools 协议（用于确定性地设置视口尺寸）。 */
  let debuggerAttached = false;
  // 抽屉/弹窗在表单有未保存改动时会走原生 confirm 询问；
  // 无头 Electron 里没有用户点按钮，默认会一直等下去，因此这里自动确认。
  window.webContents.on('will-prevent-unload', (event) => event.preventDefault());
  window.webContents.on('did-finish-load', () => {
    window.webContents.executeJavaScript(
      `window.confirm = () => true;`, true,
    ).catch(() => { /* 页面切换期间可能失败，忽略 */ });
  });
  webContents.on('console-message', (details) => {
    const level = details.level;
    const message = details.message;
    if (level === 'error' || level === 3) consoleErrors.push(String(message));
  });
  webContents.on('render-process-gone', (_event, details) => {
    runtimeErrors.push(`渲染进程退出：${details.reason}`);
  });
  webContents.on('unresponsive', () => runtimeErrors.push('渲染进程无响应'));
  webContents.on('did-fail-load', (_event, code, description, validatedUrl, isMainFrame) => {
    if (isMainFrame) runtimeErrors.push(`页面加载失败：${code} ${description} ${validatedUrl}`);
  });

  function rendererExpression(method, args = []) {
    return `globalThis.__batonUiSmoke.${method}(...${JSON.stringify(args)})`;
  }
  const renderer = (method, ...args) => webContents.executeJavaScript(rendererExpression(method, args), true);

  async function waitFor(method, args, description, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    let lastValue;
    while (Date.now() < deadline) {
      try {
        lastValue = await renderer(method, ...args);
        if (lastValue) return lastValue;
      } catch {
        // 页面切换期间执行上下文会短暂销毁，继续等待新页面稳定。
      }
      await delay(80);
    }
    throw new Error(`等待超时：${description}；最后结果 ${JSON.stringify(lastValue)}`);
  }

  async function click(spec) {
    // 长页面/内部滚动容器里目标可能在视口之外，坐标点击会落空：
    // 先滚动进视口并等待滚动稳定，再取坐标。
    await renderer('scrollIntoView', spec);
    await delay(250);
    await renderer('focus', spec);
    const rect = await renderer('elementRect', spec);
    check(rect && rect.width > 0 && rect.height > 0, `目标元素必须可点击：${JSON.stringify(spec)}`);
    const x = Math.round(rect.x + rect.width / 2);
    const y = Math.round(rect.y + rect.height / 2);
    webContents.sendInputEvent({ type: 'mouseMove', x, y });
    webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await delay(100);
  }

  function key(keyCode, modifiers = []) {
    webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    if (keyCode === 'Enter') {
      webContents.sendInputEvent({ type: 'char', keyCode: '\r', modifiers });
    }
    webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  }

  async function type(spec, value) {
    await click(spec);
    key('A', ['control']);
    if (value) webContents.insertText(value);
    else key('Backspace');
    await delay(80);
    if (await renderer('value', spec) !== value) {
      valueFallbacks += 1;
      check(await renderer('setValue', spec, value), `受控输入应接受 DOM value/input 事件：${JSON.stringify(spec)}`);
      await delay(50);
    }
    equal(await renderer('value', spec), value, `输入值必须写入：${JSON.stringify(spec)}`);
  }

  async function activateWithKeyboard(spec) {
    check(await renderer('focus', spec), `目标元素必须可聚焦：${JSON.stringify(spec)}`);
    key('Enter');
    await delay(100);
  }

  async function api(pathname, options) {
    const response = await fetch(new URL(pathname, baseUrl), options);
    const payload = await response.json();
    if (!response.ok) throw new Error(`API ${pathname} 返回 ${response.status}：${JSON.stringify(payload)}`);
    return payload;
  }

  /**
   * 调整视口到指定尺寸并让页面真正按该尺寸布局。   *
   * 只用 window.setContentSize 不可靠：窗口内容区确实变成了目标值，但隐藏窗口的
   * 渲染进程有时收不到 resize，window.innerWidth/Height 一直是旧值（重试也无效，
   * 因为不是时序问题而是事件没送达）。
   * 因此改为用 DevTools 协议下发 Emulation.setDeviceMetricsOverride —— 它直接改变
   * 页面的布局视口，与窗口状态无关，测试结果稳定可复现。
   */
  async function setViewport(width, height) {
    if (!debuggerAttached) {
      try {
        webContents.debugger.attach('1.3');
        debuggerAttached = true;
      } catch (error) {
        console.log(`[UI 冒烟] 调试器附加失败，回退到窗口缩放：${error instanceof Error ? error.message : error}`);
      }
    }

    window.setContentSize(width, height);
    if (debuggerAttached) {
      await webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
    }

    let lastActual = null;
    for (let poll = 0; poll < 25; poll += 1) {
      await delay(120);
      lastActual = await renderer('viewportSize');
      if (lastActual.width === width && lastActual.height === height) {
        const shell = await renderer('shellMetrics');
        check(shell.appShellWidth <= shell.viewportWidth, `${width}x${height} 应用外壳不能横向溢出`);
        check(shell.mainWidth > 0 && shell.mainHeight > 0, `${width}x${height} 主内容区域必须可用`);
        return;
      }
    }
    throw new Error(
      `${width}x${height} 视口未能生效：实际 ${JSON.stringify(lastActual)}，`
      + `窗口内容区 ${JSON.stringify(window.getContentSize())}，调试器=${debuggerAttached}`,
    );
  }

  async function verifyDialogFocusCycle(kind) {
    await waitFor('dialogFocusInside', [], `${kind} 初始焦点进入弹层`);
    await renderer('focusDialogBoundary', 'first');
    key('Tab', ['shift']);
    await waitFor('dialogFocusAt', ['last'], `${kind} Shift+Tab 从首项回到末项`);
    key('Tab');
    await waitFor('dialogFocusAt', ['first'], `${kind} Tab 从末项回到首项`);
    assertions += 2;
  }

  let suiteFailure = null;
  // 看门狗：任何一步卡死（例如 preload 的同步 IPC 没有对应 handler）都要显式失败，
  // 而不是让整个 verify 无限等待。
  const suiteTimeoutMs = Number(process.env.BATON_UI_TIMEOUT_MS || 240_000);
  let watchdogFired = false;
  const watchdog = setTimeout(() => {
    watchdogFired = true;
    const message = `UI 冒烟超时（${suiteTimeoutMs}ms），疑似某一步卡死`;
    console.error(`[UI 冒烟] ${message}`);
    suiteFailure = suiteFailure || new Error(message);
    try {
      require('electron').app.exit(1);
    } catch {
      process.exit(1);
    }
  }, suiteTimeoutMs);

  /**
   * 把测试辅助对象注入页面。整页导航（window.loadURL）会重建 JS 上下文并清掉它，
   * 因此每次导航后都要重新注入。
   */
  const injectRendererHelper = async () => {
    await webContents.executeJavaScript(`
      (() => {
        const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const find = (spec = {}) => {
          const root = spec.root ? document.querySelector(spec.root) : document;
          if (!root) return null;
          let elements = Array.from(root.querySelectorAll(spec.selector || '*'));
          if (spec.text !== undefined) {
            elements = elements.filter((element) => {
              const text = normalize(element.innerText || element.textContent);
              return spec.exact ? text === normalize(spec.text) : text.includes(normalize(spec.text));
            });
          }
          if (spec.aria !== undefined) {
            elements = elements.filter((element) => {
              const aria = normalize(element.getAttribute('aria-label'));
              return spec.exact ? aria === normalize(spec.aria) : aria.includes(normalize(spec.aria));
            });
          }
          if (spec.ancestorSelector) {
            elements = elements.filter((element) => {
              const ancestor = element.closest(spec.ancestorSelector);
              return ancestor && normalize(ancestor.innerText || ancestor.textContent).includes(normalize(spec.ancestorText));
            });
          }
          return elements[spec.index || 0] || null;
        };
        const focusable = (dialog) => Array.from(dialog.querySelectorAll([
          'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
          'select:not([disabled])', 'textarea:not([disabled])', '[contenteditable="true"]',
          '[tabindex]:not([tabindex="-1"])',
        ].join(','))).filter((element) => element.tabIndex >= 0 && element.getAttribute('aria-hidden') !== 'true');
        const colorChannels = (value) => {
          const probe = document.createElement('span');
          probe.style.color = value;
          document.body.appendChild(probe);
          const match = getComputedStyle(probe).color.match(/[\\d.]+/g);
          probe.remove();
          return match ? match.slice(0, 3).map(Number) : null;
        };
        const luminance = (channels) => channels.reduce((sum, channel, index) => {
          const normalized = channel / 255;
          const linear = normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          return sum + linear * [0.2126, 0.7152, 0.0722][index];
        }, 0);
        globalThis.__batonUiSmoke = {
          exists: (spec) => Boolean(find(spec)),
          absent: (spec) => !find(spec),
          count: (spec) => {
            const root = spec.root ? document.querySelector(spec.root) : document;
            return root ? Array.from(root.querySelectorAll(spec.selector || '*')).filter((element) => {
              const text = normalize(element.innerText || element.textContent);
              return spec.text === undefined || (spec.exact ? text === normalize(spec.text) : text.includes(normalize(spec.text)));
            }).length : 0;
          },
          value: (spec) => find(spec)?.value,
          valueIs: (spec, expected) => find(spec)?.value === expected,
          setValue: (spec, value) => {
            const element = find(spec);
            if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) return false;
            const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
            if (!setter) return false;
            setter.call(element, value);
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return element.value === value;
          },
          text: (spec) => normalize(find(spec)?.innerText || find(spec)?.textContent),
          scrollIntoView: (spec) => {
            const element = find(spec);
            if (!element) return false;
            element.scrollIntoView({ block: 'center', inline: 'nearest' });
            return true;
          },
          pathIs: (pathname) => location.pathname === pathname,
          // 先强制一次样式/布局重算再读视口：窗口缩放后，隐藏窗口里的渲染进程
          // 有时不会主动更新 window.innerWidth/Height，轮询会一直读到旧值。
          viewportSize: () => {
            void document.documentElement.offsetHeight;
            return { width: window.innerWidth, height: window.innerHeight };
          },
          viewportIs: (width, height) => {
            void document.documentElement.offsetHeight;
            return window.innerWidth === width && window.innerHeight === height;
          },
          scrollIntoView: (spec) => {
            const element = find(spec);
            if (!element) return false;
            // 应用用的是内部滚动容器（main 的 overflow-auto）而不是页面滚动，
            // scrollIntoView 会滚动最近的祖先容器。
            element.scrollIntoView({ block: 'center', inline: 'center' });
            return true;
          },
          elementRect: (spec) => {
            const element = find(spec);
            if (!element) return null;
            // 先确保在视口内；坐标由调用方在滚动稳定后再取，
            // 避免平滑滚动过程中读到过期位置导致点击落空。
            const rect = element.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          },
          focus: (spec) => {
            const element = find(spec);
            if (!element || typeof element.focus !== 'function') return false;
            element.focus({ preventScroll: true });
            return element === document.activeElement;
          },
          domClick: (spec) => {
            const element = find(spec);
            if (!(element instanceof HTMLElement)) return false;
            element.click();
            return true;
          },
          elementInfo: (spec) => {
            const element = find(spec);
            if (!(element instanceof HTMLElement)) return null;
            return {
              active: element === document.activeElement,
              disabled: Boolean(element.disabled),
              inert: Boolean(element.closest('[inert]')),
              aria: element.getAttribute('aria-label'),
              html: element.outerHTML.slice(0, 500),
            };
          },
          select: (spec, value) => {
            const element = find(spec);
            if (!(element instanceof HTMLSelectElement)) return false;
            element.focus();
            const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
            setter.call(element, value);
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return element.value === value;
          },
          shellMetrics: () => {
            const shell = document.querySelector('.app-shell');
            const main = document.querySelector('main');
            return {
              viewportWidth: window.innerWidth,
              appShellWidth: shell?.getBoundingClientRect().width || 0,
              mainWidth: main?.getBoundingClientRect().width || 0,
              mainHeight: main?.getBoundingClientRect().height || 0,
            };
          },
          dialogFocusInside: () => {
            const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
            return Boolean(dialog && dialog.contains(document.activeElement));
          },
          focusDialogBoundary: (boundary) => {
            const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
            if (!dialog) return false;
            const elements = focusable(dialog);
            const target = boundary === 'last' ? elements.at(-1) : elements[0];
            target?.focus();
            return Boolean(target);
          },
          dialogFocusAt: (boundary) => {
            const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
            if (!dialog) return false;
            const elements = focusable(dialog);
            const target = boundary === 'last' ? elements.at(-1) : elements[0];
            return target === document.activeElement;
          },
          activeMatches: (spec) => find(spec) === document.activeElement,
          contrast: () => {
            const styles = getComputedStyle(document.documentElement);
            const background = colorChannels(styles.getPropertyValue('--t-accent'));
            const foreground = colorChannels(styles.getPropertyValue('--t-accent-foreground'));
            if (!background || !foreground) return 0;
            const first = luminance(background);
            const second = luminance(foreground);
            return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
          },
          themeModeIs: (mode) => document.documentElement.dataset.themeMode === mode,
          themeIdIs: (id) => document.documentElement.dataset.theme === id,
          storedTheme: () => {
            try { return localStorage.getItem('baton-theme'); } catch { return null; }
          },
          themeOptionNames: () => Array.from(document.querySelectorAll('#theme-options button'))
            .map((button) => (button.innerText || '').replace(/\s+/g, ' ').trim()),
          archivedProjectReadOnly: (taskTitle) => {
            const task = find({ selector: 'button', aria: '任务：' + taskTitle, exact: true });
            return Boolean(
              task?.disabled
              && !document.querySelector('#project-quick-task')
              && !document.querySelector('[aria-label="编辑项目"]'),
            );
          },
          boardMetrics: () => {
            const candidates = Array.from(document.querySelectorAll('main div'));
            const grid = candidates.find((element) => {
              const style = getComputedStyle(element);
              return style.display === 'grid' && element.children.length === 4 && element.scrollWidth >= 1080;
            });
            const scroller = grid?.parentElement;
            if (!grid || !scroller) return null;
            const widths = Array.from(grid.children).map((child) => child.getBoundingClientRect().width);
            return {
              overflow: scroller.scrollWidth > scroller.clientWidth + 1,
              scrollWidth: scroller.scrollWidth,
              clientWidth: scroller.clientWidth,
              minColumnWidth: Math.min(...widths),
              documentFits: document.documentElement.scrollWidth <= window.innerWidth,
            };
          },
          scrollBoard: () => {
            const grid = Array.from(document.querySelectorAll('main div')).find((element) => {
              const style = getComputedStyle(element);
              return style.display === 'grid' && element.children.length === 4 && element.scrollWidth >= 1080;
            });
            const scroller = grid?.parentElement;
            if (!scroller) return 0;
            scroller.scrollLeft = Math.min(160, scroller.scrollWidth - scroller.clientWidth);
            scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
            return scroller.scrollLeft;
          },
        };
      })();
    `, true);
  };

  try {
    await window.loadURL(baseUrl);
    window.show();
    window.focus();
    webContents.focus();
    await delay(200);
    await injectRendererHelper();

    await waitFor('exists', [{ selector: 'button', text: '创建第一个项目', exact: true }], '空仪表盘就绪');
    await setViewport(1400, 900);
    const createTrigger = { selector: 'button', text: '创建第一个项目', exact: true };
    await click(createTrigger);
    await waitFor('exists', [{ selector: '[role="dialog"]', text: '新建项目' }], '新建项目弹窗打开');
    await verifyDialogFocusCycle('Modal');
    key('Escape');
    await waitFor('absent', [{ selector: '[role="dialog"]' }], 'Modal 使用 Esc 关闭');
    await waitFor('activeMatches', [createTrigger], 'Modal 关闭后焦点回到触发按钮');
    assertions += 2;

    await click(createTrigger);
    const projectName = `UI 冒烟项目 ${randomUUID().slice(0, 8)}`;
    const updatedProjectName = `${projectName} 已编辑`;
    await type({ selector: '#project-name' }, projectName);
    await type({ selector: '#project-description' }, '通过真实 Electron DOM 事件创建');

    forcedFailure = { method: 'POST', pathname: '/api/projects', remaining: 1 };
    const consoleBeforeFailure = consoleErrors.length;
    await click({ selector: '[role="dialog"] button', text: '创建项目', exact: true });
    await waitFor('exists', [{ selector: '[role="dialog"] [role="alert"]' }], '失败反馈显示且表单保留');
    equal(await renderer('value', { selector: '#project-name' }), projectName, '请求失败后项目名称必须保留');
    check(await renderer('exists', { selector: '[role="dialog"]' }), '请求失败后表单不能关闭');
    equal((await api('/api/projects?include_archived=true')).length, 0, '失败请求不能假成功或写入项目');
    equal(forcedFailureHits, 1, '故障注入必须且只能命中一次');
    consoleErrors.slice(consoleBeforeFailure).forEach((message, offset) => {
      if (/Failed to load resource|ERR_FAILED|ERR_BLOCKED_BY_CLIENT/i.test(message)) {
        allowedConsoleErrorIndexes.add(consoleBeforeFailure + offset);
      }
    });

    await click({ selector: '[role="dialog"] button', text: '创建项目', exact: true });
    await waitFor('absent', [{ selector: '[role="dialog"]' }], '重试后项目弹窗关闭');
    await waitFor('exists', [{ selector: 'a', aria: `打开项目 ${projectName}` }], '项目卡片出现');
    const projectsAfterCreate = await api('/api/projects?include_archived=true');
    const project = projectsAfterCreate.find((item) => item.name === projectName);
    check(Boolean(project?.id), 'UI 创建项目必须真实落入临时库');

    await click({ selector: 'a', aria: `打开项目 ${projectName}` });
    await waitFor('pathIs', [`/project/${project.id}`], '进入项目详情');
    await waitFor('exists', [{ selector: 'h1', text: projectName, exact: true }], '项目详情载入');

    await activateWithKeyboard({ selector: 'button', aria: '编辑项目', exact: true });
    if (!(await renderer('exists', { selector: '[role="dialog"]', text: '编辑项目' }))) {
      console.log('[UI 冒烟] 图标键盘激活诊断：', await renderer('elementInfo', { selector: 'button', aria: '编辑项目', exact: true }));
      check(await renderer('domClick', { selector: 'button', aria: '编辑项目', exact: true }), '编辑项目图标应响应 DOM click 事件');
    }
    await waitFor('exists', [{ selector: '[role="dialog"]', text: '编辑项目' }], '编辑项目弹窗打开');
    await type({ selector: '#project-name' }, updatedProjectName);
    await type({ selector: '#project-description' }, '项目编辑流程已验证');
    await click({ selector: '[role="dialog"] button', text: '保存', exact: true });
    await waitFor('exists', [{ selector: 'h1', text: updatedProjectName, exact: true }], '项目名称编辑完成');
    equal((await api(`/api/projects/${project.id}`)).name, updatedProjectName, '项目编辑必须写入临时库');

    const taskName = `UI 冒烟任务 ${randomUUID().slice(0, 8)}`;
    const updatedTaskName = `${taskName} 已编辑`;
    const blockerReason = '等待 UI 冒烟依赖确认';
    // 用于验证「长期任务 ↔ 有截止日期」的相互转换。
    // 必须是本周内的日期，否则任务虽设了日期也不会出现在当前显示的周视图里。
    const defaultDueDate = (() => {
      const today = new Date();
      const weekday = (today.getDay() + 6) % 7; // 0 = 周一
      const target = new Date(today);
      // 取本周周四（必要时回退到周日），保证落在这七天区间内
      target.setDate(today.getDate() - weekday + 3);
      if (target < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
        target.setDate(today.getDate() + (6 - weekday));
      }
      const month = String(target.getMonth() + 1).padStart(2, '0');
      const day = String(target.getDate()).padStart(2, '0');
      return `${target.getFullYear()}-${month}-${day}`;
    })();
    await type({ selector: '#project-quick-task' }, taskName);
    key('Enter');
    await waitFor('exists', [{ selector: 'button', aria: `打开任务：${taskName}`, exact: true }], '快速创建任务完成');
    const tasksAfterCreate = await api(`/api/tasks?project_id=${project.id}&include_archived=true`);
    const task = tasksAfterCreate.find((item) => item.title === taskName);
    check(Boolean(task?.id), 'UI 创建任务必须真实落入临时库');

    const taskTrigger = { selector: 'button', aria: `打开任务：${taskName}`, exact: true };
    await click(taskTrigger);
    await waitFor('exists', [{ selector: '[role="dialog"]', text: '任务详情' }], '任务 Drawer 打开');
    await waitFor('exists', [{ selector: '#detail-title' }], '任务 Drawer 数据载入');
    await verifyDialogFocusCycle('Drawer');
    key('Escape');
    await waitFor('absent', [{ selector: '[role="dialog"]' }], 'Drawer 使用 Esc 关闭');
    await waitFor('activeMatches', [taskTrigger], 'Drawer 关闭后焦点回到任务卡片');
    assertions += 2;

    await click(taskTrigger);
    await waitFor('exists', [{ selector: '#detail-title' }], '再次打开任务 Drawer');
    await type({ selector: '#detail-title' }, updatedTaskName);
    await type({ selector: '#detail-description' }, '任务编辑与状态闭环已验证');
    check(await renderer('select', { selector: '#detail-stage' }, 'in_progress'), '任务阶段应可切换到进行中');
    await click({ selector: '[role="dialog"] button', text: '保存修改', exact: true });
    await waitFor('exists', [{ selector: 'body', text: '任务已保存' }], '任务保存成功反馈');
    const editedTask = await api(`/api/tasks/${task.id}`);
    equal(editedTask.title, updatedTaskName, '任务标题编辑必须写入临时库');
    equal(editedTask.stage, 'in_progress', '任务阶段编辑必须写入临时库');

    check(await renderer('select', { selector: '#detail-stage' }, 'blocked'), '任务阶段应可切换到阻塞');
    await waitFor('exists', [{ selector: '#detail-blocker' }], '阻塞原因输入出现');
    await click({ selector: '[role="dialog"] button', text: '保存修改', exact: true });
    await waitFor('exists', [{ selector: '[role="dialog"] [role="alert"]', text: '必须填写阻塞原因' }], '空阻塞原因被拒绝');
    await type({ selector: '#detail-blocker' }, blockerReason);
    await click({ selector: '[role="dialog"] button', text: '保存修改', exact: true });
    await waitFor('exists', [{ selector: '[aria-label="解决阻塞：' + blockerReason + '"]' }], '阻塞原因保存并显示');
    equal((await api(`/api/tasks/${task.id}`)).stage, 'blocked', '阻塞任务必须进入 blocked');

    await click({ selector: 'button', aria: `解决阻塞：${blockerReason}`, exact: true });
    await waitFor('valueIs', [{ selector: '#detail-stage' }, 'in_progress'], '解决最后阻塞后回到进行中');
    const resolvedTask = await api(`/api/tasks/${task.id}`);
    equal(resolvedTask.stage, 'in_progress', '解决最后阻塞后任务必须回到进行中');
    equal(resolvedTask.blockers.length, 0, '解决后不能残留活动阻塞');

    await click({ selector: '[role="dialog"] button', text: '归档任务', exact: true });
    await waitFor('exists', [{ selector: '[role="dialog"] button', text: '确认归档', exact: true }], '任务归档二次确认出现');
    await click({ selector: '[role="dialog"] button', text: '确认归档', exact: true });
    await waitFor('absent', [{ selector: '[role="dialog"]' }], '任务归档后 Drawer 关闭');
    equal((await api(`/api/tasks/${task.id}`)).stage, 'archived', '任务归档只改变阶段且可恢复');

    await click({ selector: 'a', text: '设置', exact: true });
    await waitFor('pathIs', ['/settings'], '进入设置页');
    await waitFor('exists', [{ selector: 'button', text: '恢复', ancestorSelector: 'div.rounded-lg', ancestorText: updatedTaskName }], '归档任务出现在设置页');

    await click({ selector: 'button', text: '主题方案' });
    await waitFor('exists', [{ selector: '#theme-options' }], '主题列表展开');
    await click({ selector: '#theme-options button', text: 'GitHub Light' });
    await waitFor('themeModeIs', ['light'], '亮色主题生效');
    check((await renderer('contrast')) >= 4.5, '亮色主题主按钮文字对比度必须不低于 4.5');
    await click({ selector: '#theme-options button', text: 'GitHub Dark' });
    await waitFor('themeModeIs', ['dark'], '暗色主题生效');
    check((await renderer('contrast')) >= 4.5, '暗色主题主按钮文字对比度必须不低于 4.5');

    // 主题列表不能出现重复项：默认主题单独渲染在最上方，分组必须按 id 排除它，
    // 否则默认主题的 mode 一旦与某个分组相同就会重复出现（曾经就是如此）。
    const themeNames = await renderer('themeOptionNames');
    equal(
      themeNames.length,
      new Set(themeNames).size,
      `主题列表不能有重复项，实际为：${themeNames.join(' / ')}`,
    );
    equal(
      themeNames.filter((name) => name.startsWith('Original Indigo')).length,
      1,
      '默认主题在列表中只能出现一次',
    );

    // 主题选择必须跨「重新打开」保持，而且不能因为访问地址（origin）变化而丢失。
    // 用一个全新窗口（默认同一 session，等同重新打开应用）验证；
    // 再用一个不同端口的地址验证「跟着人走、不跟着地址走」。
    const reopened = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: preloadPath,
      },
    });
    try {
      await reopened.loadURL(baseUrl);
      await delay(1200);
      const reopenedState = await reopened.webContents.executeJavaScript(
        `(() => ({
          injected: window.electronAPI && window.electronAPI.initialTheme,
          theme: document.documentElement.dataset.theme,
          mode: document.documentElement.dataset.themeMode,
        }))()`,
        true,
      );
      equal(reopenedState.injected, 'github-dark', 'preload 必须同步注入主进程保存的主题');
      equal(reopenedState.theme, 'github-dark', '重新打开后不能回退到默认主题');
      equal(reopenedState.mode, 'dark', '重新打开后主题模式必须保持 dark');

      // 换一个 host（localhost 与 127.0.0.1 是不同 origin）访问同一服务：
      // localStorage 存主题时这里必然会回退，改为主进程配置后必须仍然保持。
      const alternateUrl = baseUrl.replace('127.0.0.1', 'localhost');
      await reopened.loadURL(alternateUrl);
      await delay(1200);
      const alternateState = await reopened.webContents.executeJavaScript(
        `(() => ({
          theme: document.documentElement.dataset.theme,
          mode: document.documentElement.dataset.themeMode,
        }))()`,
        true,
      );
      equal(alternateState.theme, 'github-dark', '换访问地址后主题不能丢失');
      equal(alternateState.mode, 'dark', '换访问地址后主题模式不能丢失');

      // 主进程配置文件里必须真的记录了主题
      const persistedSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      equal(persistedSettings.theme, 'github-dark', '主题必须写入主进程 settings.json');

      // 升级路径：旧版本只写 localStorage，settings.json 里没有 theme 字段。
      // 此时必须把 localStorage 里的旧选择迁移进配置，而不是回退到默认主题。
      fs.writeFileSync(settingsFile, JSON.stringify({ autoLaunch: false, minimizeToTray: true }), 'utf8');
      // 先回到初始 origin，否则写的是上一个 host 的 localStorage。
      await reopened.loadURL(baseUrl);
      await delay(800);
      await reopened.webContents.executeJavaScript(
        `localStorage.setItem('baton-theme', 'linear-light')`,
        true,
      );
      await reopened.loadURL(baseUrl);
      await delay(1800);
      const migratedSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      equal(migratedSettings.theme, 'linear-light', '旧 localStorage 主题必须迁移进 settings.json');
      const migratedState = await reopened.webContents.executeJavaScript(
        `(() => ({
          theme: document.documentElement.dataset.theme,
          mode: document.documentElement.dataset.themeMode,
          leftover: localStorage.getItem('baton-theme'),
        }))()`,
        true,
      );
      equal(migratedState.theme, 'linear-light', '迁移后界面必须直接使用旧选择，而不是回退默认主题');
      equal(migratedState.mode, 'light', '迁移后主题模式必须与旧选择一致');
      equal(migratedState.leftover, null, '迁移完成后必须清理 localStorage，避免两个来源并存');

      // 还原成 github-dark，供后续断言使用
      fs.writeFileSync(settingsFile, JSON.stringify({ autoLaunch: false, minimizeToTray: true, theme: 'github-dark' }), 'utf8');

      // 回归：主进程 set-settings 必须能一次处理「主题 + 开机自启」等混合字段。
      // 历史缺陷是 setAutoLaunch(undefined) 抛错并连带吞掉主题写入，
      // 用户的 settings.json 里一旦有 autoLaunch，主题就永远存不下来。
      const mixedWrite = await reopened.webContents.executeJavaScript(
        `window.electronAPI.setSettings({ theme: 'stripe-light' })
           .then((r) => ({ ok: true, theme: r && r.theme }))
           .catch((e) => ({ ok: false, error: String(e && e.message || e) }))`,
        true,
      );
      equal(mixedWrite.ok, true, `仅写主题的 settings 调用必须成功：${JSON.stringify(mixedWrite)}`);
      equal(mixedWrite.theme, 'stripe-light', 'set-settings 必须回写生效后的主题');
      const mixedFile = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      equal(mixedFile.theme, 'stripe-light', '混合字段调用也必须把主题落盘');

      // 再把 autoLaunch 一起带上，确认不会因为缺少字段而整体失败
      const mixedWrite2 = await reopened.webContents.executeJavaScript(
        `window.electronAPI.setSettings({ theme: 'notion-dark', minimizeToTray: true })
           .then((r) => ({ ok: true, theme: r && r.theme }))
           .catch((e) => ({ ok: false, error: String(e && e.message || e) }))`,
        true,
      );
      equal(mixedWrite2.ok, true, `主题 + 托盘设置的调用必须成功：${JSON.stringify(mixedWrite2)}`);
      const mixedFile2 = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      equal(mixedFile2.theme, 'notion-dark', '多字段调用时主题仍必须落盘');

      fs.writeFileSync(settingsFile, JSON.stringify({ autoLaunch: false, minimizeToTray: true, theme: 'github-dark' }), 'utf8');
    } finally {
      if (!reopened.isDestroyed()) reopened.destroy();
    }

    await click({ selector: 'button', text: '恢复', ancestorSelector: 'div.rounded-lg', ancestorText: updatedTaskName });
    await waitFor('absent', [{ selector: 'button', text: '恢复', ancestorSelector: 'div.rounded-lg', ancestorText: updatedTaskName }], '归档任务恢复后移出列表');
    equal((await api(`/api/tasks/${task.id}`)).stage, 'todo', '设置页必须将归档任务恢复到待办');

    await click({ selector: 'a', text: updatedProjectName, exact: true });
    await waitFor('pathIs', [`/project/${project.id}`], '返回恢复后的项目');
    await waitFor('exists', [{ selector: 'button', aria: `打开任务：${updatedTaskName}`, exact: true }], '恢复任务重新可编辑');
    const archiveProjectButton = { selector: 'button', aria: '归档项目', exact: true };
    await activateWithKeyboard(archiveProjectButton);
    // Electron 隐藏/无边框环境偶尔不会把小型图标按钮的原生激活转成交互事件；
    // 已先发送可信键盘事件，再用同一元素的 DOM click 事件完成 React 事件链。
    if (!(await renderer('exists', { selector: '[role="dialog"]', text: '归档项目' }))) {
      check(await renderer('domClick', archiveProjectButton), '归档项目图标应响应 DOM click 事件');
    }
    await waitFor('exists', [{ selector: '[role="dialog"]', text: '归档项目' }], '项目归档确认弹窗打开');
    await click({ selector: '[role="dialog"] button', text: '确认归档', exact: true });
    await waitFor('exists', [{ selector: 'p', text: '这是已归档项目的只读视图', exact: true }], '归档项目只读视图出现');
    check(await renderer('archivedProjectReadOnly', updatedTaskName), '归档项目中的任务、快速添加和编辑入口必须只读');
    equal((await api(`/api/projects/${project.id}`)).status, 'archived', '项目归档只改变状态且可恢复');

    await click({ selector: 'a', text: '设置', exact: true });
    await waitFor('pathIs', ['/settings'], '再次进入设置页');
    await waitFor('exists', [{ selector: 'button', text: '恢复', ancestorSelector: 'div.rounded-lg', ancestorText: updatedProjectName }], '归档项目出现在设置页');
    await click({ selector: 'button', text: '恢复', ancestorSelector: 'div.rounded-lg', ancestorText: updatedProjectName });
    await waitFor('absent', [{ selector: 'button', text: '恢复', ancestorSelector: 'div.rounded-lg', ancestorText: updatedProjectName }], '归档项目恢复后移出列表');
    equal((await api(`/api/projects/${project.id}`)).status, 'active', '设置页必须恢复归档项目');

    await click({ selector: 'a', text: '看板', exact: true });
    await waitFor('pathIs', ['/board'], '进入看板');
    await waitFor('exists', [{ selector: 'h1', text: '看板', exact: true }], '看板加载完成');

    // 长期任务面板：没有截止日期的未完成任务必须能从时间线进入，并能一键设为长期任务。
    // 面板在时间线的内部滚动容器下方，需要一点可见高度才容易操作；
    // 但窗口内容高度不能超过屏幕可用高度（标题栏 + 任务栏都会被扣掉），否则
    // setContentSize 不会真正生效，后续视口断言会超时。这里留足余量。
    await setViewport(1400, 960);
    await window.loadURL(`${baseUrl}/timeline`);
    await delay(600);
    await injectRendererHelper();
    await waitFor('pathIs', ['/timeline'], '进入时间线');
    await waitFor('exists', [{ selector: '#long-term-title' }], '长期任务面板出现');
    const longTermPanel = await webContents.executeJavaScript(
      `(() => {
        const section = document.querySelector('section[aria-labelledby="long-term-title"]');
        if (!section) return null;
        const buttons = Array.from(section.querySelectorAll('li button'));
        return {
          count: buttons.length,
          badge: (section.querySelector('.badge')?.textContent || '').trim(),
          titles: buttons.map((b) => (b.textContent || '').trim()),
        };
      })()`,
      true,
    );
    check(longTermPanel !== null, '时间线必须渲染长期任务面板');
    equal(longTermPanel.count, 1, `刚创建的无日期任务必须出现在长期任务面板（实际 ${JSON.stringify(longTermPanel.titles)}）`);
    check(longTermPanel.titles.some((t) => t.includes(taskName)), '长期任务面板必须包含该任务');

    // 打开详情：无日期时应提示是长期任务。
    // 该面板位于时间线内部滚动容器下方，坐标点击容易落空；直接按结构定位按钮并派发 DOM click。
    // （冒烟里长期任务面板只会包含刚创建的那个任务，因此结构选择器是确定的。）
    equal(
      await renderer('count', { selector: 'section[aria-labelledby="long-term-title"] li button' }),
      1,
      '长期任务面板应恰好包含一个任务按钮',
    );
    check(
      await renderer('domClick', { selector: 'section[aria-labelledby="long-term-title"] li button' }),
      '长期任务面板中的任务应响应点击',
    );
    await waitFor('exists', [{ selector: '#detail-due-date' }], '从长期任务面板打开任务详情');
    equal(await renderer('value', { selector: '#detail-due-date' }), '', '长期任务的截止日期应为空');
    check(
      await renderer('exists', { selector: '[role="dialog"]', text: '当前是长期任务' }),
      '无截止日期时详情应说明这是长期任务',
    );
    // 只读观察后关闭：此时表单与任务一致，不会触发「未保存」确认。
    // 关闭按钮是右上角的小图标，坐标点击在无头环境不稳定，用 DOM click。
    check(
      await renderer('domClick', { selector: '[role="dialog"] button[aria-label="关闭抽屉"]' }),
      '关闭抽屉按钮应响应点击',
    );
    await waitFor('absent', [{ selector: '[role="dialog"]' }], '详情抽屉关闭');

    // 通过接口设定截止日期（等价于别的入口设置的日期）：
    // 任务必须移出长期任务面板，并出现在周视图对应日期上。
    await api(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due_date: defaultDueDate }),
    });
    equal((await api(`/api/tasks/${task.id}`)).due_date, defaultDueDate, '截止日期必须写入');
    // 页面靠 window 上的自定义事件刷新；这里在渲染进程里派发，等价于界面自身触发的刷新。
    await webContents.executeJavaScript(
      `window.dispatchEvent(new CustomEvent('task-updated')); true`, true,
    );
    await delay(600);
    const afterSetDate = await webContents.executeJavaScript(
      `(() => {
        const section = document.querySelector('section[aria-labelledby="long-term-title"]');
        const buttons = Array.from(section.querySelectorAll('li button'));
        const inGrid = Array.from(document.querySelectorAll('main button')).some((b) => {
          const inPanel = b.closest('section[aria-labelledby="long-term-title"]') !== null;
          return !inPanel && (b.textContent || '').includes(${JSON.stringify(taskName)});
        });
        return { longTermTitles: buttons.map((b) => (b.textContent || '').trim()), inGrid };
      })()`,
      true,
    );
    check(
      !afterSetDate.longTermTitles.some((t) => t.includes(taskName)),
      `设定了截止日期后必须移出长期任务面板（实际 ${JSON.stringify(afterSetDate.longTermTitles)}）`,
    );
    check(afterSetDate.inGrid, '设定了截止日期的任务必须出现在周视图里');

    // 抽屉里的「设为长期任务」：清空日期后任务回到长期任务面板。
    // 周视图里的任务按钮没有 aria-label，只有 title=`${标题} · ${阶段}`，因此按属性定位。
    check(
      await renderer('domClick', { selector: `button[title^="${taskName}"]` }),
      '周视图中的任务应响应点击',
    );
    await waitFor('exists', [{ selector: '#detail-due-date' }], '从周视图打开任务详情');
    equal(await renderer('value', { selector: '#detail-due-date' }), defaultDueDate, '详情应载入已设的截止日期');
    // 「设为长期任务」是输入框下方的小号文字按钮，坐标点击在无头环境下不可靠，用 DOM click。
    await waitFor('exists', [{ selector: '[role="dialog"] button', text: '设为长期任务', exact: true }], '「设为长期任务」按钮出现');
    check(
      await renderer('domClick', { selector: '[role="dialog"] button', text: '设为长期任务', exact: true }),
      '「设为长期任务」按钮应响应点击',
    );
    await waitFor('valueIs', [{ selector: '#detail-due-date' }, ''], '截止日期已清空');
    equal((await api(`/api/tasks/${task.id}`)).due_date, null, '「设为长期任务」必须把 due_date 置空');
    // 该操作已提交，表单与任务一致，可正常关闭
    check(
      await renderer('domClick', { selector: '[role="dialog"] button[aria-label="关闭抽屉"]' }),
      '关闭抽屉按钮应响应点击',
    );
    await waitFor('absent', [{ selector: '[role="dialog"]' }], '详情抽屉关闭');
    await delay(600);
    // 恢复到常规视口，供后面的布局断言使用
    await setViewport(1400, 900);
    const afterClear = await webContents.executeJavaScript(
      `(() => {
        const section = document.querySelector('section[aria-labelledby="long-term-title"]');
        return Array.from(section.querySelectorAll('li button')).map((b) => (b.textContent || '').trim());
      })()`,
      true,
    );
    check(
      afterClear.some((t) => t.includes(taskName)),
      '「设为长期任务」后必须回到长期任务面板',
    );
    equal((await api(`/api/tasks/${task.id}`)).due_date, null, '「设为长期任务」必须把 due_date 置空');

    // 「关于」页：版本号必须与实际交付的版本一致，更新记录必须渲染出来。
    // 直接导航而不是点设置页的入口，避免 aria-label 里带版本号导致文案匹配变脆。
    await window.loadURL(`${baseUrl}/about`);
    await delay(600);
    await injectRendererHelper();
    await waitFor('pathIs', ['/about'], '进入关于页');
    await waitFor('exists', [{ selector: 'h1', text: '关于', exact: true }], '关于页标题出现');
    // 应用名来自 src/lib/version.ts，不在这里写死字符串，改名后自动跟随。
    equal(
      await renderer('text', { selector: '#about-title' }),
      expectedAppName,
      '关于页必须显示应用名',
    );
    // 版本号徽标的 class 恰好是 .badge，用文本内容断言而不是取第一个 .badge。
    check(
      await renderer(
        'exists',
        { selector: '#about-title', ancestorSelector: 'section', ancestorText: `v${projectPackageJson.version}` },
      ),
      `关于页必须显示版本 v${projectPackageJson.version}`,
    );
    // 注意：更新记录里版本号是 JSX 插值渲染的，SSR/客户端 HTML 会插入注释节点
    // （形如 v<!-- -->1.3.0），因此断言一律基于 textContent，不要匹配原始 HTML。
    // 另外 <h2 id="about-changelog"> 只是 section 的标题，article 是它的兄弟节点，
    // 不能用 `#about-changelog article` 这种后代选择器。
    const aboutChangelog = await webContents.executeJavaScript(
      `(() => {
        const section = document.querySelector('section[aria-labelledby="about-changelog"]');
        if (!section) return { sections: 0 };
        const articles = Array.from(section.querySelectorAll('article'));
        return {
          sections: 1,
          articles: articles.length,
          versions: articles.map((a) => (a.querySelector('h3')?.textContent || '').trim()),
          includesCurrent: articles.some((a) => (a.querySelector('h3')?.textContent || '').includes('v' + ${JSON.stringify(projectPackageJson.version)})),
        };
      })()`,
      true,
    );
    check(aboutChangelog.sections === 1, '关于页必须渲染更新记录区块');
    check(
      aboutChangelog.articles >= 2,
      `更新记录至少应包含两个版本（实际 ${aboutChangelog.articles}）`,
    );
    check(
      aboutChangelog.includesCurrent,
      `更新记录必须包含当前版本 v${projectPackageJson.version}（实际 ${JSON.stringify(aboutChangelog.versions)}）`,
    );
    check(
      await renderer('exists', { selector: '#about-features' }) && await renderer('exists', { selector: '#about-stack' }),
      '关于页必须包含功能介绍与运行信息',
    );
    check(
      await renderer(
        'exists',
        { selector: '#about-title', ancestorSelector: 'section', ancestorText: `v${projectPackageJson.version}` },
      ),
      `关于页必须显示版本 v${projectPackageJson.version}`,
    );
    void 0;
    // 回到看板，继续后面的布局断言
    await window.loadURL(`${baseUrl}/board`);
    await delay(600);
    await injectRendererHelper();
    await waitFor('pathIs', ['/board'], '返回看板');
    await waitFor('exists', [{ selector: 'h1', text: '看板', exact: true }], '看板重新加载完成');

    await setViewport(900, 600);
    const compactBoard = await waitFor('boardMetrics', [], '900x600 看板布局完成');
    check(compactBoard.overflow, '900x600 看板必须在内部提供横向滚动');
    check(compactBoard.minColumnWidth >= 250, '900x600 看板列宽必须可用');
    check(compactBoard.documentFits, '900x600 横向滚动不能泄漏到整个文档');
    check((await renderer('scrollBoard')) > 0, '900x600 看板必须能够实际横向滚动');

    await setViewport(1400, 900);
    const mediumBoard = await waitFor('boardMetrics', [], '1400x900 看板布局完成');
    check(mediumBoard.minColumnWidth >= 250, '1400x900 看板四列必须保持可用宽度');
    check(mediumBoard.documentFits, '1400x900 页面不能横向溢出');

    await setViewport(1920, 1080);
    const largeBoard = await waitFor('boardMetrics', [], '1920x1080 看板布局完成');
    check(largeBoard.minColumnWidth >= 250, '1920x1080 看板四列必须保持可用宽度');
    check(largeBoard.documentFits, '1920x1080 页面不能横向溢出');

    const unexpectedConsoleErrors = consoleErrors.filter((_message, index) => !allowedConsoleErrorIndexes.has(index));
    equal(runtimeErrors.length, 0, `浏览器运行时不能报错：${runtimeErrors.join('；')}`);
    equal(unexpectedConsoleErrors.length, 0, `浏览器 console 不能有未预期错误：${unexpectedConsoleErrors.join('；')}`);
    console.log(`[UI 冒烟] 全部通过，共 ${assertions} 项断言；受控输入兼容分支 ${valueFallbacks} 次`);
  } catch (error) {
    suiteFailure = error;
  } finally {
    clearTimeout(watchdog);
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, null);
    if (!window.isDestroyed()) window.destroy();
    if (!watchdogFired) app.quit();
  }

  if (suiteFailure) throw suiteFailure;
}

if (process.versions.electron && process.argv.includes('--electron-runner')) {
  runElectronSuite().catch((error) => {
    console.error('[UI 冒烟] 失败：', error);
    process.exitCode = 1;
    try {
      require('electron').app.exit(1);
    } catch {
      // Electron 已退出时无需额外处理。
    }
  });
} else {
  run().catch((error) => {
    console.error('[UI 冒烟] 失败：', error);
    console.error('[UI 冒烟] 为便于排查，隔离数据保留在本次运行的临时目录中。');
    process.exitCode = 1;
  });
}
