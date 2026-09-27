'use client';

import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type FeedbackTone = 'success' | 'error' | 'info';

interface FeedbackMessage {
  text: string;
  tone: FeedbackTone;
}

interface FeedbackContextValue {
  notify: (text: string, tone?: FeedbackTone) => void;
}

const FeedbackContext = createContext<FeedbackContextValue>({
  notify: () => undefined,
});

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function useFeedback() {
  return useContext(FeedbackContext);
}

export default function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setMessage(null);
  }, []);

  const notify = useCallback((text: string, tone: FeedbackTone = 'info') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage({ text, tone });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setMessage(null);
    }, tone === 'error' ? 5200 : 3200);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const Icon = message ? ICONS[message.tone] : Info;

  return (
    <FeedbackContext.Provider value={{ notify }}>
      {children}
      <div className="feedback-region" aria-live="polite" aria-atomic="true">
        {message ? (
          <div
            className={`feedback-toast feedback-toast-${message.tone}`}
            role={message.tone === 'error' ? 'alert' : 'status'}
          >
            <Icon size={16} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-sm leading-snug">{message.text}</span>
            <button type="button" className="icon-button" onClick={dismiss} aria-label="关闭提示">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </FeedbackContext.Provider>
  );
}
