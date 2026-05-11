import { Capacitor, registerPlugin } from '@capacitor/core';
import { registerPushSubscription } from '@/lib/backendApi';

export type NotificationCategory = 'all' | 'gamification' | 'challenges' | 'business_alert' | 'stock' | 'system';

export type NotificationMetadata = {
  category?: Exclude<NotificationCategory, 'all'>;
  dedupeKey?: string;
  [key: string]: unknown;
};

export type KaffeNotification = {
  id: string;
  user_id: string;
  store_id?: string | null;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  metadata?: NotificationMetadata | null;
  created_at: string;
};

export type NotificationReadPayload = {
  ids?: string[];
  storeId?: string;
};

export type PushRegistrationResult = {
  enabled: boolean;
  channel?: 'web_push' | 'capacitor_android';
  reason?: string;
};

type PushNotificationsPlugin = {
  requestPermissions: () => Promise<{ receive?: 'granted' | 'denied' | 'prompt'; display?: 'granted' | 'denied' | 'prompt' }>;
  register: () => Promise<void>;
  addListener: (eventName: 'registration', listenerFunc: (token: { value: string }) => void) => Promise<{ remove: () => Promise<void> }>;
};

const PushNotifications = registerPlugin<PushNotificationsPlugin>('PushNotifications');
const CACHE_PREFIX = 'kpos_notifications_cache';
const MARK_READ_QUEUE_PREFIX = 'kpos_notifications_mark_read_queue';

export const NOTIFICATION_CATEGORIES: Array<{ id: NotificationCategory; label: string }> = [
  { id: 'all', label: 'Semua' },
  { id: 'gamification', label: 'Gamification' },
  { id: 'challenges', label: 'Challenges' },
  { id: 'business_alert', label: 'Business Alert' },
  { id: 'stock', label: 'Stock' },
  { id: 'system', label: 'System' },
];

export function getNotificationCategory(notification: KaffeNotification): Exclude<NotificationCategory, 'all'> {
  const metadataCategory = notification.metadata?.category;
  if (metadataCategory) return metadataCategory;
  if (notification.type === 'challenge') return 'challenges';
  if (notification.type === 'stock') return 'stock';
  if (notification.type === 'gamification') return 'gamification';
  if (notification.type === 'loyalty' || notification.type === 'business_alert') return 'business_alert';
  return 'system';
}

export function getNotificationCacheKey(userId: string) {
  return `${CACHE_PREFIX}:${userId}`;
}

export function cacheNotifications(userId: string, notifications: KaffeNotification[]) {
  try {
    localStorage.setItem(getNotificationCacheKey(userId), JSON.stringify(notifications.slice(0, 100)));
  } catch {
    // optional cache
  }
}

export function readCachedNotifications(userId: string): KaffeNotification[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(getNotificationCacheKey(userId)) || '[]') as KaffeNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getMarkReadQueueKey(userId: string) {
  return `${MARK_READ_QUEUE_PREFIX}:${userId}`;
}

export function enqueueNotificationMarkRead(userId: string, payload: NotificationReadPayload) {
  try {
    const queue = JSON.parse(localStorage.getItem(getMarkReadQueueKey(userId)) || '[]') as NotificationReadPayload[];
    queue.push(payload);
    localStorage.setItem(getMarkReadQueueKey(userId), JSON.stringify(queue.slice(-50)));
  } catch {
    // read state can be retried manually on next open
  }
}

export async function flushQueuedNotificationMarkRead(
  userId: string,
  sender: (payload: NotificationReadPayload) => Promise<unknown>,
) {
  let queue: NotificationReadPayload[] = [];
  try {
    queue = JSON.parse(localStorage.getItem(getMarkReadQueueKey(userId)) || '[]') as NotificationReadPayload[];
  } catch {
    queue = [];
  }
  if (queue.length === 0) return;

  const remaining: NotificationReadPayload[] = [];
  for (const item of queue) {
    try {
      await sender(item);
    } catch {
      remaining.push(item);
    }
  }

  try {
    if (remaining.length > 0) {
      localStorage.setItem(getMarkReadQueueKey(userId), JSON.stringify(remaining));
    } else {
      localStorage.removeItem(getMarkReadQueueKey(userId));
    }
  } catch {
    // optional queue cleanup
  }
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function requestPushNotifications(storeId?: string): Promise<PushRegistrationResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      const permissions = await PushNotifications.requestPermissions();
      if (permissions.receive !== 'granted') {
        return { enabled: false, channel: 'capacitor_android', reason: 'Izin push belum diberikan.' };
      }

      const token = await new Promise<string>((resolve, reject) => {
        PushNotifications.addListener('registration', (registration) => {
          resolve(registration.value);
        }).catch(reject);
        PushNotifications.register().catch(reject);
      });

      await registerPushSubscription({
        channel: 'capacitor_android',
        endpoint: token,
        payload: { token },
        platform: Capacitor.getPlatform(),
        ...(storeId ? { store_id: storeId } : {}),
      });
      return { enabled: true, channel: 'capacitor_android' };
    } catch (error) {
      return {
        enabled: false,
        channel: 'capacitor_android',
        reason: error instanceof Error ? error.message : 'Push Android belum siap.',
      };
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { enabled: false, channel: 'web_push', reason: 'Browser belum mendukung notifikasi.' };
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') {
    return { enabled: false, channel: 'web_push', reason: 'Izin notifikasi belum diberikan.' };
  }

  const vapidKey = String(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || '').trim();
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !vapidKey) {
    return { enabled: true, channel: 'web_push', reason: 'Izin lokal aktif. VAPID key belum dikonfigurasi untuk push server.' };
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });
  await registerPushSubscription({
    channel: 'web_push',
    endpoint: subscription.endpoint,
    payload: subscription.toJSON() as Record<string, unknown>,
    platform: 'web',
    ...(storeId ? { store_id: storeId } : {}),
  });
  return { enabled: true, channel: 'web_push' };
}
