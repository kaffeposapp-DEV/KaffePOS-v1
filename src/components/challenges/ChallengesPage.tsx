import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, Settings2, Sparkles, Target, ToggleLeft, ToggleRight, Trophy } from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import { normalizeUserRole, type UserRole } from '@/lib/accessControl';
import {
  deriveLocalChallengeProgress,
  getChallengeTargetNumber,
  type Challenge,
  type TeamChallengeCompletion,
  type UserChallengeProgress,
} from '@/lib/challenges';
import { getTeamChallengeCompletion, updateChallenge } from '@/lib/backendApi';
import { normalizeUserFacingError } from '@/lib/errorMessages';
import type { Profile } from '@/types';
import type { SubscriptionAccess } from '@/lib/subscriptionAccess';
import { dispatchUpgradePrompt } from '@/lib/upgradePrompts';
import { dispatchCelebrationOnce, isCelebrationSoundEnabled } from '@/lib/celebration';
import ChallengeCard from './ChallengeCard';

const fNum = (value: number) => new Intl.NumberFormat('id-ID').format(value || 0);

function progressByChallenge(progress: UserChallengeProgress[]) {
  return new Map(progress.map((item) => [item.challenge_id, item]));
}

function mergeProgress(server: UserChallengeProgress[], local: UserChallengeProgress[]) {
  const byId = progressByChallenge(server);
  local.forEach((item) => {
    const current = byId.get(item.challenge_id);
    if (!current || item.current_progress > current.current_progress || item.is_completed) {
      byId.set(item.challenge_id, {
        ...current,
        ...item,
        is_completed: item.is_completed || current?.is_completed === true,
        current_progress: Math.max(item.current_progress, current?.current_progress || 0),
      });
    }
  });
  return [...byId.values()];
}

function ToggleRow({
  challenge,
  saving,
  onToggle,
}: {
  challenge: Challenge;
  saving: boolean;
  onToggle: (challenge: Challenge) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(challenge)}
      disabled={saving}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-left transition-all hover:bg-orange-50/40 disabled:opacity-60"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-slate-900">{challenge.title}</p>
        <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
          Target {fNum(getChallengeTargetNumber(challenge))} · +{challenge.points_reward} poin
        </p>
      </div>
      {challenge.is_active ? (
        <ToggleRight size={28} className="shrink-0 text-[#FF6A00]" />
      ) : (
        <ToggleLeft size={28} className="shrink-0 text-slate-300" />
      )}
    </button>
  );
}

