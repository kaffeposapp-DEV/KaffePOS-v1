import type { InventoryItem, MenuItem, StoreSettings, Transaction, Tab } from '@/types';

export type OnboardingStepId = 'store_profile' | 'menu_catalog' | 'stock_baseline' | 'first_transaction';

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
  done: boolean;
  ctaLabel: string;
  targetTab: Tab;
};

export type OnboardingChecklistInput = {
  storeSettings: StoreSettings | null;
  menu: MenuItem[];
  inventory: InventoryItem[];
  transactions: Transaction[];
};

export function getOnboardingChecklist(input: OnboardingChecklistInput) {
  const activeMenuCount = input.menu.filter((item) => item.is_available !== false).length;
  const activeInventoryCount = input.inventory.filter((item) => item.is_active !== false).length;
  const completedTransactionCount = input.transactions.filter((tx) => !tx.is_void).length;

  const steps: OnboardingStep[] = [
    {
      id: 'store_profile',
      title: 'Profil toko siap',
      description: input.storeSettings?.store_name?.trim()
        ? input.storeSettings.store_name
        : 'Lengkapi nama toko agar struk dan dashboard jelas.',
      done: Boolean(input.storeSettings?.store_name?.trim()),
      ctaLabel: 'Lengkapi toko',
      targetTab: 'settings',
    },
    {
      id: 'menu_catalog',
      title: 'Minimal 3 menu',
      description: `${Math.min(activeMenuCount, 3)}/3 menu aktif siap dijual.`,
      done: activeMenuCount >= 3,
      ctaLabel: 'Tambah menu',
      targetTab: 'menu',
    },
    {
      id: 'stock_baseline',
      title: 'Bahan baku awal',
      description: activeInventoryCount > 0
        ? `${activeInventoryCount} bahan baku tercatat.`
        : 'Tambahkan bahan utama agar HPP dan stok bisa dihitung.',
      done: activeInventoryCount > 0,
      ctaLabel: 'Buka stok',
      targetTab: 'warehouse',
    },
    {
      id: 'first_transaction',
      title: 'Transaksi pertama',
      description: completedTransactionCount > 0
        ? `${completedTransactionCount} transaksi sudah tercatat.`
        : 'Coba transaksi tunai demo untuk memastikan alur kasir aman.',
      done: completedTransactionCount > 0,
      ctaLabel: 'Coba kasir',
      targetTab: 'pos',
    },
  ];

  const completedCount = steps.filter((step) => step.done).length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);

  return {
    steps,
    completedCount,
    totalCount: steps.length,
    progressPercent,
    complete: completedCount === steps.length,
  };
}
