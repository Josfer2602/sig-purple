import type { Quote, QuoteCategory, QuoteItem, QuoteSubItem } from '../types/quote';
import { ensureImprevistoInSubItems } from '../types/quote';

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Normaliza specialSourceItemIds aceptando array de strings o JSON string serializado desde BD.
 */
export function parseSpecialSourceItemIds(raw: unknown): string[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        list = [];
      }
    }
  }
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const entry of list) {
    const id = String(entry || '').trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      clean.push(id);
    }
  }
  return clean;
}

/**
 * Calcula el Costo Total Proveedores directo desde los sub-ítems de un ítem.
 */
export function getItemSubItemsProviderTotal(item: Partial<QuoteItem> | any): number {
  const subs = Array.isArray(item?.subItems) ? item.subItems : [];
  return subs.reduce((acc: number, sub: any) => {
    const unitCost = toNumber(sub?.unitCost, 0);
    const qty = toNumber(sub?.quantity, 0);
    const dates = toNumber(sub?.dates, 0);
    return acc + unitCost * qty * dates;
  }, 0);
}

/**
 * Resuelve el Costo Total Proveedores de cada ítem de la cotización, soportando ítems especiales
 * dependientes de otros ítems con protección contra ciclos.
 */
export function resolveQuoteProviderCosts(categories: any[] = []): Map<string, number> {
  const itemById = new Map<string, any>();
  for (const cat of categories || []) {
    for (const item of cat?.items || []) {
      if (item?.id) itemById.set(String(item.id), item);
    }
  }

  const resolved = new Map<string, number>();

  const computeForItem = (item: any, visiting: Set<string>): number => {
    const itemId = item?.id ? String(item.id) : '';
    if (itemId && resolved.has(itemId)) {
      return resolved.get(itemId)!;
    }

    if (!item?.isSpecial) {
      const val = getItemSubItemsProviderTotal(item);
      if (itemId) resolved.set(itemId, val);
      return val;
    }

    if (itemId && visiting.has(itemId)) {
      return 0; // Ciclo evitado
    }

    const nextVisiting = new Set(visiting);
    if (itemId) nextVisiting.add(itemId);

    const sourceIds = parseSpecialSourceItemIds(item.specialSourceItemIds);
    let sourceSum = 0;
    for (const srcId of sourceIds) {
      if (srcId === itemId) continue;
      const srcItem = itemById.get(srcId);
      if (!srcItem) continue;
      sourceSum += computeForItem(srcItem, nextVisiting);
    }

    const ratePercent = toNumber(item.specialRatePercent, 0);
    const computed = Number((sourceSum * (ratePercent / 100)).toFixed(2));
    if (itemId) resolved.set(itemId, computed);
    return computed;
  };

  for (const cat of categories || []) {
    for (const item of cat?.items || []) {
      computeForItem(item, new Set());
    }
  }

  return resolved;
}

/**
 * Sincroniza el costo proveedor calculado de cada ítem especial y su sub-ítem base
 * para mantener coherencia total con Órdenes de Compra/Servicio, Liquidaciones, Excel y PDF.
 */
