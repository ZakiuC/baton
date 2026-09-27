'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useCanUseDOM } from '@/lib/use-electron';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.tabIndex >= 0 && element.getAttribute('aria-hidden') !== 'true',
  );
}

function isTopmostDialog(dialog: HTMLElement) {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
  return dialogs[dialogs.length - 1] === dialog;
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: string;
}

export default function Drawer({ open, onClose, title, children, width = '480px' }: DrawerProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const canUseDOM = useCanUseDOM();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || !canUseDOM) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const appShell = document.querySelector<HTMLElement>('.app-shell');
    const appShellWasInert = appShell?.inert ?? false;
    const previousBodyOverflow = document.body.style.overflow;

    // 门户位于 app-shell 外部，因此可以安全禁用其余应用内容。
    if (appShell) appShell.inert = true;
    document.body.style.overflow = 'hidden';

    const focusFrame = window.requestAnimationFrame(() => {
      const initialFocus = dialog.querySelector<HTMLElement>('[data-initial-focus]')
        || getFocusableElements(dialog)[0]
        || dialog;
      initialFocus.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmostDialog(dialog)) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const activeIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
      const lastIndex = focusableElements.length - 1;

      if (event.shiftKey && activeIndex <= 0) {
        event.preventDefault();
        focusableElements[lastIndex].focus();
      } else if (!event.shiftKey && (activeIndex === -1 || activeIndex === lastIndex)) {
        event.preventDefault();
        focusableElements[0].focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      if (appShell) appShell.inert = appShellWasInert;
      document.body.style.overflow = previousBodyOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [canUseDOM, open]);

  if (!open || !canUseDOM) return null;

  return createPortal(
    <div
      className="overlay justify-end"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="h-full flex flex-col animate-slide-in-right overflow-hidden overscroll-contain"
        style={{
          width,
          maxWidth: '92vw',
          background: 'var(--t-card)',
          borderLeft: '1px solid var(--t-border)',
        }}
      >
        {/* 头部 */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0 sticky top-0 z-10"
          style={{ background: 'var(--t-card)' }}
        >
          <h2 id={titleId} className="text-sm font-semibold text-primary">{title || '详情'}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭抽屉"
            className="icon-button"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
