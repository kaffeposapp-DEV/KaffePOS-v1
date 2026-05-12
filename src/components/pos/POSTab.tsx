/* eslint-disable react-hooks/exhaustive-deps */




/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/pos/POSTab.tsx — KaffePOS v5
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ShoppingBag, Plus, Minus, X, ChevronRight,
  Search, Printer, RefreshCw, CheckCircle2, ChefHat,
  Banknote, Gift, Landmark, Smartphone, AlertCircle, Share2,
} from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import PrintActionSheet from '@/components/pos/PrintActionSheet';
import ProductPlaceholder from '@/components/ui/ProductPlaceholder';
import LoyaltyCheckoutModal from '@/components/loyalty/LoyaltyCheckoutModal';
import type { Profile, MenuItem, Transaction } from '@/types';
import type { SubscriptionAccess } from '@/lib/subscriptionAccess';
import { canProcessPosPaymentOffline, getOfflinePaymentBlockedMessage } from '@/lib/offlinePolicy';
import { buildStockDeductionPlan, calculateProductHpp } from '@/lib/stockEngine';
import { normalizeUserFacingError } from '@/lib/errorMessages';
import {
  addLoyaltyStamp,
  createPayment,
  getLoyaltyOverview,
  getPaymentOrderStatus,
  redeemLoyaltyReward,
  searchLoyaltyPassports,
  type SecurePaymentCreateResponse,
  type SecurePaymentOrderStatus,
} from '@/lib/backendApi';
import { enqueueOfflineOperation } from '@/lib/offlineQueue';
import { dispatchUpgradePrompt } from '@/lib/upgradePrompts';
import { openMidtransSnap } from '@/lib/midtrans';
import {
  calculateLoyaltyRewardDiscount,
  canRedeemReward,
  normalizeLoyaltyPhone,
  readCachedLoyaltyOverview,
  writeCachedLoyaltyOverview,
  type LoyaltyOverview,
  type LoyaltyPassport,
  type LoyaltyReward,
} from '@/lib/loyalty';
import { useModalBehavior } from '@/hooks/useModalBehavior';
import { trackAnalyticsEvent } from '@/lib/analytics';
import { trackOpsEvent } from '@/lib/opsMetrics';

const fRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);

interface Props {
  toast:   { showToast: (m: string, t?: 'success' | 'error' | 'warning' | 'info') => void };
  profile: Profile | null;
  subscriptionAccess: SubscriptionAccess;
}

// ── Quick amount buttons ──────────────────────────────────────────
function quickAmounts(total: number): number[] {
  const rounded = Math.ceil(total / 10_000) * 10_000;
  return [...new Set([total, rounded, 50_000, 100_000].filter(v => v >= total))];
}

