'use client';

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from 'react';
import { Theme, allThemes, THEME_STORAGE_KEY } from '@/lib/themes';

interface ThemeContextType {
  theme: Theme;
  setTheme: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: allThemes[0],
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function applyVars(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.dataset.themeMode = theme.mode;
  root.style.colorScheme = theme.mode;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', theme.vars['--t-surface']);
  for (const [key, val] of Object.entries(theme.vars)) {
    root.style.setProperty(key, val);
  }
}

const serializedThemes = JSON.stringify(
  Object.fromEntries(allThemes.map((theme) => [theme.id, { mode: theme.mode, vars: theme.vars }])),
).replaceAll('<', '\\u003c');

/** 在 React 水合前恢复主题，避免亮色主题先闪出暗色界面。 */
export const THEME_BOOTSTRAP_SCRIPT = `(() => {
  try {
    const themes = ${serializedThemes};
    const isKnown = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(themes, id);
    // 优先用 preload 同步注入的主进程配置值（跨 origin 稳定）；
    // 纯浏览器环境没有 electronAPI，退回 localStorage。
    let stored = null;
    try {
      const injected = window.electronAPI && window.electronAPI.initialTheme;
      stored = isKnown(injected) ? injected : localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    } catch (error) {
      try { stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}); } catch (innerError) { stored = null; }
    }
    const known = isKnown(stored);
    const selected = known ? themes[stored] : themes.default;
    const root = document.documentElement;
    root.dataset.theme = known ? stored : 'default';
    root.dataset.themeMode = selected.mode;
    root.style.colorScheme = selected.mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', selected.vars['--t-surface']);
    Object.entries(selected.vars).forEach(([key, value]) => root.style.setProperty(key, value));
  } catch {}
})();`;

const THEME_CHANGED_EVENT = 'project-tracker-theme-changed';

/**
 * 主题的持久化有两个来源，职责不同：
 *
 * 1) localStorage —— 仅在「页面首个脚本」阶段使用。Electron 的 preload 已通过
 *    同步 IPC 把主进程配置里的主题注入 window.electronAPI.initialTheme，
 *    引导脚本据此在首屏前设好变量，因此不会闪默认主题。
 *    保留 localStorage 是为了让纯浏览器（无 Electron）也能记住主题。
 * 2) 主进程 settings.json —— 真正的存储位置。localStorage 按 origin（含端口）
 *    隔离，换个访问地址主题就丢了；配置文件没有这个问题。
 *
 * 首次在 Electron 中加载时，如果 localStorage 里有旧记录而配置里还没有，
 * 会把旧记录迁移过去（迁完即清掉 localStorage，避免两个来源不一致）。
 */
const electronApi = () => (typeof window === 'undefined' ? undefined : window.electronAPI);

/**
 * 同步可读的初始主题：Electron 用 preload 注入值，浏览器退回 localStorage。
 * 在模块加载时求值一次——此时 preload 已经跑过、localStorage 也已可用，
 * 因此 useSyncExternalStore 在首次渲染就能拿到正确快照，不会先画默认主题。
 */
function readInitialThemeId(): string {
  if (typeof window === 'undefined') return 'default';
  const injected = electronApi()?.initialTheme;
  if (typeof injected === 'string' && injected) return injected;
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'default';
  } catch {
    return 'default';
  }
}

let currentThemeId = readInitialThemeId();

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(THEME_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(THEME_CHANGED_EVENT, onStoreChange);
  };
}

/** 快照必须是稳定值（字符串），否则每次读取都会触发重渲染。 */
function getThemeSnapshot() {
  return currentThemeId;
}

function getServerThemeSnapshot() {
  return 'default';
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeId = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );
  const theme = allThemes.find((item) => item.id === themeId) || allThemes[0];

  /**
   * 把主题交给主进程持久化；纯浏览器环境退回 localStorage。
   * 只有确认写入成功后才清理 localStorage——否则一旦写失败（例如主进程拒绝了这次调用），
   * 用户的旧选择会既没进配置、又被删掉，等于彻底丢失。
   */
  const persistTheme = useCallback(async (id: string): Promise<boolean> => {
    const api = electronApi();
    if (api?.setTheme) {
      await api.setTheme(id);
      try { localStorage.removeItem(THEME_STORAGE_KEY); } catch { /* 忽略 */ }
      return true;
    }
    try { localStorage.setItem(THEME_STORAGE_KEY, id); } catch { /* 忽略 */ }
    return false;
  }, []);

  useEffect(() => {
    applyVars(theme);
  }, [theme]);

  useEffect(() => {
    const api = electronApi();
    if (!api?.setTheme) return;
    // 迁移：旧版本只写 localStorage，而旧 settings.json 里根本没有 theme 字段
    // （此时 initialTheme 为 null）。所以只要 localStorage 里还有记录，
    // 就以它为准写入配置——不能因为 initialTheme 为空就跳过迁移。
    let legacy: string | null = null;
    try { legacy = localStorage.getItem(THEME_STORAGE_KEY); } catch { legacy = null; }
    if (!legacy) return;
    if (legacy !== api.initialTheme) {
      // 旧选择与配置不一致：以旧选择为准并写入配置（成功写入后 persistTheme 会清理 localStorage）。
      currentThemeId = legacy;
      applyVars(allThemes.find((item) => item.id === legacy) || allThemes[0]);
      window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
      void persistTheme(legacy).catch(() => {
        // 迁移失败则保留 localStorage，下次启动再试。
      });
    } else {
      try { localStorage.removeItem(THEME_STORAGE_KEY); } catch { /* 忽略 */ }
    }
  }, [persistTheme]);

  const setTheme = useCallback((id: string) => {
    const selected = allThemes.find((item) => item.id === id) || allThemes[0];
    currentThemeId = selected.id;
    applyVars(selected);
    window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
    void persistTheme(selected.id).catch((error) => {
      console.error('[theme] 主题保存失败:', error);
    });
  }, [persistTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
