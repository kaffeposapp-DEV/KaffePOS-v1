 
 
 
/* eslint-disable react-refresh/only-export-components */
 
 
// src/components/ui/Toast.tsx
import { useEffect, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X, FolderOpen } from 'lucide-react';
import type { ToastMessage } from '@/types';

// ── Toast Item ─────────────────────────────────────────────────────
interface ToastItemProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const duration = toast.duration ?? 4000;

  useEffect(() => {
    if (duration <= 0) return;
    const t = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(t);
  }, [toast.id, duration, onDismiss]);

  const styles = {
    success: {
      bg: 'bg-slate-900 border-green-500/40',
      icon: <CheckCircle2 size={18} className="text-green-400 shrink-0" />,
    },
    warning: {
      bg: 'bg-slate-900 border-yellow-500/40',
      icon: <AlertTriangle size={18} className="text-yellow-400 shrink-0" />,
    },
    error: {
      bg: 'bg-slate-900 border-red-500/40',
      icon: <XCircle size={18} className="text-red-400 shrink-0" />,
    },
    info: {
      bg: 'bg-slate-900 border-blue-500/40',
      icon: <Info size={18} className="text-blue-400 shrink-0" />,
    },
  };

  const s = styles[toast.type];

  return (
    <div className={`flex items-start gap-3 ${s.bg} border rounded-xl px-4 py-3 shadow-2xl min-w-[280px] max-w-[360px] animate-in slide-in-from-bottom-4`}>
      {s.icon}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium leading-tight">{toast.message}</p>
        {toast.action && (
          <button
            onClick={() => { toast.action!.onClick(); onDismiss(toast.id); }}
            className="flex items-center gap-1 mt-2 text-orange-400 text-xs font-bold hover:text-orange-300 transition-colors">
            <FolderOpen size={13} />
            {toast.action.label}
          </button>
        )}
      </div>
      <button onClick={() => onDismiss(toast.id)}
        className="text-slate-500 hover:text-white transition-colors shrink-0 -mt-0.5">
        <X size={14} />
      </button>
    </div>
  );
}

// ── Toast Container ────────────────────────────────────────────────
interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (!toasts.length) return null;

  return (
    <div
      className="fixed z-[9999] flex flex-col gap-2 pointer-events-none"
      style={{
        bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'max-content',
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}

// ── useToast hook ──────────────────────────────────────────────────
import { useState } from 'react';
import type { ToastType } from '@/types';

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([],   );

  const showToast = useCallback((
    message: string,
    type: ToastType = 'success',
    options?: {
      duration?: number;
      action?: { label: string; onClick: () => void };
    }
  ) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev, { id, message, type, ...options }]);
  }, [],   );

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, [],   );

  // Convenience: show download success with "Open File" button
  const showDownloadSuccess = useCallback((fileName: string, onOpen?: () => void) => {
    const options: { duration: number; action?: { label: string; onClick: () => void } } = {
      duration: 8000,
    };
    if (onOpen) {
      options.action = { label: 'Buka File', onClick: onOpen };
    }
    showToast(`✅ File tersimpan: ${fileName}`, 'success', options);
  }, [showToast]);

  const showDownloadError = useCallback((error: string) => {
    showToast(`❌ Download gagal: ${error}`, 'error', { duration: 6000 });
  }, [showToast]);

  return { toasts, showToast, dismissToast, showDownloadSuccess, showDownloadError };
}
