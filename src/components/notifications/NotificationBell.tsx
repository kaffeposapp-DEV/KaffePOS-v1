import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { getNotifications } from '@/lib/backendApi';
import { useAuth } from '@/contexts/AuthContext';

export default function NotificationBell({
  onOpen,
  className = '',
}: {
  onOpen: () => void;
  className?: string;
}) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const loadUnread = async () => {
      try {
        const response = await getNotifications(1);
        if (!cancelled) setUnreadCount(response.unreadCount || 0);
      } catch {
        // notification count is non-blocking
      }
    };

    const refresh = () => {
      loadUnread().catch(() => {});
    };

    refresh();
    const poll = window.setInterval(refresh, 30_000);
    window.addEventListener('kaffepos-notifications-refresh', refresh);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.removeEventListener('kaffepos-notifications-refresh', refresh);
    };
  }, [user?.id]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-100 bg-white text-slate-500 shadow-sm transition-all hover:border-orange-100 hover:bg-orange-50 hover:text-[#FF6A00] ${className}`}
      aria-label="Buka notifikasi"
    >
      <Bell size={19} />
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#FF6A00] px-1.5 text-[10px] font-black leading-none text-white ring-2 ring-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
