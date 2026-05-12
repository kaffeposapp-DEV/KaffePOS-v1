import { useCallback, useEffect, useId, useRef, type MouseEvent } from 'react';

type ModalBehaviorOptions = {
  open: boolean;
  onClose: () => void;
  closeOnEscape?: boolean;
  lockScroll?: boolean;
  trapFocus?: boolean;
  initialFocus?: boolean;
  disabled?: boolean;
};

let bodyScrollLockCount = 0;
let previousBodyOverflow = '';
const openModalStack: string[] = [];

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
}

function lockBodyScroll() {
  if (typeof document === 'undefined') return;
  if (bodyScrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  bodyScrollLockCount += 1;
}

function unlockBodyScroll() {
  if (typeof document === 'undefined') return;
  bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
  if (bodyScrollLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
    previousBodyOverflow = '';
  }
}

export function isBackdropEvent(event: MouseEvent<HTMLElement>) {
  return event.target === event.currentTarget;
}

export function useModalBehavior<T extends HTMLElement>({
  open,
  onClose,
  closeOnEscape = true,
  lockScroll = true,
  trapFocus = true,
  initialFocus = true,
  disabled = false,
}: ModalBehaviorOptions) {
  const panelRef = useRef<T | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const modalId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const isTopModal = useCallback(() => openModalStack[openModalStack.length - 1] === modalId, [modalId]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openModalStack.push(modalId);
    if (lockScroll) lockBodyScroll();

    const focusTimer = window.setTimeout(() => {
      if (!initialFocus || disabled || !isTopModal()) return;
      const focusable = getFocusableElements(panelRef.current);
      (focusable[0] ?? panelRef.current)?.focus({ preventScroll: true });
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (disabled || !isTopModal()) return;

      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !trapFocus) return;
      const focusable = getFocusableElements(panelRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current?.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown, true);
      const stackIndex = openModalStack.lastIndexOf(modalId);
      if (stackIndex >= 0) openModalStack.splice(stackIndex, 1);
      if (lockScroll) unlockBodyScroll();
      previouslyFocusedRef.current?.focus?.({ preventScroll: true });
      previouslyFocusedRef.current = null;
    };
  }, [closeOnEscape, disabled, initialFocus, isTopModal, lockScroll, modalId, open, trapFocus]);

  const onBackdropClick = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!disabled && isBackdropEvent(event) && isTopModal()) {
      onCloseRef.current();
    }
  }, [disabled, isTopModal]);

  return {
    panelRef,
    onBackdropClick,
    dialogProps: {
      role: 'dialog',
      'aria-modal': true,
      tabIndex: -1,
    } as const,
  };
}
