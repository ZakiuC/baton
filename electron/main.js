const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const { spawn } = require("child_process");
const http = require("http");
const AutoLaunch = require("auto-launch");

// === 持久化设置 ===
const configuredUserDataPath = process.env.PROJECT_TRACKER_USER_DATA_DIR;
const canonicalUserDataPath = configuredUserDataPath
  ? path.resolve(configuredUserDataPath)
  : path.join(app.getPath("appData"), "project-tracker");
app.setPath("userData", canonicalUserDataPath);
const userDataPath = app.getPath("userData");
const settingsPath = path.join(userDataPath, "settings.json");
const DEFAULT_SETTINGS = { autoLaunch: false, minimizeToTray: true, theme: "default" };

// 主题存在主进程配置文件里，而不是渲染进程的 localStorage：
// localStorage 按 origin（含端口）隔离，换个访问地址主题就丢了。
function isValidThemeId(value) {
  return typeof value === "string" && /^[a-z0-9-]{1,64}$/.test(value);
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (error) {
    console.error("[main] 设置读取失败，将使用默认值:", error);
  }
  return { ...DEFAULT_SETTINGS };
}
function saveSettings(s) {
  const merged = { ...loadSettings(), ...s };
  fs.mkdirSync(userDataPath, { recursive: true });
  const temporaryPath = `${settingsPath}.tmp-${process.pid}-${randomUUID()}`;
  let descriptor = null;
  try {
    descriptor = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(descriptor, JSON.stringify(merged), "utf-8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(temporaryPath, settingsPath);
  } catch (error) {
    if (descriptor !== null) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw error;
  }
  return merged;
}
function getSetting(key) { return loadSettings()[key]; }
// === 开机自启 ===
const autoLauncher = new AutoLaunch({ name: "ProjectTracker" });

let mainWindow = null;
let tray = null;
let isQuitting = false;
let serverProcess = null;
const SERVER_PORT = 3099;
const SERVER_HOST = "127.0.0.1";
const isDev = !app.isPackaged;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

// === 托盘图标 ===
function createTrayIcon() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.sqrt((x - 8) ** 2 + (y - 8) ** 2);
      if (d < 7) { buf[i] = 99; buf[i + 1] = 102; buf[i + 2] = 241; buf[i + 3] = 255; }
      else { buf[i + 3] = 0; }
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

// === 启动 Next.js standalone 服务器 ===
async function startServer() {
  const candidates = [
    path.join(process.resourcesPath, "standalone", "server.js"),
    path.join(__dirname, "..", ".next", "standalone", "server.js"),
  ];
  const serverPath = candidates.find(fs.existsSync);
  if (!serverPath) throw new Error("未找到服务入口：" + candidates.join(", "));

  const cwd = path.dirname(serverPath);
  const dataDir = process.env.APP_DATA_DIR
    ? path.resolve(process.env.APP_DATA_DIR)
    : path.join(userDataPath, "data");

  console.log("[main] 随包运行时:", process.execPath, "\n[main] 服务入口:", serverPath);

  const child = spawn(process.execPath, [serverPath], {
    cwd,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(SERVER_PORT),
      HOSTNAME: SERVER_HOST,
      APP_DATA_DIR: dataDir,
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  serverProcess = child;
  child.stdout?.on("data", (data) => process.stdout.write("[服务] " + data));
  child.stderr?.on("data", (data) => process.stderr.write("[服务错误] " + data));
  child.on("error", (error) => console.error("[main] 服务进程启动失败:", error));
  child.on("exit", (code) => {
    console.log("[main] 服务进程已退出:", code);
    if (serverProcess === child) serverProcess = null;
  });

  try {
    await waitForServer(`http://${SERVER_HOST}:${SERVER_PORT}/api/dashboard`, child);
  } catch (error) {
    if (child.exitCode === null) child.kill();
    throw error;
  }
}

function waitForServer(url, child, maxAttempts = 30, retryDelay = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    let retryTimer = null;
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (retryTimer) clearTimeout(retryTimer);
      child.off("exit", handleEarlyExit);
      callback(value);
    };

    const handleEarlyExit = (code) => {
      finish(reject, new Error(`服务进程在就绪前退出，退出码：${code}`));
    };

    const retry = () => {
      if (settled) return;
      attempts += 1;
      if (attempts >= maxAttempts) {
        finish(reject, new Error("服务启动超时或就绪响应无效"));
      } else {
        retryTimer = setTimeout(check, retryDelay);
      }
    };

    const check = () => {
      const request = http.get(url, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          if (body.length < 1024 * 1024) body += chunk;
        });
        response.on("end", () => {
          try {
            const payload = JSON.parse(body);
            const valid = response.statusCode === 200
              && payload?.stats
              && Array.isArray(payload.projects)
              && Array.isArray(payload.urgentItems)
              && Array.isArray(payload.recentActivity);
            if (valid) finish(resolve, true);
            else retry();
          } catch {
            retry();
          }
        });
      });
      request.setTimeout(2000, () => request.destroy());
      request.on("error", retry);
    };

    child.once("exit", handleEarlyExit);
    check();
  });
}

