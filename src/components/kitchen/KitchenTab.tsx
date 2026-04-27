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

const STATUS_TABS: Array<{ id: KitchenOrderStatus; label: string; color: string }> = [
  { id: 'pending', label: 'BARU', color: 'bg-amber-500' },
  { id: 'preparing', label: 'PROSES', color: 'bg-sky-500' },
  { id: 'ready', label: 'SIAP', color: 'bg-emerald-500' },
];

const STATIONS: Array<{ id: KitchenStation | 'all'; label: string }> = [
  { id: 'all', label: 'SEMUA' },
  { id: 'kitchen', label: 'KITCHEN' },
  { id: 'bar', label: 'BAR' },
  { id: 'dessert', label: 'DESSERT' },
  { id: 'other', label: 'LAINNYA' },
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
      <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition-all ${
        isConnected ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 
        isError ? 'bg-red-500/10 border-red-500/20 text-red-400 animate-pulse' : 
        'bg-amber-500/10 border-amber-500/20 text-amber-400'
      }`}>
        {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
        {kitchenRealtimeStatus}
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 bg-[#0b0f19] text-white flex flex-col overflow-hidden font-sans">
      {/* ── HEADER: PREMIUM DARK COMMAND CENTER ── */}
      <header className="shrink-0 border-b border-white/5 bg-[#0b0f19] px-6 py-5 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
              <ChefHat size={30} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tighter italic uppercase md:text-3xl">Kitchen Console</h2>
              <div className="mt-1 flex items-center gap-3">
                <ConnectionIndicator />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Op: {operatorName}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSoundOn(!soundOn); if (!soundOn) playChime(); }}
              className={`flex h-12 w-12 items-center justify-center rounded-2xl border-2 transition-all active:scale-90 ${
                soundOn ? 'border-orange-500 bg-orange-500 text-white' : 'border-white/10 bg-white/5 text-slate-400'
              }`}
            >
              <Bell size={20} />
            </button>
            <button
              onClick={() => storeId && loadKitchenOrders(storeId)}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-white/10 bg-white/5 text-slate-400 transition-all active:scale-90 hover:border-white/20"
            >
              <RefreshCw size={20} className={kitchenRealtimeStatus === 'connecting' || kitchenRealtimeStatus === 'reconnecting' ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* ── STATUS TABS: BOLD & INTERACTIVE ── */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatus(tab.id)}
              className={`relative flex h-12 items-center rounded-2xl px-6 text-xs font-black uppercase tracking-tighter italic transition-all active:scale-95 ${
                status === tab.id 
                  ? 'bg-white text-slate-900 shadow-xl' 
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              <span className="relative z-10">{tab.label}</span>
              <span className={`ml-3 flex h-6 min-w-[24px] items-center justify-center rounded-lg px-1.5 text-[10px] font-black leading-none ${
                status === tab.id ? 'bg-slate-900 text-white' : 'bg-white/10 text-slate-300'
              }`}>
                {counts[tab.id] || 0}
              </span>
            </button>
          ))}
          
          <div className="mx-2 h-8 w-px bg-white/10 hidden md:block" />
          
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            <SlidersHorizontal size={14} className="shrink-0 text-slate-600 mr-1" />
            {STATIONS.map((st) => (
              <button
                key={st.id}
                onClick={() => setStation(st.id)}
                className={`h-9 shrink-0 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest transition-all ${
                  station === st.id 
                    ? 'bg-orange-500 text-white' 
                    : 'border border-white/10 text-slate-500 hover:text-slate-300'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT: ORDER STREAM ── */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#080b14] custom-scrollbar">
        {filteredOrders.length === 0 ? (
          <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-orange-500/20 blur-3xl rounded-full" />
              <ChefHat size={80} className="text-slate-800 relative z-10 opacity-20" />
            </div>
            <p className="text-2xl font-black text-slate-700 italic uppercase tracking-tighter">Belum ada pesanan</p>
            <p className="mt-2 text-sm font-bold text-slate-500 uppercase tracking-widest">Dapur bersih! Santai sejenak.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 animate-in fade-in duration-500">
            {filteredOrders.map((order) => {
              const action = nextAction(order.overall_status);
              const minutes = minutesSince(order.created_at);
              const isFresh = minutes < 2 && order.overall_status === 'pending';
              const ActionIcon = action?.icon;
              
              return (
                <article
                  key={order.id}
                  className={`group relative flex flex-col rounded-[32px] bg-white text-slate-900 shadow-2xl transition-all duration-300 hover:-translate-y-1 ${
                    isFresh ? 'ring-4 ring-orange-500 animate-in zoom-in-95' : ''
                  }`}
                >
                  {/* Card Glow for new orders */}
                  {isFresh && <div className="absolute -inset-1 bg-orange-500 blur-xl opacity-20 rounded-[32px] animate-pulse" />}

                  <div className="relative z-10 flex flex-col h-full">
                    {/* Header: Order Info */}
                    <div className="flex items-start justify-between p-6 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-3xl font-black tracking-tighter italic uppercase text-slate-900 leading-none">
                            {order.order_number}
                          </h3>
                          {isFresh && (
                            <span className="flex h-6 items-center rounded-lg bg-orange-500 px-2 text-[10px] font-black text-white uppercase tracking-tighter animate-bounce">
                              BARU
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                            {order.table_number || order.customer_name || 'WALK-IN'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Clock3 size={12} />
                          <span className={`text-[11px] font-black uppercase ${minutes > 10 ? 'text-red-500' : ''}`}>
                            {minutes === 0 ? 'TADI' : `${minutes} MIN`}
                          </span>
                        </div>
                        <span className={`mt-2 rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-widest ${
                          order.overall_status === 'pending' ? 'bg-amber-100 text-amber-600' :
                          order.overall_status === 'preparing' ? 'bg-sky-100 text-sky-600' :
                          'bg-emerald-100 text-emerald-600'
                        }`}>
                          {order.overall_status}
                        </span>
                      </div>
                    </div>

                    {/* Body: Items */}
                    <div className="flex-1 divide-y divide-slate-50 overflow-hidden">
                      {order.items
                        .filter((item) => station === 'all' || item.station === station)
                        .map((item) => (
                          <div key={item.id} className="p-6 flex gap-4 transition-colors group-hover:bg-slate-50/50">
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-2xl font-black text-white shadow-inner">
                              {item.qty}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <p className="text-lg font-black leading-none text-slate-900 italic uppercase tracking-tight truncate">
                                  {item.item_name}
                                </p>
                                <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-400 border border-slate-200/50">
                                  {item.station}
                                </span>
                              </div>
                              {item.note && (
                                <div className="mt-3 flex gap-2 rounded-2xl border-2 border-amber-200/50 bg-amber-50 p-3 shadow-sm">
                                  <AlertCircle size={14} className="shrink-0 text-amber-600 mt-0.5" />
                                  <p className="text-xs font-black text-amber-900 leading-snug uppercase tracking-tight">
                                    {item.note}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>

                    {/* Footer: Action */}
                    {action && ActionIcon && (
                      <div className="p-6 mt-auto">
                        <button
                          type="button"
                          disabled={busyId === order.id}
                          onClick={() => handleAdvance(order)}
                          className={`relative w-full h-16 flex items-center justify-center gap-3 rounded-[24px] text-sm font-black text-white uppercase tracking-[0.2em] italic shadow-xl transition-all active:scale-[0.97] disabled:opacity-50 overflow-hidden group/btn ${action.color}`}
                        >
                          {/* Inner shimmer effect */}
                          <div className="absolute inset-0 block bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover/btn:animate-[shimmer_1.5s_infinite]" />
                          
                          {busyId === order.id ? (
                            <RefreshCw size={22} className="animate-spin" />
                          ) : (
                            <>
                              <ActionIcon size={22} strokeWidth={2.5} />
                              <span className="relative z-10">{action.label}</span>
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
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #080b14;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1e293b;
          border-radius: 10px;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
