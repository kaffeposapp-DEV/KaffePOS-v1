import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Loader2, Power, PowerOff, Search, UserPlus, Users } from 'lucide-react';
import {
  createCashier,
  getCashiers,
  getStores,
  updateCashier,
  type CashierAccount,
  type StoreResponse,
} from '@/lib/backendApi';
import { normalizeUserFacingError } from '@/lib/errorMessages';

type Props = {
  toast: { showToast: (message: string, type?: string) => void };
};

type FormMode = 'create' | 'edit';
type CashierStatus = 'active' | 'inactive';

type CashierForm = {
  displayName: string;
  email: string;
  password: string;
  storeId: string;
  status: CashierStatus;
};

const emptyForm: CashierForm = {
  displayName: '',
  email: '',
  password: '',
  storeId: '',
  status: 'active',
};

function statusLabel(status: CashierStatus) {
  return status === 'active' ? 'Aktif' : 'Nonaktif';
}

export default function CashierManagementSection({ toast }: Props) {
  const [cashiers, setCashiers] = useState<CashierAccount[]>([]);
  const [stores, setStores] = useState<StoreResponse[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [mode, setMode] = useState<FormMode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CashierForm>(emptyForm);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [storeResponse, cashierResponse] = await Promise.all([getStores(), getCashiers()]);
      setStores(storeResponse.items || []);
      setCashiers(cashierResponse.items || []);
      setForm((current) => ({
        ...current,
        storeId: current.storeId || storeResponse.items?.[0]?.id || '',
      }));
    } catch (error) {
      toast.showToast(normalizeUserFacingError(error, 'Data kasir belum bisa dimuat. Coba lagi.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData().catch(() => {});
  }, [loadData]);

  const filteredCashiers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return cashiers;
    return cashiers.filter((cashier) =>
      [cashier.display_name, cashier.email, cashier.username, cashier.store_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [cashiers, query]);

  const openCreate = () => {
    setMode('create');
    setEditingId(null);
    setForm({ ...emptyForm, storeId: stores[0]?.id || '' });
    setFormOpen(true);
  };

  const openEdit = (cashier: CashierAccount) => {
    setMode('edit');
    setEditingId(cashier.id);
    setForm({
      displayName: cashier.display_name || '',
      email: cashier.email || '',
      password: '',
      storeId: cashier.store_id,
      status: cashier.status,
    });
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (!form.displayName.trim() || !form.email.trim() || !form.storeId) {
      toast.showToast('Nama, email, dan outlet wajib diisi.', 'error');
      return;
    }
    if (mode === 'create' && form.password.length < 10) {
      toast.showToast('Password awal minimal 10 karakter.', 'error');
      return;
    }

    setSaving(true);
    try {
      if (mode === 'create') {
        await createCashier({
          displayName: form.displayName.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          storeId: form.storeId,
          status: form.status,
        });
        toast.showToast('Akun kasir berhasil dibuat.', 'success');
      } else if (editingId) {
        await updateCashier(editingId, {
          displayName: form.displayName.trim(),
          email: form.email.trim().toLowerCase(),
          ...(form.password ? { password: form.password } : {}),
          storeId: form.storeId,
          status: form.status,
        });
        toast.showToast('Akun kasir berhasil diperbarui.', 'success');
      }

      setFormOpen(false);
      await loadData();
    } catch (error) {
      toast.showToast(normalizeUserFacingError(error, 'Data kasir belum bisa disimpan. Periksa isian lalu coba lagi.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (cashier: CashierAccount) => {
    const nextStatus = cashier.status === 'active' ? 'inactive' : 'active';
    try {
      await updateCashier(cashier.id, { status: nextStatus });
      toast.showToast(
        nextStatus === 'active' ? 'Akun kasir diaktifkan kembali.' : 'Akun kasir dinonaktifkan.',
        'success',
      );
      await loadData();
    } catch (error) {
      toast.showToast(normalizeUserFacingError(error, 'Status kasir belum bisa diubah. Coba lagi.'), 'error');
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Manajemen Kasir</p>
            <h3 className="mt-1 text-lg font-black text-slate-900">Akun Kasir</h3>
            <p className="mt-1 text-xs font-medium text-slate-500">Buat akun kasir dan hubungkan ke outlet yang boleh dipakai.</p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white active:scale-95"
          >
            <UserPlus size={16} />
            Tambah Kasir
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
          <Search size={16} className="text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari nama, email, atau outlet"
            className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      {formOpen && (
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{mode === 'create' ? 'Kasir Baru' : 'Edit Kasir'}</p>
              <h4 className="text-base font-black text-slate-900">{mode === 'create' ? 'Tambah Akun Kasir' : 'Ubah Akun Kasir'}</h4>
            </div>
            <button type="button" onClick={() => setFormOpen(false)} className="text-xs font-bold text-slate-400">
              Tutup
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-slate-600">Nama kasir</span>
              <input
                aria-label="Nama kasir"
                value={form.displayName}
                onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-400"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-slate-600">Email login</span>
              <input
                aria-label="Email login"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-400"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-slate-600">{mode === 'create' ? 'Password awal' : 'Password baru'}</span>
              <input
                aria-label="Password awal"
                type="password"
                value={form.password}
                placeholder={mode === 'edit' ? 'Kosongkan jika tidak diganti' : ''}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-400"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-slate-600">Outlet</span>
              <select
                aria-label="Outlet"
                value={form.storeId}
                onChange={(event) => setForm((current) => ({ ...current, storeId: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-orange-400"
              >
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>{store.store_name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-600">
              <input
                type="checkbox"
                checked={form.status === 'active'}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.checked ? 'active' : 'inactive' }))}
                className="h-4 w-4 accent-orange-500"
              />
              Aktifkan akun kasir
            </label>
            <button
              type="button"
              onClick={() => void submitForm()}
              disabled={saving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-black text-white active:scale-95 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
              Simpan Kasir
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-6 text-sm font-bold text-slate-400">
            <Loader2 size={16} className="animate-spin" />
            Memuat kasir...
          </div>
        ) : filteredCashiers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Users size={22} />
            </div>
            <p className="text-sm font-black text-slate-700">Belum ada kasir</p>
            <p className="mt-1 text-xs text-slate-400">Tambahkan akun kasir untuk outletmu.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredCashiers.map((cashier) => {
              const active = cashier.status === 'active';
              const name = cashier.display_name || cashier.username || 'Kasir';
              return (
                <div key={cashier.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-slate-900">{name}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {statusLabel(cashier.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-500">{cashier.email}</p>
                    <p className="mt-1 text-xs font-bold text-orange-600">{cashier.store_name}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(cashier)}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600 active:scale-95"
                    >
                      <Edit3 size={14} />
                      Edit
                    </button>
                    <button
                      type="button"
                      aria-label={`${active ? 'Nonaktifkan' : 'Aktifkan'} ${name}`}
                      onClick={() => void toggleStatus(cashier)}
                      className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-black active:scale-95 ${
                        active ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {active ? <PowerOff size={14} /> : <Power size={14} />}
                      {active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
