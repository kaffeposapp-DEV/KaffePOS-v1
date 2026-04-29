import type { InventoryItem, MenuItem, RecipeItem, StockUnitConversion, TransactionItem } from '@/types';

export type ConversionResult = {
  quantity: number;
  path: string[];
};

export type HppLine = {
  ingredientId: string;
  ingredientName: string;
  qty: number;
  unit: string;
  baseQty: number;
  baseUnit: string;
  unitCost: number;
  totalCost: number;
  complete: boolean;
};

export type ProductHppResult = {
  productId: string;
  productName: string;
  totalCost: number;
  complete: boolean;
  warnings: string[];
  lines: HppLine[];
};

export type StockDeductionLine = {
  ingredientId: string;
  ingredientName: string;
  requiredQty: number;
  baseUnit: string;
  stockBefore: number;
  stockAfter: number;
  ok: boolean;
};

export type StockDeductionPlan = {
  ok: boolean;
  items: StockDeductionLine[];
  warnings: string[];
};

export type BulkImportKind = 'ingredient' | 'conversion' | 'product' | 'recipe';
export type BulkImportMode = 'create_only' | 'update_existing' | 'upsert';

export type BulkImportRow = {
  rowNumber: number;
  kind: BulkImportKind | 'unknown';
  name?: string | undefined;
  stock?: number | undefined;
  base_unit?: string | undefined;
  purchase_unit?: string | undefined;
  min_stock?: number | undefined;
  total_cost?: number | undefined;
  sku?: string | undefined;
  from_unit?: string | undefined;
  to_unit?: string | undefined;
  ratio?: number | undefined;
  product_name?: string | undefined;
  ingredient_name?: string | undefined;
  qty_per_serving?: number | undefined;
  unit_reference?: string | undefined;
  price?: number | undefined;
  category?: string | undefined;
};

export type BulkImportError = {
  rowNumber: number;
  message: string;
};

export type BulkImportPreview = {
  validRows: BulkImportRow[];
  errors: BulkImportError[];
  summary: {
    ingredients: number;
    conversions: number;
    products: number;
    recipes: number;
  };
};

const normalizeUnit = (unit: string | null | undefined) => unit?.trim().toLowerCase() || '';
const normalizeName = (name: string | null | undefined) => name?.trim().toLowerCase() || '';
const toNumber = (value: string | number | undefined) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const parsed = Number(String(value).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function convertQuantity(
  quantity: number,
  fromUnit: string | undefined,
  toUnit: string | undefined,
  conversions: StockUnitConversion[],
  ingredientId?: string | null,
): ConversionResult {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  const safeQuantity = Math.max(0, quantity || 0);

  if (!from || !to || from === to) {
    return { quantity: safeQuantity, path: [from || to].filter(Boolean) };
  }

  const active = conversions.filter((conversion) => {
    if (conversion.is_active === false) return false;
    if (ingredientId && conversion.ingredient_id && conversion.ingredient_id !== ingredientId) return false;
    return conversion.ratio > 0;
  });

  const queue: Array<{ unit: string; qty: number; path: string[] }> = [{ unit: from, qty: safeQuantity, path: [from] }];
  const visited = new Set<string>([from]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const edges = active.filter((conversion) => normalizeUnit(conversion.from_unit) === current.unit);

    for (const edge of edges) {
      const nextUnit = normalizeUnit(edge.to_unit);
      if (!nextUnit || visited.has(nextUnit)) continue;
      const next = {
        unit: nextUnit,
        qty: current.qty * edge.ratio,
        path: [...current.path, nextUnit],
      };
      if (nextUnit === to) {
        return { quantity: next.qty, path: next.path };
      }
      visited.add(nextUnit);
      queue.push(next);
    }
  }

  throw new Error(`Konversi satuan ${fromUnit} ke ${toUnit} belum tersedia.`);
}

function getBaseUnit(ingredient: InventoryItem) {
  return ingredient.base_unit || ingredient.unit || 'unit';
}

export function calculateIngredientUsage(
  recipe: RecipeItem,
  ingredient: InventoryItem,
  conversions: StockUnitConversion[],
) {
  const recipeUnit = recipe.unit_reference || getBaseUnit(ingredient);
  const baseUnit = getBaseUnit(ingredient);
  const converted = convertQuantity(recipe.qty, recipeUnit, baseUnit, conversions, ingredient.id);

  return {
    baseQty: converted.quantity,
    baseUnit,
    path: converted.path,
  };
}

export function calculateProductHpp(
  product: Pick<MenuItem, 'id' | 'name' | 'price' | 'recipe'>,
  inventory: InventoryItem[],
  conversions: StockUnitConversion[],
): ProductHppResult {
  const warnings: string[] = [];
  const lines: HppLine[] = [];

  for (const recipe of product.recipe || []) {
    const ingredient = inventory.find((item) => item.id === recipe.matId);
    if (!ingredient) {
      warnings.push(`Bahan resep ${recipe.matId} tidak ditemukan.`);
      continue;
    }

    let baseQty = recipe.qty;
    let baseUnit = getBaseUnit(ingredient);
    try {
      const usage = calculateIngredientUsage(recipe, ingredient, conversions);
      baseQty = usage.baseQty;
      baseUnit = usage.baseUnit;
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'Konversi satuan resep tidak valid.');
    }

    const unitCost = Math.max(0, ingredient.cost_per_unit || 0);
    const complete = unitCost > 0;
    if (!complete) {
      warnings.push(`${ingredient.name} belum punya harga beli valid.`);
    }

    lines.push({
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      qty: recipe.qty,
      unit: recipe.unit_reference || baseUnit,
      baseQty,
      baseUnit,
      unitCost,
      totalCost: baseQty * unitCost,
      complete,
    });
  }

  return {
    productId: product.id,
    productName: product.name,
    totalCost: Math.round(lines.reduce((sum, line) => sum + line.totalCost, 0)),
    complete: warnings.length === 0 && lines.every((line) => line.complete),
    warnings,
    lines,
  };
}

