import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, CheckCircle2, ChefHat, Clock3, Flame, RefreshCw,
  SlidersHorizontal, Utensils, AlertCircle, Wifi, WifiOff
} from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import type { KitchenOrder, KitchenOrderStatus, KitchenStation, Profile, ToastType } from '@/types';

interface Props {
  toast: { showToast: (message: string, type?: ToastType) => void };
  profile: Profile | null;
}

const STATUS_TABS: Array<{ id: KitchenOrderStatus; label: string }> = [
  { id: 'pending', label: 'Antrean Baru' },
  { id: 'preparing', label: 'Proses' },
  { id: 'ready', label: 'Siap Saji' },
];

const STATIONS: Array<{ id: KitchenStation | 'all'; label: string }> = [
  { id: 'all', label: 'Semua' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bar', label: 'Bar' },
  { id: 'dessert', label: 'Dessert' },
  { id: 'other', label: 'Lainnya' },
];

function minutesSince(value: string) {
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  return Math.floor(diff / 60_000);
}

function nextAction(status: KitchenOrderStatus) {
  if (status === 'pending') return { label: 'MULAI PROSES', next: 'preparing' as KitchenOrderStatus, icon: Flame, color: 'bg-slate-900' };
  if (status === 'preparing') return { label: 'TANDAI SIAP', next: 'ready' as KitchenOrderStatus, icon: CheckCircle2, color: 'bg-orange-500' };
  if (status === 'ready') return { label: 'SELESAIKAN', next: 'served' as KitchenOrderStatus, icon: Utensils, color: 'bg-emerald-600' };
  return null;
}

function playChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const gain = ctx.createGain();
    gain.gain.value = 0.08;
    gain.connect(ctx.destination);
    [660, 880].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      osc.type = 'sine';
      osc.connect(gain);
      osc.start(ctx.currentTime + index * 0.12);
      osc.stop(ctx.currentTime + index * 0.12 + 0.14);
    });
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch { /* Audio is optional */ }
}

