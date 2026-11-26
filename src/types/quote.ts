export interface QuoteHistory {
  id: string;
  quoteId: string;
  userName: string;
  action: string;
  details?: string;
  createdAt: string;
}

export interface QuoteSubItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  dates: number; // Fechas/Días
  unitCost: number;
  providerName: string;
  providerId?: string;
}

export interface QuoteItem {
  id: string;
  name: string;
  quantity: number;
  dates: number;
  details: string[]; // Viñetas de descripción
  subItems: QuoteSubItem[];
  internalMultiplierPercent: number; // % Multiplicador Interno
  financialExpensePercent: number; // % Gasto Financiero (ej. 10%)
  isSpecial?: boolean; // Ítem especial calculado como % de otros ítems (ej. APDAYC / UNIMPRO)
  specialRatePercent?: number; // % aplicado sobre la suma del Costo Proveedores de los ítems seleccionados
  specialSourceItemIds?: string[]; // IDs de los ítems cuyos Costos Totales Proveedores se suman
  providerContact: string;
  productionTime: string;
  sourceQuoteDate?: string;
  sourceProjectName?: string;
}

export interface QuoteCategory {
  id: string;
  name: string;
  items: QuoteItem[];
}

export interface Quote {
  id: string;
  projectId?: string; // Link to project
  version: number;
  isTemplate: boolean;
  templateName?: string;
  status: 'En Proceso' | 'Ok Cuentas' | 'Enviado' | 'Aprobado' | 'Borrador' | string;
  client: string;
  brand: string;
  requirement: string;
  date: string;
  businessName: string;
  ruc: string;
  paymentConditions: string;
  currency?: 'PEN' | 'USD';
  exchangeRate?: number;
  includeIgv?: boolean;
  categories: QuoteCategory[];
  history?: QuoteHistory[];
}

export const ensureImprevistoInSubItems = (subItems?: QuoteSubItem[]): QuoteSubItem[] => {
  const list: QuoteSubItem[] = Array.isArray(subItems) ? [...subItems.filter(Boolean)] : [];
  const hasImp = list.some(s => (s?.name || '').trim().toLowerCase().includes('imprevisto'));
  if (!hasImp) {
    list.push({
      id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 5)}-imprevisto`,
      name: 'Imprevistos',
      description: '',
      quantity: 1,
      dates: 1,
      unitCost: 0,
      providerName: '',
      providerId: ''
    });
  }
  return list.sort((a, b) => {
    const isA = (a?.name || '').trim().toLowerCase().includes('imprevisto');
    const isB = (b?.name || '').trim().toLowerCase().includes('imprevisto');
    if (isA && !isB) return 1;
    if (!isA && isB) return -1;
    return 0;
  });
};
