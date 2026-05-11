const SLOW_DEVICE_CLASS = 'kaffe-slow-device';
const REDUCED_MOTION_CLASS = 'kaffe-reduced-motion';

function hasLowDeviceMemory() {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof memory === 'number' && memory > 0 && memory <= 4;
}

function hasLowCoreCount() {
  return typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4;
}

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent);
}

export function applyDevicePerformanceHints() {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slowDevice = reducedMotion || (isAndroidDevice() && (hasLowDeviceMemory() || hasLowCoreCount()));

  root.classList.toggle(REDUCED_MOTION_CLASS, reducedMotion);
  root.classList.toggle(SLOW_DEVICE_CLASS, slowDevice);
}
