import { CheckCircle2, Clock3, Coffee, ReceiptText, ShieldCheck, TrendingUp, Zap } from 'lucide-react';
import type { Challenge, UserChallengeProgress } from '@/lib/challenges';
import { getChallengeProgressLabel, getChallengeTargetNumber } from '@/lib/challenges';
import ProgressBar from './ProgressBar';

const ICONS = {
  sell_drink: Coffee,
  average_checkout_time: Clock3,
  transactions_count: ReceiptText,
  upsell_value: TrendingUp,
  zero_voids: ShieldCheck,
} as const;

export default function ChallengeCard({
  challenge,
  progress,
}: {
  challenge: Challenge;
  progress?: UserChallengeProgress | undefined;
}) {
  const Icon = ICONS[challenge.target_type] || Zap;
  const target = getChallengeTargetNumber(challenge);
  const current = Math.min(progress?.current_progress || 0, target);
  const percent = Math.round((current / Math.max(target, 1)) * 100);
  const done = progress?.is_completed || current >= target;

  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--brand-panel-shadow-hover)] ${
        done ? 'border-orange-100 ring-1 ring-orange-100' : 'border-slate-100'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-100 bg-orange-50 text-[#FF6A00]">
            <Icon size={20} strokeWidth={2.4} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-black text-slate-900">{challenge.title}</p>
              {done ? <CheckCircle2 size={16} className="shrink-0 text-emerald-600" /> : null}
            </div>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{challenge.description}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-orange-700">
          +{challenge.points_reward}
        </span>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-wider text-slate-400">
          <span>{done ? 'Selesai' : 'Progress'}</span>
          <span>
            {getChallengeProgressLabel(challenge, current)} / {getChallengeProgressLabel(challenge, target)}
          </span>
        </div>
        <ProgressBar value={percent} />
      </div>
    </div>
  );
}
