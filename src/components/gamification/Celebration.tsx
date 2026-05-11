import { useEffect, useMemo, useState } from 'react';
import { Award, BadgeCheck, CheckCircle2, Flame, Sparkles, Trophy, X, type LucideIcon } from 'lucide-react';
import { CELEBRATION_EVENT, type CelebrationDetail, type CelebrationKind } from '@/lib/celebration';

const ICONS: Record<CelebrationKind, LucideIcon> = {
  challenge: CheckCircle2,
  badge: BadgeCheck,
  level: Trophy,
  score: Sparkles,
  loyalty: Award,
  streak: Flame,
};

function playSoftDing() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(760, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.32);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.34);
    setTimeout(() => context.close().catch(() => {}), 420);
  } catch {
    // sound is optional
  }
}

function confettiPieces(seed: string) {
  const base = seed.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return Array.from({ length: 18 }).map((_, index) => {
    const offset = ((base + index * 37) % 90) - 45;
    const delay = (index % 6) * 45;
    const distance = 54 + ((base + index * 17) % 36);
    const color = index % 4 === 0 ? '#FF6A00' : index % 4 === 1 ? '#FDBA74' : index % 4 === 2 ? '#E5E7EB' : '#FFFFFF';
    return { index, offset, delay, distance, color };
  });
}

export default function CelebrationHost() {
  const [celebration, setCelebration] = useState<CelebrationDetail | null>(null);
  const [queue, setQueue] = useState<CelebrationDetail[]>([]);
  const [visible, setVisible] = useState(false);
  const kind = celebration?.kind ?? 'challenge';
  const Icon = ICONS[kind] || Sparkles;
  const pieces = useMemo(() => confettiPieces(celebration?.id || celebration?.title || 'kaffepos'), [celebration?.id, celebration?.title]);

  useEffect(() => {
    const handleCelebrate = (event: Event) => {
      const detail = (event as CustomEvent<CelebrationDetail>).detail;
      if (!detail?.title) return;
      setQueue((current) => [...current, detail].slice(-5));
    };

    window.addEventListener(CELEBRATION_EVENT, handleCelebrate);
    return () => window.removeEventListener(CELEBRATION_EVENT, handleCelebrate);
  }, []);

  useEffect(() => {
    if (visible || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCelebration(next);
    setVisible(true);
    if (next.sound) playSoftDing();
  }, [queue, visible]);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setVisible(false), 4200);
    return () => window.clearTimeout(timer);
  }, [visible, celebration?.id]);

  if (!celebration || !visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center px-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
      <div className="pointer-events-auto relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-orange-100 bg-white p-4 shadow-[0_22px_70px_rgba(31,41,51,0.18)] animate-in">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {pieces.map((piece) => (
            <span
              key={piece.index}
              className="kaffe-confetti-piece"
              style={{
                backgroundColor: piece.color,
                left: '50%',
                top: 18,
                ['--x' as string]: `${piece.offset}px`,
                ['--y' as string]: `${piece.distance}px`,
                animationDelay: `${piece.delay}ms`,
              }}
            />
          ))}
        </div>
        <div className="relative flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-100 bg-orange-50 text-[#FF6A00]">
            <Icon size={22} strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#FF6A00]">Achievement unlocked</p>
            <h3 className="mt-1 text-sm font-black text-slate-900">{celebration.title}</h3>
            {celebration.message ? (
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{celebration.message}</p>
            ) : null}
            {celebration.points ? (
              <span className="mt-3 inline-flex rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-700">
                +{celebration.points} poin
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-700"
            aria-label="Tutup celebration"
          >
            <X size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
