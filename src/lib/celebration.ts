export type CelebrationKind = 'challenge' | 'badge' | 'level' | 'score' | 'loyalty' | 'streak';

export type CelebrationDetail = {
  id?: string;
  kind?: CelebrationKind;
  title: string;
  message?: string;
  points?: number;
  sound?: boolean;
};

export const CELEBRATION_EVENT = 'kaffepos-celebration';

const CELEBRATION_SEEN_PREFIX = 'kpos_celebration_seen';
const CELEBRATION_SOUND_KEY = 'kpos_celebration_sound';

function getSeenKey(key: string) {
  return `${CELEBRATION_SEEN_PREFIX}:${key}`;
}

export function dispatchCelebration(detail: CelebrationDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<CelebrationDetail>(CELEBRATION_EVENT, { detail }));
}

export function dispatchCelebrationOnce(key: string, detail: CelebrationDetail) {
  if (typeof window === 'undefined') return;
  try {
    const seenKey = getSeenKey(key);
    if (localStorage.getItem(seenKey)) return;
    localStorage.setItem(seenKey, new Date().toISOString());
  } catch {
    // celebration dedupe is best-effort
  }
  dispatchCelebration({ ...detail, id: detail.id ?? key });
}

export function isCelebrationSoundEnabled() {
  try {
    return localStorage.getItem(CELEBRATION_SOUND_KEY) === '1';
  } catch {
    return false;
  }
}

export function setCelebrationSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(CELEBRATION_SOUND_KEY, enabled ? '1' : '0');
  } catch {
    // preference is optional
  }
}
