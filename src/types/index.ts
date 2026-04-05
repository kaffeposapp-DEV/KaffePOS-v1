/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Tab = 'dashboard' | 'pos' | 'warehouse' | 'menu' | 'history' | 'report' | 'settings';
export interface StoreSettings {
  id: string; owner_id: string; store_name: string;
  address?: string; whatsapp?: string; tagline?: string;
  receipt_header?: string; receipt_footer?: string; tax_percent?: number;
  logo_url?: string; logo_base64?: string;
  logo_position?: 'left'|'center'|'right'; logo_size?: number;
  show_logo_on_receipt?: boolean;
  paper_width?: '58mm'|'80mm'; is_pro?: boolean;
  receipt_font_size?: 'small'|'medium'|'large';
  receipt_show_address?: boolean;
  receipt_show_whatsapp?: boolean;
  receipt_show_tax?: boolean;
  receipt_show_cashier?: boolean;
  receipt_show_trx_id?: boolean;
  receipt_divider?: 'dash'|'equal'|'star'|'dot';
  receipt_custom_line1?: string;
  receipt_custom_line2?: string;
  currency?: string;
  email?: string;
  website?: string;
  created_at?: string; updated_at?: string;
}
export interface MenuItem {
  id: string; store_id: string; name: string; price: number;
  category: string; image_url?: string; description?: string;
  recipe?: RecipeItem[]; variants?: Variant[];
  is_available: boolean; sort_order?: number;
  created_at?: string; updated_at?: string;
}
export interface RecipeItem { matId: string; qty: number; }
export interface Variant    { name: string; price: number; }
export interface CartItem extends MenuItem {
  qty: number; variantId?: string; _baseId?: string;
}
export interface InventoryItem {
  id: string; store_id: string; name: string;
  stock: number; unit: string; min_stock: number;
  cost_per_unit: number; created_at?: string; updated_at?: string;
}
export interface InventoryItemUpdate {
  type: 'new' | 'edit' | 'add' | 'restock';
  id?: string;
  name: string;
  qty: string | number;
  cost: string | number;
  unit?: string;
  minStock?: string | number;
}
export interface Transaction {
  id: string; store_id: string; date: string;
  items: TransactionItem[]; subtotal: number;
  discount: number; discount_label?: string|null;
  tax: number; total: number; cogs?: number;
  paid: number; change: number; method: 'Tunai'|'Transfer'|'QRIS';
  customer_name?: string|null;   // Nama pelanggan (optional)
  cashier?: string; note?: string|null;
  is_void: boolean; void_reason?: string|null;
  void_at?: string|null; void_by?: string|null;
  created_at?: string;
}
export interface TransactionItem { name:string; qty:number; price:number; subtotal:number; }
export interface Expense {
  id: string; store_id: string; date: string;
  description: string; amount: number; category: string;
  cashier?: string; created_at?: string;
}
export interface CashFlowEntry {
  id: string; store_id: string; date: string;
  type: 'in'|'out'; amount: number; description?: string; created_at?: string;
}
export interface CashRegister {
  id: string; store_id: string; date: string;
  amount: number; note?: string|null; opened_by: string; created_at?: string;
}
export interface Profile {
  id: string; username?: string; display_name?: string;
  email?: string; avatar_url?: string;
  tier?: string;       // 'pro' | 'basic' — kolom utama di Supabase
  is_pro?: boolean;    // kolom legacy (fallback)
  pro_plan?: string; pro_order_id?: string;
  pro_activated_at?: string; pro_expires_at?: string; created_at?: string;
}

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: { label: string; onClick: () => void };
}
