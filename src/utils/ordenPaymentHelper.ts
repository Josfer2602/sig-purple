/**
 * Helper para gestión dinámica de condiciones y porcentajes de pago en Órdenes de Compra y Pagos.
 */

export const DEFAULT_CONDICIONES_PAGO_ORDEN: string[] = [
  '50% Adelanto / 50% Contra Entrega',
  '100% Adelanto',
  '100% Contra Entrega',
  '30% Adelanto / 70% Contra Entrega',
  '70% Adelanto / 30% Contra Entrega',
  '40% Adelanto / 60% Contra Entrega',
  '60% Adelanto / 40% Contra Entrega',
  '20% Adelanto / 80% Contra Entrega',
  '80% Adelanto / 20% Contra Entrega',
  'Contado',
  'Crédito a 15 días',
  'Crédito a 30 días',
  'Crédito a 60 días'
];

/**
 * Extrae de forma inteligente la fracción de adelanto (entre 0.0 y 1.0) de cualquier condición de pago.
 * Ejemplos:
 * - "50/50" -> 0.5
 * - "30/70" -> 0.3
 * - "40/60" o "40% Adelanto / 60% Contra Entrega" -> 0.4
 * - "20/80" o "20% Adelanto" -> 0.2
 * - "100% Adelanto" o "Contado" o "100% Contado" -> 1.0
 * - "100% Contra Entrega" o "Crédito a 30 días" -> 0.0
 */
export function parsePorcentajeAdelanto(condicion?: string | null): number {
  if (!condicion) return 0.5;
  const text = condicion.trim();

  // Caso: 100% Adelanto / Contado
  if (/100%\s*(adelanto|contado)/i.test(text) || /^contado$/i.test(text) || /^100%$/i.test(text)) {
    return 1.0;
  }

  // Caso: 100% Contra Entrega o Crédito sin adelanto
  if (
    /100%\s*(contra\s*entrega|saldo)/i.test(text) ||
    /cr[eé]dito/i.test(text) ||
    /pago a \d+/i.test(text) ||
    /contra\s*entrega/i.test(text) && !text.includes('/') && !text.includes('adelanto')
  ) {
    return 0.0;
  }

  // Caso: Fracción tipo "X/Y" (ej: "50/50", "40/60", "20/80", "30 / 70", "25/75")
  const ratioMatch = text.match(/(\d{1,3})\s*[\/]\s*(\d{1,3})/);
  if (ratioMatch) {
    const p1 = parseFloat(ratioMatch[1]);
    if (!isNaN(p1) && p1 >= 0 && p1 <= 100) {
      return p1 / 100;
    }
  }

  // Caso: Porcentaje explícito de adelanto o inicial (ej: "40% Adelanto", "25% inicial")
  const pctMatch = text.match(/(\d{1,3}(?:\.\d+)?)%\s*(adelanto|inicial|entrega)?/i);
  if (pctMatch) {
    const p = parseFloat(pctMatch[1]);
    if (!isNaN(p) && p >= 0 && p <= 100) {
      return p / 100;
    }
  }

  return 0.5; // Valor por defecto estándar
}

export interface OrdenPaymentBreakdown {
  porcentajeAdelanto: number; // 0 a 1
  porcentajeSaldo: number;    // 0 a 1
  adelanto: number;
  saldo: number;
  total: number;
  descripcion: string;
}

/**
 * Calcula el desglose monetario de adelanto y saldo para una orden de compra dado su total y su condición.
 */
export function calculateOrdenPaymentBreakdown(total: number, condicion?: string | null): OrdenPaymentBreakdown {
  const safeTotal = isNaN(total) ? 0 : total;
  const pctAdelanto = parsePorcentajeAdelanto(condicion);
  const pctSaldo = Math.max(0, 1 - pctAdelanto);
  
  const adelanto = Number((safeTotal * pctAdelanto).toFixed(2));
  const saldo = Number((safeTotal - adelanto).toFixed(2));

  let descripcion = '';
  if (pctAdelanto === 1) {
    descripcion = `Pago 100% Contado / Adelanto (S/ ${safeTotal.toFixed(2)})`;
  } else if (pctAdelanto === 0) {
    descripcion = `Pago 100% Contra Entrega / Crédito (S/ ${safeTotal.toFixed(2)})`;
  } else {
    descripcion = `Adelanto ${(pctAdelanto * 100).toFixed(0)}% (S/ ${adelanto.toFixed(2)}) + Saldo ${(pctSaldo * 100).toFixed(0)}% (S/ ${saldo.toFixed(2)})`;
  }

  return {
    porcentajeAdelanto: pctAdelanto,
    porcentajeSaldo: pctSaldo,
    adelanto,
    saldo,
    total: safeTotal,
    descripcion
  };
}

/**
 * Determina si un tipo de documento/comprobante corresponde a Recibo por Honorarios.
 * Según normativa SUNAT Perú, los Recibos por Honorarios (4ta Categoría) NO están sujetos a detracción (SPOT).
 */
export function isReciboPorHonorariosDoc(tipoDocumento?: string | null): boolean {
  if (!tipoDocumento) return false;
  const normalized = tipoDocumento.toLowerCase().trim();
  return (
    normalized.includes('honorario') ||
    normalized === 'rxh' ||
    normalized === 'rhe' ||
    normalized.includes('recibo por honorario')
  );
}

/**
 * Evalúa si un comprobante emitido/detectado (ej. OCR) NO admite detracción SPOT.
 * El SPOT en Perú solo aplica a operaciones gravadas con IGV sustentadas en Facturas.
 */
export function isComprobanteSinDetraccion(tipoComprobante?: string | null): boolean {
  if (!tipoComprobante) return false;
  const normalized = tipoComprobante.toLowerCase().trim();
  return (
    isReciboPorHonorariosDoc(normalized) ||
    normalized.includes('boleta')
  );
}

/**
 * Determina si un proveedor emite Recibos por Honorarios.
 */
export function isProveedorReciboPorHonorarios(proveedor?: { tipoDocumento?: string | null } | null): boolean {
  return isReciboPorHonorariosDoc(proveedor?.tipoDocumento);
}

/**
 * Resuelve de forma segura si corresponde aplicar Detracción SPOT:
 * - Nunca aplica a Recibos por Honorarios (ni Boletas).
 * - Solo aplica cuando corresponde a Servicios y el porcentaje es > 0%.
 */
export function resolveEffectiveDetraccion(params: {
  aplicaDetraccion?: boolean | null;
  porcentajeDetraccion?: number | null;
  isServicio?: boolean;
  proveedorTipoDocumento?: string | null;
  comprobanteTipo?: string | null;
}): boolean {
  if (isReciboPorHonorariosDoc(params.proveedorTipoDocumento)) return false;
  if (isComprobanteSinDetraccion(params.comprobanteTipo)) return false;
  if (params.isServicio === false) return false;
  if (!params.aplicaDetraccion) return false;
  if (
    params.porcentajeDetraccion !== undefined &&
    params.porcentajeDetraccion !== null &&
    Number(params.porcentajeDetraccion) <= 0
  ) {
    return false;
  }
  return true;
}
