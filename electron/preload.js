const { contextBridge, ipcRenderer } = require("electron");

// 主题必须在页面第一个脚本执行前就位，否则会先闪一下默认主题。
// sendSync 只在窗口加载时调用一次，代价是主进程读一个小 JSON。
let initialTheme = null;
try {
  const theme = ipcRenderer.sendSync("theme:get");
  if (typeof theme === "string" && theme) initialTheme = theme;
} catch (error) {
  // 拿不到就退回渲染进程的 localStorage 逻辑，但要让原因可见。
  console.error("[preload] 读取初始主题失败:", error);
  initialTheme = null;
}

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld("electronAPI", {
  // 主题：首屏同步取到的初始值 + 写回主进程配置
  initialTheme,
  setTheme: (themeId) => ipcRenderer.invoke("set-settings", { theme: themeId }),

  // 应用版本（与打包时的 package.json 一致）
  appVersion: (() => {
    try {
      return ipcRenderer.sendSync("app:get-version");
    } catch {
      return null;
    }
  })(),

  // 设置
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: (settings) => ipcRenderer.invoke("set-settings", settings),
  getAutoLaunch: () => ipcRenderer.invoke("get-auto-launch"),
  setAutoLaunch: (enabled) => ipcRenderer.invoke("set-auto-launch", enabled),

  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke("window-minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window-maximize"),
  closeWindow: () => ipcRenderer.invoke("window-close"),
  isMaximized: () => ipcRenderer.invoke("window-is-maximized"),

  // 监听主进程事件
  onAutoLaunchChanged: (callback) => {
    ipcRenderer.on("auto-launch-changed", (_event, enabled) =>
      callback(enabled)
    );
  },
  onWindowStateChanged: (callback) => {
    ipcRenderer.on("window-state-changed", (_event, state) =>
      callback(state)
    );
  },
});
