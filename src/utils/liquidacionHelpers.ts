import type { Quote, QuoteCategory } from '../types/quote';
import type { Orden, OrdenSubItem, Pago, GastoProduccion, GastoProduccionItem, Proveedor } from '../types/models';

const ORDER_NAME_PREFIXES = [
  'venta de ',
  'servicio de ',
  'alquiler de ',
  'produccion de ',
  'confeccion de ',
  'gestion de ',
  'elaboracion de ',
  'instalacion de ',
  'montaje de '
];

/**
 * Normaliza cadenas para comparaciones tolerantes a tildes, mayúsculas y espacios repetidos.
 */
export function normalizeText(value: unknown): string {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Elimina prefijos comerciales habituales en órdenes ("Venta de ...", "Servicio de ...")
 * únicamente para mejorar el respaldo por nombre cuando cambió el ID de un sub-ítem.
 */
function stripOrderPrefix(normalized: string): string {
  for (const prefix of ORDER_NAME_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return normalized.slice(prefix.length).trim();
    }
  }
  return normalized;
}

/**
 * Deduplica ítems idénticos dentro de una orden cuando su suma supera al total real de la orden
 * (por ejemplo, si una edición previa guardó dos filas idénticas del mismo sub-ítem).
 */
export function dedupeOrderItems(orden: Orden): OrdenSubItem[] {
  const items = orden.items || [];
  if (items.length <= 1) return items;

  const orderTotal = Number(orden.total) || 0;
  const rawSum = items.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
  if (orderTotal <= 0 || rawSum <= orderTotal + 0.05) {
    return items;
  }

  const seenExact = new Set<string>();
  const dedupedExact: OrdenSubItem[] = [];
  for (const it of items) {
    const sig = [
      String(it.quoteSubItemId || '').trim(),
      normalizeText(it.name || it.customDescription),
      Number(it.quantity) || 0,
      Number(it.unitCost) || 0,
      Number(it.total) || 0
    ].join('|');
    if (seenExact.has(sig)) continue;
    seenExact.add(sig);
    dedupedExact.push(it);
  }

  const exactSum = dedupedExact.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
  if (exactSum <= orderTotal + 0.05) {
    return dedupedExact;
  }

  // Segundo nivel: si el mismo sub-ítem fue duplicado con ligera variación en el texto
  const seenBySubAndTotal = new Set<string>();
  const dedupedBySub: OrdenSubItem[] = [];
  for (const it of dedupedExact) {
    const subId = String(it.quoteSubItemId || '').trim();
    const total = Number(it.total) || 0;
    const key = subId ? `${subId}|${total.toFixed(2)}` : `${normalizeText(it.name)}|${total.toFixed(2)}`;
    if (seenBySubAndTotal.has(key)) continue;
    seenBySubAndTotal.add(key);
    dedupedBySub.push(it);
  }

  return dedupedBySub;
}

/**
 * Calcula el costo neto sin IGV de una orden de compra/servicio evitando doble conteo de ítems duplicados.
 */
export function getOrderCostSinIgv(orden: Orden, proveedores: Proveedor[]): number {
  const effectiveItems = dedupeOrderItems(orden);
  if (effectiveItems.length > 0) {
    const itemsSubtotal = effectiveItems.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
    if (itemsSubtotal > 0) return itemsSubtotal;
  }
  const prov = proveedores.find(pr => pr.id === orden.proveedorId);
  const tieneIgv = prov?.tipoDocumento === 'Factura';
  return tieneIgv ? (Number(orden.total) || 0) / 1.18 : (Number(orden.total) || 0);
}

/**
 * Determina si una cotización corresponde a un estado elegible para el módulo de Liquidaciones.
 */
export function isQuoteEligibleForLiquidacion(q: Quote): boolean {
  if (!q.projectId) return false;
  const qStatus = (q.status || '').toLowerCase().trim();
  if (
    qStatus.includes('rechaz') ||
    qStatus.includes('borrador') ||
    qStatus.includes('creaci') ||
    qStatus.includes('enviad') ||
    qStatus.includes('revisi') ||
    qStatus.includes('pendient')
  ) {
    return false;
  }
  return qStatus.includes('aprob') || qStatus.includes('liquid');
}

