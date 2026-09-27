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

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export default function Modal({ open, onClose, title, children, width = '440px' }: ModalProps) {
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
      className="overlay items-center justify-center"
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
        className="card animate-slide-in-up p-0 overflow-hidden overscroll-contain flex flex-col"
        style={{ width, maxWidth: '92vw', maxHeight: '88vh' }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
          <h2 id={titleId} className="text-sm font-semibold text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭对话框"
            className="icon-button"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        {/* 内容 */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
