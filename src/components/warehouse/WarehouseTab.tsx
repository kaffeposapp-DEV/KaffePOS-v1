 
 
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from 'react';
import { Plus, Archive, X, AlertTriangle, ChevronDown, ChevronUp, Search, RefreshCw, ChefHat, Calculator, Upload, CheckCircle2, FileSpreadsheet, ClipboardCheck } from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet';
import type { BulkImportMode } from '@/lib/stockEngine';
import {
  buildBulkImportPreview,
  calculateGrossMargin,
  calculateProductHpp,
  parseStockImportCsv,
  type BulkImportRow,
} from '@/lib/stockEngine';
import { getRecipeSaveErrorMessage, normalizeUserFacingError } from '@/lib/errorMessages';
import type { InventoryItem, InventoryItemUpdate, MenuItem } from '@/types';
import { getInventoryUsageMap } from '@/utils/receipt';

const fRp = (n: number) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(n||0);

interface WarehouseForm {
  id: string;
  name: string;
  qty: string;
  cost: string;
  unit: string;
  minStock: string;
  type: 'new' | 'edit' | 'restock';
}

export default function WarehouseTab({ toast }: { toast:any }) {
  const {
    inventory,
    menu,
    transactions,
    unitConversions,
    saveInventoryItem,
    adjustInventoryStock,
    deleteInventoryItem,
    saveStockUnitConversion,
    deleteStockUnitConversion,
    saveMenuItem,
    commitStockBulkImportRows,
  } = useStore();
  const [section, setSection] = useState<'summary'|'ingredients'|'conversions'|'recipes'|'hpp'|'import'>('summary');
  const [showModal,    setShowModal]    = useState(false);
  const [form,         setForm]         = useState<WarehouseForm>({ id:'', name:'', qty:'', cost:'', unit:'gr', minStock:'5', type:'new' });
  const [search,       setSearch]       = useState('');
  const [saving,       setSaving]       = useState(false);
  const [expandedId,   setExpandedId]   = useState<string|null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{id:string;name:string}|null>(null);
  const [conversionForm, setConversionForm] = useState({ ingredient_id: '', from_unit: '', to_unit: 'pcs', ratio: '1' });
  const [recipeForm, setRecipeForm] = useState({ product_id: '', ingredient_id: '', qty: '', unit_reference: '' });
  const [recipeError, setRecipeError] = useState('');
  const [importMode, setImportMode] = useState<BulkImportMode>('create_only');
  const [importText, setImportText] = useState('');
  const [importRows, setImportRows] = useState<BulkImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [opnameTarget, setOpnameTarget] = useState<InventoryItem | null>(null);
  const [opnameForm, setOpnameForm] = useState({ countedStock: '', reason: 'Opname stok fisik', note: '' });
  const [opnameSaving, setOpnameSaving] = useState(false);

  const filtered = useMemo(() =>
    inventory.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
  , [inventory, search]);

  const lowStock = inventory.filter(i => i.stock <= i.min_stock);
  const activeInventory = inventory.filter(i => i.is_active !== false);
  const inventoryValue = inventory.reduce((sum, item) => sum + item.stock * item.cost_per_unit, 0);
  const hppRows = useMemo(
    () => menu.map((product) => {
      const hpp = calculateProductHpp(product, inventory, unitConversions);
      const margin = calculateGrossMargin(product.price, hpp.totalCost);
      return { product, hpp, margin };
    }),
    [inventory, menu, unitConversions],
  );
  const importPreview = useMemo(
    () => buildBulkImportPreview(importRows, { inventory, menu, conversions: unitConversions, mode: importMode }),
    [importMode, importRows, inventory, menu, unitConversions],
  );
  const usageMap = useMemo(() => {
    const rows = getInventoryUsageMap(inventory, menu, transactions, unitConversions);
    return new Map(rows.map((row) => [row.itemId, row]));
  }, [inventory, menu, transactions, unitConversions]);

  // Which menus use each inventory item
  const usedInMenu = useMemo(() => {
    const map: Record<string, string[]> = {};
    menu.forEach((m: MenuItem) => {
      (m.recipe||[]).forEach(r => {
        if (!map[r.matId]) map[r.matId] = [];
        if (!map[r.matId].includes(m.name)) map[r.matId].push(m.name);
      });
    });
    return map;
  }, [menu]);

  const openNew     = () => { setForm({ id:'', name:'', qty:'', cost:'', unit:'gr', minStock:'5', type:'new' }); setShowModal(true); };
  const openRestock = (item: InventoryItem) => { setForm({ id:item.id, name:item.name, qty:'', cost:'', unit:item.unit, minStock:String(item.min_stock||5), type:'restock' }); setShowModal(true); };
  const openEdit    = (item: InventoryItem) => { setForm({ id:item.id, name:item.name, qty:String(item.stock), cost:String(Math.round(item.cost_per_unit * item.stock)), unit:item.unit, minStock:String(item.min_stock||5), type:'edit' }); setShowModal(true); };
  const openOpname = (item: InventoryItem) => {
    setOpnameTarget(item);
    setOpnameForm({ countedStock: String(item.stock), reason: 'Opname stok fisik', note: '' });
  };

  const sectionItems = [
    { id: 'summary', label: 'Ringkasan Stok', icon: Archive },
    { id: 'ingredients', label: 'Bahan Baku', icon: Plus },
    { id: 'conversions', label: 'Konversi Satuan', icon: RefreshCw },
    { id: 'recipes', label: 'Resep / Porsi', icon: ChefHat },
    { id: 'hpp', label: 'HPP & Margin', icon: Calculator },
    { id: 'import', label: 'Impor Bulk', icon: Upload },
  ] as const;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.qty) { toast.showToast('Nama dan jumlah wajib diisi', 'warning'); return; }
    const qty = Number(form.qty);
    const cost = Number(form.cost || 0);
    const minStock = Number(form.minStock || 0);
    if (qty < 0 || cost < 0 || minStock < 0) {
      toast.showToast('Qty, biaya, dan stok minimum tidak boleh negatif', 'warning');
      return;
    }
    setSaving(true);
    try {
      await saveInventoryItem(form as unknown as InventoryItemUpdate);
      setShowModal(false);
      const msg = form.type==='new' ? '✅ Bahan ditambahkan!' : form.type==='edit' ? '✅ Bahan diperbarui!' : '✅ Stok diperbarui!';
      toast.showToast(msg, 'success');
    } catch (e:any) {
      toast.showToast(normalizeUserFacingError(e, 'Bahan baku belum bisa disimpan. Periksa kembali isian stok.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOpname = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opnameTarget) return;
    const countedStock = Number(opnameForm.countedStock);
    if (!Number.isFinite(countedStock) || countedStock < 0) {
      toast.showToast('Jumlah stok hasil opname tidak boleh negatif.', 'warning');
      return;
    }
    if (!opnameForm.reason.trim()) {
      toast.showToast('Alasan opname wajib diisi.', 'warning');
      return;
    }

    setOpnameSaving(true);
    try {
      await adjustInventoryStock({
        inventoryId: opnameTarget.id,
        countedStock,
        reason: opnameForm.reason.trim(),
        note: opnameForm.note.trim() || null,
      });
      setOpnameTarget(null);
      toast.showToast('Opname stok disimpan', 'success');
    } catch (error: any) {
      toast.showToast(normalizeUserFacingError(error, 'Opname stok belum bisa disimpan. Periksa stok fisik lalu coba lagi.'), 'error');
    } finally {
      setOpnameSaving(false);
    }
  };

  const handleSaveConversion = async (e: React.FormEvent) => {
    e.preventDefault();
    const ratio = Number(conversionForm.ratio || 0);
    if (!conversionForm.from_unit || !conversionForm.to_unit || ratio <= 0) {
      toast.showToast('Satuan asal, tujuan, dan rasio wajib valid', 'warning');
      return;
    }
    try {
      await saveStockUnitConversion({
        ingredient_id: conversionForm.ingredient_id || null,
        from_unit: conversionForm.from_unit,
        to_unit: conversionForm.to_unit,
        ratio,
        is_active: true,
      });
      setConversionForm({ ingredient_id: '', from_unit: '', to_unit: 'pcs', ratio: '1' });
      toast.showToast('Konversi satuan disimpan', 'success');
    } catch (error: any) {
      toast.showToast(normalizeUserFacingError(error, 'Konversi satuan belum bisa disimpan. Periksa satuan dan rasio.'), 'error');
    }
  };

  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    const product = menu.find((item) => item.id === recipeForm.product_id);
    const ingredient = inventory.find((item) => item.id === recipeForm.ingredient_id);
    const qty = Number(recipeForm.qty || 0);
    setRecipeError('');
    if (!product) {
      const message = 'Pilih produk yang akan diberi resep.';
      setRecipeError(message);
      toast.showToast(message, 'warning');
      return;
    }
    if (!ingredient) {
      const message = 'Pilih bahan baku untuk resep.';
      setRecipeError(message);
      toast.showToast(message, 'warning');
      return;
    }
    if (qty <= 0) {
      const message = 'Jumlah bahan per porsi harus lebih dari 0.';
      setRecipeError(message);
      toast.showToast(message, 'warning');
      return;
    }

    const nextRecipe = [
      ...(product.recipe || []).filter((line) => line.matId !== ingredient.id),
      { matId: ingredient.id, qty, unit_reference: recipeForm.unit_reference || ingredient.base_unit || ingredient.unit },
    ];

    try {
      await saveMenuItem({ ...product, recipe: nextRecipe });
      setRecipeForm({ product_id: product.id, ingredient_id: '', qty: '', unit_reference: '' });
      toast.showToast('Resep produk diperbarui', 'success');
    } catch (error: any) {
      const message = getRecipeSaveErrorMessage(error);
      setRecipeError(message);
      toast.showToast(message, 'error');
    }
  };

  const handleImportText = (value: string) => {
    setImportText(value);
    const parsed = parseStockImportCsv(value);
    setImportRows(parsed.rows);
  };

  const handleImportFile = async (file?: File | null) => {
    if (!file) return;
    const text = await file.text();
    handleImportText(text);
  };

  const handleCommitImport = async () => {
    if (importPreview.errors.length > 0 || importPreview.validRows.length === 0) {
      toast.showToast('Perbaiki baris error sebelum import', 'warning');
      return;
    }

    setImporting(true);
    try {
      const result = await commitStockBulkImportRows(importMode, importPreview.validRows);
      setImportText('');
      setImportRows([]);
      toast.showToast(`Import stok selesai: ${result.committed.ingredients} bahan, ${result.committed.products} produk, ${result.committed.recipes} resep`, 'success');
    } catch (error: any) {
      toast.showToast(normalizeUserFacingError(error, 'Import stok gagal diproses. Periksa data lalu coba lagi.'), 'error');
    } finally {
      setImporting(false);
    }
  };

  const getStockMeta = (item: InventoryItem) => {
    const usage = usageMap.get(item.id);
    const healthPct = item.min_stock > 0 ? Math.min((item.stock / item.min_stock) * 100, 200) : 100;
    const fillPct = usage?.percent ?? 100;
    const isLow = item.stock <= item.min_stock;
    const barColor = isLow ? '#ef4444' : fillPct < 40 ? '#f97316' : '#10b981';
    return {
      used: usage?.used || 0,
      baseline: usage?.baseline || item.stock,
      fillPct,
      healthPct,
      barColor,
      label: isLow ? 'Stok menipis' : fillPct >= 70 ? 'Stok full' : 'Stok aman',
    };
  };

  return (
    <div className="kaffe-responsive-surface flex-1 flex flex-col overflow-hidden bg-white lg:bg-slate-50/50">
      <div className="bg-white border-b border-slate-100 px-4 sm:px-6 pt-6 pb-4 z-10">
        <div className="flex min-w-0 items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="font-black text-xl text-slate-800 italic uppercase tracking-tighter">Stok</h2>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Bahan, Konversi, Resep, HPP</p>
          </div>
          <div className={`shrink-0 gap-2 ${section === 'ingredients' || section === 'summary' ? 'flex' : 'hidden md:flex'}`}>
            <button onClick={openNew} className="flex items-center gap-2 h-10 px-4 bg-white text-slate-600 rounded-xl border border-slate-200 text-[12px] font-black uppercase tracking-widest active:scale-95 transition-all hover:border-orange-200 hover:text-[#FF6A00]">
              <Plus size={16}/>Baru
            </button>
            <button onClick={()=>{setForm({id:'',name:'',qty:'',cost:'',unit:'gr',minStock:'5',type:'restock'});setShowModal(true);}}
              className="kaffe-gradient-button flex items-center gap-2 h-10 px-4 rounded-xl text-[12px] font-black uppercase tracking-widest active:scale-95 transition-all">
              <Archive size={16}/>Restock
            </button>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mb-4 font-bold uppercase tracking-widest leading-relaxed">
          Restock tercatat sebagai pembelian bahan baku dan tidak mengurangi saldo awal kasir.
        </p>

        <div className="kaffe-scroll-tabs flex gap-2 overflow-x-auto pb-2 mb-3">
          {sectionItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`h-10 px-3 rounded-2xl border text-[11px] font-black whitespace-nowrap flex items-center gap-2 transition-all ${
                section === id
                  ? 'bg-slate-900 text-white border-slate-900 shadow-soft'
                  : 'bg-white text-slate-500 border-slate-100 hover:border-orange-200'
              }`}
            >
              <Icon size={14} />{label}
            </button>
          ))}
        </div>

        {lowStock.length > 0 && section === 'summary' && (
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3 mb-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-rose-500 shrink-0 mt-0.5"/>
            <div>
              <p className="text-rose-600 text-[11px] font-black uppercase tracking-widest">{lowStock.length} BAHAN STOK KRITIS!</p>
              <p className="text-rose-400 text-xs font-bold mt-0.5 italic">{lowStock.map(i=>i.name).join(', ')}</p>
            </div>
          </div>
        )}

        {/* Search */}
        {section === 'ingredients' && <div className="relative mb-2">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"/>
          <input 
            value={search} 
            onChange={e=>setSearch(e.target.value)} 
            placeholder="Cari bahan baku..."
            className="w-full h-12 bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-4 text-[15px] focus:outline-none focus:ring-4 focus:ring-[#FF6A00]/5 focus:border-[#FF6A00]/20 transition-all font-bold text-slate-700 placeholder:text-slate-300 shadow-sm"
          />
        </div>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {section === 'summary' && (
          <div className="space-y-5">
            <div className="kaffe-card-grid grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-soft">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bahan Aktif</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{activeInventory.length}</p>
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-soft">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stok Kritis</p>
                <p className={`mt-2 text-2xl font-black ${lowStock.length ? 'text-rose-500' : 'text-emerald-600'}`}>{lowStock.length}</p>
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-soft">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nilai Stok</p>
                <p className="mt-2 text-lg font-black text-slate-900">{fRp(inventoryValue)}</p>
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-soft">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resep Aktif</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{menu.filter(item => item.recipe?.length).length}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-soft">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">Bahan Perlu Restock</p>
                {lowStock.length === 0 ? (
                  <p className="text-sm font-bold text-slate-400">Semua bahan utama aman.</p>
                ) : lowStock.slice(0, 6).map(item => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <span className="text-sm font-bold text-slate-700">{item.name}</span>
                    <span className="text-xs font-black text-rose-500">{item.stock} {item.unit}</span>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-soft">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">HPP Belum Lengkap</p>
                {hppRows.filter(row => !row.hpp.complete).length === 0 ? (
                  <p className="text-sm font-bold text-slate-400">Semua resep yang aktif punya HPP valid.</p>
                ) : hppRows.filter(row => !row.hpp.complete).slice(0, 6).map(row => (
                  <div key={row.product.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <span className="text-sm font-bold text-slate-700">{row.product.name}</span>
                    <span className="text-[11px] font-black text-amber-500">{row.hpp.warnings.length} catatan</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === 'ingredients' && (filtered.length === 0 ? (
          <div className="kaffe-empty-state flex flex-col items-center justify-center h-60 rounded-3xl text-slate-300">
             <Archive size={48} className="mb-4 opacity-10" />
             <p className="text-[12px] font-black uppercase tracking-[0.2em]">Stok Kosong</p>
          </div>
        ) : (
            <div className="kaffe-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map(item => {
          const isLow = item.stock <= item.min_stock;
          const stockMeta = getStockMeta(item);
          const inMenus = usedInMenu[item.id] || [];
          const expanded = expandedId === item.id;

          return (
            <div key={item.id} className={`kaffe-action-card group bg-white rounded-2xl border transition-all duration-300 hover:shadow-premium hover:border-[#FF6A00]/20 ${isLow?'border-rose-100 bg-rose-50/10 shadow-soft':'border-slate-100 shadow-soft'}`}>
              <div className="p-6">
                <div className="flex items-start justify-between mb-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <p className="font-bold text-slate-800 text-[16px] group-hover:text-[#FF6A00] transition-colors">{item.name}</p>
                      {isLow && <span className="text-[9px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md uppercase tracking-widest">Kritis</span>}
                      {inMenus.length>0 && (
                        <button onClick={()=>setExpandedId(expanded?null:item.id)}
                          className="text-[9px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md flex items-center gap-1.5 uppercase tracking-widest">
                          {inMenus.length} resep {expanded?<ChevronUp size={12}/>:<ChevronDown size={12}/>}
                        </button>
                      )}
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className={`font-black text-3xl tracking-tighter italic ${isLow?'text-rose-500':'text-slate-900'}`}>
                        {item.stock.toLocaleString('id-ID')}
                      </span>
                      <span className="text-[11px] font-black text-slate-300 uppercase tracking-widest">{item.unit}</span>
                    </div>
                    <div className="flex flex-col gap-1 mt-4">
                       <div className="flex items-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.05em]">
                         <span>HPP: {fRp(item.cost_per_unit)}/{item.unit}</span>
                         <div className="w-1 h-1 rounded-full bg-slate-100" />
                         <span>Aset: {fRp(item.stock * item.cost_per_unit)}</span>
                       </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 ml-4 shrink-0">
                    <button onClick={()=>openRestock(item)} className="p-2.5 bg-orange-50 text-[#FF6A00] rounded-2xl hover:bg-orange-100 transition-colors border border-orange-100"><Archive size={18}/></button>
                    <button aria-label={`Opname ${item.name}`} onClick={()=>openOpname(item)} className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-100 transition-colors border border-emerald-100"><ClipboardCheck size={18}/></button>
                    <button onClick={()=>openEdit(item)} className="p-2.5 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-100 transition-colors border border-slate-100"><Plus size={18} className="rotate-45"/></button>
                  </div>
                </div>

                {/* Stock bar */}
                <div className="w-full bg-slate-50 rounded-full h-3 overflow-hidden border border-slate-100/50">
                  <div className="h-3 rounded-full transition-all" style={{width:`${stockMeta.fillPct}%`, backgroundColor:stockMeta.barColor}}/>
                </div>
                <div className="flex justify-between text-[10px] mt-2 font-bold uppercase tracking-widest">
                  <span className={isLow ? 'text-rose-500' : 'text-slate-300'}>{stockMeta.label}</span>
                  <span className="text-slate-300">{stockMeta.fillPct}% sisa stok</span>
                </div>
              </div>

              {/* Menu yang menggunakan bahan ini */}
              {expanded && inMenus.length>0 && (
                <div className="border-t border-slate-50 bg-blue-50/30 px-6 py-4">
                  <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-3">DIGUNAKAN DI MENU</p>
                  <div className="flex flex-wrap gap-2">
                    {inMenus.map((name,i)=>(
                      <span key={i} className="text-[11px] font-black bg-white text-blue-600 border border-blue-100 px-3 py-1 rounded-xl shadow-sm">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
            })}
          </div>
        ))}

        {section === 'conversions' && (
          <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
            <form onSubmit={handleSaveConversion} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-soft space-y-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Tambah Konversi</p>
              <select value={conversionForm.ingredient_id} onChange={e=>setConversionForm(f=>({...f,ingredient_id:e.target.value}))} className="w-full h-11 border border-slate-200 rounded-2xl px-3 text-sm font-bold">
                <option value="">Global / semua bahan</option>
                {inventory.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input value={conversionForm.from_unit} onChange={e=>setConversionForm(f=>({...f,from_unit:e.target.value}))} placeholder="mika / bal" className="h-11 border border-slate-200 rounded-2xl px-3 text-sm font-bold"/>
                <input value={conversionForm.to_unit} onChange={e=>setConversionForm(f=>({...f,to_unit:e.target.value}))} placeholder="pcs / gram" className="h-11 border border-slate-200 rounded-2xl px-3 text-sm font-bold"/>
              </div>
              <input type="number" step="0.0001" value={conversionForm.ratio} onChange={e=>setConversionForm(f=>({...f,ratio:e.target.value}))} placeholder="15" className="h-11 w-full border border-slate-200 rounded-2xl px-3 text-sm font-bold"/>
              <button className="w-full h-11 rounded-2xl bg-slate-900 text-white font-black text-[12px] uppercase tracking-widest">Simpan Konversi</button>
            </form>
            <div className="bg-white border border-slate-100 rounded-2xl shadow-soft overflow-hidden">
              {unitConversions.length === 0 ? (
                <div className="p-8 text-center text-slate-300 font-black uppercase tracking-widest text-xs">Belum ada konversi</div>
              ) : unitConversions.map(conversion => {
                const ingredient = inventory.find(item => item.id === conversion.ingredient_id);
                return (
                  <div key={conversion.id} className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-sm font-black text-slate-800">1 {conversion.from_unit} = {conversion.ratio.toLocaleString('id-ID')} {conversion.to_unit}</p>
                      <p className="text-[11px] font-bold text-slate-400">{ingredient?.name || 'Global'}</p>
                    </div>
                    <button onClick={()=>deleteStockUnitConversion(conversion.id)} className="h-9 px-3 rounded-xl bg-rose-50 text-rose-500 text-[11px] font-black">Hapus</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {section === 'recipes' && (
          <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
            <form onSubmit={handleSaveRecipe} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-soft space-y-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Tambah Resep</p>
              <select value={recipeForm.product_id} onChange={e=>setRecipeForm(f=>({...f,product_id:e.target.value}))} className="w-full h-11 border border-slate-200 rounded-2xl px-3 text-sm font-bold">
                <option value="">Pilih produk</option>
                {menu.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <select value={recipeForm.ingredient_id} onChange={e=>setRecipeForm(f=>({...f,ingredient_id:e.target.value}))} className="w-full h-11 border border-slate-200 rounded-2xl px-3 text-sm font-bold">
                <option value="">Pilih bahan</option>
                {inventory.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" step="0.0001" value={recipeForm.qty} onChange={e=>setRecipeForm(f=>({...f,qty:e.target.value}))} placeholder="Qty / porsi" className="h-11 border border-slate-200 rounded-2xl px-3 text-sm font-bold"/>
                <input value={recipeForm.unit_reference} onChange={e=>setRecipeForm(f=>({...f,unit_reference:e.target.value}))} placeholder="pcs / gram" className="h-11 border border-slate-200 rounded-2xl px-3 text-sm font-bold"/>
              </div>
              {recipeError && (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{recipeError}</p>
              )}
              <button className="w-full h-11 rounded-2xl bg-slate-900 text-white font-black text-[12px] uppercase tracking-widest">Simpan Resep</button>
            </form>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hppRows.map(({ product, hpp }) => (
                <div key={product.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-soft">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-slate-800">{product.name}</p>
                      <p className="text-[11px] font-bold text-slate-400">{product.recipe?.length || 0} bahan resep</p>
                    </div>
                    <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${hpp.complete?'bg-emerald-50 text-emerald-600':'bg-amber-50 text-amber-600'}`}>{hpp.complete?'Lengkap':'Perlu Cek'}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {hpp.lines.length === 0 ? <p className="text-xs font-bold text-slate-300">Tanpa resep</p> : hpp.lines.map(line => (
                      <div key={line.ingredientId} className="flex justify-between text-xs font-bold">
                        <span className="text-slate-500">{line.ingredientName}</span>
                        <span className="text-slate-800">{line.baseQty.toLocaleString('id-ID')} {line.baseUnit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {section === 'hpp' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {hppRows.map(({ product, hpp, margin }) => (
              <div key={product.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-soft">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="font-black text-slate-800">{product.name}</p>
                    <p className="text-[11px] font-bold text-slate-400">{product.category}</p>
                  </div>
                  {hpp.complete ? <CheckCircle2 size={18} className="text-emerald-500"/> : <AlertTriangle size={18} className="text-amber-500"/>}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-[10px] font-black text-slate-400 uppercase">Harga</p><p className="font-black text-slate-900">{fRp(product.price)}</p></div>
                  <div><p className="text-[10px] font-black text-slate-400 uppercase">HPP</p><p className="font-black text-slate-900">{fRp(hpp.totalCost)}</p></div>
                  <div><p className="text-[10px] font-black text-slate-400 uppercase">Margin</p><p className="font-black text-emerald-600">{margin.marginPercent}%</p></div>
                  <div><p className="text-[10px] font-black text-slate-400 uppercase">Laba</p><p className="font-black text-slate-900">{fRp(margin.grossProfit)}</p></div>
                </div>
                {!hpp.complete && <p className="mt-3 text-[11px] font-bold text-amber-600">{hpp.warnings[0]}</p>}
              </div>
            ))}
          </div>
        )}

        {section === 'import' && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-soft">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 text-slate-700 font-black"><FileSpreadsheet size={18}/> CSV Import</div>
                <div className="flex gap-2">
                  <select value={importMode} onChange={e=>setImportMode(e.target.value as BulkImportMode)} className="h-10 border border-slate-200 rounded-xl px-3 text-xs font-black">
                    <option value="create_only">Create only</option>
                    <option value="update_existing">Update existing</option>
                    <option value="upsert">Upsert</option>
                  </select>
                  <input type="file" accept=".csv,text/csv" onChange={e=>handleImportFile(e.target.files?.[0])} className="max-w-44 text-xs font-bold"/>
                </div>
              </div>
              <textarea
                value={importText}
                onChange={e=>handleImportText(e.target.value)}
                className="w-full min-h-72 border border-slate-200 rounded-2xl p-4 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                placeholder={'kind,name,stock,base_unit,total_cost,from_unit,to_unit,ratio,product_name,ingredient_name,qty_per_serving,price,category\ningredient,Gula Aren,10,kg,45000,,,,,,,\nconversion,,,,,kg,gram,1000,,,,,\nproduct,Kopi Susu,,,,,,,,,,18000,Coffee\nrecipe,,,,,,,,Kopi Susu,Gula Aren,20,,'}
              />
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-soft h-fit">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">Preview Import</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {Object.entries(importPreview.summary).map(([key, value]) => (
                  <div key={key} className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[9px] font-black uppercase text-slate-400">{key}</p>
                    <p className="text-xl font-black text-slate-800">{value}</p>
                  </div>
                ))}
              </div>
              {importPreview.errors.length > 0 && (
                <div className="space-y-2 mb-4">
                  {importPreview.errors.slice(0, 5).map(error => (
                    <div key={`${error.rowNumber}-${error.message}`} className="rounded-xl bg-rose-50 text-rose-600 p-3 text-xs font-bold">
                      Baris {error.rowNumber}: {error.message}
                    </div>
                  ))}
                </div>
              )}
              <button onClick={handleCommitImport} disabled={importing || importPreview.errors.length > 0 || importPreview.validRows.length === 0} className="w-full h-12 rounded-2xl bg-[#FF6A00] text-white font-black text-[12px] uppercase tracking-widest disabled:opacity-40">
                {importing ? 'Mengimpor...' : 'Commit Import'}
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div 
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="modal-content bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-black text-xl text-slate-900 tracking-tight">
                {form.type==='new'?'Bahan Baru':form.type==='edit'?'Edit Bahan':'Restock Bahan'}
              </h3>
              <button 
                onClick={()=>setShowModal(false)} 
                className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 active:bg-slate-100"
              >
                <X size={20}/>
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              {form.type!=='restock' ? (
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold text-slate-700 pl-0.5">Nama Bahan *</label>
                  <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                    placeholder="Biji Kopi Arabica"
                    className="w-full h-12 border border-slate-200 rounded-2xl px-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all" />
                </div>
              ) : (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                  <p className="font-bold text-orange-700">{form.name}</p>
                  <p className="text-orange-500 text-xs">Menambah stok yang sudah ada tanpa memotong saldo buka kasir</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold text-slate-700 pl-0.5">
                    {form.type==='new'?'Stok Awal':form.type==='edit'?'Jumlah Stok':'Jumlah Restock'} *
                  </label>
                  <input type="number" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))}
                    placeholder="0" step="0.1"
                    className="w-full h-12 border border-slate-200 rounded-2xl px-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold text-slate-700 pl-0.5">Satuan</label>
                  <select value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))}
                    className="w-full h-12 border border-slate-200 rounded-2xl px-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all appearance-none">
                    {['gr','kg','ml','L','pcs','btl','bks','lbr','sachet'].map(u=><option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-slate-700 pl-0.5">Total Biaya Beli (Rp)</label>
                <input type="number" value={form.cost} onChange={e=>setForm(f=>({...f,cost:e.target.value}))}
                  placeholder="0"
                  className="w-full h-12 border border-slate-200 rounded-2xl px-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all" />
                <p className="text-[11px] text-slate-400 pl-0.5 font-medium">
                  {form.qty && form.cost
                    ? `HPP per ${form.unit}: ${fRp(parseInt(form.cost)/(parseFloat(form.qty)||1))}`
                    : 'Isi untuk hitung HPP/unit otomatis'}
                </p>
              </div>
              {form.type !== 'restock' && (
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold text-slate-700 pl-0.5">Stok Minimum (Peringatan)</label>
                  <input type="number" value={form.minStock} onChange={e=>setForm(f=>({...f,minStock:e.target.value}))}
                    placeholder="5"
                    className="w-full h-12 border border-slate-200 rounded-2xl px-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all" />
                  <p className="text-[11px] text-slate-400 pl-0.5 font-medium">Notifikasi ⚠ muncul saat stok ≤ nilai ini</p>
                </div>
              )}
              <button 
                type="submit" 
                disabled={saving}
                className="w-full h-14 bg-[#FF6A00] text-white font-black rounded-2xl active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 shadow-premium transition-all italic uppercase tracking-wider"
              >
                {saving&&<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
                {saving?'Menyimpan...':'Simpan Perubahan'}
              </button>
            </form>
          </div>
        </div>
      )}

      {opnameTarget && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setOpnameTarget(null)}
        >
          <div className="modal-content bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-black text-xl text-slate-900 tracking-tight">Opname Stok</h3>
                <p className="text-xs font-bold text-slate-400 mt-1">{opnameTarget.name}</p>
              </div>
              <button
                onClick={()=>setOpnameTarget(null)}
                className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 active:bg-slate-100"
              >
                <X size={20}/>
              </button>
            </div>
            <form onSubmit={handleSaveOpname} className="space-y-3">
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stok sistem sekarang</p>
                <p className="text-lg font-black text-slate-900 mt-1">{opnameTarget.stock.toLocaleString('id-ID')} {opnameTarget.unit}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-slate-700 pl-0.5">Stok fisik hasil hitung *</label>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={opnameForm.countedStock}
                  onChange={e=>setOpnameForm(f=>({...f,countedStock:e.target.value}))}
                  className="w-full h-12 border border-slate-200 rounded-2xl px-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-slate-700 pl-0.5">Alasan *</label>
                <input
                  value={opnameForm.reason}
                  onChange={e=>setOpnameForm(f=>({...f,reason:e.target.value}))}
                  className="w-full h-12 border border-slate-200 rounded-2xl px-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-slate-700 pl-0.5">Catatan</label>
                <textarea
                  value={opnameForm.note}
                  onChange={e=>setOpnameForm(f=>({...f,note:e.target.value}))}
                  className="w-full min-h-20 border border-slate-200 rounded-2xl px-4 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all"
                  placeholder="Opsional"
                />
              </div>
              <button
                type="submit"
                disabled={opnameSaving}
                className="w-full h-14 bg-[#FF6A00] text-white font-black rounded-2xl active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 shadow-premium transition-all italic uppercase tracking-wider"
              >
                {opnameSaving&&<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
                {opnameSaving?'Menyimpan...':'Simpan Opname'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Konfirmasi hapus bahan baku */}
      <DeleteConfirmSheet
        visible={!!deleteTarget}
        title={`Hapus "${deleteTarget?.name}"?`}
        message="Bahan baku ini akan dihapus permanen. Resep menu yang menggunakan bahan ini akan terpengaruh."
        onConfirm={() => deleteTarget && deleteInventoryItem(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
