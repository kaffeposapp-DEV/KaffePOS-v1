import { useCallback, useEffect, useState } from 'react';
import {
  BadgePercent,
  CheckCircle2,
  Coffee,
  Gift,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Stamp,
  TicketPercent,
  UserRound,
} from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import { normalizeUserRole, type UserRole } from '@/lib/accessControl';
import {
  addLoyaltyStamp,
  createLoyaltyPassport,
  createLoyaltyReward,
  getLoyaltyOverview,
  searchLoyaltyPassports,
  updateLoyaltySettings,
} from '@/lib/backendApi';
import { enqueueOfflineOperation } from '@/lib/offlineQueue';
import {
  DEFAULT_LOYALTY_SETTINGS,
  canRedeemReward,
  getStampProgress,
  getTierLabel,
  getTierProgress,
  normalizeLoyaltyPhone,
  readCachedLoyaltyOverview,
  writeCachedLoyaltyOverview,
  type LoyaltyOverview,
  type LoyaltyPassport,
  type LoyaltyReward,
  type LoyaltyRewardType,
  type LoyaltySettings,
} from '@/lib/loyalty';
import { normalizeUserFacingError } from '@/lib/errorMessages';
import type { Profile } from '@/types';
import type { SubscriptionAccess } from '@/lib/subscriptionAccess';
import { dispatchUpgradePrompt } from '@/lib/upgradePrompts';
import { dispatchCelebrationOnce, isCelebrationSoundEnabled } from '@/lib/celebration';

const fRp = (value: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value || 0);

const fNum = (value: number) => new Intl.NumberFormat('id-ID').format(value || 0);

type Toast = { showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void };

const rewardTypeOptions: Array<{ id: LoyaltyRewardType; label: string }> = [
  { id: 'discount_amount', label: 'Diskon Nominal' },
  { id: 'discount_percent', label: 'Diskon Persen' },
  { id: 'free_item', label: 'Free Item' },
];

