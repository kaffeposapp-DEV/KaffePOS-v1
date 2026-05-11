/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { Bell, Check, Loader2, Smartphone, X } from 'lucide-react';
import { ApiError, getNotifications, markNotificationsRead } from '@/lib/backendApi';
import { useAuth } from '@/contexts/AuthContext';
import {
  NOTIFICATION_CATEGORIES,
  cacheNotifications,
  enqueueNotificationMarkRead,
  flushQueuedNotificationMarkRead,
  getNotificationCategory,
  readCachedNotifications,
  requestPushNotifications,
  type KaffeNotification,
  type NotificationCategory,
} from '@/lib/notifications';
import NotificationCard, { NotificationEmptyState } from './NotificationCard';

export default function NotificationCenter({
  isOpen,
  onClose,
  storeId,
}: {
  isOpen: boolean;
  onClose: () => void;
  storeId?: string | null;
}) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<KaffeNotification[]>([]);
  const [activeCategory, setActiveCategory] = useState<NotificationCategory>('all');
  const [loading, setLoading] = useState(true);
  const [syncingRead, setSyncingRead] = useState(false);
  const [pushMessage, setPushMessage] = useState('');

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications],
  );

  const visibleNotifications = useMemo(() => {
    if (activeCategory === 'all') return notifications;
    return notifications.filter((notification) => getNotificationCategory(notification) === activeCategory);
  }, [activeCategory, notifications]);

  const loadNotifications = async () => {
    if (!user?.id) return;
    try {
      const response = await getNotifications(80);
      setNotifications(response.items || []);
      cacheNotifications(user.id, response.items || []);
      window.dispatchEvent(new Event('kaffepos-notifications-refresh'));
    } catch (error) {
      const cached = readCachedNotifications(user.id);
      setNotifications(cached);
      if (!(error instanceof ApiError && error.status === 0)) {
        console.error('[Notifications] load failed:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (ids?: string[]) => {
    if (!user?.id) return;
    const payload = {
      ...(ids && ids.length > 0 ? { ids } : {}),
      ...(storeId ? { storeId } : {}),
    };
    setSyncingRead(true);
    setNotifications((current) => current.map((notification) => (
      !ids || ids.includes(notification.id) ? { ...notification, is_read: true } : notification
    )));

    try {
      await markNotificationsRead(payload);
      await flushQueuedNotificationMarkRead(user.id, markNotificationsRead);
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        enqueueNotificationMarkRead(user.id, payload);
      } else {
        console.error('[Notifications] mark read failed:', error);
      }
    } finally {
      setSyncingRead(false);
      window.dispatchEvent(new Event('kaffepos-notifications-refresh'));
    }
  };

  const enablePush = async () => {
    setPushMessage('Menyiapkan push...');
    const result = await requestPushNotifications(storeId ?? undefined);
    setPushMessage(result.enabled
      ? (result.reason || 'Push notifications aktif.')
      : (result.reason || 'Push notifications belum aktif.'));
  };

  useEffect(() => {
    if (!isOpen || !user?.id) return;
    setLoading(true);
    loadNotifications().catch(() => {});
    flushQueuedNotificationMarkRead(user.id, markNotificationsRead).catch(() => {});
    const poll = window.setInterval(() => {
      loadNotifications().catch(() => {});
    }, 30_000);
    return () => window.clearInterval(poll);
  }, [isOpen, user?.id]);

  useEffect(() => {
    if (!isOpen || unreadCount === 0) return;
    const unreadIds = notifications.filter((notification) => !notification.is_read).map((notification) => notification.id);
    const timer = window.setTimeout(() => {
      markRead(unreadIds).catch(() => {});
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [isOpen, unreadCount, notifications]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-slate-50 animate-in"
      style={{
        paddingTop: 'env(safe-area-inset-top,0px)',
        paddingBottom: 'env(safe-area-inset-bottom,0px)',
      }}
    >
      <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-100">
              <Bell size={20} className="text-[#FF6A00]" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-black text-slate-800">Notification Center</h2>
              <p className="truncate text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {unreadCount > 0 ? `${unreadCount} belum dibaca` : 'Semua sudah dibaca'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markRead().catch(() => {})}
                className="hidden h-10 items-center gap-2 rounded-xl bg-orange-50 px-3 text-[11px] font-black uppercase tracking-widest text-[#FF6A00] sm:flex"
                disabled={syncingRead}
              >
                {syncingRead ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Mark read
              </button>
            )}
            <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-slate-100">
              <X size={20} className="text-slate-400" />
            </button>
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {NOTIFICATION_CATEGORIES.map((category) => {
            const active = activeCategory === category.id;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                className={`h-9 flex-none rounded-xl border px-3 text-[11px] font-black uppercase tracking-widest transition-all ${
                  active
                    ? 'border-orange-100 bg-orange-50 text-[#FF6A00]'
                    : 'border-slate-100 bg-white text-slate-400 hover:text-slate-700'
                }`}
              >
                {category.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={26} className="animate-spin text-[#FF6A00]" />
            <p className="mt-3 text-sm font-bold text-slate-400">Memuat notifikasi...</p>
          </div>
        ) : visibleNotifications.length === 0 ? (
          <NotificationEmptyState />
        ) : (
          <div className="mx-auto max-w-3xl space-y-3">
            {visibleNotifications.map((notification) => (
              <NotificationCard key={notification.id} notification={notification} />
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-100 bg-white p-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#FF6A00]">
              <Smartphone size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black text-slate-800">Push notifications</p>
              <p className="truncate text-[10px] font-bold text-slate-400">{pushMessage || 'Aktifkan untuk menerima alert penting.'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => enablePush().catch(() => setPushMessage('Push belum bisa diaktifkan.'))}
            className="h-10 shrink-0 rounded-xl bg-[#FF6A00] px-4 text-[11px] font-black uppercase tracking-widest text-white shadow-sm"
          >
            Aktifkan
          </button>
        </div>
      </div>
    </div>
  );
}
