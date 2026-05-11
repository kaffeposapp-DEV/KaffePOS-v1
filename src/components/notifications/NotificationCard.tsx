import { BadgePercent, Bell, BriefcaseBusiness, Clock, Info, Package, Target, Trophy } from 'lucide-react';
import type { KaffeNotification } from '@/lib/notifications';
import { getNotificationCategory } from '@/lib/notifications';

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
}

function getVisual(notification: KaffeNotification) {
  const category = getNotificationCategory(notification);
  if (notification.type === 'loyalty') return { Icon: BadgePercent, label: 'Business Alert', className: 'bg-orange-100 text-orange-600' };
  if (category === 'gamification') return { Icon: Trophy, label: 'Gamification', className: 'bg-orange-100 text-orange-600' };
  if (category === 'challenges') return { Icon: Target, label: 'Challenges', className: 'bg-orange-100 text-orange-600' };
  if (category === 'business_alert') return { Icon: BriefcaseBusiness, label: 'Business Alert', className: 'bg-slate-100 text-slate-600' };
  if (category === 'stock') return { Icon: Package, label: 'Stock', className: 'bg-amber-100 text-amber-700' };
  return { Icon: Info, label: 'System', className: 'bg-slate-100 text-slate-500' };
}

export default function NotificationCard({ notification }: { notification: KaffeNotification }) {
  const visual = getVisual(notification);
  const Icon = visual.Icon;

  return (
    <article
      className={`rounded-2xl border p-4 transition-all ${
        notification.is_read
          ? 'border-slate-100 bg-white'
          : 'border-orange-100 bg-orange-50/40 shadow-sm shadow-orange-100/40'
      }`}
    >
      <div className="flex gap-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${visual.className}`}>
          <Icon size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{visual.label}</p>
              <h3 className="mt-0.5 truncate text-sm font-black text-slate-800">{notification.title}</h3>
            </div>
            {!notification.is_read && (
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#FF6A00] shadow-[0_0_0_4px_rgba(255,106,0,0.12)]" />
            )}
          </div>
          <p className="text-xs font-semibold leading-relaxed text-slate-600">{notification.message}</p>
          <div className="mt-3 flex items-center gap-1.5 text-slate-400">
            <Clock size={11} />
            <span className="text-[10px] font-bold">{formatNotificationTime(notification.created_at)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

export function NotificationEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100">
        <Bell size={36} className="text-slate-300" />
      </div>
      <p className="mt-4 text-lg font-black text-slate-700">Belum ada notifikasi</p>
      <p className="mt-1 max-w-[230px] text-sm font-semibold text-slate-400">
        Update dari misi, stok, loyalty, dan operasional akan muncul di sini saat tersedia.
      </p>
    </div>
  );
}
