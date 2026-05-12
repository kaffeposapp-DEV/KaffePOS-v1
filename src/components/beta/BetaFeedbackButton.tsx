import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ImagePlus, Loader2, MessageSquareText, Send, Star, X } from 'lucide-react';
import { ApiError, submitBetaFeedback } from '@/lib/backendApi';
import { normalizeUserFacingError } from '@/lib/errorMessages';
import { useModalBehavior } from '@/hooks/useModalBehavior';
import { trackAnalyticsEvent } from '@/lib/analytics';
import { trackOpsEvent } from '@/lib/opsMetrics';

type Toast = { showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void };

type FeedbackDraft = {
  store_id?: string | null;
  rating?: number | null;
  category?: 'Bug' | 'Saran Fitur' | 'Lainnya';
  description?: string;
  screenshot_data?: string | null;
  liked?: string;
  improve?: string;
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
  const [rating, setRating] = useState(5);
  const [category, setCategory] = useState<'Bug' | 'Saran Fitur' | 'Lainnya'>('Saran Fitur');
  const [description, setDescription] = useState('');
  const [screenshotData, setScreenshotData] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [queuedCount, setQueuedCount] = useState(() => readQueue().length);

  const canSubmit = useMemo(() => description.trim().length > 0, [description]);
  const { panelRef, onBackdropClick, dialogProps } = useModalBehavior<HTMLElement>({
    open,
    onClose: () => setOpen(false),
    disabled: saving,
  });

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
      toast.showToast('Isi deskripsi feedback dulu.', 'warning');
      return;
    }

    const payload: FeedbackDraft = {
      store_id: storeId || null,
      rating,
      category,
      description: description.trim(),
      screenshot_data: screenshotData,
      liked: category === 'Saran Fitur' ? description.trim() : '',
      improve: category !== 'Saran Fitur' ? description.trim() : '',
      metadata: {
        userAgent: navigator.userAgent,
        path: window.location.pathname,
        submittedAt: new Date().toISOString(),
        viewport: { width: window.innerWidth, height: window.innerHeight },
      },
    };

    try {
      setSaving(true);
      if (!navigator.onLine) {
        queueFeedback(payload);
        setQueuedCount(readQueue().length);
        setDescription('');
        setScreenshotData(null);
        setOpen(false);
        toast.showToast('Feedback disimpan offline dan akan terkirim saat online.', 'success');
        return;
      }

      await submitBetaFeedback(payload);
      trackAnalyticsEvent('feedback_submitted', { category, rating, has_screenshot: Boolean(screenshotData) });
      void trackOpsEvent({
        event_name: 'feedback_submitted',
        status: 'success',
        ...(storeId ? { store_id: storeId } : {}),
        metadata: { category, rating, hasScreenshot: Boolean(screenshotData) },
      });
      setDescription('');
      setScreenshotData(null);
      setOpen(false);
      toast.showToast('Feedback beta terkirim. Terima kasih.', 'success');
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        queueFeedback(payload);
        setQueuedCount(readQueue().length);
        setDescription('');
        setScreenshotData(null);
        setOpen(false);
        toast.showToast('Feedback disimpan offline dan akan terkirim otomatis.', 'success');
        return;
      }
      toast.showToast(normalizeUserFacingError(error, 'Feedback belum bisa dikirim.'), 'warning');
    } finally {
      setSaving(false);
    }
  };

  const handleScreenshot = async (file: File | null) => {
    if (!file) {
      setScreenshotData(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.showToast('Lampiran harus berupa gambar.', 'warning');
      return;
    }
    if (file.size > 900_000) {
      toast.showToast('Ukuran screenshot maksimal 900KB.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setScreenshotData(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => toast.showToast('Screenshot belum bisa dibaca.', 'warning');
    reader.readAsDataURL(file);
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
        <span className="hidden sm:inline">Kirim Feedback</span>
        {queuedCount > 0 ? (
          <span className="ml-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] text-orange-700 ring-1 ring-orange-100">
            {queuedCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="kaffe-modal-overlay fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 p-3 backdrop-blur-sm sm:items-center" onClick={onBackdropClick}>
          <section
            ref={panelRef}
            className="kaffe-panel kaffe-modal-panel w-full max-w-lg rounded-3xl bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
            aria-labelledby="beta-feedback-title"
            {...dialogProps}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-widest text-[#FF6A00]">Closed Beta</p>
                <h2 id="beta-feedback-title" className="font-display mt-1 text-xl font-extrabold text-slate-900">Kirim Feedback</h2>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">
                  Rating, kategori, dan screenshot opsional membantu kami memperbaiki KaffePOS lebih cepat.
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
              <div>
                <span className="mb-2 ml-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">Rating</span>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRating(value)}
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition-all ${
                        value <= rating
                          ? 'border-orange-100 bg-orange-50 text-[#FF6A00]'
                          : 'border-slate-100 bg-white text-slate-300 hover:bg-slate-50'
                      }`}
                      aria-label={`Rating ${value}`}
                    >
                      <Star size={18} fill={value <= rating ? '#FF6A00' : 'none'} />
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="mb-2 ml-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">Kategori</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as 'Bug' | 'Saran Fitur' | 'Lainnya')}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition-all focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
                >
                  <option>Bug</option>
                  <option>Saran Fitur</option>
                  <option>Lainnya</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-2 ml-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">Deskripsi</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={4}
                  maxLength={2400}
                  placeholder="Ceritakan bug, ide fitur, atau bagian yang terasa membingungkan..."
                  className="min-h-[112px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
                />
              </label>

              <label className="block rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 px-4 py-4">
                <span className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-orange-700">
                  <ImagePlus size={14} />
                  Screenshot Opsional
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => void handleScreenshot(event.target.files?.[0] ?? null)}
                  className="block w-full text-xs font-semibold text-slate-500 file:mr-3 file:rounded-xl file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-black file:uppercase file:tracking-wider file:text-[#FF6A00]"
                />
                <p className="mt-2 text-[11px] font-semibold text-slate-500">
                  PNG/JPG maksimal 900KB. Lampiran membantu kami melihat konteks masalah.
                </p>
                {screenshotData ? (
                  <button
                    type="button"
                    onClick={() => setScreenshotData(null)}
                    className="mt-3 rounded-xl bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wider text-slate-500 ring-1 ring-orange-100"
                  >
                    Hapus Screenshot
                  </button>
                ) : null}
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
