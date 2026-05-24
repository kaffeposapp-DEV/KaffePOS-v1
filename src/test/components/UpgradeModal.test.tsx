import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UpgradeModal from '@/components/subscription/UpgradeModal';
import { logUpgradePromptEvent } from '@/lib/backendApi';

vi.mock('@/lib/backendApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/backendApi')>();
  return {
    ...actual,
    logUpgradePromptEvent: vi.fn().mockResolvedValue({ success: true }),
  };
});

const ownerRoleProps = { role: 'owner_admin' as const };

function renderModal(overrides: Partial<ComponentProps<typeof UpgradeModal>> = {}) {
  const onClose = vi.fn();
  const result = render(
    <UpgradeModal
      open
      onClose={onClose}
      currentPlan="secangkir"
      recommendedPlan="signature"
      trigger="trial_day_13"
      promptKey="trial-test"
      title="Trial Signature tersisa 1 hari"
      description="Upgrade ke Signature kapan saja agar fitur premium tetap aktif."
      storeId="00000000-0000-0000-0000-000000000001"
      toast={{ showToast: vi.fn() }}
      metadata={{ daysLeft: 1 }}
      {...ownerRoleProps}
      {...overrides}
    />,
  );
  return { ...result, onClose };
}

describe('UpgradeModal dismiss behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('closes trial upgrade pop-up from X button', async () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Tutup upgrade/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(logUpgradePromptEvent).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'dismiss' })));
  });

  it('closes trial upgrade pop-up from backdrop click', () => {
    const { onClose } = renderModal();
    const dialog = screen.getByRole('dialog', { name: /Trial Signature tersisa 1 hari/i });
    const backdrop = dialog.parentElement as HTMLElement;

    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes trial upgrade pop-up from Escape key', () => {
    const { onClose } = renderModal();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