function getApprovedProjectQuotesCount(projectId: string | undefined, allQuotes: Quote[]): number {
  if (!projectId) return 0;
  return allQuotes.filter(otherQ => {
    if (otherQ.projectId !== projectId) return false;
    return isQuoteEligibleForLiquidacion(otherQ);
  }).length;
}

function getQuoteSubItemIdSet(q: Quote): Set<string> {
  const ids = new Set<string>();
  (q.categories || []).forEach(c =>
    (c.items || []).forEach(it =>
      (it.subItems || []).forEach(sub => {
        if (sub.id) ids.add(String(sub.id));
      })
    )
  );
  return ids;
}

/**
 * Determina si una orden pertenece a una cotización específica sin duplicar órdenes entre múltiples cotizaciones de un mismo proyecto.
 */
export function isOrdenRelatedToQuote(o: Orden, q: Quote, allQuotes: Quote[]): boolean {
  if (o.quoteId) {
    return o.quoteId === q.id;
  }
  if (q.projectId && o.proyectoId === q.projectId) {
    const quoteSubItemIds = getQuoteSubItemIdSet(q);
    const hasMatchingItem = (o.items || []).some(oi => {
      if (!oi.quoteSubItemId) return false;
      return String(oi.quoteSubItemId)
        .split(',')
        .some(part => quoteSubItemIds.has(part.trim()));
    });
    if (hasMatchingItem) return true;

    if (getApprovedProjectQuotesCount(q.projectId, allQuotes) <= 1) return true;
  }
  return false;
}

export function isGastoRelatedToQuote(g: GastoProduccion, q: Quote, allQuotes: Quote[]): boolean {
  if (g.quoteId) {
    return g.quoteId === q.id;
  }
  if (q.projectId && g.proyectoId === q.projectId) {
    if (getApprovedProjectQuotesCount(q.projectId, allQuotes) <= 1) return true;
  }
  return false;
}

/**
 * Determina si un pago corresponde estrictamente a una cotización, evitando duplicar pagos
 * entre varias cotizaciones aprobadas del mismo proyecto.
 */
export function isPagoRelatedToQuote(
  p: Pago,
  q: Quote,
  relatedOrders: Orden[],
  allOrdenes: Orden[],
  allQuotes: Quote[]
): boolean {
  if (p.ordenId) {
    const parentOrder = allOrdenes.find(o => o.id === p.ordenId);
    if (parentOrder) {
      return relatedOrders.some(ro => ro.id === parentOrder.id);
    }
    return p.quoteId === q.id;
  }
  if (p.quoteId) {
    return p.quoteId === q.id;
  }
  if (q.projectId && p.proyectoId === q.projectId) {
    return getApprovedProjectQuotesCount(q.projectId, allQuotes) <= 1;
  }
  return false;
}

export interface UnmatchedOrderEntry {
  order: Orden;
  item: OrdenSubItem;
  realCost: number;
  paid: number;
}

export interface UnmatchedGastoEntry {
  gasto: GastoProduccion;
  item: GastoProduccionItem;
  realCost: number;
}

export interface SubItemStat {
  realCost: number;
  paid: number;
  orders: Array<{ order: Orden; item: OrdenSubItem; allocatedCost: number }>;
  gastos: Array<{ gasto: GastoProduccion; item: GastoProduccionItem }>;
}

export interface QuoteDesgloseResult {
  subStats: Record<string, SubItemStat>;
  itemStats: Record<string, { realCost: number; paid: number }>;
  unmatchedOrders: UnmatchedOrderEntry[];
  unmatchedGastos: UnmatchedGastoEntry[];
  unmatchedRealCost: number;
  unmatchedPaid: number;
}

/**
 * Calcula las métricas globales de una cotización liquidable de forma consistente con su desglose.
 */