export default function KitchenTab({ toast, profile }: Props) {
  const {
    storeId,
    kitchenOrders,
    kitchenRealtimeStatus,
    loadKitchenOrders,
    connectKitchenRealtime,
    updateKitchenOrder,
  } = useStore();

  const [status, setStatus] = useState<KitchenOrderStatus>('pending');
  const [station, setStation] = useState<KitchenStation | 'all'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const previousIds = useRef(new Set<string>());
  const operatorName = profile?.display_name || profile?.username || 'Kitchen';

  useEffect(() => {
    if (!storeId) return;
    loadKitchenOrders(storeId).catch(() => toast.showToast('Gagal memuat antrean dapur.', 'warning'));
    connectKitchenRealtime(storeId);
  }, [connectKitchenRealtime, loadKitchenOrders, storeId, toast]);

  useEffect(() => {
    const currentIds = new Set(kitchenOrders.map((order) => order.id));
    const hasNewPending = kitchenOrders.some(
      (order) => order.overall_status === 'pending' && !previousIds.current.has(order.id)
    );
    if (soundOn && hasNewPending) playChime();
    previousIds.current = currentIds;
  }, [kitchenOrders, soundOn]);

  const filteredOrders = useMemo(() => {
    return kitchenOrders.filter((order) => {
      if (order.overall_status !== status) return false;
      if (station === 'all') return true;
      return order.items.some((item) => item.station === station);
    });
  }, [kitchenOrders, station, status]);

  const counts = useMemo(() => {
    return STATUS_TABS.reduce<Record<string, number>>((acc, tab) => {
      acc[tab.id] = kitchenOrders.filter((order) => order.overall_status === tab.id).length;
      return acc;
    }, {});
  }, [kitchenOrders]);

  const handleAdvance = async (order: KitchenOrder) => {
    const action = nextAction(order.overall_status);
    if (!action) return;
    try {
      setBusyId(order.id);
      await updateKitchenOrder(order.id, action.next);
      toast.showToast(`Order ${order.order_number} diperbarui.`, 'success');
    } catch (error) {
      toast.showToast(error instanceof Error ? error.message : 'Gagal memperbarui status.', 'warning');
    } finally {
      setBusyId(null);
    }
  };

  const ConnectionIndicator = () => {
    const isConnected = kitchenRealtimeStatus === 'connected';
    const isError = kitchenRealtimeStatus === 'error' || kitchenRealtimeStatus === 'offline';

    return (
      <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest border transition-all ${
        isConnected ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
        isError ? 'bg-rose-50 border-rose-100 text-rose-600 animate-pulse' :
        'bg-amber-50 border-amber-100 text-amber-600'
      }`}>
        {isConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
        {kitchenRealtimeStatus}
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 bg-slate-50 text-slate-900 flex flex-col overflow-hidden font-sans">
      {/* ── HEADER: CLEAN & FAMILIAR APK STYLE ── */}
      <header className="shrink-0 bg-white border-b border-slate-200/60 px-5 pt-5 pb-4 md:px-8 z-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] shadow-soft border border-[#FF6A00]/20">
              <ChefHat size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="font-display text-xl font-extrabold text-slate-800 tracking-tight">Antrean Dapur</h2>
              <div className="mt-1 flex items-center gap-3">
                <ConnectionIndicator />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Operator: {operatorName}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSoundOn(!soundOn); if (!soundOn) playChime(); }}
              className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all active:scale-95 ${
                soundOn ? 'border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/20' : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'
              }`}
              title="Bunyi order baru"
            >
              <Bell size={18} />
            </button>
            <button
              onClick={() => storeId && loadKitchenOrders(storeId)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition-all active:scale-95 hover:bg-slate-50"
              title="Refresh"
            >
              <RefreshCw size={18} className={kitchenRealtimeStatus === 'connecting' || kitchenRealtimeStatus === 'reconnecting' ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* ── FILTER TABS: ONE-TONE WITH POS ── */}
        <div className="mt-6 flex flex-col gap-4">
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatus(tab.id)}
                className={`shrink-0 h-10 px-6 rounded-2xl text-[13px] font-bold transition-all border flex items-center gap-3 ${
                  status === tab.id
                    ? 'bg-slate-900 text-white border-slate-900 shadow-premium'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}
              >
                {tab.label}
                <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-lg px-2 text-[10px] font-bold ${
                  status === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
                }`}>
                  {counts[tab.id] || 0}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
            <SlidersHorizontal size={14} className="shrink-0 text-slate-300 mr-1" />
            {STATIONS.map((st) => (
              <button
                key={st.id}
                onClick={() => setStation(st.id)}
                className={`shrink-0 h-8 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest transition-all ${
                  station === st.id
                    ? 'bg-orange-50 text-orange-600 border border-orange-100'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT: CONSISTENT GRID ── */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
        {filteredOrders.length === 0 ? (
          <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center opacity-40">
            <div className="w-24 h-24 bg-slate-100 rounded-[40px] flex items-center justify-center mb-6">
              <ChefHat size={48} className="text-slate-300" />
            </div>
            <p className="text-lg font-black text-slate-800 uppercase italic tracking-tighter">Dapur Bersih</p>
            <p className="mt-1 text-xs font-bold text-slate-400 uppercase tracking-widest">Belum ada pesanan yang masuk.</p>
          </div>
        ) : (
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 animate-in fade-in duration-300">
            {filteredOrders.map((order) => {
              const action = nextAction(order.overall_status);
              const minutes = minutesSince(order.created_at);
              const isFresh = minutes < 2 && order.overall_status === 'pending';
              const ActionIcon = action?.icon;

              return (
                <article
                  key={order.id}
                  className={`group relative flex flex-col rounded-[32px] bg-white border border-slate-200/80 shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 ${
                    isFresh ? 'bg-amber-50/30 border-amber-200' : ''
                  }`}
                >
                  <div className="flex flex-col h-full">
                    {/* Header: Order Info */}
                    <div className="p-5 pb-4 border-b border-slate-100">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Order ID</p>
                          <div className="flex items-center gap-3">
                            <h3 className="font-display text-2xl font-extrabold text-slate-800 tracking-tight uppercase leading-none">
                              {order.order_number}
                            </h3>
                            {isFresh && (
                              <span className="flex h-5 items-center rounded-lg bg-[#FF6A00] px-2 text-[10px] font-bold text-white uppercase tracking-wider">
                                BARU
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-1.5 text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                            <Clock3 size={12} />
                            <span className={`text-[11px] font-bold uppercase tracking-wider ${minutes > 15 ? 'text-rose-500' : ''}`}>
                              {minutes === 0 ? 'Tadi' : `${minutes}m`}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                           <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                           <p className="text-[13px] font-bold text-slate-600 truncate">
                             {order.table_number || order.customer_name || 'Walk-in'}
                           </p>
                        </div>
                        <span className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                          order.overall_status === 'pending' ? 'bg-amber-100 text-amber-700' :
                          order.overall_status === 'preparing' ? 'bg-sky-100 text-sky-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {order.overall_status}
                        </span>
                      </div>
                    </div>

                    {/* Body: Items */}
                    <div className="flex-1 divide-y divide-slate-50">
                      {order.items
                        .filter((item) => station === 'all' || item.station === station)
                        .map((item) => (
                          <div key={item.id} className="p-5 flex gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-slate-900 text-lg font-extrabold text-white shadow-soft font-display">
                              {item.qty}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[15px] font-bold text-slate-800 leading-tight mb-1 truncate">
                                {item.item_name}
                              </p>
                              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                                {item.station}
                              </p>
                              {item.note && (
                                <div className="mt-3 flex gap-2 rounded-2xl bg-amber-50/80 border border-amber-100 p-3">
                                  <AlertCircle size={12} className="shrink-0 text-amber-500 mt-0.5" />
                                  <p className="text-[11px] font-bold text-amber-800 leading-snug">
                                    {item.note}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>

                    {/* Footer: Action Button */}
                    {action && ActionIcon && (
                      <div className="p-5 pt-2">
                        <button
                          type="button"
                          disabled={busyId === order.id}
                          onClick={() => handleAdvance(order)}
                          className={`relative w-full h-12 flex items-center justify-center gap-3 rounded-[20px] text-[13px] font-bold text-white uppercase tracking-widest transition-all active:scale-[0.97] disabled:opacity-50 overflow-hidden shadow-premium ${action.color} ${action.color === 'bg-orange-500' ? 'bg-[#FF6A00] hover:bg-[#ef934b]' : ''}`}
                        >
                          {busyId === order.id ? (
                            <RefreshCw size={18} className="animate-spin" />
                          ) : (
                            <>
                              <ActionIcon size={18} strokeWidth={2.5} />
                              <span>{action.label}</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
