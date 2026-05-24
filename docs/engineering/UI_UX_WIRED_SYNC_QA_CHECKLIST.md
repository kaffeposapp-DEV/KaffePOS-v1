# QA Checklist: KaffePOS UI/UX Wired Sync & Accessibility

This checklist contains validation items and guidelines for verifying the visual, responsive, and WCAG accessibility standards across KaffePOS pages and components.

---

## 1. Visual Consistency & Layout Sync
- [x] **Theme Harmony**: The application is locked to a clean white and warm orange (`#FF6A00`) brand palette. No dark modes or neon additions.
- [x] **Panel Styling**: Card surfaces employ consistent backdrop filters, light borders (`var(--brand-panel-border)`), and soft shadows (`var(--brand-panel-shadow)`).
- [x] **Typography Scale**: Display headings use the 'Outfit' sans-serif family; body elements use 'Inter' for clear readability.

---

## 2. Accessibility Guidelines (WCAG Compliance)
- [x] **Modals Close Targets**: Every modal (e.g., receipt sheet, detailed overlay, opname popup) must feature a clear `aria-label="Tutup..."` on its `X` icon button.
- [x] **Actionable Icon-Only Buttons**: Any button featuring only a Lucide icon (e.g., print receipts, edit/delete inventory lines) must have an explicit `aria-label` description for screen readers.
- [x] **Search & Form Inputs**: All select boxes, search bars, and input fields without physical text labels must use `aria-label` attributes to associate description context.
- [x] **Interactive Tap Zones**: Active tap targets (buttons, links, triggers) maintain a min-height/width of `44px` (or use `.kaffe-btn-compact` specifically inside compact table structures).

---

## 3. Component Verification Checklist

### POS & Printing Flow
- [x] Bluetooth cetak button has `aria-label="Cetak via Bluetooth"`.
- [x] USB OTG button has `aria-label="Cetak via USB OTG"`.
- [x] WhatsApp sharing button has `aria-label="Kirim Struk via WhatsApp"`.
- [x] Sheet close icon has `aria-label="Tutup"`.

### History & Transactions
- [x] Printer icon on each transaction card has `aria-label="Cetak struk"`.
- [x] Transaction void badge has readable high contrast.

### Warehouse & Inventory
- [x] Ingredient rows edit and delete buttons have `aria-label="Edit item"` and `aria-label="Hapus item"`.
- [x] Search input inside the warehouse ingredients list has `aria-label="Cari bahan baku"`.
- [x] Create/restock modal close icon has `aria-label="Tutup modal"`.
- [x] Unit select inside the modal has `aria-label="Satuan bahan"`.
- [x] Unit conversions form inputs have proper `aria-label` tags (`Bahan baku asal`, `Satuan asal`, `Satuan tujuan`, `Rasio konversi`).
- [x] Recipe builder form has proper `aria-label` tags (`Produk`, `Bahan baku resep`, `Jumlah bahan per porsi`, `Satuan rujukan`).
- [x] Bulk CSV import section has `aria-label="Mode impor"` on selects and `aria-label="CSV data"` on textareas.
- [x] Opname stok modal has `aria-label="Tutup opname"` close button.

### Loyalty Program
- [x] Search bar has `aria-label="Cari pelanggan loyalty"`.
- [x] Manual stamp addition form inputs have proper `aria-label` tags (`Nama pelanggan`, `Nomor HP pelanggan`, `Nominal transaksi`).
- [x] Reward builder admin inputs have proper `aria-label` tags (`Nama reward`, `Deskripsi reward`, `Tipe reward`, `Nilai reward`, `Poin dibutuhkan`, `Stamp dibutuhkan`).

### Admin Panels
- [x] Detailed Modal has `aria-label="Tutup detail"` on its close icon button.
- [x] Affiliate list status selects and search inputs have proper `aria-label` tags.
- [x] Referral attribution filter selects and search inputs have proper `aria-label` tags.
- [x] Commission transaction filter selects and search inputs have proper `aria-label` tags.

### Kitchen Order KDS
- [x] Sound switcher bell button has `aria-label={soundOn ? 'Matikan suara bel' : 'Aktifkan suara bel'}`.
- [x] Refresh button has `aria-label="Segarkan data"`.

---

## 4. Execution & Automated Guardrails
- **TypeScript Typecheck**: Run `npm run typecheck` to compile all files with `tsc --noEmit`.
- **ESLint Checks**: Run `npm run lint` to verify eslint rules pass with zero warnings.
- **Unit & Integration Tests**: Run `npm run test` to verify all 323 vitest cases pass successfully.
- **React Doctor Audit**: Run `npx -y react-doctor@latest --verbose --full` and diff pinned versions. Must score 100/100.
