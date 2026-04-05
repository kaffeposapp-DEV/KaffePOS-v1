 
 
 
 
 
 
// src/components/ui/DeleteConfirmSheet.tsx

import { Trash2, X } from 'lucide-react';

interface Props {
  visible:   boolean;
  title:     string;
  message?:  string;
  onConfirm: () => void;
  onCancel:  () => void;
}

export default function DeleteConfirmSheet({ visible, title, message, onConfirm, onCancel }: Props) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center"
      onClick={onCancel}>
      <div className="bg-white w-full max-w-md rounded-t-3xl p-5 pb-8"
        onClick={e => e.stopPropagation()}>
        {/* Handle bar */}
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />

        {/* Icon */}
        <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Trash2 size={26} className="text-red-500" />
        </div>

        {/* Text */}
        <h3 className="font-black text-slate-800 text-xl text-center mb-1">{title}</h3>
        {message && (
          <p className="text-slate-400 text-sm text-center mb-5">{message}</p>
        )}
        {!message && <div className="mb-5" />}

        {/* Buttons */}
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-3.5 border-2 border-slate-200 text-slate-600 font-bold rounded-2xl active:scale-95 flex items-center justify-center gap-2">
            <X size={16} /> Batal
          </button>
          <button onClick={() => { onConfirm(); onCancel(); }}
            className="flex-1 py-3.5 bg-red-500 text-white font-black rounded-2xl active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-red-200">
            <Trash2 size={16} /> Hapus
          </button>
        </div>
      </div>
    </div>
  );
}