function makeIdempotencyKey(prefix: string) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}:${crypto.randomUUID()}`;
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-[#FF6A00] transition-all duration-700 ease-out"
        style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
      />
    </div>
  );
}

function TierBadge({ tier }: { tier: LoyaltyPassport['tier'] }) {
  const label = getTierLabel(tier);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-orange-700"
      title="Tier naik otomatis dari total transaksi pelanggan."
    >
      <Sparkles size={12} />
      {label}
    </span>
  );
}

function PassportStampGrid({ passport, settings }: { passport: LoyaltyPassport; settings: LoyaltySettings }) {
  const progress = getStampProgress(passport, settings);
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
      {Array.from({ length: progress.required }).map((_, index) => {
        const filled = index < progress.current;
        return (
          <div
            key={index}
            className={`flex aspect-square items-center justify-center rounded-2xl border transition-all duration-300 ${
              filled
                ? 'border-orange-100 bg-orange-50 text-[#FF6A00] shadow-sm'
                : 'border-slate-100 bg-white text-slate-200'
            }`}
            aria-label={`Stamp ${index + 1}${filled ? ' terisi' : ' kosong'}`}
            title={filled ? `Stamp ${index + 1} sudah terisi` : `Stamp ${index + 1} belum terisi`}
          >
            {filled ? <Coffee size={20} strokeWidth={2.6} /> : <Stamp size={18} strokeWidth={2} />}
          </div>
        );
      })}
    </div>
  );
}

export function StampCard({ passport, settings }: { passport: LoyaltyPassport; settings: LoyaltySettings }) {
  const stampProgress = getStampProgress(passport, settings);
  const tierProgress = getTierProgress(passport);
  return (
    <section
      className="kaffe-panel rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--brand-panel-shadow-hover)] md:p-6"
      title="Kopi Passport menampilkan stamp, poin, tier, dan progress reward pelanggan."
    >
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-orange-100 bg-orange-50 text-[#FF6A00]">
            <UserRound size={22} />
          </div>
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="font-display text-xl font-extrabold text-slate-900">
                {passport.customer_name || 'Pelanggan Kopi'}
              </h3>
              <TierBadge tier={passport.tier} />
            </div>
            <p className="text-sm font-semibold text-slate-500">{passport.customer_phone}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:w-[220px]">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Poin</p>
            <p className="mt-1 text-lg font-black text-slate-900">{fNum(passport.available_points)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Stamp</p>
            <p className="mt-1 text-lg font-black text-slate-900">{passport.available_stamps}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-orange-100/80 bg-gradient-to-br from-orange-50/80 via-white to-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-[#FF6A00]">Kopi Passport</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {stampProgress.current}/{stampProgress.required} stamp menuju reward
            </p>
          </div>
          {stampProgress.completedCards > 0 ? (
            <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-600 shadow-sm">
              {stampProgress.completedCards} kartu penuh
            </span>
          ) : null}
        </div>
        <PassportStampGrid passport={passport} settings={settings} />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">{tierProgress.label}</p>
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            {fRp(tierProgress.current)} / {fRp(tierProgress.target)}
          </p>
        </div>
        <ProgressBar value={tierProgress.percent} />
      </div>
    </section>
  );
}

function RewardCard({ reward, passport }: { reward: LoyaltyReward; passport: LoyaltyPassport | null }) {
  const redeemable = canRedeemReward(passport, reward);
  return (
    <div
      className={`rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-0.5 ${
        reward.is_active ? 'border-slate-100 bg-white shadow-sm' : 'border-slate-100 bg-slate-50 opacity-70'
      }`}
      title={redeemable ? 'Reward ini sudah bisa ditukar pelanggan.' : 'Pelanggan belum memenuhi syarat reward ini.'}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-orange-100 bg-orange-50 text-[#FF6A00]">
          {reward.type === 'free_item' ? <Gift size={19} /> : <TicketPercent size={19} />}
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
            redeemable ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'
          }`}
        >
          {redeemable ? 'Siap tukar' : 'Belum cukup'}
        </span>
      </div>
      <p className="text-sm font-black text-slate-900">{reward.name}</p>
      <p className="mt-1 min-h-[36px] text-xs font-semibold leading-relaxed text-slate-500">
        {reward.description || 'Reward loyalty untuk pelanggan setia.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {reward.points_cost > 0 ? (
          <span className="rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
            {fNum(reward.points_cost)} poin
          </span>
        ) : null}
        {reward.stamps_cost > 0 ? (
          <span className="rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-orange-700">
            {reward.stamps_cost} stamp
          </span>
        ) : null}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="kaffe-app-bg kaffe-responsive-surface flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="kaffe-panel rounded-2xl p-6">
          <div className="flex items-center justify-center gap-3 py-16 text-sm font-bold text-slate-400">
            <Loader2 size={26} className="animate-spin text-[#FF6A00]" />
            Memuat Kopi Passport...
          </div>
        </section>
      </div>
    </div>
  );
}

function EmptyState({ onFocus }: { onFocus: () => void }) {
  return (
    <section className="kaffe-panel rounded-2xl border-dashed p-5 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-orange-100 bg-orange-50 text-[#FF6A00]">
            <Coffee size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-900">Belum ada pelanggan loyalty</p>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">
              Cari nomor pelanggan atau tambahkan stamp pertama setelah checkout.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onFocus}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF6A00] px-4 text-xs font-black uppercase tracking-wider text-white shadow-[0_12px_26px_rgba(255,106,0,0.18)] transition-all active:scale-95 hover:-translate-y-0.5"
        >
          Tambah Pelanggan
          <Plus size={16} />
        </button>
      </div>
    </section>
  );
}

