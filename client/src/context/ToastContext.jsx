import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((msg, type = 'info', duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    setToasts((prev) => [...prev, { id, msg, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showSuccess = useCallback((msg) => addToast(msg, 'success'), [addToast]);
  const showError = useCallback((msg) => addToast(msg, 'error', 6000), [addToast]);
  const showWarn = useCallback((msg) => addToast(msg, 'warn', 5000), [addToast]);
  const showInfo = useCallback((msg) => addToast(msg, 'info'), [addToast]);

  return (
    <ToastContext.Provider value={{ showSuccess, showError, showWarn, showInfo }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        {toasts.map((t) => {
          const typeStyles = {
            success: 'bg-emerald-900/95 text-emerald-100 border-emerald-700 shadow-emerald-950/20',
            error: 'bg-rose-900/95 text-rose-100 border-rose-700 shadow-rose-950/20',
            warn: 'bg-amber-900/95 text-amber-100 border-amber-700 shadow-amber-950/20',
            info: 'bg-slate-900/95 text-slate-100 border-slate-700 shadow-slate-950/20',
          };
          const icons = {
            success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />,
            error: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />,
            warn: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />,
            info: <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />,
          };
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border backdrop-blur-md shadow-xl text-xs font-medium transition-all transform translate-y-0 ${typeStyles[t.type]}`}
            >
              {icons[t.type]}
              <div className="flex-1 leading-snug">{t.msg}</div>
              <button onClick={() => removeToast(t.id)} className="opacity-60 hover:opacity-100 transition-opacity">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
