export type UnitConversionRecord = {
  ingredient_id?: string | null;
  from_unit: string;
  to_unit: string;
  ratio: number;
  is_active?: boolean;
};

export type RecipeConversionInput = {
  ingredientId: string;
  qty: number;
  fromUnit?: string | null;
  baseUnit?: string | null;
  conversions: UnitConversionRecord[];
};

const normalizeUnit = (unit?: string | null) => unit?.trim().toLowerCase() || '';

export function convertRecipeQuantityToBase(input: RecipeConversionInput) {
  const from = normalizeUnit(input.fromUnit || input.baseUnit);
  const to = normalizeUnit(input.baseUnit || input.fromUnit);
  const safeQty = Math.max(0, input.qty || 0);

  if (!from || !to || from === to) {
    return { quantity: safeQty, path: [from || to].filter(Boolean) };
  }

  const active = input.conversions.filter((conversion) => {
    if (conversion.is_active === false) return false;
    if (conversion.ingredient_id && conversion.ingredient_id !== input.ingredientId) return false;
    return conversion.ratio > 0;
  });

  const queue: Array<{ unit: string; quantity: number; path: string[] }> = [
    { unit: from, quantity: safeQty, path: [from] },
  ];
  const visited = new Set<string>([from]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const edges = active.filter((conversion) => normalizeUnit(conversion.from_unit) === current.unit);

    for (const edge of edges) {
      const nextUnit = normalizeUnit(edge.to_unit);
      if (!nextUnit || visited.has(nextUnit)) continue;
      const next = {
        unit: nextUnit,
        quantity: current.quantity * edge.ratio,
        path: [...current.path, nextUnit],
      };
      if (nextUnit === to) {
        return { quantity: next.quantity, path: next.path };
      }
      visited.add(nextUnit);
      queue.push(next);
    }
  }

  throw new Error(`Konversi satuan ${input.fromUnit} ke ${input.baseUnit} belum tersedia.`);
}