export function LoyaltyPage({ toast, profile, role, subscriptionAccess }: { toast: Toast; profile?: Profile | null; role?: UserRole; subscriptionAccess?: SubscriptionAccess }) {
  const { storeId, isOnline, syncStatus } = useStore();
  const resolvedRole = normalizeUserRole(role ?? profile?.role);
  const isOwner = resolvedRole === 'owner_admin';
  const canUseAdvancedLoyalty = subscriptionAccess?.features.loyalty_advanced === true;
  const [overview, setOverview] = useState<LoyaltyOverview | null>(() => {
    const activeStoreId = useStore.getState().storeId;
    return activeStoreId ? readCachedLoyaltyOverview(activeStoreId) : null;
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [transactionAmount, setTransactionAmount] = useState('');
  const [selectedPassport, setSelectedPassport] = useState<LoyaltyPassport | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<LoyaltySettings>(DEFAULT_LOYALTY_SETTINGS);
  const [rewardDraft, setRewardDraft] = useState({
    name: '',
    description: '',
    type: 'discount_amount' as LoyaltyRewardType,
    reward_value: '10000',
    points_cost: '1000',
    stamps_cost: '0',
  });

  const settings = overview?.settings ?? { ...DEFAULT_LOYALTY_SETTINGS, store_id: storeId || '' };
  const rewards = overview?.rewards ?? [];
  const passports = overview?.passports ?? [];

  const refresh = useCallback(async () => {
    if (!storeId) return;
    const cached = readCachedLoyaltyOverview(storeId);
    if (cached) {
      setOverview(cached);
      setSettingsDraft(cached.settings);
    }
    if (!isOnline) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await getLoyaltyOverview(storeId);
      setOverview(data);
      setSettingsDraft(data.settings);
      writeCachedLoyaltyOverview(storeId, data);
      setSelectedPassport((current) => current ?? data.passports[0] ?? null);
    } catch (error) {
      if (!cached) toast.showToast(normalizeUserFacingError(error, 'Data loyalty belum bisa dimuat.'), 'warning');
    } finally {
      setLoading(false);
    }
  }, [isOnline, storeId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectPassport = (passport: LoyaltyPassport) => {
    setSelectedPassport(passport);
    setCustomerName(passport.customer_name || '');
    setCustomerPhone(passport.customer_phone);
  };

  const handleSearch = async () => {
    if (!storeId) return;
    const normalized = normalizeLoyaltyPhone(query);
    if (!query.trim()) {
      void refresh();
      return;
    }
    if (!isOnline) {
      const localMatches = passports.filter((passport) => {
        const haystack = `${passport.customer_name || ''} ${passport.customer_phone}`.toLowerCase();
        return haystack.includes(query.toLowerCase()) || haystack.includes(normalized.toLowerCase());
      });
      setOverview((current) => current ? { ...current, passports: localMatches } : current);
      return;
    }
    try {
      setSaving(true);
      const result = await searchLoyaltyPassports(storeId, query);
      setOverview((current) => current ? { ...current, passports: result.items } : current);
      if (result.items[0]) selectPassport(result.items[0]);
    } catch (error) {
      toast.showToast(normalizeUserFacingError(error, 'Pencarian pelanggan gagal.'), 'warning');
    } finally {
      setSaving(false);
    }
  };

  const upsertPassportInOverview = (passport: LoyaltyPassport) => {
    setOverview((current) => {
      const base = current ?? {
        settings: { ...DEFAULT_LOYALTY_SETTINGS, store_id: storeId || '' },
        rewards: [],
        passports: [],
      };
      const next = {
        ...base,
        passports: [passport, ...base.passports.filter((item) => item.id !== passport.id)],
      };
      if (storeId) writeCachedLoyaltyOverview(storeId, next);
      return next;
    });
    setSelectedPassport(passport);
  };

  const handleCreatePassport = async () => {
    if (!storeId) return;
    const phone = normalizeLoyaltyPhone(customerPhone);
    if (phone.length < 4) {
      toast.showToast('Nomor pelanggan minimal 4 digit.', 'warning');
      return;
    }
    try {
      setSaving(true);
      const passport = await createLoyaltyPassport({
        store_id: storeId,
        customer_name: customerName.trim() || null,
        customer_phone: phone,
      });
      upsertPassportInOverview(passport);
      toast.showToast('Kopi Passport siap digunakan.', 'success');
    } catch (error) {
      toast.showToast(normalizeUserFacingError(error, 'Pelanggan belum bisa disimpan.'), 'warning');
    } finally {
      setSaving(false);
    }
  };

  const handleAddStamp = async () => {
    if (!storeId) return;
    const phone = normalizeLoyaltyPhone(customerPhone || selectedPassport?.customer_phone || '');
    const amount = Math.max(0, Math.round(Number(transactionAmount || 0)));
    if (!selectedPassport && phone.length < 4) {
      toast.showToast('Pilih pelanggan atau isi nomor telepon.', 'warning');
      return;
    }
    if (amount <= 0) {
      toast.showToast('Nominal transaksi wajib diisi untuk menghitung poin.', 'warning');
      return;
    }

    const payload = {
      store_id: storeId,
      ...(selectedPassport ? { passport_id: selectedPassport.id } : { customer_phone: phone }),
      customer_name: customerName.trim() || selectedPassport?.customer_name || null,
      transaction_amount: amount,
      note: 'Manual Kopi Passport',
      idempotency_key: makeIdempotencyKey('loyalty-stamp'),
    };

    try {
      setSaving(true);
      if (!isOnline) {
        await enqueueOfflineOperation(storeId, {
          operation: 'loyalty.stamp.create',
          payload,
          idempotencyKey: payload.idempotency_key,
        });
        toast.showToast('Stamp disimpan offline dan akan sinkron otomatis.', 'success');
        setTransactionAmount('');
        return;
      }
      const result = await addLoyaltyStamp(payload);
      const beforeCards = Math.floor((selectedPassport?.available_stamps || 0) / Math.max(settings.stamps_required, 1));
      const afterCards = Math.floor(result.passport.available_stamps / Math.max(settings.stamps_required, 1));
      upsertPassportInOverview(result.passport);
      setTransactionAmount('');
      if (afterCards > beforeCards) {
        dispatchCelebrationOnce(`loyalty-reward:${result.passport.id}:${afterCards}`, {
          kind: 'loyalty',
          title: 'Reward loyalty tercapai',
          message: `${result.passport.customer_name || result.passport.customer_phone} siap menukar reward.`,
          sound: isCelebrationSoundEnabled(),
        });
      }
      toast.showToast(`+${result.earned.stamps} stamp dan +${fNum(result.earned.points)} poin ditambahkan.`, 'success');
    } catch (error) {
      toast.showToast(normalizeUserFacingError(error, 'Stamp belum bisa ditambahkan.'), 'warning');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!storeId || !isOwner) return;
    if (!canUseAdvancedLoyalty) {
      dispatchUpgradePrompt({
        trigger: 'loyalty_advanced',
        promptKey: 'feature:loyalty_advanced',
        recommendedPlan: 'signature',
        title: 'Loyalty advanced ada di paket Signature',
        description: 'Upgrade untuk mengatur aturan stamp, poin, dan reward loyalty yang lebih fleksibel.',
      });
      return;
    }
    try {
      setSaving(true);
      const updated = await updateLoyaltySettings({
        store_id: storeId,
        stamps_required: Number(settingsDraft.stamps_required),
        points_per_rupiah: Number(settingsDraft.points_per_rupiah),
        minimum_transaction_amount: Number(settingsDraft.minimum_transaction_amount),
        is_active: settingsDraft.is_active,
      });
      setOverview((current) => current ? { ...current, settings: updated } : current);
      toast.showToast('Pengaturan loyalty tersimpan.', 'success');
    } catch (error) {
      toast.showToast(normalizeUserFacingError(error, 'Pengaturan loyalty belum bisa disimpan.'), 'warning');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateReward = async () => {
    if (!storeId || !isOwner) return;
    if (!canUseAdvancedLoyalty) {
      dispatchUpgradePrompt({
        trigger: 'loyalty_advanced',
        promptKey: 'feature:loyalty_advanced',
        recommendedPlan: 'signature',
        title: 'Loyalty advanced ada di paket Signature',
        description: 'Upgrade untuk membuat reward custom dan mengelola program loyalty lebih lengkap.',
      });
      return;
    }
    if (!rewardDraft.name.trim()) {
      toast.showToast('Nama reward wajib diisi.', 'warning');
      return;
    }
    try {
      setSaving(true);
      const reward = await createLoyaltyReward({
        store_id: storeId,
        name: rewardDraft.name.trim(),
        description: rewardDraft.description.trim() || null,
        type: rewardDraft.type,
        reward_value: Math.max(0, Math.round(Number(rewardDraft.reward_value || 0))),
        points_or_stamps_needed: Math.max(
          Math.max(0, Math.round(Number(rewardDraft.points_cost || 0))),
          Math.max(0, Math.round(Number(rewardDraft.stamps_cost || 0))),
        ),
        points_cost: Math.max(0, Math.round(Number(rewardDraft.points_cost || 0))),
        stamps_cost: Math.max(0, Math.round(Number(rewardDraft.stamps_cost || 0))),
        is_active: true,
      });
      setOverview((current) => current ? { ...current, rewards: [...current.rewards, reward] } : current);
      setRewardDraft({
        name: '',
        description: '',
        type: 'discount_amount',
        reward_value: '10000',
        points_cost: '1000',
        stamps_cost: '0',
      });
      toast.showToast('Reward baru ditambahkan.', 'success');
    } catch (error) {
      toast.showToast(normalizeUserFacingError(error, 'Reward belum bisa ditambahkan.'), 'warning');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !overview) return <LoadingState />;

  return (
    <div className="kaffe-app-bg kaffe-responsive-surface flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#FF6A00]">
              <BadgePercent size={13} />
              Kopi Passport
            </div>
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Loyalty pelanggan
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
              Stamp, poin, tier, dan reward dibuat selaras dengan checkout agar pelanggan lebih sering kembali.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-wider ${
              isOnline ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
            }`}>
              {isOnline ? 'Online' : 'Offline queue'}
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={saving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-100 bg-white px-4 text-xs font-black uppercase tracking-wider text-slate-600 shadow-sm transition-all active:scale-95 hover:border-orange-100 hover:text-[#FF6A00] disabled:opacity-60"
            >
              <RefreshCw size={15} className={saving ? 'animate-spin' : ''} />
              Sync
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="kaffe-metric-card p-4" title="Jumlah pelanggan yang sudah memiliki Kopi Passport.">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-orange-100 bg-orange-50 text-[#FF6A00]">
                <UserRound size={18} />
              </div>
              <p className="text-[11px] font-semibold text-slate-400">Pelanggan loyalty</p>
            </div>
            <p className="font-display text-2xl font-extrabold text-slate-900">{fNum(passports.length)}</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">Data lokal dan cloud</p>
          </div>
          <div className="kaffe-metric-card p-4" title="Jumlah stamp yang dibutuhkan untuk reward utama.">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-orange-100 bg-orange-50 text-[#FF6A00]">
                <Stamp size={18} />
              </div>
              <p className="text-[11px] font-semibold text-slate-400">Aturan stamp</p>
            </div>
            <p className="font-display text-2xl font-extrabold text-slate-900">{settings.stamps_required} stamp</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">Tukar reward utama</p>
          </div>
          <div className="kaffe-metric-card p-4" title="Reward aktif yang bisa dipakai saat pelanggan menukar poin atau stamp.">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-orange-100 bg-orange-50 text-[#FF6A00]">
                <Gift size={18} />
              </div>
              <p className="text-[11px] font-semibold text-slate-400">Reward aktif</p>
            </div>
            <p className="font-display text-2xl font-extrabold text-slate-900">{fNum(rewards.filter((item) => item.is_active).length)}</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">{syncStatus === 'syncing' ? 'Sedang sync' : 'Siap digunakan'}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <div className="kaffe-panel rounded-2xl p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-[#FF6A00]">Cari pelanggan</p>
                  <h3 className="mt-1 text-lg font-black text-slate-900">Tambah stamp</h3>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-100 bg-orange-50 text-[#FF6A00]">
                  <Search size={18} />
                </div>
              </div>
              <div className="space-y-3">
                <div className="relative">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void handleSearch();
                    }}
                    placeholder="Cari nama atau nomor HP"
                    aria-label="Cari pelanggan loyalty"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-bold text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleSearch()}
                  disabled={saving}
                  className="kaffe-gradient-button flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-xs font-black uppercase tracking-wider text-white transition-all active:scale-95 disabled:opacity-60"
                  title="Cari pelanggan loyalty berdasarkan nama atau nomor HP."
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  Cari Passport
                </button>
              </div>

              <div className="mt-5 space-y-3">
                <input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Nama pelanggan"
                  aria-label="Nama pelanggan"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
                />
                <input
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="Nomor HP"
                  inputMode="tel"
                  aria-label="Nomor HP pelanggan"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
                />
                <input
                  value={transactionAmount}
                  onChange={(event) => setTransactionAmount(event.target.value)}
                  placeholder="Nominal transaksi"
                  inputMode="numeric"
                  type="number"
                  aria-label="Nominal transaksi"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <button
                    type="button"
                    onClick={() => void handleCreatePassport()}
                    disabled={saving || !storeId}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-white px-4 text-xs font-black uppercase tracking-wider text-[#FF6A00] transition-all active:scale-95 hover:bg-orange-50 disabled:opacity-60"
                    title="Simpan pelanggan baru ke Kopi Passport."
                  >
                    <UserRound size={16} />
                    Simpan Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAddStamp()}
                    disabled={saving || !storeId}
                    className="kaffe-gradient-button inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-xs font-black uppercase tracking-wider text-white transition-all active:scale-95 disabled:opacity-60"
                    title="Tambahkan stamp dan poin berdasarkan nominal transaksi."
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Stamp size={16} />}
                    Tambah Stamp
                  </button>
                </div>
              </div>
            </div>

            <div className="kaffe-panel rounded-2xl p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-[#FF6A00]">Daftar pelanggan</p>
                  <h3 className="mt-1 text-lg font-black text-slate-900">Passport terbaru</h3>
                </div>
              </div>
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {passports.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-400">
                    Belum ada data pelanggan. Tambahkan pelanggan setelah checkout untuk mulai mengumpulkan stamp.
                  </p>
                ) : (
                  passports.map((passport) => (
                    <button
                      key={passport.id}
                      type="button"
                      onClick={() => selectPassport(passport)}
                      className={`w-full rounded-2xl border p-4 text-left transition-all duration-300 active:scale-[0.99] ${
                        selectedPassport?.id === passport.id
                          ? 'border-orange-200 bg-orange-50/70 shadow-sm'
                          : 'border-slate-100 bg-white hover:border-orange-100 hover:bg-orange-50/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-900">{passport.customer_name || 'Pelanggan Kopi'}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">{passport.customer_phone}</p>
                        </div>
                        <TierBadge tier={passport.tier} />
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400">
                        <span>{passport.available_stamps} stamp</span>
                        <span className="h-1 w-1 rounded-full bg-slate-300" />
                        <span>{fNum(passport.available_points)} poin</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </aside>

          <main className="space-y-5">
            {selectedPassport ? (
              <StampCard passport={selectedPassport} settings={settings} />
            ) : (
              <EmptyState onFocus={() => {
                setQuery('');
                setCustomerPhone('');
              }}
              />
            )}

            <section className="kaffe-panel rounded-2xl p-5 md:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-[#FF6A00]">Reward</p>
                  <h3 className="mt-1 text-lg font-black text-slate-900">Daftar penukaran</h3>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-orange-700">
                  <ShieldCheck size={13} />
                  Dipakai di checkout
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {rewards.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-400 md:col-span-2">
                    Reward belum dibuat. Buat reward sederhana agar stamp dan poin punya tujuan penukaran.
                  </p>
                ) : (
                  rewards.map((reward) => (
                    <RewardCard key={reward.id} reward={reward} passport={selectedPassport} />
                  ))
                )}
              </div>
            </section>

            {isOwner ? (
              <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div className="kaffe-panel rounded-2xl p-5 md:p-6">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-100 bg-orange-50 text-[#FF6A00]">
                      <Settings2 size={18} />
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-wider text-[#FF6A00]">Admin settings</p>
                      <h3 className="mt-1 text-lg font-black text-slate-900">Aturan stamp</h3>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="block">
                      <span className="mb-2 ml-1 block text-[11px] font-black uppercase tracking-wider text-slate-400">Stamp per reward</span>
                      <input
                        value={settingsDraft.stamps_required}
                        onChange={(event) => setSettingsDraft((current) => ({ ...current, stamps_required: Number(event.target.value) }))}
                        type="number"
                        min={2}
                        max={20}
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition-all focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 ml-1 block text-[11px] font-black uppercase tracking-wider text-slate-400">Poin per rupiah</span>
                      <input
                        value={settingsDraft.points_per_rupiah}
                        onChange={(event) => setSettingsDraft((current) => ({ ...current, points_per_rupiah: Number(event.target.value) }))}
                        type="number"
                        min={0}
                        step="0.001"
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition-all focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 ml-1 block text-[11px] font-black uppercase tracking-wider text-slate-400">Minimum transaksi</span>
                      <input
                        value={settingsDraft.minimum_transaction_amount}
                        onChange={(event) => setSettingsDraft((current) => ({ ...current, minimum_transaction_amount: Number(event.target.value) }))}
                        type="number"
                        min={0}
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition-all focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleSaveSettings()}
                      disabled={saving}
                      className="kaffe-gradient-button mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-xs font-black uppercase tracking-wider text-white transition-all active:scale-95 disabled:opacity-60"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      Simpan Settings
                    </button>
                  </div>
                </div>

                <div className="kaffe-panel rounded-2xl p-5 md:p-6">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-100 bg-orange-50 text-[#FF6A00]">
                      <Gift size={18} />
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-wider text-[#FF6A00]">Reward builder</p>
                      <h3 className="mt-1 text-lg font-black text-slate-900">Tambah reward</h3>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <input
                      value={rewardDraft.name}
                      onChange={(event) => setRewardDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Nama reward"
                      aria-label="Nama reward"
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
                    />
                    <input
                      value={rewardDraft.description}
                      onChange={(event) => setRewardDraft((current) => ({ ...current, description: event.target.value }))}
                      placeholder="Deskripsi singkat"
                      aria-label="Deskripsi reward"
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
                    />
                    <select
                      value={rewardDraft.type}
                      onChange={(event) => setRewardDraft((current) => ({ ...current, type: event.target.value as LoyaltyRewardType }))}
                      aria-label="Tipe reward"
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition-all focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
                    >
                      {rewardTypeOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <input
                        value={rewardDraft.reward_value}
                        onChange={(event) => setRewardDraft((current) => ({ ...current, reward_value: event.target.value }))}
                        placeholder="Value"
                        type="number"
                        aria-label="Nilai reward"
                        className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
                      />
                      <input
                        value={rewardDraft.points_cost}
                        onChange={(event) => setRewardDraft((current) => ({ ...current, points_cost: event.target.value }))}
                        placeholder="Poin"
                        type="number"
                        aria-label="Poin dibutuhkan"
                        className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
                      />
                      <input
                        value={rewardDraft.stamps_cost}
                        onChange={(event) => setRewardDraft((current) => ({ ...current, stamps_cost: event.target.value }))}
                        placeholder="Stamp"
                        type="number"
                        aria-label="Stamp dibutuhkan"
                        className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCreateReward()}
                      disabled={saving}
                      className="kaffe-gradient-button mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-xs font-black uppercase tracking-wider text-white transition-all active:scale-95 disabled:opacity-60"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      Tambah Reward
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
          </main>
        </section>
      </div>
    </div>
  );
}

export default LoyaltyPage;