export function recalculateSpecialQuoteItems<T extends QuoteCategory>(categories: T[] = []): T[] {
  const validItemIds = new Set<string>();
  for (const cat of categories || []) {
    for (const item of cat?.items || []) {
      if (item?.id) validItemIds.add(String(item.id));
    }
  }

  // Primero filtrar IDs huérfanos en ítems especiales para que resolveQuoteProviderCosts sea exacto
  const sanitized = (categories || []).map((cat) => ({
    ...cat,
    items: (cat?.items || []).filter(Boolean).map((item: any) => {
      if (!item?.isSpecial) return item;
      const cleanSourceIds = parseSpecialSourceItemIds(item.specialSourceItemIds).filter(
        (id) => id !== String(item.id) && validItemIds.has(id)
      );
      return {
        ...item,
        isSpecial: true,
        specialRatePercent: item.specialRatePercent !== undefined && item.specialRatePercent !== null
          ? toNumber(item.specialRatePercent, 10)
          : 10,
        specialSourceItemIds: cleanSourceIds
      };
    })
  }));

  const costMap = resolveQuoteProviderCosts(sanitized);

  return sanitized.map((cat) => ({
    ...cat,
    items: (cat?.items || []).map((item: any) => {
      if (!item?.isSpecial) return item;
      const computedCost = Number((costMap.get(String(item.id)) ?? 0).toFixed(2));
      const existingSubs: QuoteSubItem[] = Array.isArray(item.subItems) ? item.subItems : [];
      const nonImprevistos = existingSubs.filter(
        (s) => !String(s?.name || '').toLowerCase().includes('imprevisto')
      );
      const imprevistoSub = existingSubs.find(
        (s) => String(s?.name || '').toLowerCase().includes('imprevisto')
      );

      const primarySub: QuoteSubItem = nonImprevistos.length > 0
        ? {
            ...nonImprevistos[0],
            name: nonImprevistos[0].name?.trim() ? nonImprevistos[0].name : (item.name || 'Servicio porcentual'),
            quantity: 1,
            dates: 1,
            unitCost: computedCost
          }
        : {
            id: `sub-sp-${item.id || Date.now()}`,
            name: item.name || 'Servicio porcentual',
            description: '',
            quantity: 1,
            dates: 1,
            unitCost: computedCost,
            providerName: '',
            providerId: null
          };

      // En ítems especiales mantenemos el sub-ítem base + Imprevistos en 0 para coincidir 1:1 con Excel
      const syncedImprevisto: QuoteSubItem = imprevistoSub
        ? { ...imprevistoSub, quantity: 1, dates: 1, unitCost: 0 }
        : {
            id: `sub-imp-${item.id || Date.now()}`,
            name: 'Imprevistos',
            description: '',
            quantity: 1,
            dates: 1,
            unitCost: 0,
            providerName: ''
          };

      return {
        ...item,
        subItems: ensureImprevistoInSubItems([primarySub, syncedImprevisto])
      };
    })
  })) as T[];
}

export interface ItemFinancialsResult {
  totalProvider: number;
  unitProviderCost: number;
  internalMultiplierPercent: number;
  internalMultiplierAmount: number;
  financialExpensePercent: number;
  financialExpense: number;
  rawClientCost: number;
  totalClient: number;
  unitClientCost: number;
}

/**
 * Calcula todos los montos financieros de un ítem usando exactamente las reglas del ERP y Excel.
 */
export function computeQuoteItemFinancials(
  item: Partial<QuoteItem> | any,
  providerCostMap?: Map<string, number>
): ItemFinancialsResult {
  const itemId = item?.id ? String(item.id) : '';
  const totalProvider =
    item?.isSpecial && providerCostMap && itemId && providerCostMap.has(itemId)
      ? providerCostMap.get(itemId)!
      : getItemSubItemsProviderTotal(item);

  const qty = Math.max(1, toNumber(item?.quantity, 1));
  const dates = Math.max(1, toNumber(item?.dates, 1));
  const qtyDates = qty * dates;

  const internalMultiplierPercent = toNumber(item?.internalMultiplierPercent, 0);
  const financialExpensePercent = toNumber(item?.financialExpensePercent, 0);

  const internalMultiplierAmount = totalProvider * (internalMultiplierPercent / 100);
  const financialExpense = totalProvider * (financialExpensePercent / 100);
  const rawClientCost = totalProvider + internalMultiplierAmount + financialExpense;
  const totalClient = Math.round(rawClientCost);

  return {
    totalProvider,
    unitProviderCost: totalProvider / qtyDates,
    internalMultiplierPercent,
    internalMultiplierAmount,
    financialExpensePercent,
    financialExpense,
    rawClientCost,
    totalClient,
    unitClientCost: qtyDates > 0 ? totalClient / qtyDates : 0
  };
}