export function calculateQuoteMetrics(
  q: Quote,
  ordenes: Orden[],
  pagos: Pago[],
  gastosProduccion: GastoProduccion[],
  proveedores: Proveedor[],
  allQuotes: Quote[]
) {
  let totalCostoProveedor = 0;
  let totalCostoCliente = 0;

  (q.categories || []).forEach(cat => {
    (cat.items || []).forEach(item => {
      const itemTotalProvider = (item.subItems || []).reduce(
        (acc, sub) => acc + (Number(sub.unitCost) || 0) * (Number(sub.quantity) || 0) * (Number(sub.dates) || 0),
        0
      );
      totalCostoProveedor += itemTotalProvider;

      const internalMultiplierAmount = itemTotalProvider * ((Number(item.internalMultiplierPercent) || 0) / 100);
      const financialExpense = itemTotalProvider * ((Number(item.financialExpensePercent) || 0) / 100);
      const rawCalculatedClientCost = itemTotalProvider + internalMultiplierAmount + financialExpense;
      totalCostoCliente += Math.round(rawCalculatedClientCost);
    });
  });

  const ordenesRelacionadas = ordenes.filter(o => isOrdenRelatedToQuote(o, q, allQuotes));
  const gastosRelacionados = gastosProduccion.filter(g => isGastoRelatedToQuote(g, q, allQuotes));

  const gastoRealOrdenes = ordenesRelacionadas.reduce((acc, o) => acc + getOrderCostSinIgv(o, proveedores), 0);
  const gastoRealProduccion = gastosRelacionados.reduce((acc, g) => acc + (Number(g.total) || 0), 0);
  const gastoReal = gastoRealOrdenes + gastoRealProduccion;

  const totalVentaCliente = totalCostoCliente * 1.12;
  const margenProyectado = totalVentaCliente - totalCostoProveedor;
  const margenReal = totalVentaCliente - gastoReal;

  const porcentajeMargenProyectado = totalCostoProveedor > 0 ? (margenProyectado / totalCostoProveedor) * 100 : 0;
  const porcentajeMargenReal = gastoReal > 0 ? (margenReal / gastoReal) * 100 : 0;

  const pagadoTotal = pagos
    .filter(p => p.estado === 'Pagado' && isPagoRelatedToQuote(p, q, ordenesRelacionadas, ordenes, allQuotes))
    .reduce((acc, p) => acc + (Number(p.monto) || 0), 0);

  return {
    venta: totalVentaCliente,
    gastoProyectado: totalCostoProveedor,
    gastoReal,
    pagadoTotal,
    margenProyectado,
    margenReal,
    porcentajeMargenProyectado,
    porcentajeMargenReal
  };
}

/**
 * Calcula el desglose operativo por sub-ítem, ítem y órdenes/gastos no vinculados directamente
 * para garantizar que la suma del desglose siempre concilie con el Gasto Real comprometido.
 */
