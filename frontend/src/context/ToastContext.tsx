import React, { createContext, useCallback, useContext, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────
export type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

// ── Context ────────────────────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

// ── Provider + Container ───────────────────────────────────────────────────
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Fixed top-right toast stack */}
      <div
        className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 pointer-events-none"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

// ── Individual Toast Item ──────────────────────────────────────────────────
const VARIANT_STYLES: Record<ToastVariant, { wrapper: string; icon: string }> = {
  success: {
    wrapper:
      'bg-emerald-950/90 border border-emerald-500/40 text-emerald-100 shadow-emerald-900/40',
    icon: '✅',
  },
  error: {
    wrapper:
      'bg-red-950/90 border border-red-500/40 text-red-100 shadow-red-900/40',
    icon: '❌',
  },
  info: {
    wrapper:
      'bg-slate-900/90 border border-slate-600/40 text-slate-100 shadow-slate-900/40',
    icon: 'ℹ️',
  },
};

const ToastItem: React.FC<{ toast: ToastItem; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  const styles = VARIANT_STYLES[toast.variant];

  return (
    <div
      className={`
        pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-2xl
        min-w-[280px] max-w-[380px] text-sm font-semibold backdrop-blur-md shadow-xl
        animate-in slide-in-from-right-4 fade-in duration-300
        ${styles.wrapper}
      `}
      role="alert"
    >
      <span className="text-base shrink-0 mt-px" aria-hidden="true">
        {styles.icon}
      </span>
      <span className="flex-1 leading-snug text-xs">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity ml-1 text-xs font-bold"
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
};