export function calculateGrossMargin(price: number, hpp: number) {
  const safePrice = Math.max(0, price || 0);
  const safeHpp = Math.max(0, hpp || 0);
  const grossProfit = safePrice - safeHpp;

  return {
    grossProfit,
    marginPercent: safePrice > 0 ? Math.round((grossProfit / safePrice) * 10_000) / 100 : 0,
    markupPercent: safeHpp > 0 ? Math.round((grossProfit / safeHpp) * 10_000) / 100 : 0,
  };
}

export function buildStockDeductionPlan(
  items: Array<Pick<TransactionItem, 'name' | 'qty' | 'menu_item_id'> & { id?: string; _baseId?: string }>,
  menu: MenuItem[],
  inventory: InventoryItem[],
  conversions: StockUnitConversion[],
): StockDeductionPlan {
  const menuById = new Map(menu.map((item) => [item.id, item]));
  const menuByName = new Map(menu.map((item) => [item.name, item]));
  const required = new Map<string, number>();
  const warnings: string[] = [];

  for (const sold of items) {
    const product = menuById.get(sold.menu_item_id || '') || menuById.get(sold._baseId || '') || menuByName.get(sold.name);
    if (!product) continue;

    for (const recipe of product.recipe || []) {
      const ingredient = inventory.find((item) => item.id === recipe.matId);
      if (!ingredient) {
        warnings.push(`Bahan resep ${recipe.matId} tidak ditemukan.`);
        continue;
      }

      try {
        const usage = calculateIngredientUsage(recipe, ingredient, conversions);
        required.set(ingredient.id, (required.get(ingredient.id) || 0) + usage.baseQty * Math.max(0, sold.qty || 0));
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : 'Konversi satuan resep tidak valid.');
      }
    }
  }

  const deductionItems = Array.from(required.entries()).map(([ingredientId, requiredQty]) => {
    const ingredient = inventory.find((item) => item.id === ingredientId)!;
    const stockBefore = Math.max(0, ingredient.stock || 0);
    return {
      ingredientId,
      ingredientName: ingredient.name,
      requiredQty,
      baseUnit: getBaseUnit(ingredient),
      stockBefore,
      stockAfter: stockBefore - requiredQty,
      ok: stockBefore >= requiredQty,
    };
  });

  return {
    ok: warnings.length === 0 && deductionItems.every((item) => item.ok),
    items: deductionItems,
    warnings: [
      ...warnings,
      ...deductionItems.filter((item) => !item.ok).map((item) => `Stok ${item.ingredientName} tidak cukup.`),
    ],
  };
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