// === 创建窗口 ===
async function createWindow() {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "ProjectTracker",
    backgroundColor: "#FAFAFB",
    // 使用原生标题栏，确保关闭/最小化/最大化始终可用
    frame: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });
  mainWindow = window;

  window.once("ready-to-show", () => {
    window.show();
    window.focus();
  });

  window.on("close", (event) => {
    if (!isQuitting && getSetting("minimizeToTray")) {
      event.preventDefault();
      window.hide();
    }
  });

  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  const url = isDev ? `http://${SERVER_HOST}:3000` : `http://${SERVER_HOST}:${SERVER_PORT}`;
  await window.loadURL(url);

}

// === 托盘 ===
function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("ProjectTracker");
  const buildMenu = () => Menu.buildFromTemplate([
    { label: "显示窗口", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: "separator" },
    { label: "开机自启", type: "checkbox", checked: getSetting("autoLaunch"),
      click: (mi) => { setAutoLaunch(mi.checked).catch((error) => {
        mi.checked = !mi.checked;
        console.error("[main] 开机自启设置失败:", error);
      }); } },
    { type: "separator" },
    { label: "退出", click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(buildMenu());
  tray.on("right-click", () => tray.setContextMenu(buildMenu()));
  tray.on("double-click", () => { mainWindow?.show(); mainWindow?.focus(); });
}

// === 开机自启 ===
async function setAutoLaunch(on) {
  if (typeof on !== "boolean") throw new Error("开机自启设置必须是布尔值");
  const previous = Boolean(getSetting("autoLaunch"));
  await (on ? autoLauncher.enable() : autoLauncher.disable());
  try {
    saveSettings({ autoLaunch: on });
  } catch (error) {
    await (previous ? autoLauncher.enable() : autoLauncher.disable()).catch(() => {});
    throw error;
  }
  mainWindow?.webContents.send("auto-launch-changed", on);
  return on;
}

// === IPC ===
ipcMain.handle("get-auto-launch", () => getSetting("autoLaunch"));
ipcMain.handle("set-auto-launch", (_event, value) => setAutoLaunch(value));
ipcMain.handle("get-settings", () => loadSettings());
// preload 用 sendSync 在首屏之前取主题：异步 IPC 会让界面先闪一下默认主题。
ipcMain.on("theme:get", (event) => {
  event.returnValue = getSetting("theme");
});
// 版本号取自 package.json（electron-builder 打包时也用它），
// 因此「关于」页显示的版本必然与安装包一致。
ipcMain.on("app:get-version", (event) => {
  event.returnValue = app.getVersion();
});
ipcMain.handle("set-settings", async (_event, settings) => {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error("设置格式无效");
  }
  // 先整体校验，任何一项非法都不产生副作用。
  // （历史缺陷：setAutoLaunch(undefined) 会抛错，导致同一批里的主题写入被静默吞掉。）
  if (settings.autoLaunch !== undefined && typeof settings.autoLaunch !== "boolean") {
    throw new Error("开机自启设置必须是布尔值");
  }
  if (settings.theme !== undefined && !isValidThemeId(settings.theme)) {
    throw new Error("主题标识无效");
  }
  if (settings.minimizeToTray !== undefined && typeof settings.minimizeToTray !== "boolean") {
    throw new Error("托盘设置必须是布尔值");
  }

  const previousAutoLaunch = Boolean(getSetting("autoLaunch"));
  let changedAutoLaunch = false;
  try {
    if (settings.theme !== undefined) saveSettings({ theme: settings.theme });
    if (settings.autoLaunch !== undefined) {
      await setAutoLaunch(settings.autoLaunch);
      changedAutoLaunch = true;
    }
    if (settings.minimizeToTray !== undefined) {
      saveSettings({ minimizeToTray: settings.minimizeToTray });
    }
  } catch (error) {
    // 部分失败时不能让用户以为设置已保存。
    if (changedAutoLaunch) {
      await (previousAutoLaunch ? autoLauncher.enable() : autoLauncher.disable()).catch(() => {});
    }
    throw error;
  }
  return loadSettings();
});
ipcMain.handle("window-minimize", () => mainWindow?.minimize());
ipcMain.handle("window-maximize", () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle("window-close", () => mainWindow?.close());
ipcMain.handle("window-is-maximized", () => mainWindow?.isMaximized() ?? false);

// === 生命周期 ===
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    // 禁用默认菜单栏（File/Edit/View/Window）
    Menu.setApplicationMenu(null);

    try {
      if (!isDev) await startServer();
      await createWindow();
      createTray();

      if (getSetting("autoLaunch")) {
        autoLauncher.isEnabled().then(en => { if (!en) autoLauncher.enable().catch(() => {}); }).catch(() => {});
      }
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
        else mainWindow?.show();
      });
      mainWindow.on("maximize", () => mainWindow.webContents.send("window-state-changed", { maximized: true }));
      mainWindow.on("unmaximize", () => mainWindow.webContents.send("window-state-changed", { maximized: false }));
    } catch (err) {
      console.error("[main] 启动失败:", err);
      if (!mainWindow) mainWindow = new BrowserWindow({ width: 500, height: 300 });
      const message = err instanceof Error ? err.message : String(err);
      const safeMessage = message
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
      const errorPage = `<body style="background:#FAFAFB;color:#1B1C24;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>启动失败</h2><p style="color:#DC2626">${safeMessage}</p></div></body>`;
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorPage)}`);
      mainWindow.show();
    }
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  serverProcess?.kill();
  serverProcess = null;
  tray?.destroy();
  tray = null;
});
