/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/utils/toast.ts

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export const showToast = (message: string, type: ToastType = 'info') => {
  const event = new CustomEvent('kaffepos-toast', {
    detail: { message, type }
  });
  window.dispatchEvent(event);
};

export default showToast;
