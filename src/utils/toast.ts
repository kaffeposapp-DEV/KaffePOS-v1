 
 
 
 
 
 
// src/utils/toast.ts

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export const showToast = (message: string, type: ToastType = 'info') => {
  const event = new CustomEvent('kaffepos-toast', {
    detail: { message, type }
  });
  window.dispatchEvent(event);
};

export default showToast;
