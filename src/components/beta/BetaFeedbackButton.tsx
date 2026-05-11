import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, MessageSquareText, Send, X } from 'lucide-react';
import { ApiError, submitBetaFeedback } from '@/lib/backendApi';
import { normalizeUserFacingError } from '@/lib/errorMessages';

type Toast = { showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void };

type FeedbackDraft = {
  store_id?: string | null;
  liked: string;
  improve: string;
  metadata?: Record<string, unknown>;
};

const QUEUE_KEY = 'kpos_beta_feedback_queue';

function readQueue(): FeedbackDraft[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: FeedbackDraft[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-20)));
  } catch {
    /* ignore */
  }
}

function queueFeedback(payload: FeedbackDraft) {
  writeQueue([...readQueue(), payload]);
}

export default function BetaFeedbackButton({ storeId, toast }: { storeId?: string | null; toast: Toast }) {
  const [open, setOpen] = useState(false);
  const [liked, setLiked] = useState('');
  const [improve, setImprove] = useState('');
  const [saving, setSaving] = useState(false);
  const [queuedCount, setQueuedCount] = useState(() => readQueue().length);

  const canSubmit = useMemo(() => liked.trim().length > 0 || improve.trim().length > 0, [improve, liked]);

  useEffect(() => {
    const flushQueue = async () => {
      if (!navigator.onLine) return;
      const queue = readQueue();
      if (queue.length === 0) {
        setQueuedCount(0);
        return;
      }

      const remaining: FeedbackDraft[] = [];
      for (const item of queue) {
        try {
          await submitBetaFeedback(item);
        } catch (error) {
          remaining.push(item);
          if (error instanceof ApiError && error.status === 0) break;
        }
      }
      writeQueue(remaining);
      setQueuedCount(remaining.length);
      if (remaining.length < queue.length) {
        toast.showToast('Feedback beta offline berhasil disinkronkan.', 'success');
      }
    };

    void flushQueue();
    window.addEventListener('online', flushQueue);
    return () => window.removeEventListener('online', flushQueue);
  }, [toast]);

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.showToast('Isi minimal satu kolom feedback dulu.', 'warning');
      return;
    }

    const payload: FeedbackDraft = {
      store_id: storeId || null,
      liked: liked.trim(),
      improve: improve.trim(),
      metadata: {
        userAgent: navigator.userAgent,
        path: window.location.pathname,
        submittedAt: new Date().toISOString(),
      },
    };

    try {
      setSaving(true);
      if (!navigator.onLine) {
        queueFeedback(payload);
        setQueuedCount(readQueue().length);
        setLiked('');
        setImprove('');
        setOpen(false);
        toast.showToast('Feedback disimpan offline dan akan terkirim saat online.', 'success');
        return;
      }

      await submitBetaFeedback(payload);
      setLiked('');
      setImprove('');
      setOpen(false);
      toast.showToast('Feedback beta terkirim. Terima kasih.', 'success');
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        queueFeedback(payload);
        setQueuedCount(readQueue().length);
        setLiked('');
        setImprove('');
        setOpen(false);
        toast.showToast('Feedback disimpan offline dan akan terkirim otomatis.', 'success');
        return;
      }
      toast.showToast(normalizeUserFacingError(error, 'Feedback belum bisa dikirim.'), 'warning');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(78px+env(safe-area-inset-bottom,0px))] right-4 z-40 inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-orange-100 bg-white px-4 text-xs font-black uppercase tracking-wider text-[#FF6A00] shadow-[0_14px_34px_rgba(31,41,51,0.10)] transition-all hover:-translate-y-0.5 hover:bg-orange-50 lg:bottom-5 lg:right-5"
        aria-label="Kirim feedback closed beta"
        title="Kirim feedback closed beta"
      >
        <MessageSquareText size={17} />
        <span className="hidden sm:inline">Feedback</span>
        {queuedCount > 0 ? (
          <span className="ml-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] text-orange-700 ring-1 ring-orange-100">
            {queuedCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="kaffe-modal-overlay fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 p-3 backdrop-blur-sm sm:items-center">
          <section className="kaffe-panel kaffe-modal-panel w-full max-w-lg rounded-3xl bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-widest text-[#FF6A00]">Closed Beta</p>
                <h2 className="font-display mt-1 text-xl font-extrabold text-slate-900">Feedback singkat</h2>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">
                  Bantu kami memprioritaskan polish sebelum beta dibuka lebih luas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-500 hover:bg-orange-50 hover:text-[#FF6A00]"
                aria-label="Tutup feedback"
              >
                <X size={18} />
              </button>
            </div>

            <div className="kaffe-modal-scroll space-y-4 p-5">
              <label className="block">
                <span className="mb-2 ml-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">What do you like?</span>
                <textarea
                  value={liked}
                  onChange={(event) => setLiked(event.target.value)}
                  rows={4}
                  maxLength={1200}
                  placeholder="Fitur atau alur yang sudah enak dipakai..."
                  className="min-h-[112px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
                />
              </label>

              <label className="block">
                <span className="mb-2 ml-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">What to improve?</span>
                <textarea
                  value={improve}
                  onChange={(event) => setImprove(event.target.value)}
                  rows={4}
                  maxLength={1200}
                  placeholder="Bagian yang membingungkan, lambat, atau perlu dirapikan..."
                  className="min-h-[112px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
                />
              </label>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 p-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-100 bg-white px-5 text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50"
              >
                Nanti
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={saving || !canSubmit}
                className="kaffe-gradient-button inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : canSubmit ? <Send size={16} /> : <CheckCircle2 size={16} />}
                Kirim Feedback
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