export function parseStockImportCsv(csv: string): { rows: BulkImportRow[]; errors: BulkImportError[] } {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { rows: [], errors: [{ rowNumber: 1, message: 'File import kosong.' }] };

  const headers = parseCsvLine(lines[0]).map((header) => normalizeUnit(header));
  const rows: BulkImportRow[] = [];
  const errors: BulkImportError[] = [];

  lines.slice(1).forEach((line, index) => {
    const rowNumber = index + 2;
    const cells = parseCsvLine(line);
    const record = new Map<string, string>();
    headers.forEach((header, headerIndex) => record.set(header, cells[headerIndex] || ''));

    const kind = normalizeUnit(record.get('kind')) as BulkImportKind;
    if (!['ingredient', 'conversion', 'product', 'recipe'].includes(kind)) {
      errors.push({ rowNumber, message: 'Kolom kind harus ingredient, conversion, product, atau recipe.' });
    }

    rows.push({
      rowNumber,
      kind: ['ingredient', 'conversion', 'product', 'recipe'].includes(kind) ? kind : 'unknown',
      name: record.get('name') || undefined,
      stock: toNumber(record.get('stock')),
      base_unit: record.get('base_unit') || undefined,
      purchase_unit: record.get('purchase_unit') || undefined,
      min_stock: toNumber(record.get('min_stock')),
      total_cost: toNumber(record.get('total_cost')),
      sku: record.get('sku') || undefined,
      from_unit: record.get('from_unit') || undefined,
      to_unit: record.get('to_unit') || undefined,
      ratio: toNumber(record.get('ratio')),
      product_name: record.get('product_name') || undefined,
      ingredient_name: record.get('ingredient_name') || undefined,
      qty_per_serving: toNumber(record.get('qty_per_serving')),
      unit_reference: record.get('unit_reference') || undefined,
      price: toNumber(record.get('price')),
      category: record.get('category') || undefined,
    });
  });

  return { rows, errors };
}

export function buildBulkImportPreview(
  rows: BulkImportRow[],
  context: {
    inventory: InventoryItem[];
    menu: MenuItem[];
    conversions: StockUnitConversion[];
    mode: BulkImportMode;
  },
): BulkImportPreview {
  const errors: BulkImportError[] = [];
  const validRows: BulkImportRow[] = [];
  const ingredientNames = new Set(context.inventory.map((item) => normalizeName(item.name)));
  const productNames = new Set(context.menu.map((item) => normalizeName(item.name)));

  for (const row of rows) {
    let message = '';

    if (row.kind === 'ingredient') {
      if (!row.name) message = 'Nama bahan baku wajib diisi.';
      if (!row.base_unit) message = message || 'Satuan dasar wajib diisi.';
      if ((row.stock ?? 0) < 0 || (row.total_cost ?? 0) < 0) message = message || 'Stok dan total cost tidak boleh negatif.';
      if (context.mode === 'create_only' && ingredientNames.has(normalizeName(row.name))) {
        message = message || 'Bahan baku sudah ada. Pilih mode update/upsert jika ingin memperbarui.';
      }
    } else if (row.kind === 'conversion') {
      if (!row.from_unit || !row.to_unit || !row.ratio || row.ratio <= 0) {
        message = 'Konversi wajib punya from_unit, to_unit, dan ratio lebih dari 0.';
      }
    } else if (row.kind === 'product') {
      if (!row.name) message = 'Nama produk wajib diisi.';
      if (!row.price || row.price < 0) message = message || 'Harga produk wajib valid.';
      if (context.mode === 'create_only' && productNames.has(normalizeName(row.name))) {
        message = message || 'Produk sudah ada. Pilih mode update/upsert jika ingin memperbarui.';
      }
    } else if (row.kind === 'recipe') {
      if (!row.product_name || !row.ingredient_name || !row.qty_per_serving || row.qty_per_serving <= 0) {
        message = 'Resep wajib punya product_name, ingredient_name, dan qty_per_serving lebih dari 0.';
      }
    } else {
      message = 'Jenis baris import tidak dikenal.';
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
    summary: {
      ingredients: validRows.filter((row) => row.kind === 'ingredient').length,
      conversions: validRows.filter((row) => row.kind === 'conversion').length,
      products: validRows.filter((row) => row.kind === 'product').length,
      recipes: validRows.filter((row) => row.kind === 'recipe').length,
    },
  };
}
