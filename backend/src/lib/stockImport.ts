export type StockBulkImportMode = 'create_only' | 'update_existing' | 'upsert';
export type StockBulkImportKind = 'ingredient' | 'conversion' | 'product' | 'recipe';

export type StockBulkImportRow = {
  rowNumber: number;
  kind: StockBulkImportKind | 'unknown';
  name?: string;
  stock?: number;
  base_unit?: string;
  purchase_unit?: string;
  min_stock?: number;
  total_cost?: number;
  sku?: string;
  from_unit?: string;
  to_unit?: string;
  ratio?: number;
  product_name?: string;
  ingredient_name?: string;
  qty_per_serving?: number;
  unit_reference?: string;
  price?: number;
  category?: string;
};

export type StockBulkImportError = {
  rowNumber: number;
  message: string;
};

export type StockBulkImportSummary = {
  ingredients: number;
  conversions: number;
  products: number;
  recipes: number;
};

export type StockBulkImportValidation = {
  validRows: StockBulkImportRow[];
  errors: StockBulkImportError[];
  summary: StockBulkImportSummary;
};

export type StockBulkExistingConversion = {
  ingredientName?: string | null | undefined;
  fromUnit: string;
  toUnit: string;
};

const normalizeName = (value?: string | null) => value?.trim().toLowerCase() || '';
const hasValue = (value?: string | null) => Boolean(value && value.trim());
const isValidKind = (kind: string): kind is StockBulkImportKind =>
  ['ingredient', 'conversion', 'product', 'recipe'].includes(kind);
const conversionKey = (ingredientName?: string | null, fromUnit?: string | null, toUnit?: string | null) =>
  `${normalizeName(ingredientName) || 'global'}:${normalizeName(fromUnit)}:${normalizeName(toUnit)}`;

export function summarizeStockBulkRows(rows: StockBulkImportRow[]): StockBulkImportSummary {
  return {
    ingredients: rows.filter((row) => row.kind === 'ingredient').length,
    conversions: rows.filter((row) => row.kind === 'conversion').length,
    products: rows.filter((row) => row.kind === 'product').length,
    recipes: rows.filter((row) => row.kind === 'recipe').length,
  };
}

export function validateStockBulkImportRows(
  rows: StockBulkImportRow[],
  context: {
    existingIngredientNames: string[];
    existingProductNames: string[];
    existingConversions?: StockBulkExistingConversion[];
    mode: StockBulkImportMode;
  },
): StockBulkImportValidation {
  const errors: StockBulkImportError[] = [];
  const validRows: StockBulkImportRow[] = [];
  const existingIngredients = new Set(context.existingIngredientNames.map(normalizeName));
  const existingProducts = new Set(context.existingProductNames.map(normalizeName));
  const existingConversions = new Set((context.existingConversions || []).map((entry) =>
    conversionKey(entry.ingredientName, entry.fromUnit, entry.toUnit),
  ));
  const incomingIngredients = new Set<string>();
  const incomingProducts = new Set<string>();

  for (const row of rows) {
    if (row.kind === 'ingredient' && row.name) incomingIngredients.add(normalizeName(row.name));
    if (row.kind === 'product' && row.name) incomingProducts.add(normalizeName(row.name));
  }

  const seenIngredients = new Set<string>();
  const seenProducts = new Set<string>();

  for (const row of rows) {
    let message = '';

    if (!isValidKind(row.kind)) {
      message = 'Jenis baris import tidak dikenal.';
    } else if (row.kind === 'ingredient') {
      const key = normalizeName(row.name);
      if (!hasValue(row.name)) message = 'Nama bahan baku wajib diisi.';
      if (!hasValue(row.base_unit)) message = message || 'Satuan dasar wajib diisi.';
      if ((row.stock ?? 0) < 0 || (row.total_cost ?? 0) < 0) message = message || 'Stok dan total cost tidak boleh negatif.';
      if (seenIngredients.has(key)) message = message || 'Bahan baku duplikat di file import.';
      if (context.mode === 'create_only' && existingIngredients.has(key)) {
        message = message || 'Bahan baku sudah ada. Pilih mode update/upsert jika ingin memperbarui.';
      }
      if (context.mode === 'update_existing' && !existingIngredients.has(key)) {
        message = message || 'Bahan baku belum ada. Pilih mode upsert jika ingin membuat data baru.';
      }
      if (key) seenIngredients.add(key);
    } else if (row.kind === 'conversion') {
      if (!hasValue(row.from_unit) || !hasValue(row.to_unit) || !row.ratio || row.ratio <= 0) {
        message = 'Konversi wajib punya from_unit, to_unit, dan ratio lebih dari 0.';
      }
      const ingredientKey = normalizeName(row.ingredient_name);
      if (ingredientKey && !existingIngredients.has(ingredientKey) && !incomingIngredients.has(ingredientKey)) {
        message = message || 'Bahan untuk konversi tidak ditemukan di data lama atau file import.';
      }
      const key = conversionKey(row.ingredient_name, row.from_unit, row.to_unit);
      if (context.mode === 'create_only' && existingConversions.has(key)) {
        message = message || 'Konversi satuan sudah ada. Pilih mode update/upsert jika ingin memperbarui.';
      }
      if (context.mode === 'update_existing' && !existingConversions.has(key)) {
        message = message || 'Konversi satuan belum ada. Pilih mode upsert jika ingin membuat data baru.';
      }
    } else if (row.kind === 'product') {
      const key = normalizeName(row.name);
      if (!hasValue(row.name)) message = 'Nama produk wajib diisi.';
      if (!row.price || row.price < 0) message = message || 'Harga produk wajib valid.';
      if (seenProducts.has(key)) message = message || 'Produk duplikat di file import.';
      if (context.mode === 'create_only' && existingProducts.has(key)) {
        message = message || 'Produk sudah ada. Pilih mode update/upsert jika ingin memperbarui.';
      }
      if (context.mode === 'update_existing' && !existingProducts.has(key)) {
        message = message || 'Produk belum ada. Pilih mode upsert jika ingin membuat data baru.';
      }
      if (key) seenProducts.add(key);
    } else if (row.kind === 'recipe') {
      const productKey = normalizeName(row.product_name);
      const ingredientKey = normalizeName(row.ingredient_name);
      if (!productKey || !ingredientKey || !row.qty_per_serving || row.qty_per_serving <= 0) {
        message = 'Resep wajib punya product_name, ingredient_name, dan qty_per_serving lebih dari 0.';
      }
      if (productKey && !existingProducts.has(productKey) && !incomingProducts.has(productKey)) {
        message = message || 'Produk resep tidak ditemukan di data lama atau file import.';
      }
      if (ingredientKey && !existingIngredients.has(ingredientKey) && !incomingIngredients.has(ingredientKey)) {
        message = message || 'Bahan resep tidak ditemukan di data lama atau file import.';
      }
    }

    if (message) {
      errors.push({ rowNumber: row.rowNumber, message });
    } else {
      validRows.push(row);
    }
  }

  return {
    validRows,
    errors,
    summary: summarizeStockBulkRows(validRows),
  };
}
