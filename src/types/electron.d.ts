export {};

declare global {
  interface Window {
    electronAPI?: {
      /** preload 在页面首个脚本执行前同步注入的主题 id */
      initialTheme?: string | null;
      /** 应用版本号，与打包时的 package.json 一致；浏览器环境为 null */
      appVersion?: string | null;
      setTheme: (themeId: string) => Promise<ThemeSettings>;
      getSettings: () => Promise<ThemeSettings>;
      setSettings: (settings: {
        autoLaunch?: boolean;
        minimizeToTray?: boolean;
        theme?: string;
      }) => Promise<ThemeSettings>;
      getAutoLaunch: () => Promise<boolean>;
      setAutoLaunch: (enabled: boolean) => Promise<boolean>;
      minimizeWindow: () => Promise<void>;
      maximizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
      onAutoLaunchChanged: (callback: (enabled: boolean) => void) => void;
      onWindowStateChanged: (callback: (state: { maximized: boolean }) => void) => void;
    };
  }
}

interface ThemeSettings {
  autoLaunch: boolean;
  minimizeToTray: boolean;
  theme: string;
}