export function getQuoteDesgloseStats(
  q: Quote,
  ordenes: Orden[],
  pagos: Pago[],
  gastosProduccion: GastoProduccion[],
  proveedores: Proveedor[],
  allQuotes: Quote[]
): QuoteDesgloseResult {
  const quoteOrders = ordenes.filter(o => isOrdenRelatedToQuote(o, q, allQuotes));
  const quoteGastos = gastosProduccion.filter(g => isGastoRelatedToQuote(g, q, allQuotes));

  const subsList: Array<{ sub: any; item: any; cat: any; budget: number }> = [];
  (q.categories || []).forEach(cat => {
    (cat.items || []).forEach(it => {
      (it.subItems || []).forEach(sub => {
        const budget = (Number(sub.unitCost) || 0) * (Number(sub.quantity) || 0) * (Number(sub.dates) || 0);
        subsList.push({ sub, item: it, cat, budget });
      });
    });
  });

  const subOrdersMap: Record<string, Array<{ order: Orden; item: OrdenSubItem }>> = {};
  const subGastosMap: Record<string, Array<{ gasto: GastoProduccion; item: GastoProduccionItem }>> = {};
  subsList.forEach(s => {
    const sId = String(s.sub.id || '');
    subOrdersMap[sId] = [];
    subGastosMap[sId] = [];
  });

  const getOrderPaidTotal = (o: Orden) =>
    pagos
      .filter(p => p.ordenId === o.id && p.estado === 'Pagado')
      .reduce((acc, p) => acc + (Number(p.monto) || 0), 0);

  const getOrderTotalForRatio = (o: Orden, effectiveItems: OrdenSubItem[]) => {
    const oTotal = Number(o.total) || 0;
    if (oTotal > 0) return oTotal;
    return effectiveItems.reduce((acc, it) => acc + (Number(it.total) || 0), 0) || 1;
  };

  // Helper para elegir mejor sub-ítem candidato cuando la coincidencia es por nombre
  const pickBestNameMatch = (rawName: string, amount: number): string | null => {
    const oiName = normalizeText(rawName);
    const oiClean = stripOrderPrefix(oiName);
    if (!oiName) return null;

    const scoreCandidate = (s: { sub: any; item: any; budget: number }): number => {
      const sName = normalizeText(s.sub.name);
      const itName = normalizeText(s.item.name);
      if (sName === oiName || sName === oiClean) return 100;
      if (!sName.includes('imprevist') && sName.length >= 4) {
        if (sName.includes(oiName) || oiName.includes(sName)) return 75;
        if (oiClean.length >= 4 && (sName.includes(oiClean) || oiClean.includes(sName))) return 70;
      }
      if (!sName.includes('imprevist') && itName.length >= 4) {
        if (itName.includes(oiName) || oiName.includes(itName)) return 50;
        if (oiClean.length >= 4 && (itName.includes(oiClean) || oiClean.includes(itName))) return 45;
      }
      return 0;
    };

    let bestSubId: string | null = null;
    let bestScore = 0;
    let bestBudgetDiff = Infinity;

    for (const s of subsList) {
      const score = scoreCandidate(s);
      if (score <= 0) continue;
      const budgetDiff = Math.abs(s.budget - amount);
      const sId = String(s.sub.id || '');
      const alreadyAssigned = (subOrdersMap[sId]?.length || 0) > 0;
      // Desempate: preferir el sub-ítem que aún no tenga orden y cuyo presupuesto sea más cercano
      const effectiveScore = score - (alreadyAssigned ? 5 : 0);
      if (effectiveScore > bestScore || (effectiveScore === bestScore && budgetDiff < bestBudgetDiff)) {
        bestScore = effectiveScore;
        bestBudgetDiff = budgetDiff;
        bestSubId = sId;
      }
    }

    return bestSubId;
  };

  const unmatchedOrders: UnmatchedOrderEntry[] = [];

  // 1. Emparejar ítems de órdenes (ya deduplicados)
  quoteOrders.forEach(o => {
    const effectiveItems = dedupeOrderItems(o);
    const itemsTotalSum = effectiveItems.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
    const oPagos = getOrderPaidTotal(o);
    const oTotal = getOrderTotalForRatio(o, effectiveItems);

    if (effectiveItems.length === 0 || itemsTotalSum <= 0) {
      const realCost = getOrderCostSinIgv(o, proveedores);
      if (realCost > 0) {
        unmatchedOrders.push({
          order: o,
          item: {
            id: o.id,
            ordenId: o.id,
            quoteSubItemId: '',
            name: o.titulo || 'Orden emitida sin desglose de ítems',
            quantity: 1,
            unitCost: realCost,
            total: realCost
          },
          realCost,
          paid: oTotal > 0 && oPagos > 0 ? (realCost / oTotal) * oPagos : 0
        });
      }
      return;
    }

    effectiveItems.forEach(oi => {
      const oiId = String(oi.quoteSubItemId || '').trim();
      const oiTotal = Number(oi.total) || 0;

      if (oiId && oiId.includes(',')) {
        const ids = oiId.split(',').map(s => s.trim()).filter(Boolean);
        const matchedIds = ids.filter(singleId => Boolean(subOrdersMap[singleId]));
        if (matchedIds.length > 0) {
          matchedIds.forEach(singleId => {
            subOrdersMap[singleId].push({ order: o, item: oi });
          });
        } else {
          const fallbackId = pickBestNameMatch(oi.name || oi.customDescription || '', oiTotal);
          if (fallbackId && subOrdersMap[fallbackId]) {
            subOrdersMap[fallbackId].push({ order: o, item: oi });
          } else {
            unmatchedOrders.push({
              order: o,
              item: oi,
              realCost: oiTotal,
              paid: oTotal > 0 && oPagos > 0 ? (oiTotal / oTotal) * oPagos : 0
            });
          }
        }
        return;
      }

      if (oiId && subOrdersMap[oiId]) {
        subOrdersMap[oiId].push({ order: o, item: oi });
        return;
      }

      const fallbackId = pickBestNameMatch(oi.name || oi.customDescription || '', oiTotal);
      if (fallbackId && subOrdersMap[fallbackId]) {
        subOrdersMap[fallbackId].push({ order: o, item: oi });
      } else {
        unmatchedOrders.push({
          order: o,
          item: oi,
          realCost: oiTotal,
          paid: oTotal > 0 && oPagos > 0 ? (oiTotal / oTotal) * oPagos : 0
        });
      }
    });
  });

  // 2. Emparejar gastos de producción
  const unmatchedGastos: UnmatchedGastoEntry[] = [];
  quoteGastos.forEach(g => {
    const gItems = g.items || [];
    if (gItems.length === 0 && (Number(g.total) || 0) > 0) {
      unmatchedGastos.push({
        gasto: g,
        item: {
          id: g.id,
          gastoId: g.id,
          quoteSubItemId: '',
          name: `${g.tipoComprobante || 'Gasto'} ${g.numeroComprobante || g.id}`.trim(),
          costPercentage: 100,
          monto: Number(g.total) || 0
        },
        realCost: Number(g.total) || 0
      });
      return;
    }

    gItems.forEach(gi => {
      const giId = String(gi.quoteSubItemId || '').trim();
      const giMonto = Number(gi.monto) || 0;

      if (giId && subGastosMap[giId]) {
        subGastosMap[giId].push({ gasto: g, item: gi });
        return;
      }

      const fallbackId = pickBestNameMatch(gi.name || (gi as any).descripcion || '', giMonto);
      if (fallbackId && subGastosMap[fallbackId]) {
        subGastosMap[fallbackId].push({ gasto: g, item: gi });
      } else {
        unmatchedGastos.push({ gasto: g, item: gi, realCost: giMonto });
      }
    });
  });

  // 3. Calcular estadísticas por sub-ítem
  const subStats: Record<string, SubItemStat> = {};
  subsList.forEach(s => {
    const sId = String(s.sub.id || '');
    const ordersForSub = subOrdersMap[sId] || [];
    const gastosForSub = subGastosMap[sId] || [];

    let realOrders = 0;
    let paid = 0;
    const allocatedOrders: Array<{ order: Orden; item: OrdenSubItem; allocatedCost: number }> = [];

    ordersForSub.forEach(x => {
      const o = x.order;
      const oi = x.item;
      const oiId = String(oi.quoteSubItemId || '');
      let allocated = Number(oi.total) || 0;

      if (oiId.includes(',')) {
        const ids = oiId.split(',').map(str => str.trim()).filter(Boolean);
        const existingSubs = subsList.filter(subObj => ids.includes(String(subObj.sub.id || '')));
        if (existingSubs.length > 0) {
          const totalBudgetOfConsolidated = existingSubs.reduce((sum, subObj) => sum + subObj.budget, 0);
          const ratio = totalBudgetOfConsolidated > 0 ? s.budget / totalBudgetOfConsolidated : 1 / existingSubs.length;
          allocated = (Number(oi.total) || 0) * ratio;
        }
      }

      realOrders += allocated;
      allocatedOrders.push({ order: o, item: oi, allocatedCost: allocated });

      const effectiveItems = dedupeOrderItems(o);
      const oTotal = getOrderTotalForRatio(o, effectiveItems);
      const oPagos = getOrderPaidTotal(o);
      if (oTotal > 0 && oPagos > 0) {
        paid += (allocated / oTotal) * oPagos;
      }
    });

    const realGastos = gastosForSub.reduce((acc, x) => acc + (Number(x.item.monto) || 0), 0);
    subStats[sId] = {
      realCost: realOrders + realGastos,
      paid,
      orders: allocatedOrders,
      gastos: gastosForSub
    };
  });

  // 4. Estadísticas por ítem
  const itemStats: Record<string, { realCost: number; paid: number }> = {};
  (q.categories || []).forEach(cat => {
    (cat.items || []).forEach(it => {
      const itId = String(it.id || '');
      let itemRealCost = 0;
      let itemPaid = 0;
      (it.subItems || []).forEach(sub => {
        const stats = subStats[String(sub.id || '')] || { realCost: 0, paid: 0 };
        itemRealCost += stats.realCost;
        itemPaid += stats.paid;
      });
      itemStats[itId] = { realCost: itemRealCost, paid: itemPaid };
    });
  });

  const unmatchedRealCost =
    unmatchedOrders.reduce((acc, u) => acc + u.realCost, 0) +
    unmatchedGastos.reduce((acc, g) => acc + g.realCost, 0);
  const unmatchedPaid = unmatchedOrders.reduce((acc, u) => acc + u.paid, 0);

  return {
    subStats,
    itemStats,
    unmatchedOrders,
    unmatchedGastos,
    unmatchedRealCost,
    unmatchedPaid
  };
}