export default function ChallengesPage({ profile, role, subscriptionAccess }: { profile?: Profile | null; role?: UserRole; subscriptionAccess?: SubscriptionAccess }) {
  const {
    storeId,
    storeSettings,
    activeChallenges,
    challengeProgress,
    transactions,
    isOnline,
    syncing,
    loadChallenges,
  } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [teamCompletion, setTeamCompletion] = useState<TeamChallengeCompletion | null>(null);
  const [error, setError] = useState('');
  const resolvedRole = normalizeUserRole(role ?? profile?.role);
  const isOwner = resolvedRole === 'owner_admin';
  const canUseFullGamification = subscriptionAccess?.features.gamification_full === true;

  useEffect(() => {
    if (!storeId) return;
    loadChallenges(storeId).catch(() => {});
  }, [loadChallenges, storeId]);

  useEffect(() => {
    if (!storeId || !isOwner || !isOnline || !canUseFullGamification) return;
    getTeamChallengeCompletion(storeId)
      .then(setTeamCompletion)
      .catch(() => {});
  }, [canUseFullGamification, isOnline, isOwner, storeId, activeChallenges.length, challengeProgress.length]);

  const localProgress = useMemo(
    () => deriveLocalChallengeProgress({
      challenges: activeChallenges,
      transactions,
      profile,
      existingProgress: challengeProgress,
    }),
    [activeChallenges, challengeProgress, profile, transactions],
  );
  const mergedProgress = useMemo(
    () => mergeProgress(challengeProgress, localProgress),
    [challengeProgress, localProgress],
  );
  const progressMap = useMemo(() => progressByChallenge(mergedProgress), [mergedProgress]);
  const visibleChallenges = activeChallenges.filter((challenge) => isOwner || challenge.is_active);
  const completed = visibleChallenges.filter((challenge) => progressMap.get(challenge.id)?.is_completed);
  const rewardPoints = completed.reduce((sum, challenge) => sum + challenge.points_reward, 0);
  const justCompleted = completed.length > 0 && completed.length === visibleChallenges.filter((challenge) => challenge.is_active).length;

  useEffect(() => {
    const userKey = profile?.id || 'local';
    completed.forEach((challenge) => {
      const progress = progressMap.get(challenge.id);
      dispatchCelebrationOnce(`challenge:${userKey}:${challenge.id}`, {
        kind: 'challenge',
        title: challenge.title,
        message: 'Misi harian selesai.',
        points: challenge.points_reward,
        sound: isCelebrationSoundEnabled(),
        id: progress?.id || challenge.id,
      });
    });
  }, [completed, profile?.id, progressMap]);

  const handleRefresh = async () => {
    if (!storeId || refreshing) return;
    setRefreshing(true);
    setError('');
    try {
      await loadChallenges(storeId);
      if (isOwner && isOnline && canUseFullGamification) {
        setTeamCompletion(await getTeamChallengeCompletion(storeId));
      }
    } catch (err) {
      setError(normalizeUserFacingError(err, 'Misi harian belum bisa dimuat.'));
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggle = async (challenge: Challenge) => {
    if (!storeId || !isOwner) return;
    if (!canUseFullGamification) {
      dispatchUpgradePrompt({
        trigger: 'gamification_full',
        promptKey: 'feature:gamification_full',
        recommendedPlan: 'signature',
        title: 'Gamification penuh ada di paket Signature',
        description: 'Upgrade untuk mengatur misi default dan melihat completion rate tim secara lengkap.',
      });
      return;
    }
    setSavingId(challenge.id);
    setError('');
    try {
      await updateChallenge(challenge.id, { store_id: storeId, is_active: !challenge.is_active });
      await loadChallenges(storeId);
      if (isOnline) setTeamCompletion(await getTeamChallengeCompletion(storeId));
    } catch (err) {
      setError(normalizeUserFacingError(err, 'Status misi belum bisa disimpan.'));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="kaffe-app-bg kaffe-responsive-surface flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl animate-in fade-in slide-in-from-bottom-4 duration-500 flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-widest text-[#FF6A00]">Misi Harian</p>
            <h1 className="font-display mt-1 text-2xl font-extrabold text-slate-900">Daily Challenges</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {storeSettings?.store_name || 'KaffePOS'} · {isOnline ? 'Terhubung' : 'Mode offline'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={!storeId || refreshing || syncing}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-500 shadow-sm transition-all hover:bg-orange-50 hover:text-[#FF6A00] active:scale-95 disabled:opacity-50"
            aria-label="Muat ulang misi"
          >
            <RefreshCw size={19} className={refreshing || syncing ? 'animate-spin text-[#FF6A00]' : ''} />
          </button>
        </header>

        {error ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            {error}
          </div>
        ) : null}

        {justCompleted ? (
          <section className="kaffe-panel rounded-2xl border-orange-100 bg-orange-50/70 p-5 md:p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 animate-pulse items-center justify-center rounded-xl border border-orange-100 bg-white text-[#FF6A00]">
                <Sparkles size={22} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900">Semua misi aktif selesai</p>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-600">
                  Reward performa hari ini sudah masuk ke ringkasan poin gamifikasi.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="kaffe-card-grid grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="kaffe-metric-card p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-orange-100 bg-orange-50 text-[#FF6A00]">
              <Target size={18} />
            </div>
            <p className="font-display text-2xl font-extrabold text-slate-900">{completed.length}/{visibleChallenges.filter((item) => item.is_active).length}</p>
            <p className="mt-1 text-[11px] font-black uppercase tracking-wider text-slate-500">Misi selesai</p>
          </div>
          <div className="kaffe-metric-card p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-orange-100 bg-orange-50 text-[#FF6A00]">
              <Trophy size={18} />
            </div>
            <p className="font-display text-2xl font-extrabold text-slate-900">{fNum(rewardPoints)}</p>
            <p className="mt-1 text-[11px] font-black uppercase tracking-wider text-slate-500">Poin reward</p>
          </div>
          <div className="kaffe-metric-card p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-orange-100 bg-orange-50 text-[#FF6A00]">
              <CheckCircle2 size={18} />
            </div>
            <p className="font-display text-2xl font-extrabold text-slate-900">
              {isOwner ? (canUseFullGamification ? `${teamCompletion?.completion_rate ?? 0}%` : 'Signature') : isOnline ? 'Live' : 'Offline'}
            </p>
            <p className="mt-1 text-[11px] font-black uppercase tracking-wider text-slate-500">
              {isOwner ? 'Completion tim' : 'Status sync'}
            </p>
          </div>
        </section>

        <section className="kaffe-panel rounded-2xl p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-[#FF6A00]">Aktif Hari Ini</p>
              <h2 className="font-display mt-1 text-xl font-extrabold text-slate-900">Daftar Misi</h2>
            </div>
            <span className="rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-orange-700">
              {visibleChallenges.filter((challenge) => challenge.is_active).length} aktif
            </span>
          </div>
          {visibleChallenges.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
              <p className="text-sm font-black text-slate-800">Belum ada misi aktif</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Misi harian akan muncul setelah tersinkron dengan server.</p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {visibleChallenges.map((challenge) => (
                <ChallengeCard key={challenge.id} challenge={challenge} progress={progressMap.get(challenge.id)} />
              ))}
            </div>
          )}
        </section>

        {isOwner ? (
          <section className="kaffe-panel rounded-2xl p-5 md:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-100 bg-orange-50 text-[#FF6A00]">
                <Settings2 size={18} />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-[#FF6A00]">Owner Settings</p>
                <h2 className="font-display mt-1 text-xl font-extrabold text-slate-900">Kontrol Misi Default</h2>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {activeChallenges.map((challenge) => (
                <ToggleRow
                  key={challenge.id}
                  challenge={challenge}
                  saving={savingId === challenge.id}
                  onToggle={handleToggle}
                />
              ))}
            </div>
            {!canUseFullGamification ? (
              <button
                type="button"
                onClick={() => dispatchUpgradePrompt({
                  trigger: 'gamification_full',
                  promptKey: 'feature:gamification_full',
                  recommendedPlan: 'signature',
                  title: 'Gamification penuh ada di paket Signature',
                  description: 'Upgrade untuk mengatur misi default dan melihat completion rate tim secara lengkap.',
                })}
                className="mt-4 w-full rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-left transition-all active:scale-[0.98] hover:bg-orange-100"
              >
                <p className="text-sm font-black text-orange-950">Kontrol owner terkunci</p>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-orange-800">Pengaturan misi dan completion rate tim tersedia mulai paket Signature.</p>
              </button>
            ) : null}
            {teamCompletion ? (
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                <p className="text-sm font-black text-slate-900">Completion rate tim {teamCompletion.completion_rate}%</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {teamCompletion.completed_count}/{teamCompletion.total_slots} slot misi selesai dari {teamCompletion.staff_count} staff aktif.
                </p>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