export interface QuoteTotalsResult {
  subTotalProviders: number;
  subTotalClient: number;
  feeAgencia: number;
  finalTotalClient: number;
  providerCostMap: Map<string, number>;
}

/**
 * Calcula totales globales de una cotización (SubTotal Prov, SubTotal Cliente, Fee 12%, Total Sin IGV).
 */
export function computeQuoteTotals(
  quoteOrCategories: Partial<Quote> | QuoteCategory[] | any[]
): QuoteTotalsResult {
  const categories = Array.isArray(quoteOrCategories)
    ? quoteOrCategories
    : (quoteOrCategories?.categories || []);
  const providerCostMap = resolveQuoteProviderCosts(categories);

  let subTotalProviders = 0;
  let subTotalClient = 0;

  for (const cat of categories) {
    for (const item of cat?.items || []) {
      const fin = computeQuoteItemFinancials(item, providerCostMap);
      subTotalProviders += fin.totalProvider;
      subTotalClient += fin.totalClient;
    }
  }

  const feeAgencia = subTotalClient * 0.12;
  const finalTotalClient = subTotalClient + feeAgencia;

  return {
    subTotalProviders,
    subTotalClient,
    feeAgencia,
    finalTotalClient,
    providerCostMap
  };
}

/**
 * Clona categorías con nuevos IDs remapeando specialSourceItemIds de los IDs viejos a los nuevos.
 */
export function cloneCategoriesWithFreshIds(categories: QuoteCategory[] = []): QuoteCategory[] {
  const stamp = Date.now();
  let seq = 0;
  const nextSuffix = () => `${stamp}-${++seq}-${Math.random().toString(36).slice(2, 6)}`;

  const itemIdMap = new Map<string, string>();

  const firstPass = (categories || []).map((cat) => {
    const newCatId = `cat-${nextSuffix()}`;
    const newItems = (cat?.items || []).map((item: any) => {
      const oldItemId = item?.id ? String(item.id) : '';
      const newItemId = `item-${nextSuffix()}`;
      if (oldItemId) itemIdMap.set(oldItemId, newItemId);
      return {
        ...item,
        id: newItemId,
        subItems: (item?.subItems || []).map((sub: any) => ({
          ...sub,
          id: `sub-${nextSuffix()}`
        }))
      };
    });
    return {
      ...cat,
      id: newCatId,
      items: newItems
    };
  });

  const remapped = firstPass.map((cat) => ({
    ...cat,
    items: cat.items.map((item: any) => {
      if (!item?.isSpecial) return item;
      const oldRefs = parseSpecialSourceItemIds(item.specialSourceItemIds);
      const newRefs = oldRefs.map((ref) => itemIdMap.get(ref) || ref);
      return {
        ...item,
        specialSourceItemIds: newRefs
      };
    })
  }));

  return recalculateSpecialQuoteItems(remapped);
}

/**
 * Verifica si un ítem es elegible como fuente para un ítem especial dado (evita auto-referencia y ciclos).
 */
export function wouldCreateSpecialCycle(
  categories: QuoteCategory[] = [],
  targetSpecialItemId: string,
  candidateSourceItemId: string
): boolean {
  if (targetSpecialItemId === candidateSourceItemId) return true;
  const itemById = new Map<string, any>();
  for (const cat of categories || []) {
    for (const item of cat?.items || []) {
      if (item?.id) itemById.set(String(item.id), item);
    }
  }
  const visited = new Set<string>();
  const stack = [candidateSourceItemId];
  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (currentId === targetSpecialItemId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const currentItem = itemById.get(currentId);
    if (currentItem?.isSpecial) {
      for (const ref of parseSpecialSourceItemIds(currentItem.specialSourceItemIds)) {
        stack.push(ref);
      }
    }
  }
  return false;
}
