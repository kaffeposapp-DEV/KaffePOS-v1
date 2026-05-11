import { BadgePercent, RefreshCw, Search, Stamp } from 'lucide-react';
import {
  canRedeemReward,
  getStampProgress,
  getTierLabel,
  type LoyaltyPassport,
  type LoyaltyReward,
  type LoyaltySettings,
} from '@/lib/loyalty';

type Props = {
  phone: string;
  onPhoneChange: (value: string) => void;
  onSearch: () => void;
  searching: boolean;
  passport: LoyaltyPassport | null;
  settings: LoyaltySettings | null | undefined;
  rewards: LoyaltyReward[];
  activeReward: LoyaltyReward | null;
  onApplyReward: (reward: LoyaltyReward) => void;
  onClearReward: () => void;
};

export default function LoyaltyCheckoutModal({
  phone,
  onPhoneChange,
  onSearch,
  searching,
  passport,
  settings,
  rewards,
  activeReward,
  onApplyReward,
  onClearReward,
}: Props) {
  const stampProgress = passport && settings ? getStampProgress(passport, settings) : null;

  return (
    <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-orange-100 bg-white text-[#FF6A00]">
            <BadgePercent size={17} />
          </span>
          <div>
            <p className="text-[11px] font-black tracking-wider text-[#FF6A00] uppercase">Kopi Passport</p>
            <p className="text-[11px] font-bold text-slate-500">Stamp, poin, dan reward pelanggan</p>
          </div>
        </div>
        {passport ? (
          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wider text-orange-700">
            {getTierLabel(passport.tier)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={phone}
          onChange={(event) => onPhoneChange(event.target.value)}
          placeholder="Nomor HP pelanggan"
          inputMode="tel"
          className="h-12 min-w-0 flex-1 rounded-2xl border border-orange-100 bg-white px-4 text-sm font-bold text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-[#FF6A00]/40 focus:ring-4 focus:ring-[#FF6A00]/10"
        />
        <button
          type="button"
          onClick={onSearch}
          disabled={searching}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-white px-4 text-xs font-black uppercase tracking-wider text-[#FF6A00] transition-all active:scale-95 disabled:opacity-60"
        >
          {searching ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />}
          Cari
        </button>
      </div>

      {passport ? (
        <div className="mt-3 rounded-2xl border border-orange-100 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-black text-slate-900">{passport.customer_name || 'Pelanggan Kopi'}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                {passport.available_stamps} stamp · {passport.available_points.toLocaleString('id-ID')} poin
              </p>
            </div>
            {stampProgress ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-orange-700">
                <Stamp size={12} />
                {stampProgress.current}/{stampProgress.required}
              </span>
            ) : null}
          </div>

          {rewards.length > 0 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {rewards.map((reward) => {
                const redeemable = canRedeemReward(passport, reward);
                const active = activeReward?.id === reward.id;
                return (
                  <button
                    key={reward.id}
                    type="button"
                    onClick={() => active ? onClearReward() : onApplyReward(reward)}
                    disabled={!redeemable}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-all active:scale-95 disabled:opacity-45 ${
                      active
                        ? 'border-[#FF6A00] bg-[#FF6A00] text-white'
                        : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-orange-100 hover:bg-orange-50'
                    }`}
                  >
                    <p className="text-[11px] font-black">{reward.name}</p>
                    <p className={`mt-0.5 text-[10px] font-bold ${active ? 'text-white/80' : 'text-slate-400'}`}>
                      {reward.points_cost > 0 ? `${reward.points_cost.toLocaleString('id-ID')} poin` : ''}
                      {reward.stamps_cost > 0 ? `${reward.points_cost > 0 ? ' · ' : ''}${reward.stamps_cost} stamp` : ''}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-[11px] font-semibold leading-relaxed text-slate-500">
          Jika nomor belum terdaftar, stamp akan membuat Passport baru setelah pembayaran sukses.
        </p>
      )}
    </div>
  );
}
