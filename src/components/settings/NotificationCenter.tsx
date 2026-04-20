/* eslint-disable react-hooks/exhaustive-deps */
 
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/settings/NotificationCenter.tsx
import { useState, useEffect } from 'react';
import { Bell, X, Check, Mail, Info, Clock, Ghost } from 'lucide-react';
import { getNotifications, markAllNotificationsRead } from '@/lib/backendApi';
import { useAuth } from '@/contexts/AuthContext';

export default function NotificationCenter({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<any[]>([],   );
  const [loading, setLoading] = useState(true);

  const fetchNotifs = async () => {
    if (!user) return;
    try {
      const response = await getNotifications(20);
      setNotifs(response.items || [],   );
    } catch (e) {
      console.error('[Notif] fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  const markAllRead = async () => {
    if (!user || notifs.length === 0) return;
    try {
      await markAllNotificationsRead();
      setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchNotifs();
    // Mark as read after 2 seconds of viewing
    const timer = setTimeout(() => markAllRead(), 2000);
    const poll = setInterval(() => {
      fetchNotifs().catch(() => {});
    }, 30_000);

    return () => {
      clearTimeout(timer);
      clearInterval(poll);
    };
  }, [isOpen, user?.id]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-slate-50 animate-in slide-in-from-right duration-300"
      style={{
        paddingTop: 'env(safe-area-inset-top,0px)',
        paddingBottom: 'env(safe-area-inset-bottom,0px)',
      }}
    >
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-orange-100 rounded-2xl flex items-center justify-center">
            <Bell size={20} className="text-orange-600" />
          </div>
          <div>
            <h2 className="font-black text-slate-800">Notifikasi</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pusat Informasi KaffePOS</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <X size={20} className="text-slate-400" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 grayscale opacity-50">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-bold text-slate-400">Memuat kabar terbaru...</p>
          </div>
        ) : notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center">
              <Ghost size={40} className="text-slate-300" />
            </div>
            <div>
              <p className="font-black text-slate-700 text-lg">Belum ada notifikasi</p>
              <p className="text-slate-400 text-sm max-w-[200px] mx-auto mt-1">
                Kabar dari admin atau update sistem akan muncul di sini.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {notifs.map((n) => (
              <div key={n.id} className={`p-4 rounded-2xl border transition-all ${n.is_read ? 'bg-white border-slate-100' : 'bg-orange-50/30 border-orange-100 shadow-sm'}`}>
                <div className="flex gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    n.type === 'welcome' ? 'bg-blue-100 text-blue-600' :
                    n.type === 'success' ? 'bg-green-100 text-green-600' :
                    n.type === 'warning' ? 'bg-amber-100 text-amber-600' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {n.type === 'welcome' ? <Mail size={18} /> : 
                     n.type === 'success' ? <Check size={18} /> : 
                     <Info size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-black text-slate-800 text-sm truncate">{n.title}</p>
                      {!n.is_read && <span className="w-2 h-2 bg-orange-500 rounded-full shrink-0 animate-pulse" />}
                    </div>
                    <p className="text-slate-600 text-xs leading-relaxed mb-2">{n.message}</p>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Clock size={10} />
                      <span className="text-[10px] font-bold">
                        {new Date(n.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} • {new Date(n.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <p className="text-center text-[10px] text-slate-300 font-bold uppercase tracking-widest pt-4">
              Menampilkan {notifs.length} kabar terakhir
            </p>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-4 sm:p-6 bg-slate-100 border-t border-slate-200 shrink-0">
        <div className="bg-white rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shrink-0">
            <Bell size={20} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-800">Butuh Bantuan?</p>
            <p className="text-[10px] text-slate-500">Butuh bantuan? Hubungi kami di Instagram @kaffepos</p>
          </div>
        </div>
      </div>
    </div>
  );
}