function makeIdempotencyKey(prefix: string) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}:${crypto.randomUUID()}`;
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

type PaymentPhase = 'idle' | 'creating' | 'snap_open' | 'pending' | 'success' | 'failed' | 'cancelled' | 'expired' | 'denied';

function getSnapTransactionStatus(result: unknown) {
  if (!result || typeof result !== 'object') return null;
  const value = (result as { transaction_status?: unknown; status_code?: unknown }).transaction_status;
  return typeof value === 'string' ? value.toLowerCase() : null;
}

function getPaymentPhaseFromSnap(result: unknown, fallback: PaymentPhase): PaymentPhase {
  const status = getSnapTransactionStatus(result);
  if (status === 'settlement' || status === 'capture') return 'success';
  if (status === 'pending') return 'pending';
  if (status === 'cancel') return 'cancelled';
  if (status === 'expire') return 'expired';
  if (status === 'deny') return 'denied';
  return fallback;
}

function getPaymentMessage(phase: PaymentPhase) {
  if (phase === 'creating') return 'Membuat pembayaran aman...';
  if (phase === 'snap_open') return 'Snap Midtrans siap. Selesaikan pembayaran di popup.';
  if (phase === 'pending') return 'Pembayaran sedang menunggu konfirmasi Midtrans.';
  if (phase === 'success') return 'Pembayaran berhasil. Struk digital siap.';
  if (phase === 'cancelled') return 'Pembayaran dibatalkan. Pesanan belum diproses.';
  if (phase === 'expired') return 'Waktu pembayaran habis. Silakan buat pembayaran baru.';
  if (phase === 'denied') return 'Pembayaran ditolak. Silakan coba metode lain.';
  if (phase === 'failed') return 'Pembayaran gagal, silakan coba lagi.';
  return null;
}

export default function POSTab({ toast, profile, subscriptionAccess }: Props) {
  const {
    storeId, menu, inventory, unitConversions, cart, discount, transactions, isOnline,
    addToCart, updateQty, clearCart, setDiscount, setCartItemNote,
    saveTransaction, storeSettings, kitchenOrders, loadAll,
  } = useStore();

  const [cat,        setCat]        = useState('All');
  const [search,     setSearch]     = useState('');
  const [dSearch,    setDSearch]    = useState('');
  const [showPay,    setShowPay]    = useState(false);
  const [showVouchers, setShowVouchers] = useState(false);
  const [method,     setMethod]     = useState<'Tunai'|'Transfer'|'QRIS'>('Tunai');
  const [cash,       setCash]       = useState('');
  const [showRcpt,   setShowRcpt]   = useState(false);
  const [lastTx,     setLastTx]     = useState<Transaction | null>(null);
  const [custName,   setCustName]   = useState('');   // ← Nama pelanggan
  const [showPrintSheet, setShowPrintSheet] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [paymentPhase, setPaymentPhase] = useState<PaymentPhase>('idle');
  const [paymentOrder, setPaymentOrder] = useState<SecurePaymentCreateResponse | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<SecurePaymentOrderStatus | null>(null);
  const [loyaltyOverview, setLoyaltyOverview] = useState<LoyaltyOverview | null>(null);
  const [loyaltyPhone, setLoyaltyPhone] = useState('');
  const [loyaltySearching, setLoyaltySearching] = useState(false);
  const [loyaltyPassport, setLoyaltyPassport] = useState<LoyaltyPassport | null>(null);
  const [loyaltyReward, setLoyaltyReward] = useState<LoyaltyReward | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search input
  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDSearch(val), 200);
  }, [],   );

  const cats = useMemo(() =>
    ['All', ...new Set(menu.map(m => m.category))],
    [menu]
  );

  const filtered = useMemo(() =>
    menu.filter(m =>
      m.is_available &&
      (cat === 'All' || m.category === cat) &&
      (!dSearch || m.name.toLowerCase().includes(dSearch.toLowerCase()))
    ),
    [menu, cat, dSearch]
  );

  const subtotal = useMemo(() => cart.reduce((s, c) => s + c.price * c.qty, 0), [cart]);
  const discAmt  = useMemo(() => {
    if (!discount) return 0;
    const rawDiscount = discount.endsWith('%')
      ? Math.round(subtotal * parseInt(discount) / 100)
      : parseInt(discount) || 0;
    return Math.min(Math.max(0, rawDiscount), subtotal);
  }, [subtotal, discount]);
  const taxPct = storeSettings?.tax_percent || 0;
  const taxableBase = Math.max(0, subtotal - discAmt);
  const taxAmt = Math.round(taxableBase * taxPct / 100);
  const total  = taxableBase + taxAmt;
  const paid   = method === 'Tunai' ? parseInt(cash) || 0 : total;
  const change = Math.max(0, paid - total);
  const currentMonthTransactionCount = useMemo(() => {
    const now = new Date();
    return transactions.filter((tx) => {
      if (tx.is_void) return false;
      const txDate = new Date(tx.date);
      return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
    }).length;
  }, [transactions]);
  const activeKitchenOrders = useMemo(
    () => kitchenOrders.filter((order) => !['served', 'completed', 'cancelled'].includes(order.overall_status)).slice(0, 4),
    [kitchenOrders],
  );
  const lastTxKitchenOrder = useMemo(() => {
    if (!lastTx) return null;
    return kitchenOrders.find((order) => order.transaction_id === lastTx.id) || lastTx.kitchen_order || null;
  }, [kitchenOrders, lastTx]);

  // ── Stock check — handles variants correctly ──────────────────
  const checkStock = useCallback((item: MenuItem): boolean => {
    if (!item.recipe?.length) return true;
    // Find how many of this item (base ID) are already in cart
    const inCartQty = cart
      .filter(c => c.id === item.id || c._baseId === item.id)
      .reduce((s, c) => s + c.qty, 0);
    const plan = buildStockDeductionPlan(
      [{ id: item.id, name: item.name, qty: inCartQty + 1, menu_item_id: item.id }],
      menu,
      inventory,
      unitConversions,
    );
    return plan.ok;
  }, [cart, inventory, menu, unitConversions]);

  const handleAdd = useCallback((item: MenuItem) => {
    if (!checkStock(item)) {
      toast.showToast('Stok bahan tidak cukup', 'warning');
      return;
    }
    // If has variants, add base price
    if (item.variants?.length) {
      // Show variant picker — for now just add base
      addToCart(item);
    } else {
      addToCart(item);
    }
  }, [checkStock, addToCart, toast]);

  useEffect(() => {
    if (!showPay || !storeId) return;
    const cached = readCachedLoyaltyOverview(storeId);
    if (cached) setLoyaltyOverview(cached);
    if (!isOnline) return;
    getLoyaltyOverview(storeId)
      .then((data) => {
        setLoyaltyOverview(data);
        writeCachedLoyaltyOverview(storeId, data);
      })
      .catch(() => {
        // Loyalty is supportive; checkout must remain usable even when this fetch fails.
      });
  }, [isOnline, showPay, storeId]);

  const loyaltyRewards = useMemo(
    () => (loyaltyOverview?.rewards || []).filter((reward) => reward.is_active),
    [loyaltyOverview?.rewards],
  );

  const loyaltySettings = loyaltyOverview?.settings;

  const handleLoyaltySearch = useCallback(async () => {
    if (!storeId) return;
    const normalizedPhone = normalizeLoyaltyPhone(loyaltyPhone || custName);
    if (normalizedPhone.length < 4 && !custName.trim()) {
      toast.showToast('Isi nomor HP atau nama pelanggan untuk mencari Kopi Passport.', 'warning');
      return;
    }
    try {
      setLoyaltySearching(true);
      const localPassports = loyaltyOverview?.passports || [];
      if (!isOnline) {
        const query = (normalizedPhone || custName).toLowerCase();
        const found = localPassports.find((passport) => (
          `${passport.customer_name || ''} ${passport.customer_phone}`.toLowerCase().includes(query)
        ));
        if (found) {
          setLoyaltyPassport(found);
          setLoyaltyPhone(found.customer_phone);
          if (!custName.trim() && found.customer_name) setCustName(found.customer_name);
          return;
        }
        toast.showToast('Passport belum ada di cache offline. Stamp akan tetap bisa diantrikan.', 'info');
        return;
      }
      const result = await searchLoyaltyPassports(storeId, normalizedPhone || custName);
      const found = result.items[0] || null;
      setLoyaltyPassport(found);
      if (found) {
        setLoyaltyPhone(found.customer_phone);
        if (!custName.trim() && found.customer_name) setCustName(found.customer_name);
        toast.showToast('Kopi Passport ditemukan.', 'success');
      } else {
        toast.showToast('Passport belum ditemukan. Stamp akan membuat passport baru setelah bayar.', 'info');
      }
    } catch (error) {
      toast.showToast(normalizeUserFacingError(error, 'Pencarian loyalty gagal.'), 'warning');
    } finally {
      setLoyaltySearching(false);
    }
  }, [custName, isOnline, loyaltyOverview?.passports, loyaltyPhone, storeId, toast]);

  const handleApplyLoyaltyReward = useCallback((reward: LoyaltyReward) => {
    if (!loyaltyPassport) {
      toast.showToast('Pilih Kopi Passport dulu sebelum menukar reward.', 'warning');
      return;
    }
    if (!canRedeemReward(loyaltyPassport, reward)) {
      toast.showToast('Poin atau stamp pelanggan belum cukup untuk reward ini.', 'warning');
      return;
    }
    const rewardDiscount = calculateLoyaltyRewardDiscount(reward, subtotal);
    if (reward.type !== 'free_item' && rewardDiscount <= 0) {
      toast.showToast('Reward ini belum punya nominal diskon untuk transaksi ini.', 'warning');
      return;
    }
    setLoyaltyReward(reward);
    if (rewardDiscount > 0) setDiscount(String(rewardDiscount));
    toast.showToast(`${reward.name} diterapkan ke transaksi.`, 'success');
  }, [loyaltyPassport, setDiscount, subtotal, toast]);

  const handleClearLoyaltyReward = useCallback(() => {
    setLoyaltyReward(null);
    setDiscount('');
  }, [setDiscount]);


  const finishPaidPayment = useCallback(async (status: SecurePaymentOrderStatus) => {
    setPaymentStatus(status);
    setPaymentPhase('success');
    if (storeId) await loadAll(storeId).catch(() => {});
    if (status.transaction) setLastTx(status.transaction);
    trackAnalyticsEvent('payment_completed', {
      store_id: storeId || undefined,
      order_id: status.order_id,
      transaction_id: status.transaction_id || undefined,
      value: status.gross_amount,
    });
    void trackOpsEvent({
      event_name: 'payment_completed',
      status: 'success',
      ...(storeId ? { store_id: storeId } : {}),
      ...(status.transaction_id ? { transaction_id: status.transaction_id } : {}),
      metadata: { orderId: status.order_id, grossAmount: status.gross_amount },
    });
    clearCart();
    setCustName('');
    setLoyaltyPhone('');
    setLoyaltyPassport(null);
    setLoyaltyReward(null);
    setShowPay(false);
    setShowRcpt(true);
    toast.showToast('Pembayaran berhasil. Struk digital siap.', 'success');
  }, [clearCart, loadAll, storeId, toast]);

  const pollPaymentOrder = useCallback(async (orderId: string, fallbackPhase: PaymentPhase = 'pending') => {
    setPaymentPhase(fallbackPhase);
    let latest: SecurePaymentOrderStatus | null = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      latest = await getPaymentOrderStatus(orderId);
      setPaymentStatus(latest);
      console.info('[KaffePOS payment]', {
        orderId,
        status: latest.status,
        transactionStatus: latest.transaction_status,
        transactionId: latest.transaction_id,
        attempt: attempt + 1,
      });
      if (latest.status === 'completed') {
        await finishPaidPayment(latest);
        return latest;
      }
      if (latest.status === 'failed' || latest.status === 'cancelled') {
        const failedPhase = latest.transaction_status === 'expire'
          ? 'expired'
          : latest.transaction_status === 'deny'
            ? 'denied'
            : latest.status === 'cancelled'
              ? 'cancelled'
              : 'failed';
        setPaymentPhase(failedPhase);
        toast.showToast(getPaymentMessage(failedPhase) || 'Pembayaran gagal, silakan coba lagi.', 'error');
        return latest;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt < 3 ? 1200 : 2500));
    }
    setPaymentPhase('pending');
    toast.showToast('Pembayaran masih diproses. Status akan diperbarui otomatis dari Midtrans.', 'info');
    return latest;
  }, [finishPaidPayment, toast]);

  const handleCheckout = useCallback(async () => {
    if (!cart.length) return;
    if (!storeId) {
      toast.showToast('Toko belum siap. Sinkronkan ulang data toko dulu.', 'warning');
      return;
    }
    if (!isOnline && !canProcessPosPaymentOffline(method)) {
      toast.showToast(getOfflinePaymentBlockedMessage(method), 'warning');
      return;
    }
    if (method === 'Tunai' && paid < total) {
      toast.showToast('Uang bayar kurang', 'warning');
      return;
    }
    if (
      subscriptionAccess.transactionLimit !== -1 &&
      currentMonthTransactionCount >= subscriptionAccess.transactionLimit
    ) {
      toast.showToast('Paket gratis sudah mencapai 100 transaksi bulan ini. Upgrade untuk lanjut tanpa batas.', 'warning');
      dispatchUpgradePrompt({
        trigger: 'transaction_limit_blocked',
        promptKey: 'transaction_limit_blocked',
        recommendedPlan: 'kopi_susu',
        title: 'Batas transaksi gratis sudah tercapai',
        description: 'Upgrade ke Kopi Susu atau Signature untuk membuka transaksi tanpa batas dan menjaga kasir tetap bisa melayani pelanggan.',
        metadata: {
          used: currentMonthTransactionCount,
          limit: subscriptionAccess.transactionLimit,
        },
      });
      return;
    }
    const stockPlan = buildStockDeductionPlan(cart.map((cartItem) => ({
      id: cartItem.id,
      ...(cartItem._baseId ? { _baseId: cartItem._baseId } : {}),
      name: cartItem.name,
      qty: cartItem.qty,
      menu_item_id: cartItem._baseId || cartItem.id,
    })), menu, inventory, unitConversions);
    if (!stockPlan.ok) {
      toast.showToast('Stok bahan berubah. Periksa ulang keranjang sebelum checkout.', 'warning');
      return;
    }

    const cogs = cart.reduce((s, c) => {
      const base = menu.find(m => m.id === (c._baseId || c.id));
      if (!base) return s;
      return s + calculateProductHpp(base, inventory, unitConversions).totalCost * c.qty;
    }, 0);

    const todayStr = new Date().toDateString();
    const todayTxs = transactions.filter(t => new Date(t.date).toDateString() === todayStr);
    const count = todayTxs.length;
    const group = Math.floor(count / 100);
    const letter = String.fromCharCode(65 + Math.min(group, 25)); // A-Z mask
    const num = (count % 100) + 1;
    const uniqueSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const orderId = `ORDER #${letter}${String(num).padStart(3, '0')}-${uniqueSuffix}`;

    const tx = {
      id: orderId,
      store_id: storeId || 'temp',
      date:        new Date().toISOString(),
      items:       cart.map(c => ({
        name: c.name,
        qty: c.qty,
        price: c.price,
        subtotal: c.price * c.qty,
        menu_item_id: c._baseId || c.id,
        note: c.note?.trim() || null,
      })),
      subtotal, discount: discAmt, discount_label: loyaltyReward ? `Loyalty: ${loyaltyReward.name}` : (discount || null),
      tax: taxAmt, total, cogs: Math.round(cogs),
      paid, change, method,
      customer_name: custName.trim() || null,   // ← Simpan nama pelanggan
      cashier:     profile?.display_name || profile?.username || 'Kasir',
      note: null, is_void: false, void_reason: null, void_at: null, void_by: null,
      created_at:  new Date().toISOString(),
    };

    try {
      setCheckingOut(true);
      setPaymentPhase('idle');
      setPaymentStatus(null);
      if (method === 'QRIS') {
        if (!isOnline) {
          toast.showToast(getOfflinePaymentBlockedMessage('QRIS'), 'warning');
          return;
        }

        setPaymentPhase('creating');
        trackAnalyticsEvent('payment_started', { store_id: storeId, value: total, method: 'QRIS' });
        void trackOpsEvent({
          event_name: 'payment_started',
          status: 'success',
          store_id: storeId,
          metadata: { total, method: 'QRIS' },
        });
        const payment = await createPayment({
          store_id: storeId,
          discount_amount: discAmt,
          items: cart.map((item) => ({
            id: item._baseId || item.id,
            qty: item.qty,
            variant_name: item.variantId ?? null,
            note: item.note?.trim() || null,
          })),
          customer: {
            name: custName.trim() || null,
            email: profile?.email || null,
          },
        });

        setPaymentOrder(payment);
        setPaymentPhase('snap_open');
        toast.showToast('Pembayaran aman dibuat. Selesaikan lewat Snap.', 'info');
        if (payment.snap_token) {
          await openMidtransSnap({
            snapToken: payment.snap_token,
            snapScriptUrl: payment.snap_script_url ?? null,
            paymentUrl: payment.payment_url,
            callbacks: {
              onSuccess: (result) => {
                const phase = getPaymentPhaseFromSnap(result, 'success');
                void pollPaymentOrder(payment.order_id, phase);
              },
              onPending: (result) => {
                const phase = getPaymentPhaseFromSnap(result, 'pending');
                setPaymentPhase(phase);
                void pollPaymentOrder(payment.order_id, phase);
              },
              onError: (result) => {
                const phase = getPaymentPhaseFromSnap(result, 'failed');
                setPaymentPhase(phase);
                void pollPaymentOrder(payment.order_id, phase);
              },
              onClose: () => {
                setPaymentPhase('pending');
                toast.showToast('Popup pembayaran ditutup. Pesanan belum ditandai lunas.', 'info');
                void pollPaymentOrder(payment.order_id, 'pending');
              },
            },
          });
        } else if (payment.payment_url) {
          setPaymentPhase('pending');
          window.location.assign(payment.payment_url);
        }
        return;
      }

      const savedTx = await saveTransaction(tx as unknown as Transaction);
      const normalizedLoyaltyPhone = normalizeLoyaltyPhone(loyaltyPhone);
      if (storeId && (loyaltyPassport || normalizedLoyaltyPhone.length >= 4)) {
        const stampPayload = {
          store_id: storeId,
          ...(loyaltyPassport ? { passport_id: loyaltyPassport.id } : { customer_phone: normalizedLoyaltyPhone }),
          customer_name: custName.trim() || loyaltyPassport?.customer_name || null,
          transaction_id: savedTx.id,
          transaction_amount: total,
          note: 'Checkout Kopi Passport',
          idempotency_key: makeIdempotencyKey(`loyalty-stamp:${savedTx.id}`),
        };
        try {
          if (!isOnline || savedTx.sync_status === 'pending') {
            await enqueueOfflineOperation(storeId, {
              operation: 'loyalty.stamp.create',
              payload: stampPayload,
              idempotencyKey: stampPayload.idempotency_key,
            });
          } else {
            const stampResult = await addLoyaltyStamp(stampPayload);
            setLoyaltyPassport(stampResult.passport);
          }
        } catch {
          await enqueueOfflineOperation(storeId, {
            operation: 'loyalty.stamp.create',
            payload: stampPayload,
            idempotencyKey: stampPayload.idempotency_key,
          });
        }
      }

      if (storeId && loyaltyPassport && loyaltyReward) {
        const redemptionPayload = {
          store_id: storeId,
          passport_id: loyaltyPassport.id,
          reward_id: loyaltyReward.id,
          transaction_id: savedTx.id,
          transaction_amount: subtotal,
          idempotency_key: makeIdempotencyKey(`loyalty-redemption:${savedTx.id}:${loyaltyReward.id}`),
        };
        try {
          if (!isOnline || savedTx.sync_status === 'pending') {
            await enqueueOfflineOperation(storeId, {
              operation: 'loyalty.redemption.create',
              payload: redemptionPayload,
              idempotencyKey: redemptionPayload.idempotency_key,
            });
          } else {
            await redeemLoyaltyReward(redemptionPayload);
          }
        } catch {
          await enqueueOfflineOperation(storeId, {
            operation: 'loyalty.redemption.create',
            payload: redemptionPayload,
            idempotencyKey: redemptionPayload.idempotency_key,
          });
        }
      }
      setLastTx(savedTx);
      clearCart();
      setCustName('');
      setLoyaltyPhone('');
      setLoyaltyPassport(null);
      setLoyaltyReward(null);
      setShowPay(false);
      setShowRcpt(true);
      toast.showToast(
        savedTx.sync_status === 'pending'
          ? 'Transaksi tersimpan offline dan akan disinkronkan otomatis.'
          : 'Transaksi berhasil',
        'success',
      );
    } catch (e:any) {
      toast.showToast(normalizeUserFacingError(e, 'Checkout belum bisa diproses. Coba lagi.'), 'warning');
    } finally {
      setCheckingOut(false);
    }
  }, [cart, clearCart, currentMonthTransactionCount, discAmt, discount, inventory, isOnline, menu, method, paid, pollPaymentOrder, profile, saveTransaction, storeId, subscriptionAccess.transactionLimit, subtotal, taxAmt, toast, total, unitConversions]);


  const lowStock = useMemo(() =>
    inventory.filter(i => i.stock <= i.min_stock),
    [inventory]
  );

  const closePaymentModal = useCallback(() => setShowPay(false), []);
  const closeReceiptModal = useCallback(() => setShowRcpt(false), []);
  const closeVoucherModal = useCallback(() => setShowVouchers(false), []);
  const paymentModal = useModalBehavior<HTMLDivElement>({
    open: showPay,
    onClose: closePaymentModal,
    disabled: checkingOut,
  });
  const receiptModal = useModalBehavior<HTMLDivElement>({
    open: showRcpt && Boolean(lastTx),
    onClose: closeReceiptModal,
  });
  const voucherModal = useModalBehavior<HTMLDivElement>({
    open: showVouchers,
    onClose: closeVoucherModal,
  });
  const paymentMessage = getPaymentMessage(paymentPhase);
  const shareReceiptToWhatsApp = useCallback(() => {
    const tx = lastTx;
    if (!tx) return;
    const lines = [
      `Struk ${storeSettings?.store_name || 'KaffePOS'}`,
      `No: ${tx.id}`,
      tx.customer_name ? `Pelanggan: ${tx.customer_name}` : null,
      '',
      ...tx.items.map((item: any) => `${item.qty}x ${item.name} - ${fRp(item.subtotal)}`),
      '',
      `Total: ${fRp(tx.total)}`,
      `Bayar: ${tx.method}`,
      'Terima kasih.',
    ].filter(Boolean);
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer');
  }, [lastTx, storeSettings?.store_name]);

  return (
    <div className="kaffe-responsive-surface flex-1 flex overflow-hidden bg-slate-50">
      {/* ── KIRI: GRID MENU ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
        <div className="bg-white border-b border-slate-200/60 px-4 sm:px-6 pt-5 pb-4 z-10">
          <div className="flex min-w-0 items-center justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="font-display text-xl font-extrabold text-slate-800 tracking-tight">Katalog Menu</h2>
              {lowStock.length > 0 && (
                <p className="text-[11px] text-rose-500 font-bold mt-0.5 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-rose-500 animate-pulse" />
                  {lowStock.length} bahan kritis
                </p>
              )}
            </div>
            <div
              onClick={() => { if(!isOnline) window.location.reload(); }}
              className={`flex shrink-0 items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer active:scale-95 transition-all ${isOnline?'bg-emerald-50 border-emerald-100 text-emerald-600':'bg-rose-50 border-rose-100 text-rose-600 animate-bounce shadow-lg shadow-rose-200/50'}`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${isOnline?'bg-emerald-500 animate-pulse':'bg-rose-500'}`} />
              <span className="text-[10px] font-bold uppercase tracking-widest">{isOnline?'Terhubung':'Offline'}</span>
            </div>
          </div>
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Cari menu kopi, snack..."
              className="w-full h-12 bg-slate-50 border border-slate-200/60 rounded-2xl pl-12 pr-4 text-[15px] focus:outline-none focus:ring-4 focus:ring-[#FF6A00]/10 focus:border-[#FF6A00]/30 transition-all font-medium text-slate-700 placeholder:text-slate-400 shadow-soft"
            />
          </div>
          <div className="kaffe-scroll-tabs kaffe-command-bar flex gap-2 mt-4 overflow-x-auto pb-1 scrollbar-hide">
            {cats.map(c => (
              <button key={c} onClick={() => setCat(c)}
                className={`shrink-0 h-10 px-5 rounded-xl text-[13px] font-bold transition-all duration-300 ${cat===c?'bg-[#FF6A00] text-white shadow-premium':'bg-slate-50 text-slate-500 border border-slate-200 hover:bg-white hover:border-slate-300'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          {filtered.length === 0 ? (
            <div className="kaffe-empty-state flex flex-col items-center justify-center h-full rounded-3xl text-slate-400 gap-3">
              <ShoppingBag size={48} strokeWidth={1.5} className="opacity-20" />
              <p className="font-bold text-sm tracking-tight">Menu tidak ditemukan</p>
              <p className="max-w-xs text-center text-xs font-semibold text-slate-400">
                Coba kata kunci lain atau tambah produk baru dari tab Produk.
              </p>
            </div>
          ) : (
            <div className="kaffe-card-grid kaffe-quick-grid grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5 pb-24 md:pb-4">
              {filtered.map(item => {
                const totalQty = cart.filter(c => c.id === item.id || c._baseId === item.id).reduce((s,c)=>s+c.qty,0);
                return (
                  <div key={item.id} onClick={() => handleAdd(item)}
                    className="kaffe-action-card group min-w-0 bg-white rounded-3xl overflow-hidden shadow-soft border border-slate-100 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-premium active:scale-[0.98] flex flex-col relative"
                  >
                    {item.image_url ? (
                      <div className="relative pt-[75%] w-full overflow-hidden bg-slate-50">
                        <img src={item.image_url} alt={item.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy" />
                      </div>
                    ) : (
                      <div className="pt-[75%] w-full relative">
                        <ProductPlaceholder category={item.category} className="absolute inset-0" iconSize={32} />
                      </div>
                    )}
                    <div className="p-4 flex-1 flex flex-col">
                      <p className="font-bold text-slate-800 text-[14px] leading-tight mb-2 group-hover:text-[#FF6A00] transition-colors">{item.name}</p>
                      <p className="text-[#FF6A00] font-extrabold text-[15px] mt-auto">{fRp(item.price)}</p>
                    </div>

                    {totalQty > 0 && (
                      <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md rounded-2xl shadow-premium border border-white/50 px-3 py-1.5 flex items-center gap-2 z-10 animate-in zoom-in">
                        <span className="font-bold text-xs text-slate-800">{totalQty}x</span>
                        <div className="w-6 h-6 rounded-lg bg-[#FF6A00] text-white flex items-center justify-center">
                           <Plus size={12} strokeWidth={3} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── MOBILE: BUTTON KERANJANG MENGAMBANG ── */}
        {cart.length > 0 && (
          <div className="kaffe-sticky-action md:hidden absolute bottom-4 left-4 right-4 z-20">
            <button onClick={() => setShowPay(true)} className="w-full bg-slate-900 text-white p-4 rounded-3xl flex items-center justify-between shadow-[0_10px_40px_rgb(0,0,0,0.3)] active:scale-[0.97] transition-all border border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-black text-sm">{cart.length}</div>
                <span className="font-bold text-sm">Keranjang</span>
              </div>
              <div className="flex items-center gap-2 font-black text-lg">
                {fRp(total)} <ChevronRight size={18}/>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* ── KANAN: SIDEBAR CHECKOUT PERSISTEN (TABLET/DESKTOP) ── */}
      <div className="kaffe-checkout-panel hidden md:flex min-w-0 flex-col w-[340px] lg:w-[420px] bg-white border-l border-slate-200/60 shadow-[-10px_0_30px_rgb(0,0,0,0.02)] z-20 relative">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="font-extrabold text-slate-800">Pesanan Hari Ini</h2>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-[10px] uppercase tracking-wider font-bold text-slate-400 hover:text-red-500 transition-colors">
              Kosongkan (X)
            </button>
          )}
        </div>

        {activeKitchenOrders.length > 0 && (
          <div className="border-b border-slate-100 bg-white px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
                <ChefHat size={14} />
                Status Dapur
              </div>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('kaffepos-open-tab', { detail: { tab: 'kitchen' } }))}
                className="text-[10px] font-black uppercase tracking-wider text-orange-500"
              >
                Buka
              </button>
            </div>
            <div className="space-y-2">
              {activeKitchenOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-slate-800">{order.order_number}</p>
                    <p className="truncate text-[10px] font-bold text-slate-400">{order.customer_name || order.table_number || 'Walk-in'}</p>
                  </div>
                  <span className={`ml-2 rounded-lg px-2 py-1 text-[10px] font-black uppercase ${
                    order.overall_status === 'pending' ? 'bg-amber-100 text-amber-700' :
                    order.overall_status === 'preparing' ? 'bg-sky-100 text-sky-700' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {order.overall_status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            <div className="w-32 h-32 bg-slate-50 rounded-[40px] flex items-center justify-center mb-8 relative">
              <div className="absolute inset-0 bg-slate-100/50 rounded-[40px] animate-ping duration-[3000ms]" />
              <ShoppingBag size={56} className="text-slate-200 relative z-10"/>
            </div>
            <p className="font-black text-slate-800 text-lg italic uppercase tracking-tighter">Keranjang Kosong</p>
            <p className="mt-1 max-w-[220px] text-xs font-semibold leading-relaxed text-slate-400">
              Pilih menu dari daftar untuk mulai membuat pesanan.
            </p>
            <p className="text-slate-400 text-xs mt-2 leading-relaxed max-w-[200px] font-medium">Pilih menu di sebelah kiri untuk memulai pesanan baru.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {cart.map(c => (
              <div key={c.id} className="flex gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-soft transition-all hover:border-[#FF6A00]/20">
                <div className="flex-1 overflow-hidden">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <p className="font-bold text-slate-800 text-[14px] truncate">{c.name}</p>
                    <button onClick={() => updateQty(c.id, 0)} className="text-slate-300 hover:text-rose-500 transition-colors">
                       <X size={14} />
                    </button>
                  </div>
                  <p className="text-slate-500 text-[12px] font-medium mb-3">{fRp(c.price)}</p>
                  <input
                    value={c.note || ''}
                    onChange={(e) => setCartItemNote(c.id, e.target.value)}
                    placeholder="Catatan..."
                    className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-600 outline-none transition focus:border-[#FF6A00]/30 focus:bg-white focus:ring-4 focus:ring-[#FF6A00]/5"
                  />
                </div>
                <div className="flex flex-col items-end justify-between py-1">
                  <p className="font-extrabold text-slate-800 text-[14px]">{fRp(c.price * c.qty)}</p>
                  <div className="flex items-center gap-2.5 mt-2 bg-slate-50 rounded-xl border border-slate-200/60 p-1 shadow-inner">
                    <button onClick={() => updateQty(c.id, c.qty - 1)} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-white hover:text-slate-800 rounded-lg shadow-sm transition-all"><Minus size={12} strokeWidth={3}/></button>
                    <span className="font-bold text-xs w-4 text-center">{c.qty}</span>
                    <button onClick={() => updateQty(c.id, c.qty + 1)} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-white hover:text-slate-800 rounded-lg shadow-sm transition-all"><Plus size={12} strokeWidth={3}/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Panel Checkout Bawah */}
        {cart.length > 0 && (
          <div className="bg-white border-t border-slate-100 p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.02)]">
            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-sm font-medium text-slate-500">
                <span>Subtotal ({cart.length} item)</span>
                <span>{fRp(subtotal)}</span>
              </div>
              {discAmt > 0 && (
                <div className="flex justify-between text-sm font-bold text-rose-500">
                  <span>Diskon</span>
                  <span>-{fRp(discAmt)}</span>
                </div>
              )}
              {taxAmt > 0 && (
                <div className="flex justify-between text-sm font-medium text-slate-500">
                  <span>Pajak ({taxPct}%)</span>
                  <span>{fRp(taxAmt)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-4 border-t border-slate-100 mt-2">
                <span className="text-base font-black text-slate-900 uppercase italic tracking-tighter">Total Tagihan</span>
                <span className="text-2xl font-black text-[#FF6A00] italic tracking-tighter">{fRp(total)}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={clearCart}
                className="flex-1 h-14 rounded-2xl border-2 border-slate-100 text-slate-400 font-bold hover:bg-slate-50 hover:border-slate-200 transition-all"
              >
                Batal
              </button>
              <button
                onClick={() => setShowPay(true)}
                className="flex-[2] h-14 rounded-2xl bg-[#FF6A00] text-white font-black uppercase italic tracking-wider shadow-premium hover:shadow-xl hover:scale-[1.02] active:scale-100 transition-all flex items-center justify-center gap-2"
              >
                Bayar <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── UNIFIED PAYMENT MODAL ── */}
      {showPay && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-end md:items-center justify-center p-0 md:p-6" onClick={paymentModal.onBackdropClick}>
          <div
            ref={paymentModal.panelRef}
            className="kaffe-panel w-full max-w-[500px] rounded-t-[28px] md:rounded-[28px] p-6 sm:p-8 max-h-[95vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom-20 duration-500"
            aria-labelledby="pos-payment-title"
            {...paymentModal.dialogProps}
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 id="pos-payment-title" className="font-display text-2xl font-extrabold text-slate-900 tracking-tight">Pembayaran</h3>
                <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest mt-1">Konfirmasi pesanan</p>
              </div>
              <button onClick={closePaymentModal} disabled={checkingOut} className="p-3 bg-white border border-slate-100 rounded-2xl text-slate-500 hover:bg-orange-50 hover:text-[#FF6A00] transition-colors disabled:opacity-50"><X size={22}/></button>
            </div>

            <div className="kaffe-soft-section text-center mb-8 rounded-2xl p-6">
              <p className="text-[11px] font-black text-[#FF6A00] uppercase tracking-widest mb-2">Total tagihan</p>
              <h3 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">{fRp(total)}</h3>
            </div>

            <div className="mb-8 rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Ringkasan Order</p>
                <span className="rounded-full bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-orange-600">{cart.length} item</span>
              </div>
              <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-700">{item.qty}x {item.name}</p>
                      {item.note && <p className="truncate text-[11px] font-semibold text-amber-600">Catatan: {item.note}</p>}
                    </div>
                    <p className="shrink-0 font-black text-slate-800">{fRp(item.price * item.qty)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-sm">
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{fRp(subtotal)}</span></div>
                {discAmt > 0 && <div className="flex justify-between font-bold text-rose-500"><span>Diskon</span><span>-{fRp(discAmt)}</span></div>}
                {taxAmt > 0 && <div className="flex justify-between text-slate-500"><span>Pajak</span><span>{fRp(taxAmt)}</span></div>}
                <div className="flex justify-between text-base font-black text-slate-900"><span>Total</span><span className="text-[#FF6A00]">{fRp(total)}</span></div>
              </div>
            </div>

            {paymentMessage && method === 'QRIS' && (
              <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm font-bold ${
                paymentPhase === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : ['failed', 'cancelled', 'expired', 'denied'].includes(paymentPhase)
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-orange-200 bg-orange-50 text-orange-700'
              }`}>
                <div className="flex items-start gap-2">
                  {['failed', 'cancelled', 'expired', 'denied'].includes(paymentPhase) ? <AlertCircle size={18} /> : <RefreshCw size={18} className={checkingOut ? 'animate-spin' : ''} />}
                  <div>
                    <p>{paymentMessage}</p>
                    {paymentOrder && <p className="mt-1 text-[11px] font-black uppercase tracking-wider opacity-70">{paymentOrder.order_id}</p>}
                    {paymentStatus?.transaction_status && <p className="mt-1 text-[11px] font-black uppercase tracking-wider opacity-70">Midtrans: {paymentStatus.transaction_status}</p>}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4 mb-8">
               <div>
                  <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase block mb-2 ml-1">Nama Pelanggan (Opsional)</label>
                  <input value={custName} onChange={e => setCustName(e.target.value)} placeholder="Contoh: Budi - Meja 05" className="w-full h-14 bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 text-[16px] font-bold focus:outline-none focus:border-[#FF6A00] transition-all"/>
               </div>

               <LoyaltyCheckoutModal
                  phone={loyaltyPhone}
                  onPhoneChange={setLoyaltyPhone}
                  onSearch={handleLoyaltySearch}
                  searching={loyaltySearching}
                  passport={loyaltyPassport}
                  settings={loyaltySettings}
                  rewards={loyaltyRewards}
                  activeReward={loyaltyReward}
                  onApplyReward={handleApplyLoyaltyReward}
                  onClearReward={handleClearLoyaltyReward}
               />

               <div>
                  <div className="flex items-center justify-between mb-2 ml-1">
                    <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase">Promo & Diskon</label>
                    <button onClick={() => setShowVouchers(true)} className="inline-flex items-center gap-1.5 text-[11px] font-black text-orange-500 uppercase tracking-widest hover:underline">
                      <Gift size={13} /> Pilih Promo
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      value={discount || ''}
                      onChange={e => setDiscount(e.target.value)}
                      placeholder="10% atau 5000"
                      className={`w-full h-14 bg-slate-50 border-2 rounded-2xl px-5 text-[16px] focus:outline-none transition-all font-bold ${discAmt > 0 ? 'border-green-300 bg-green-50 text-green-600' : 'border-slate-100 focus:border-[#FF6A00]'}`}
                    />
                    {discAmt > 0 && <CheckCircle2 size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-green-500" />}
                  </div>
               </div>
            </div>

            <div className="space-y-3 mb-8">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Metode Pembayaran</p>
              <div className="grid grid-cols-1 gap-3">
                {([
                  { id: 'Tunai', icon: Banknote },
                  { id: 'QRIS', icon: Smartphone },
                  { id: 'Transfer', icon: Landmark }
                ] as const).map((m) => {
                  const Icon = m.icon;
                  return (
                    <button key={m.id} onClick={() => setMethod(m.id)}
                      disabled={!isOnline && !canProcessPosPaymentOffline(m.id)}
                      className={`flex items-center justify-between p-5 rounded-2xl border-2 font-black text-[15px] transition-all disabled:opacity-30 ${method===m.id?'border-[#FF6A00] bg-orange-50 text-[#FF6A00] shadow-sm':'border-slate-100 text-slate-500 bg-white hover:border-slate-200'}`}>
                      <div className="flex items-center gap-4">
                        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${method===m.id ? 'bg-white text-[#FF6A00]' : 'bg-slate-50 text-slate-400'}`}>
                          <Icon size={19} />
                        </span>
                        <span>{m.id}</span>
                      </div>
                      {method === m.id && <CheckCircle2 size={18} strokeWidth={4} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {method === 'Tunai' && (
              <div className="mb-10 animate-in slide-up duration-300">
                <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase block mb-2 ml-1">Uang Diterima</label>
                <div className="relative">
                   <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-slate-400">Rp</span>
                   <input type="number" value={cash} onChange={e => setCash(e.target.value)} placeholder={String(total)} className="w-full border-2 border-slate-100 rounded-2xl pl-12 pr-5 py-5 text-3xl font-black focus:outline-none focus:border-[#FF6A00] transition-all bg-slate-50" autoFocus inputMode="numeric"/>
                </div>
                {paid >= total && paid > 0 && (
                  <div className="mt-4 flex justify-between items-center bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                    <span className="text-sm font-bold text-emerald-700 uppercase tracking-widest">Kembalian</span>
                    <span className="text-2xl font-black text-emerald-600 italic">{fRp(change)}</span>
                  </div>
                )}
                <div className="flex gap-2 mt-4 overflow-x-auto scrollbar-hide pb-1">
                  {quickAmounts(total).map(amt => (
                    <button key={amt} onClick={() => setCash(String(amt))} className="shrink-0 px-5 py-3 bg-white border-2 border-slate-100 rounded-xl text-xs font-black text-slate-600 active:scale-95 hover:border-[#FF6A00]/30">
                      {fRp(amt)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button onClick={handleCheckout} disabled={checkingOut || !cart.length || (method === 'Tunai' && paid < total)}
              className="kaffe-gradient-button w-full py-5 text-white font-black text-base rounded-2xl active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 transition-all hover:shadow-xl hover:scale-[1.01] uppercase tracking-wider">
              {checkingOut ? <><RefreshCw size={24} className="animate-spin" /> MEMPROSES...</> : <>KONFIRMASI BAYAR <CheckCircle2 size={24}/></>}
            </button>
          </div>
        </div>
      )}

      {/* ── RECEIPT MODAL ── */}
      {showRcpt && lastTx && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={receiptModal.onBackdropClick}>
          <div
            ref={receiptModal.panelRef}
            className="bg-white w-full max-w-[360px] rounded-[32px] p-6 shadow-2xl animate-in zoom-in-95 duration-200"
            aria-labelledby="pos-receipt-title"
            {...receiptModal.dialogProps}
          >
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3 text-3xl shadow-[0_0_30px_rgb(34,197,94,0.2)]">✓</div>
              <h3 id="pos-receipt-title" className="font-extrabold text-xl text-slate-800">Lunas!</h3>
              <p className="text-slate-400 text-xs font-medium mt-1">#{lastTx.id}</p>
              {lastTx.sync_status === 'pending' && (
                <p className="mx-auto mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700">
                  Menunggu Sync
                </p>
              )}
            </div>

            {lastTx.customer_name && (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 mb-5 text-center">
                <p className="text-[10px] font-black text-slate-400 tracking-widest mb-1 uppercase">Pemesan</p>
                <p className="text-xl font-black text-slate-800">{lastTx.customer_name}</p>
              </div>
            )}

            {lastTxKitchenOrder && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl py-3 px-4 mb-5 text-center">
                <p className="text-[10px] font-black text-amber-500 tracking-widest mb-1 uppercase">Status Dapur</p>
                <p className="text-lg font-black text-amber-800">{lastTxKitchenOrder.overall_status}</p>
              </div>
            )}

            <div className="bg-white border border-slate-200 border-dashed rounded-2xl p-4 mb-6 text-sm">
              {lastTx.items.map((i:any, idx: number) => (
                <div key={idx} className="mb-2 font-medium">
                  <div className="flex justify-between">
                    <span className="text-slate-600">{i.name} <span className="font-bold text-slate-800">x{i.qty}</span></span>
                    <span className="font-bold text-slate-800">{fRp(i.subtotal)}</span>
                  </div>
                  {i.note && <p className="mt-1 text-xs font-bold text-amber-600">Catatan: {i.note}</p>}
                </div>
              ))}
              <div className="border-t border-slate-200 border-dashed pt-3 mt-3">
                <div className="flex justify-between font-black text-lg"><span>Total Tagihan</span><span className="text-slate-800">{fRp(lastTx.total)}</span></div>
                {lastTx.method === 'Tunai' && (
                  <div className="flex justify-between text-green-600 font-bold mt-1"><span>Uang Kembali</span><span>{fRp(lastTx.change)}</span></div>
                )}
              </div>
            </div>

            <button onClick={() => setShowPrintSheet(true)} className="w-full py-3.5 mb-3 bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-extrabold rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all">
              <Printer size={16} strokeWidth={2.5}/> Cetak Struk Fisik
            </button>

            <button onClick={shareReceiptToWhatsApp} className="w-full py-3.5 mb-3 bg-orange-50 border-2 border-orange-100 text-orange-600 hover:bg-orange-100 font-extrabold rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all">
              <Share2 size={16} strokeWidth={2.5}/> Share WA
            </button>

            <button onClick={closeReceiptModal} className="w-full py-4 bg-orange-500 text-white font-black rounded-2xl active:scale-95 transition-all shadow-lg shadow-orange-500/20">
              Transaksi Baru
            </button>
          </div>
        </div>
      )}

      {/* Action Sheets */}
      <PrintActionSheet visible={showPrintSheet} onClose={() => setShowPrintSheet(false)} transaction={lastTx} storeSettings={storeSettings} allowThermalPrint={subscriptionAccess.features.thermal_print} toast={toast} />

      {/* ── VOUCHER MODAL ── */}
      {showVouchers && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[70] flex items-end md:items-center justify-center p-0 md:p-4" onClick={voucherModal.onBackdropClick}>
          <div
            ref={voucherModal.panelRef}
            className="kaffe-panel w-full max-w-[500px] rounded-t-[28px] md:rounded-[28px] p-6 sm:p-8 shadow-2xl animate-in slide-in-from-bottom-20 duration-500"
            aria-labelledby="pos-voucher-title"
            {...voucherModal.dialogProps}
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 id="pos-voucher-title" className="font-display text-2xl font-extrabold text-slate-900 tracking-tight">Pilih Promo</h3>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Diskon Terpopuler</p>
              </div>
              <button onClick={closeVoucherModal} className="p-3 bg-white border border-slate-100 rounded-2xl text-slate-500 hover:bg-orange-50 hover:text-[#FF6A00] transition-colors"><X size={22}/></button>
            </div>

            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 scrollbar-thin">
              {[
                { l: 'Diskon 10%', v: '10%', d: 'Potongan 10% dari subtotal' },
                { l: 'Diskon 50%', v: '50%', d: 'Potongan setengah harga' },
                { l: 'Potongan 5rb', v: '5000', d: 'Potongan flat Rp 5.000' },
                { l: 'Potongan 10rb', v: '10000', d: 'Potongan flat Rp 10.000' },
                { l: 'Jumat Berkah (20%)', v: '20%', d: 'Promo khusus hari Jumat' },
                { l: 'Batal Diskon', v: '', d: 'Hapus semua potongan' },
              ].map((promo, idx) => (
                <button
                  key={idx}
                  onClick={() => { setDiscount(promo.v); setShowVouchers(false); toast.showToast(`Promo ${promo.l} diterapkan!`, 'success'); }}
                  className={`w-full text-left p-5 rounded-2xl border-2 transition-all active:scale-[0.98] flex items-center justify-between group ${discount === promo.v ? 'border-orange-500 bg-orange-50' : 'border-slate-100 bg-white hover:border-orange-200 hover:bg-orange-50/40'}`}
                >
                  <div className="flex-1">
                    <p className={`font-black text-lg italic uppercase tracking-tight ${discount === promo.v ? 'text-orange-600' : 'text-slate-800'}`}>{promo.l}</p>
                    <p className="text-slate-400 text-xs font-medium mt-0.5">{promo.d}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${discount === promo.v ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/40' : 'bg-white text-slate-300 border border-slate-200 group-hover:border-slate-300'}`}>
                    <Plus size={20} />
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col gap-4">
              <p className="text-[10px] font-black text-slate-400 uppercase text-center tracking-[0.3em]">Atau input manual di halaman checkout</p>
              <button
                onClick={closeVoucherModal}
                className="w-full py-5 bg-slate-900 text-white font-black rounded-2xl uppercase tracking-widest italic text-sm shadow-xl active:scale-95 transition-all"
              >
                Konfirmasi Pilihan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
