import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Award,
  CheckCircle2,
  ChevronRight,
  Coffee,
  Flame,
  Medal,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import { normalizeUserRole, type UserRole } from '@/lib/accessControl';
import {
  buildStaffPersonalProfileStats,
  type StaffBadge,
  type StaffBadgeIcon,
  type StaffChallenge,
} from '@/lib/gamification';
import { deriveLocalChallengeProgress } from '@/lib/challenges';
import { dispatchCelebrationOnce, isCelebrationSoundEnabled, setCelebrationSoundEnabled } from '@/lib/celebration';
import type { Profile } from '@/types';

const fRp = (value: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value || 0);

const fNum = (value: number) => new Intl.NumberFormat('id-ID').format(value || 0);

const BADGE_ICONS: Record<StaffBadgeIcon, LucideIcon> = {
  award: Award,
  zap: Zap,
  'trending-up': TrendingUp,
  'shield-check': ShieldCheck,
  flame: Flame,
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="kaffe-progress-bar h-full rounded-full bg-[#FF6A00] transition-all duration-700 ease-out"
        style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
      />
    </div>
  );
}

function LevelProgress({
  level,
  label,
  points,
  progress,
  nextLabel,
}: {
  level: number;
  label: string;
  points: number;
  progress: number;
  nextLabel: string;
}) {
  return (
    <div
      className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4 sm:p-5"
      title="Progress level dihitung dari poin transaksi, misi, dan badge yang sudah dicapai."
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-700">Level Progress</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <span className="font-display text-4xl font-extrabold leading-none text-slate-900">Lv {level}</span>
            <span className="pb-1 text-sm font-black text-orange-700">{label}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-orange-100 bg-white px-3 py-2 text-right shadow-sm">
          <p className="font-display text-xl font-extrabold text-slate-900">{fNum(points)}</p>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Poin</p>
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-wider text-slate-500">
          <span>{nextLabel}</span>
          <span>{progress}%</span>
        </div>
        <ProgressBar value={progress} />
      </div>
    </div>
  );
}

function StreakCounter({ value }: { value: number }) {
  return (
    <div
      className="rounded-xl border border-orange-100 bg-orange-50/70 p-4"
      title="Streak bertambah saat ada aktivitas transaksi yang konsisten setiap hari."
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-orange-100 bg-white text-[#FF6A00]">
        <Flame size={18} />
      </div>
      <p className="font-display text-2xl font-extrabold text-slate-900">{value} hari</p>
      <p className="mt-1 text-[11px] font-black uppercase tracking-wider text-slate-500">Daily streak</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: ReactNode;
}) {
  return (
    <div className="kaffe-metric-card p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--brand-panel-shadow-hover)]">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-orange-100 bg-orange-50 text-[#FF6A00]">
          {icon}
        </div>
        <p className="min-w-0 text-[11px] font-semibold text-slate-400">{label}</p>
      </div>
      <p className="font-display text-xl font-extrabold leading-tight text-slate-900">{value}</p>
      <p className="mt-2 text-[11px] font-semibold text-slate-500">{sub}</p>
    </div>
  );
}

function BadgeCard({ badge }: { badge: StaffBadge }) {
  const Icon = BADGE_ICONS[badge.icon];
  const progress = Math.round((badge.progress / Math.max(badge.target, 1)) * 100);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-4 transition-all duration-300 hover:-translate-y-0.5 ${
        badge.unlocked
          ? 'border-orange-100 bg-orange-50/60 shadow-sm'
          : 'border-slate-100 bg-slate-50/70'
      }`}
      title={badge.unlocked ? `${badge.name} sudah terbuka.` : `${badge.name}: ${badge.progress}/${badge.target} progress.`}
    >
      {badge.unlocked ? (
        <div className="absolute right-0 top-0 h-20 w-20 -translate-y-10 translate-x-10 rounded-full bg-white/70" />
      ) : null}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
            badge.unlocked
              ? 'border-orange-100 bg-white text-[#FF6A00]'
              : 'border-slate-100 bg-white text-slate-300'
          }`}
        >
          <Icon size={18} strokeWidth={2.5} />
        </div>
        {badge.unlocked ? (
          <span className="relative rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wider text-[#FF6A00] ring-1 ring-orange-100">
            Earned
          </span>
        ) : (
          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
            {badge.progress}/{badge.target}
          </span>
        )}
      </div>
      <p className="text-sm font-black text-slate-900">{badge.name}</p>
      <p className="mt-1 min-h-[36px] text-xs font-semibold leading-relaxed text-slate-500">{badge.description}</p>
      <div className="mt-3">
        <ProgressBar value={progress} />
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const medalClass = rank === 1
    ? 'border-orange-100 bg-orange-50 text-[#FF6A00]'
    : rank === 2
      ? 'border-slate-200 bg-slate-50 text-slate-600'
      : rank === 3
        ? 'border-amber-100 bg-amber-50 text-amber-700'
        : 'border-slate-100 bg-white text-slate-500';
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-black ${medalClass}`}
      title={rank <= 3 ? `Peringkat ${rank} mendapatkan highlight medal.` : `Peringkat ${rank}`}
    >
      {rank <= 3 ? <Medal size={18} /> : `#${rank}`}
    </div>
  );
}

