'use client';

import { useSyncExternalStore } from 'react';
import { APP_VERSION } from '@/lib/version';

/**
 * 应用版本号。
 *
 * preload 在页面首个脚本执行前就用同步 IPC 把版本注入 window.electronAPI.appVersion，
 * 因此首帧即可读到，无需 effect + setState（那会多一次渲染，也会触发
 * react-hooks/set-state-in-effect）。
 *
 * 快照是稳定字符串，浏览器环境（无 Electron）回落到源码里的 APP_VERSION；
 * 服务端快照同样用 APP_VERSION，保证水合一致。
 */
const subscribeToNothing = () => () => undefined;
const getInjectedVersion = () => {
  const injected = typeof window === 'undefined' ? null : window.electronAPI?.appVersion;
  return typeof injected === 'string' && injected ? injected : APP_VERSION;
};
const getServerVersion = () => APP_VERSION;

export function useAppVersion(): string {
  return useSyncExternalStore(subscribeToNothing, getInjectedVersion, getServerVersion);
}