/**
 * Preserva los IDs originales de categorías, ítems y sub-ítems al reemplazar estructura de una cotización existente
 * (por ejemplo, al re-importar Excel/IA), evitando que se rompan vínculos con Órdenes ya emitidas.
 */
export function preserveQuoteNodeIds(
  previousCategories: QuoteCategory[] = [],
  nextCategories: QuoteCategory[] = []
): QuoteCategory[] {
  if (!previousCategories.length) return nextCategories;

  const usedCatIds = new Set<string>();
  const usedItemIds = new Set<string>();
  const usedSubIds = new Set<string>();

  return nextCategories.map(newCat => {
    const newCatName = normalizeText(newCat.name);
    const matchedCat = previousCategories.find(
      oldCat => oldCat.id && !usedCatIds.has(oldCat.id) && normalizeText(oldCat.name) === newCatName
    );
    if (matchedCat?.id) usedCatIds.add(matchedCat.id);

    const oldItemsPool = matchedCat?.items || previousCategories.flatMap(c => c.items || []);

    const mappedItems = (newCat.items || []).map(newItem => {
      const newItemName = normalizeText(newItem.name);
      const matchedItem = oldItemsPool.find(
        oldItem => oldItem.id && !usedItemIds.has(oldItem.id) && normalizeText(oldItem.name) === newItemName
      );
      if (matchedItem?.id) usedItemIds.add(matchedItem.id);

      const oldSubsPool = matchedItem?.subItems || oldItemsPool.flatMap(it => it.subItems || []);

      const mappedSubItems = (newItem.subItems || []).map(newSub => {
        const newSubName = normalizeText(newSub.name);
        const matchedSub = oldSubsPool.find(
          oldSub => oldSub.id && !usedSubIds.has(oldSub.id) && normalizeText(oldSub.name) === newSubName
        );
        if (matchedSub?.id) usedSubIds.add(matchedSub.id);

        return matchedSub?.id ? { ...newSub, id: matchedSub.id } : newSub;
      });

      return {
        ...(matchedItem?.id ? { ...newItem, id: matchedItem.id } : newItem),
        subItems: mappedSubItems
      };
    });

    return {
      ...(matchedCat?.id ? { ...newCat, id: matchedCat.id } : newCat),
      items: mappedItems
    };
  });
}