function ChallengeRow({ challenge }: { challenge: StaffChallenge }) {
  const progress = Math.round((Math.min(challenge.current, challenge.target) / Math.max(challenge.target, 1)) * 100);
  const currentLabel = challenge.code === 'revenue-500k' ? fRp(challenge.current) : fNum(challenge.current);
  const targetLabel = challenge.code === 'revenue-500k' ? fRp(challenge.target) : fNum(challenge.target);

  return (
    <div
      className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--brand-panel-shadow-hover)]"
      title="Misi selesai otomatis saat target transaksi atau performa harian terpenuhi."
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <p className="text-sm font-black text-slate-900">{challenge.title}</p>
            {challenge.completed ? <CheckCircle2 size={16} className="shrink-0 text-emerald-600" /> : null}
          </div>
          <p className="text-xs font-semibold leading-relaxed text-slate-500">{challenge.description}</p>
        </div>
        <span className="shrink-0 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-orange-700">
          +{challenge.rewardPoints}
        </span>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex flex-col gap-1 text-[11px] font-black uppercase tracking-wider text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>Progress</span>
          <span>{currentLabel} / {targetLabel}</span>
        </div>
        <ProgressBar value={progress} />
      </div>
    </div>
  );
}

function PerformanceLoadingState() {
  return (
    <div className="kaffe-app-bg kaffe-responsive-surface flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header>
          <div className="h-3 w-28 animate-pulse rounded-full bg-orange-100" />
          <div className="mt-3 h-8 w-48 animate-pulse rounded-xl bg-slate-100" />
          <div className="mt-2 h-4 w-64 max-w-full animate-pulse rounded-full bg-slate-100" />
        </header>
        <section className="kaffe-panel rounded-2xl p-5 md:p-6">
          <div className="flex items-center justify-center gap-3 py-14 text-sm font-bold text-slate-400">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-orange-200 border-t-[#FF6A00]" />
            Memuat performa staff...
          </div>
        </section>
        <section className="kaffe-card-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {['points', 'trx', 'revenue', 'badge'].map((item) => (
            <div key={item} className="kaffe-metric-card p-4">
              <div className="h-9 w-9 animate-pulse rounded-lg bg-orange-50" />
              <div className="mt-4 h-5 w-24 animate-pulse rounded-lg bg-slate-100" />
              <div className="mt-3 h-3 w-32 animate-pulse rounded-full bg-slate-100" />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function EmptyPerformanceState({ isOwner }: { isOwner: boolean }) {
  const openPos = () => {
    window.dispatchEvent(new CustomEvent('kaffepos-open-tab', { detail: { tab: 'pos' } }));
  };

  return (
    <section className="kaffe-panel rounded-2xl border-dashed p-5 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-orange-100 bg-orange-50 text-[#FF6A00]">
            <Coffee size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-900">
              {isOwner ? 'Belum ada performa tim minggu ini' : 'Performa personal masih kosong'}
            </p>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">
              {isOwner
                ? 'Data gamifikasi akan muncul setelah kasir mulai menyelesaikan transaksi.'
                : 'Selesaikan transaksi pertama hari ini untuk mulai mengumpulkan poin, streak, dan badge.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openPos}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF6A00] px-4 text-xs font-black uppercase tracking-wider text-white shadow-[0_12px_26px_rgba(255,106,0,0.18)] transition-all active:scale-95 hover:-translate-y-0.5"
        >
          Buka Kasir
          <ChevronRight size={16} />
        </button>
      </div>
    </section>
  );
}

export default function StaffPersonalProfile({ profile, role }: { profile?: Profile | null; role?: UserRole }) {
  const { transactions, syncing, isOnline, storeSettings, loading, activeChallenges, challengeProgress } = useStore();
  const [soundEnabled, setSoundEnabled] = useState(() => isCelebrationSoundEnabled());
  const resolvedRole = normalizeUserRole(role ?? profile?.role);
  const isOwner = resolvedRole === 'owner_admin';
  const mergedChallengeProgress = useMemo(
    () => deriveLocalChallengeProgress({
      challenges: activeChallenges.filter((challenge) => challenge.is_active),
      transactions,
      profile,
      existingProgress: challengeProgress,
    }),
    [activeChallenges, challengeProgress, profile, transactions],
  );
  const challengeRewardPoints = useMemo(
    () => mergedChallengeProgress.reduce((sum, progress) => {
      if (!progress.is_completed) return sum;
      const challenge = activeChallenges.find((entry) => entry.id === progress.challenge_id);
      return sum + (challenge?.points_reward ?? 0);
    }, 0),
    [activeChallenges, mergedChallengeProgress],
  );
  const stats = useMemo(
    () => buildStaffPersonalProfileStats({
      transactions,
      profile,
      scope: isOwner ? 'team' : 'personal',
      bonusPoints: challengeRewardPoints,
      ...(isOwner ? { displayName: `Tim ${storeSettings?.store_name || 'Outlet'}` } : {}),
    }),
    [challengeRewardPoints, isOwner, profile, storeSettings?.store_name, transactions],
  );
  const unlockedBadges = stats.badges.filter((badge) => badge.unlocked).length;
  const visibleLeaderboard = isOwner
    ? stats.leaderboard.slice(0, 5)
    : stats.leaderboard.filter((entry) => entry.name === stats.staffName).slice(0, 1);
  const levelProgressLabel = stats.isMaxLevel
    ? 'Level maksimal tercapai'
    : `${stats.levelProgress}% menuju ${fNum(stats.nextLevelPoints)} poin`;
  const sound = soundEnabled;

  useEffect(() => {
    const scopeKey = `${profile?.id || 'team'}:${isOwner ? 'team' : 'personal'}`;
    if (stats.level > 1) {
      dispatchCelebrationOnce(`level:${scopeKey}:${stats.level}`, {
        kind: 'level',
        title: `Level ${stats.level} tercapai`,
        message: `${stats.staffName} masuk level ${stats.levelLabel}.`,
        sound,
      });
    }

    stats.badges
      .filter((badge) => badge.unlocked)
      .forEach((badge) => {
        dispatchCelebrationOnce(`badge:${scopeKey}:${badge.code}`, {
          kind: 'badge',
          title: badge.name,
          message: badge.description,
          sound,
        });
      });

    if (stats.dailyStreak >= 3) {
      dispatchCelebrationOnce(`streak:${scopeKey}:${stats.dailyStreak}`, {
        kind: 'streak',
        title: `${stats.dailyStreak} hari streak`,
        message: 'Ritme transaksi harian tetap terjaga.',
        sound,
      });
    }
  }, [isOwner, profile?.id, sound, stats.badges, stats.dailyStreak, stats.level, stats.levelLabel, stats.staffName]);

  if (loading && transactions.length === 0) {
    return <PerformanceLoadingState />;
  }

  return (
    <div className="kaffe-app-bg kaffe-responsive-surface flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl animate-in fade-in slide-in-from-bottom-4 duration-500 flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-widest text-[#FF6A00]">
              {isOwner ? 'Performa Tim' : 'Profil Performa'}
            </p>
            <h1 className="font-display mt-1 text-2xl font-extrabold text-slate-900">
              {stats.staffName}
            </h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {storeSettings?.store_name || 'KaffePOS'} · {isOwner ? 'Owner view' : `Level ${stats.level} ${stats.levelLabel}`}
            </p>
          </div>
          <div className="flex w-fit items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs font-bold text-slate-500 shadow-sm">
            <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {syncing ? 'Menyinkronkan' : isOnline ? 'Online' : 'Mode offline'}
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              setCelebrationSoundEnabled(next);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-500 shadow-sm hover:bg-orange-50 hover:text-[#FF6A00]"
            aria-label={soundEnabled ? 'Matikan suara achievement' : 'Aktifkan suara achievement'}
            title={soundEnabled ? 'Matikan suara lembut saat achievement tercapai' : 'Aktifkan suara lembut saat achievement tercapai'}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </header>

        {stats.isEmpty && <EmptyPerformanceState isOwner={isOwner} />}

        <section className="kaffe-panel rounded-2xl p-5 transition-all duration-300 md:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-orange-100 bg-orange-50 text-xl font-black text-[#FF6A00] shadow-sm">
                {stats.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                    Level {stats.level}
                  </span>
                  <span className="rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-700">
                    {stats.levelLabel}
                  </span>
                </div>
                <h2 className="font-display mt-4 text-4xl font-extrabold leading-tight text-slate-900 sm:text-5xl">
                  {fNum(stats.points)} poin
                </h2>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
                  {isOwner
                    ? 'Pantau ritme tim, akurasi transaksi, dan kontribusi penjualan outlet dalam satu tampilan.'
                    : 'Pertahankan ritme transaksi, upsell yang natural, dan akurasi kasir untuk naik level berikutnya.'}
                </p>
                <div className="mt-5">
                  <LevelProgress
                    level={stats.level}
                    label={stats.levelLabel}
                    points={stats.points}
                    progress={stats.levelProgress}
                    nextLabel={isOwner ? 'Progress Tim' : levelProgressLabel}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <StreakCounter value={stats.dailyStreak} />
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-slate-100 bg-white text-[#FF6A00]">
                  <Trophy size={18} />
                </div>
                <p className="font-display text-2xl font-extrabold text-slate-900">
                  {isOwner ? fNum(stats.activeStaffCount) : `#${stats.rank}`}
                </p>
                <p className="mt-1 text-[11px] font-black uppercase tracking-wider text-slate-500">
                  {isOwner ? 'Staff aktif' : 'Ranking personal'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="kaffe-card-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Poin"
            value={fNum(stats.points)}
            sub={isOwner ? 'Akumulasi performa tim' : 'Akumulasi performa personal'}
            icon={<Sparkles size={18} />}
          />
          <StatCard
            label="Transaksi Minggu Ini"
            value={fNum(stats.weeklyTransactions)}
            sub="Transaksi non-void"
            icon={<Zap size={18} />}
          />
          <StatCard
            label="Revenue Minggu Ini"
            value={fRp(stats.weeklyRevenue)}
            sub={isOwner ? 'Kontribusi outlet' : 'Kontribusi kasir'}
            icon={<TrendingUp size={18} />}
          />
          <StatCard
            label="Badge Aktif"
            value={`${unlockedBadges}/${stats.badges.length}`}
            sub="Pencapaian terbuka"
            icon={<Medal size={18} />}
          />
        </section>

        <section className="kaffe-panel rounded-2xl p-5 md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-widest text-[#FF6A00]">Misi Harian</p>
              <h3 className="font-display mt-1 text-xl font-extrabold text-slate-900">Ringkasan Progress</h3>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">
                {mergedChallengeProgress.filter((item) => item.is_completed).length}/{activeChallenges.filter((item) => item.is_active).length} misi selesai · +{fNum(challengeRewardPoints)} poin reward
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('kaffepos-open-tab', { detail: { tab: 'challenges' } }))}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-orange-100 bg-orange-50 px-4 text-xs font-black uppercase tracking-wider text-orange-700 transition-all hover:bg-orange-100 active:scale-95"
            >
              Buka Misi
              <ChevronRight size={16} />
            </button>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="kaffe-panel rounded-2xl p-5 md:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-[#FF6A00]">Badge</p>
                <h3 className="font-display mt-1 text-xl font-extrabold text-slate-900">
                  {isOwner ? 'Badge Collection Tim' : 'Badge Collection'}
                </h3>
              </div>
              <span className="rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-slate-500">
                {unlockedBadges} terbuka
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {stats.badges.map((badge) => (
                <BadgeCard key={badge.code} badge={badge} />
              ))}
            </div>
          </div>

          <div className="kaffe-panel rounded-2xl p-5 md:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-[#FF6A00]">Ranking</p>
                <h3 className="font-display mt-1 text-xl font-extrabold text-slate-900">
                  {isOwner ? 'Leaderboard Tim' : 'Posisi Saya'}
                </h3>
              </div>
              <span className="rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-orange-700">
                {isOwner ? `${stats.activeStaffCount} staff` : `#${stats.rank}`}
              </span>
            </div>
            <div className="space-y-3">
              {visibleLeaderboard.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-center">
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-300">
                    <Trophy size={20} />
                  </div>
                  <p className="text-sm font-black text-slate-800">Belum ada ranking minggu ini</p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">Ranking akan muncul setelah transaksi pertama tersimpan.</p>
                </div>
              ) : visibleLeaderboard.map((entry) => {
                const active = !isOwner && entry.name === stats.staffName;
                return (
                  <div
                    key={entry.name}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      active ? 'border-orange-100 bg-orange-50/70' : 'border-slate-100 bg-slate-50/70'
                    }`}
                  >
                    <RankBadge rank={entry.rank} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-slate-900">{entry.name}</p>
                      <p className="text-[11px] font-semibold text-slate-500">{entry.transactions} transaksi</p>
                    </div>
                      <p className="text-sm font-black text-slate-900">{fNum(entry.points)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="kaffe-panel rounded-2xl p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-[#FF6A00]">Daily Challenges</p>
              <h3 className="font-display mt-1 text-xl font-extrabold text-slate-900">Misi Aktif Hari Ini</h3>
            </div>
            <div className="hidden h-10 w-10 items-center justify-center rounded-xl border border-orange-100 bg-orange-50 text-[#FF6A00] sm:flex">
              <Target size={18} />
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {stats.challenges.map((challenge) => (
              <ChallengeRow key={challenge.code} challenge={challenge} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
