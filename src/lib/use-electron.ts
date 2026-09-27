'use client';

import { useSyncExternalStore } from 'react';

/**
 * 浏览器与 Electron 渲染进程共用同一份代码，服务端渲染阶段必须返回 false，
 * 否则会因 window 不存在而水合不一致。
 */
const subscribeToNothing = () => () => undefined;
const getBrowserSnapshot = () => true;
const getServerSnapshot = () => false;
const getElectronSnapshot = () => Boolean(
  typeof window !== 'undefined' && window.electronAPI,
);
const getServerElectronSnapshot = () => false;

/** 水合完成后才为 true，避免服务端/客户端快照不一致。 */
export function useCanUseDOM(): boolean {
  return useSyncExternalStore(subscribeToNothing, getBrowserSnapshot, getServerSnapshot);
}

/** 仅在 Electron 渲染进程中为 true。 */
export function useIsElectron(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    getElectronSnapshot,
    getServerElectronSnapshot,
  );
}
