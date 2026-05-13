import type { ReactNode } from 'react';
import { useModalBehavior } from '@/hooks/useModalBehavior';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  overlayClassName?: string;
  panelClassName?: string;
  closeOnEscape?: boolean;
  disableClose?: boolean;
};

function joinClassNames(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(' ');
}

export default function Modal({
  open,
  onClose,
  children,
  labelledBy,
  overlayClassName,
  panelClassName,
  closeOnEscape = true,
  disableClose = false,
}: ModalProps) {
  const { panelRef, onBackdropClick, dialogProps } = useModalBehavior<HTMLDivElement>({
    open,
    onClose,
    closeOnEscape,
    disableClose,
  });

  if (!open) return null;

  return (
    <div
      className={joinClassNames(
        'kaffe-modal-overlay fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/50 backdrop-blur-sm md:items-center',
        overlayClassName,
      )}
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        className={joinClassNames(
          'kaffe-modal-panel bg-white shadow-[0_24px_100px_rgba(15,23,42,0.22)] animate-in slide-in-from-bottom-4 duration-200',
          panelClassName,
        )}
        {...(labelledBy ? { 'aria-labelledby': labelledBy } : {})}
        {...dialogProps}
      >
        {children}
      </div>
    </div>
  );
}
