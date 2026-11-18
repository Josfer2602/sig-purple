import * as XLSX from 'xlsx';
import type { Cliente, Proyecto, Proveedor, Orden, Pago, FacturaCliente, GastoProduccion } from '../types/models';
import type { Quote } from '../types/quote';

// Helper: Auto-ajustar ancho de columnas de acuerdo al contenido
export const autoFitColumns = (worksheet: XLSX.WorkSheet, data: any[]) => {
  if (!data || data.length === 0) return;
  const keys = Object.keys(data[0]);
  const colWidths = keys.map(key => {
    let maxLen = key.toString().length;
    for (const row of data) {
      const val = row[key];
      if (val !== undefined && val !== null) {
        const str = String(val);
        if (str.length > maxLen) maxLen = str.length;
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, 11), 60) };
  });
  worksheet['!cols'] = colWidths;
};

// Helper: Formato de fecha YYYY-MM-DD
const formatDate = (dateStr?: string | null) => {
  if (!dateStr || dateStr === '-' || dateStr === 'NO APLICA') return '';
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) {}
  return String(dateStr).trim();
};

// Helper: Obtener nombre de cliente
const resolveClientName = (clientIdOrName?: string, clientes?: Cliente[], proyectos?: Proyecto[], projectId?: string): string => {
  if (!clientIdOrName && projectId && proyectos) {
    const proj = proyectos.find(p => p.id === projectId);
    if (proj?.clienteId && clientes) {
      const c = clientes.find(cl => cl.id === proj.clienteId);
      if (c) return c.empresa;
    }
  }
  if (!clientIdOrName) return '-';
  if (clientes) {
    const found = clientes.find(c => c.id === clientIdOrName);
    if (found) return found.empresa;
  }
  return clientIdOrName;
};

// Helper: Obtener nombre de proyecto
const resolveProjectName = (projectId?: string, proyectos?: Proyecto[]): string => {
  if (!projectId) return '-';
  if (proyectos) {
    const p = proyectos.find(pr => pr.id === projectId);
    if (p) return p.nombre;
  }
  return projectId;
};

// Helper: Obtener nombre de proveedor
const resolveProviderName = (providerId?: string, proveedores?: Proveedor[]): string => {
  if (!providerId) return '-';
  if (proveedores) {
    const prov = proveedores.find(p => p.id === providerId);
    if (prov) return prov.razonSocial || prov.nombre;
  }
  return providerId;
};

// Helper: Calcular totales financieros de una cotización
export const calculateQuoteFinancials = (quote: Quote, proyectos?: Proyecto[]) => {
  let costoDirecto = 0;
  let subTotalClient = 0;

  (quote.categories || []).forEach(cat => {
    (cat.items || []).forEach(item => {
      const totalProvider = (item.subItems || []).reduce(
        (acc, sub) => acc + ((Number(sub.unitCost) || 0) * (Number(sub.quantity) || 0) * (Number(sub.dates) || 0)), 
        0
      );
      const internalMultiplierAmount = totalProvider * ((Number(item.internalMultiplierPercent) || 0) / 100);
      const financialExpense = totalProvider * ((Number(item.financialExpensePercent) || 0) / 100);
      const rawClientCost = totalProvider + internalMultiplierAmount + financialExpense;
      const totalClient = Math.round(rawClientCost);

      costoDirecto += totalProvider;
      subTotalClient += totalClient;
    });
  });

  let totalVenta = subTotalClient > 0 ? Math.round(subTotalClient * 1.12 * 100) / 100 : 0;

  // Fallback si no tiene desglose pero tiene proyecto con subtotal
  if (totalVenta === 0 && quote.projectId && proyectos) {
    const proj = proyectos.find(p => p.id === quote.projectId);
    if (proj && proj.subtotal > 0) {
      totalVenta = proj.subtotal;
    }
  }

  const margenMonto = totalVenta > 0 ? Math.round((totalVenta - costoDirecto) * 100) / 100 : 0;
  const margenPorcentaje = totalVenta > 0 ? Math.round(((totalVenta - costoDirecto) / totalVenta) * 1000) / 10 : 0;

  return {
    costoDirecto: Math.round(costoDirecto * 100) / 100,
    totalVenta,
    margenMonto,
    margenPorcentaje
  };
};

// Helper: Detección Avanzada de Duplicados en Cotizaciones
export interface QuoteDuplicateAnalysis {
  estadoDuplicado: string;
  esDuplicado: boolean;
  tipoDuplicado: 'CRITICO' | 'PROBABLE' | 'MULTI_VERSION' | 'UNICO';
  coincidenciasCount: number;
  coincidentesIds: string[];
  motivo: string;
  esUltimaVersion: boolean;
}

export const analyzeQuoteDuplicates = (
  allQuotes: Quote[], 
  clientes?: Cliente[], 
  proyectos?: Proyecto[]
): Map<string, QuoteDuplicateAnalysis> => {
  const result = new Map<string, QuoteDuplicateAnalysis>();

  // 1. Agrupar por ProjectId + Version
  const projVersionMap = new Map<string, Quote[]>();
  // 2. Agrupar por ProjectId (para detectar multi-versiones y la versión más reciente)
  const projAllQuotesMap = new Map<string, Quote[]>();
  // 3. Agrupar por Cliente + Requerimiento Normalizado
  const clientReqMap = new Map<string, Quote[]>();

  allQuotes.forEach(q => {
    if (!q || q.status === 'Archivado') return;

    const normReq = (q.requirement || '').trim().toLowerCase();
    const clientName = resolveClientName(q.client, clientes, proyectos, q.projectId).trim().toLowerCase();
    const projId = (q.projectId || '').trim();
    const ver = Number(q.version) || 1;

    // Project + Version
    if (projId) {
      const pvKey = `${projId}___V${ver}`;
      if (!projVersionMap.has(pvKey)) projVersionMap.set(pvKey, []);
      projVersionMap.get(pvKey)!.push(q);

      if (!projAllQuotesMap.has(projId)) projAllQuotesMap.set(projId, []);
      projAllQuotesMap.get(projId)!.push(q);
    }

    // Client + Requirement
    if (clientName && normReq) {
      const crKey = `${clientName}___${normReq}`;
      if (!clientReqMap.has(crKey)) clientReqMap.set(crKey, []);
      clientReqMap.get(crKey)!.push(q);
    }
  });

  allQuotes.forEach(q => {
    if (!q) return;
    const normReq = (q.requirement || '').trim().toLowerCase();
    const clientName = resolveClientName(q.client, clientes, proyectos, q.projectId).trim().toLowerCase();
    const projId = (q.projectId || '').trim();
    const ver = Number(q.version) || 1;

    // Verificar si es la versión más reciente del proyecto
    let esUltimaVersion = true;
    if (projId && projAllQuotesMap.has(projId)) {
      const maxVer = Math.max(...projAllQuotesMap.get(projId)!.map(x => Number(x.version) || 1));
      esUltimaVersion = ver >= maxVer;
    }

    // CASO 1: Duplicado Crítico (Mismo Proyecto y Misma Versión)
    const pvKey = projId ? `${projId}___V${ver}` : null;
    const pvMatches = pvKey && projVersionMap.has(pvKey) ? projVersionMap.get(pvKey)! : [];
    if (pvMatches.length > 1) {
      const others = pvMatches.filter(x => x.id !== q.id).map(x => x.id);
      result.set(q.id, {
        estadoDuplicado: `🔴 CRÍTICO (${pvMatches.length} idénticas)`,
        esDuplicado: true,
        tipoDuplicado: 'CRITICO',
        coincidenciasCount: pvMatches.length,
        coincidentesIds: others,
        motivo: `Mismo Proyecto y Versión V${ver} registrados en ${pvMatches.length} cotizaciones distintas.`,
        esUltimaVersion
      });
      return;
    }

    // CASO 2: Duplicado Probable (Mismo Cliente y Mismo Requerimiento)
    const crKey = clientName && normReq ? `${clientName}___${normReq}` : null;
    const crMatches = crKey && clientReqMap.has(crKey) ? clientReqMap.get(crKey)! : [];
    if (crMatches.length > 1) {
      const others = crMatches.filter(x => x.id !== q.id).map(x => x.id);
      result.set(q.id, {
        estadoDuplicado: `🟠 PROBABLE (${crMatches.length} coincidencias)`,
        esDuplicado: true,
        tipoDuplicado: 'PROBABLE',
        coincidenciasCount: crMatches.length,
        coincidentesIds: others,
        motivo: `Mismo cliente ("${clientName}") y requerimiento idéntico en ${crMatches.length} cotizaciones.`,
        esUltimaVersion
      });
      return;
    }

    // CASO 3: Multi-Versión del mismo Proyecto
    const pMatches = projId && projAllQuotesMap.has(projId) ? projAllQuotesMap.get(projId)! : [];
    if (pMatches.length > 1) {
      const others = pMatches.filter(x => x.id !== q.id).map(x => `V${x.version}: ${x.id}`);
      result.set(q.id, {
        estadoDuplicado: esUltimaVersion ? `🟡 MULTI-VERSIÓN (Última V${ver})` : `🟡 MULTI-VERSIÓN (V${ver} anterior)`,
        esDuplicado: false,
        tipoDuplicado: 'MULTI_VERSION',
        coincidenciasCount: pMatches.length,
        coincidentesIds: others,
        motivo: `El proyecto tiene ${pMatches.length} versiones registradas. ${esUltimaVersion ? 'Esta es la versión más reciente.' : 'Existe una versión más reciente.'}`,
        esUltimaVersion
      });
      return;
    }

    // CASO 4: Cotización Única
    result.set(q.id, {
      estadoDuplicado: '🟢 ÚNICA',
      esDuplicado: false,
      tipoDuplicado: 'UNICO',
      coincidenciasCount: 1,
      coincidentesIds: [],
      motivo: 'Sin duplicados detectados.',
      esUltimaVersion: true
    });
  });

  return result;
};

// ==========================================
// 1. EXPORTAR CLIENTES
// ==========================================
export const generateClientesSheetData = (clientes: Cliente[], proyectos: Proyecto[] = []) => {
  return (clientes || []).map(c => {
    const proyectosVinculados = proyectos.filter(p => p.clienteId === c.id);
    const principalCargo = c.cargo || c.contactos?.find(ct => ct.esPrincipal)?.cargo || c.contactos?.[0]?.cargo || '-';
    const contactosAdicionales = (c.contactos || []).map(ct => 
      `${ct.nombre}${ct.cargo ? ` (${ct.cargo})` : ''}${ct.email ? ` - ${ct.email}` : ''}${ct.telefono ? ` - ${ct.telefono}` : ''}`
    ).join('; ');

    return {
      'ID Cliente': c.id,
      'Empresa / Razón Social': c.empresa,
      'Contacto Principal': c.contacto || '-',
      'Cargo Contacto': principalCargo,
      'Email Contacto': c.email || '-',
      'Teléfono Contacto': c.telefono || '-',
      'Estado': c.estado || 'Activo',
      'N° Proyectos': proyectosVinculados.length,
      'Proyectos Vinculados': proyectosVinculados.map(p => `${p.nombre} (${p.estado})`).join(' | '),
      'N° Contactos Registrados': c.contactos?.length || 1,
      'Detalle Todos los Contactos': contactosAdicionales || '-'
    };
  });
};

export const exportClientesToExcel = (clientes: Cliente[], proyectos: Proyecto[] = []) => {
  const data = generateClientesSheetData(clientes, proyectos);
  const worksheet = XLSX.utils.json_to_sheet(data);
  autoFitColumns(worksheet, data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');
  const fileName = `Clientes_SIG_Purple_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

// ==========================================
// 2. EXPORTAR PROYECTOS
// ==========================================
export const generateProyectosSheetData = (proyectos: Proyecto[], clientes: Cliente[] = [], quotes: Quote[] = []) => {
  return (proyectos || []).map(p => {
    const clienteName = resolveClientName(p.clienteId, clientes);
    const quotesDelProyecto = quotes.filter(q => q.projectId === p.id);
    const subtotal = Number(p.subtotal) || 0;
    const gastosAdicionales = Number(p.gastosAdicionales) || 0;
    const totalProyecto = subtotal + gastosAdicionales;
    const moneda = p.moneda || (quotesDelProyecto.some(q => q.currency === 'USD') ? 'USD' : 'PEN');

    const getBestQuoteForExport = (quotesList: any[]) => {
      if (!quotesList || quotesList.length === 0) return null;
      const liquidQuotes = quotesList.filter(q => (q.status || '').toLowerCase().includes('liquid'));
      const aprobQuotes = quotesList.filter(q => {
        const s = (q.status || '').toLowerCase();
        return s.includes('aprob') || s.includes('ganad');
      });
      const enviadQuotes = quotesList.filter(q => (q.status || '').toLowerCase().includes('enviad'));
      const draftQuotes = quotesList.filter(q => {
        const s = (q.status || '').toLowerCase();
        return s.includes('creac') || s.includes('borrad');
      });

      const sortBest = (arr: any[]) => {
        return [...arr].sort((a, b) => {
          const tA = calculateQuoteFinancials(a, proyectos).totalVenta || 0;
          const tB = calculateQuoteFinancials(b, proyectos).totalVenta || 0;
          if (Math.abs(tA - tB) > 0.01) return tB - tA;
          return (Number(b.version) || 1) - (Number(a.version) || 1);
        })[0];
      };

      if (liquidQuotes.length > 0) return sortBest(liquidQuotes);
      if (aprobQuotes.length > 0) return sortBest(aprobQuotes);
      if (enviadQuotes.length > 0) return sortBest(enviadQuotes);
      if (draftQuotes.length > 0) return sortBest(draftQuotes);
      return sortBest(quotesList);
    };

    const relevantQuote = getBestQuoteForExport(quotesDelProyecto);

    let cotizacionMonto = 0;
    if (relevantQuote) {
      cotizacionMonto = calculateQuoteFinancials(relevantQuote, proyectos).totalVenta;
    } else if (subtotal > 0) {
      cotizacionMonto = subtotal;
    }

    return {
      'Código': p.id.startsWith('PRJ-') ? p.id : `PRJ-${p.id.split('-')[0].toUpperCase()}`,
      'Fecha Registro': formatDate(p.fechaRegistro),
      'Fecha Estado': formatDate(p.fechaAprobacion || (p as any).fechaEstado),
      'Cliente': clienteName,
      'Nombre Proyecto': p.nombre,
      'Project Manager': p.projectManager || 'Eric Higa',
      'Tipo de Servicio': p.tipoServicio || '-',
      'Tipo de Proyecto': p.tipoProyecto || '-',
      'Moneda': moneda,
      'Rango Presupuestal': p.presupuestoEstimado || '-',
      'Monto Cotización': cotizacionMonto > 0 ? cotizacionMonto : '-',
      'Subtotal Registrado': subtotal > 0 ? subtotal : '-',
      'Gastos Adicionales': gastosAdicionales > 0 ? gastosAdicionales : 0,
      'Total Proyecto': totalProyecto > 0 ? totalProyecto : '-',
      'Estado': p.estado || 'PENDIENTE CP',
      'Status Actividad': p.statusActividad || '-',
      'N° Cotizaciones': quotesDelProyecto.length,
      'IDs Cotizaciones': quotesDelProyecto.map(q => `${q.id} (V${q.version})`).join(', '),
      'Contacto Solicitante': p.contactoNombre ? `${p.contactoNombre} (${p.contactoCargo || '-'})` : '-',
      'Comentarios / Notas': p.comentarios || '',
      'Carpeta Drive': p.driveFolderUrl || '-'
    };
  });
};

export const exportProyectosToExcel = (proyectos: Proyecto[], clientes: Cliente[] = [], quotes: Quote[] = []) => {
  const data = generateProyectosSheetData(proyectos, clientes, quotes);
  const worksheet = XLSX.utils.json_to_sheet(data);
  autoFitColumns(worksheet, data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Proyectos');
  const fileName = `Proyectos_SIG_Purple_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

// ==========================================
// 3. EXPORTAR COTIZACIONES (CON DETECCIÓN DE DUPLICADOS)
// ==========================================
export const generateCotizacionesSheetData = (quotes: Quote[], proyectos: Proyecto[] = [], clientes: Cliente[] = []) => {
  const duplicatesMap = analyzeQuoteDuplicates(quotes, clientes, proyectos);

  const rows = (quotes || []).map(q => {
    const dup = duplicatesMap.get(q.id) || {
      estadoDuplicado: '🟢 ÚNICA',
      esDuplicado: false,
      tipoDuplicado: 'UNICO' as const,
      coincidenciasCount: 1,
      coincidentesIds: [],
      motivo: 'Sin duplicados detectados.',
      esUltimaVersion: true
    };

    const fin = calculateQuoteFinancials(q, proyectos);
    const clientName = resolveClientName(q.client, clientes, proyectos, q.projectId);
    const projectName = resolveProjectName(q.projectId, proyectos);
    const totalItems = (q.categories || []).reduce((acc, cat) => acc + (cat.items?.length || 0), 0);
    const assignedProviders = Array.from(new Set(
      (q.categories || []).flatMap(c => 
        (c.items || []).flatMap(it => 
          (it.subItems || []).map(s => s.providerName).filter(Boolean)
        )
      )
    )).join(', ');

    return {
      'Estado Duplicado': dup.estadoDuplicado,
      '¿Es Duplicado?': dup.esDuplicado ? 'SÍ' : 'NO',
      'N° Coincidencias': dup.coincidenciasCount,
      'IDs Coincidentes / Relacionadas': dup.coincidentesIds.join(', ') || '-',
      'Diagnóstico de Duplicado': dup.motivo,
      '¿Es Última Versión?': dup.esUltimaVersion ? 'SÍ' : 'NO',
      'ID Cotización': q.id,
      'Versión': `V${q.version || 1}`,
      'Estado': q.status || 'Borrador',
      'Requerimiento / Título': q.requirement || projectName || '-',
      'Cliente': clientName,
      'Marca': q.brand || '-',
      'ID Proyecto': q.projectId || '-',
      'Nombre Proyecto': projectName,
      'Fecha': formatDate(q.date),
      'Moneda': q.currency || 'PEN',
      'Tipo de Cambio': q.exchangeRate || 3.75,
      'Costo Directo Proveedores (S/)': fin.costoDirecto,
      'Proveedores Asignados': assignedProviders || '-',
      'Total Venta Cliente (S/)': fin.totalVenta,
      'Margen Estimado (S/)': fin.margenMonto,
      'Margen (%)': `${fin.margenPorcentaje}%`,
      'Condiciones de Pago': q.paymentConditions || '-',
      'Razón Social Cotizada': q.businessName || '-',
      'RUC Cotizado': q.ruc || '-',
      'N° Categorías': q.categories?.length || 0,
      'N° Ítems Presupuestados': totalItems,
      'Es Plantilla': q.isTemplate ? 'SÍ' : 'NO'
    };
  });

  // Ordenar para que los duplicados críticos y probables salgan arriba de forma destacada
  const sortWeight: Record<string, number> = {
    'CRITICO': 1,
    'PROBABLE': 2,
    'MULTI_VERSION': 3,
    'UNICO': 4
  };

  rows.sort((a, b) => {
    const typeA = duplicatesMap.get(a['ID Cotización'])?.tipoDuplicado || 'UNICO';
    const typeB = duplicatesMap.get(b['ID Cotización'])?.tipoDuplicado || 'UNICO';
    const wDiff = (sortWeight[typeA] || 99) - (sortWeight[typeB] || 99);
    if (wDiff !== 0) return wDiff;
    return a['Cliente'].localeCompare(b['Cliente']);
  });

  return rows;
};

export const exportCotizacionesToExcel = (quotes: Quote[], proyectos: Proyecto[] = [], clientes: Cliente[] = []) => {
  const data = generateCotizacionesSheetData(quotes, proyectos, clientes);
  const worksheet = XLSX.utils.json_to_sheet(data);
  autoFitColumns(worksheet, data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cotizaciones');
  const fileName = `Cotizaciones_Con_Duplicados_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

// ==========================================
// 4. EXPORTAR PROVEEDORES
// ==========================================
export const generateProveedoresSheetData = (proveedores: Proveedor[]) => {
  return (proveedores || []).map(p => {
    const cats = (p.categorias && p.categorias.length > 0 ? p.categorias : [p.categoria]).filter(Boolean).join(', ');
    const subcats = (p.subcategorias || []).join(', ');
    const tags = (p.tags || []).join(', ');
    const cuentas = (p.cuentas || []).map(c => `${c.banco || 'Banco'}: Cta ${c.numeroCuenta || '-'} | CCI ${c.cci || '-'}`).join('; ');

    return {
      'ID Proveedor': p.id,
      'Razón Social': p.razonSocial || p.nombre || '-',
      'Nombre Comercial': p.nombre || '-',
      'RUC': p.ruc || '-',
      'Correo': p.correo || '-',
      'Teléfono': p.telefono || '-',
      'Tipo Comprobante': p.tipoDocumento || 'Factura',
      'Categorías': cats || '-',
      'Subcategorías': subcats || '-',
      'Tags': tags || '-',
      'Ciudad': p.ciudad || '-',
      'Dirección': p.direccion || '-',
      'Sitio Web': p.web || '-',
      '¿Es Confiable?': p.esConfiable === false ? 'NO' : 'SÍ',
      'Motivo No Confiable': p.motivoNoConfiable || '-',
      'Tipo Proveedor': p.tipoProveedor || 'Trabajado',
      'Cuentas Bancarias': cuentas || '-'
    };
  });
};

export const exportProveedoresToExcel = (proveedores: Proveedor[]) => {
  const data = generateProveedoresSheetData(proveedores);
  const worksheet = XLSX.utils.json_to_sheet(data);
  autoFitColumns(worksheet, data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Proveedores');
  const fileName = `Proveedores_SIG_Purple_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

// ==========================================
// 5. EXPORTAR ÓRDENES DE COMPRA Y SERVICIO
// ==========================================
export const generateOrdenesSheetData = (
  ordenes: Orden[], 
  proveedores: Proveedor[] = [], 
  proyectos: Proyecto[] = [], 
  clientes: Cliente[] = []
) => {
  return (ordenes || []).map(o => {
    const provName = resolveProviderName(o.proveedorId, proveedores);
    const prov = proveedores.find(p => p.id === o.proveedorId);
    const clientName = resolveClientName(o.clienteId, clientes, proyectos, o.proyectoId);
    const projectName = resolveProjectName(o.proyectoId, proyectos);
    const itemsSummary = (o.items || []).map(i => `${i.name} (Cant: ${i.quantity}, Total: S/ ${i.total})`).join('; ');

    return {
      'ID Orden': o.id,
      'Tipo de Orden': o.tipoOrden || 'Compra',
      'Título / Concepto': o.titulo || '-',
      'Proveedor': provName,
      'RUC Proveedor': prov?.ruc || '-',
      'Cliente': clientName,
      'Proyecto': projectName,
      'ID Cotización': o.quoteId || '-',
      'Fecha Emisión': formatDate(o.fechaEmision),
      'Total (S/)': Number(o.total) || 0,
      'Estado Entrega': o.estadoEntrega || 'Pendiente',
      'Condiciones de Pago': o.condicionesPago || '-',
      'N° Ítems': o.items?.length || 0,
      'Detalle de Ítems': itemsSummary || '-'
    };
  });
};

export const exportOrdenesToExcel = (
  ordenes: Orden[], 
  proveedores: Proveedor[] = [], 
  proyectos: Proyecto[] = [], 
  clientes: Cliente[] = []
) => {
  const data = generateOrdenesSheetData(ordenes, proveedores, proyectos, clientes);
  const worksheet = XLSX.utils.json_to_sheet(data);
  autoFitColumns(worksheet, data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Órdenes');
  const fileName = `Ordenes_Compra_Servicio_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

// ==========================================
// 6. EXPORTAR PAGOS A PROVEEDORES
// ==========================================
export const generatePagosSheetData = (
  pagos: Pago[], 
  proveedores: Proveedor[] = [], 
  proyectos: Proyecto[] = [], 
  ordenes: Orden[] = []
) => {
  return (pagos || []).map(p => {
    const provName = resolveProviderName(p.proveedorId, proveedores);
    const prov = proveedores.find(pr => pr.id === p.proveedorId);
    const projectName = resolveProjectName(p.proyectoId, proyectos);
    const ord = ordenes.find(o => o.id === p.ordenId);

    return {
      'ID Pago': p.id,
      'N° Comprobante': p.numeroComprobante || '-',
      'Tipo de Pago': p.tipoPago || 'Adelanto',
      'Título / Concepto': p.concepto || ord?.titulo || '-',
      'Proveedor': provName,
      'RUC Proveedor': prov?.ruc || '-',
      'Proyecto': projectName,
      'ID Orden': p.ordenId || '-',
      'Monto (S/)': Number(p.monto) || 0,
      'Fecha Registro': formatDate(p.fechaRegistro),
      'Fecha Pago Programada': formatDate(p.fechaPago),
      'Estado': p.estado || 'Pendiente',
      'Estado Factura': (!p.comprobanteUrl || (p.numeroComprobante || '').toUpperCase() === 'POR REGULARIZAR' || (p.numeroComprobante || '').toUpperCase() === 'PENDIENTE') ? 'POR REGULARIZAR' : 'CONFORME',
      '¿Tiene Comprobante?': p.comprobanteUrl ? 'SÍ' : 'NO',
      'Enlace Factura': p.comprobanteUrl || '-',
      '¿Tiene Constancia Depósito?': p.comprobanteDeposito ? 'SÍ' : 'NO',
      'Notas / Comentarios': p.comentarios || p.notas || '-'
    };
  });
};

export const exportPagosToExcel = (
  pagos: Pago[], 
  proveedores: Proveedor[] = [], 
  proyectos: Proyecto[] = [], 
  ordenes: Orden[] = []
) => {
  const data = generatePagosSheetData(pagos, proveedores, proyectos, ordenes);
  const worksheet = XLSX.utils.json_to_sheet(data);
  autoFitColumns(worksheet, data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Pagos a Proveedores');
  const fileName = `Pagos_Proveedores_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

// ==========================================
// 7. EXPORTAR FACTURACIÓN CLIENTES
// ==========================================
export const generateFacturasSheetData = (
  facturas: FacturaCliente[], 
  proyectos: Proyecto[] = [], 
  clientes: Cliente[] = []
) => {
  return (facturas || []).map(f => {
    const proj = proyectos.find(p => p.id === f.proyectoId);
    const clientName = resolveClientName(proj?.clienteId, clientes);

    return {
      'ID Factura': f.id,
      'Proyecto': proj?.nombre || f.proyectoId || '-',
      'Cliente': clientName,
      'Tipo de Orden': f.tipoOrden || 'OC',
      'N° Orden Cliente': f.numeroOrden || '-',
      'Fecha Generación Orden': formatDate(f.fechaGeneracionOrden),
      'N° Factura Emitida': f.numeroFactura || '-',
      'Fecha Emisión Factura': formatDate(f.fechaEmision),
      'Condición Pago': f.condicionPago || '-',
      'Días de Pago': f.diasPago || 0,
      '% Facturado': f.porcentajeFacturacion ? `${f.porcentajeFacturacion}%` : '100%',
      'Monto Sin IGV (S/)': Number(f.montoSinIgv) || 0,
      'IGV (S/)': Number(f.igv) || 0,
      'Monto Con IGV (S/)': Number(f.montoConIgv) || 0,
      'Aplica Detracción': f.aplicaDetraccion ? 'SÍ' : 'NO',
      'Aplica Retención': f.aplicaRetencion ? 'SÍ' : 'NO',
      'Importe Recibido (S/)': Number(f.importeRecibido) || 0,
      'Fecha Cobro / Pago': formatDate(f.fechaPago),
      'Estado Cobro': f.estado || 'Pendiente'
    };
  });
};

export const exportFacturasToExcel = (
  facturas: FacturaCliente[], 
  proyectos: Proyecto[] = [], 
  clientes: Cliente[] = []
) => {
  const data = generateFacturasSheetData(facturas, proyectos, clientes);
  const worksheet = XLSX.utils.json_to_sheet(data);
  autoFitColumns(worksheet, data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Facturación Clientes');
  const fileName = `Facturacion_Clientes_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

// ==========================================
// 8. EXPORTAR GASTOS DE PRODUCCIÓN
// ==========================================
export const generateGastosSheetData = (
  gastos: GastoProduccion[], 
  proyectos: Proyecto[] = [], 
  clientes: Cliente[] = []
) => {
  return (gastos || []).map(g => {
    const projName = resolveProjectName(g.proyectoId, proyectos);
    const clientName = resolveClientName(g.clienteId, clientes, proyectos, g.proyectoId);
    const itemsSummary = (g.items || []).map(i => `${i.name}: S/ ${i.monto}`).join('; ');
    const esFact = (g.tipoComprobante || '').toLowerCase().includes('factur');
    const totalVal = Number(g.total) || 0;
    const baseVal = g.montoBase !== undefined ? Number(g.montoBase) : (esFact ? Number((totalVal / 1.18).toFixed(2)) : totalVal);
    const igvVal = g.montoIgv !== undefined ? Number(g.montoIgv) : (esFact ? Number((totalVal - baseVal).toFixed(2)) : 0);

    return {
      'ID Gasto': g.id,
      'Proyecto': projName,
      'Cliente': clientName,
      'Tipo Comprobante': g.tipoComprobante || '-',
      'N° Comprobante': g.numeroComprobante || '-',
      'Fecha Emisión': formatDate(g.fechaEmision),
      'Costo Base (S/)': baseVal,
      'IGV 18% (S/)': igvVal,
      'Total Gasto (S/)': totalVal,
      'Área Responsable': g.areaResponsable || '-',
      'Estado Gasto': g.estadoGasto || 'Rendido',
      '¿Es Gasto Adicional?': g.esGastoAdicional ? 'SÍ' : 'NO',
      'Motivo Adicional': g.motivoAdicional || '-',
      'N° Ítems': g.items?.length || 0,
      'Detalle Ítems': itemsSummary || '-'
    };
  });
};

export const exportGastosToExcel = (
  gastos: GastoProduccion[], 
  proyectos: Proyecto[] = [], 
  clientes: Cliente[] = []
) => {
  const data = generateGastosSheetData(gastos, proyectos, clientes);
  const worksheet = XLSX.utils.json_to_sheet(data);
  autoFitColumns(worksheet, data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Gastos Producción');
  const fileName = `Gastos_Produccion_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

// ==========================================
// 9. EXPORTAR BASE DE DATOS COMPLETA (LIBRO MULTI-HOJA)
// ==========================================
export interface FullDatabaseExportParams {
  clientes: Cliente[];
  proyectos: Proyecto[];
  quotes: Quote[];
  proveedores: Proveedor[];
  ordenes: Orden[];
  pagos: Pago[];
  facturasCliente?: FacturaCliente[];
  gastosProduccion?: GastoProduccion[];
}

export const exportFullDatabaseToExcel = (params: FullDatabaseExportParams) => {
  const {
    clientes = [],
    proyectos = [],
    quotes = [],
    proveedores = [],
    ordenes = [],
    pagos = [],
    facturasCliente = [],
    gastosProduccion = []
  } = params;

  const workbook = XLSX.utils.book_new();

  // 1. Clientes
  const dataClientes = generateClientesSheetData(clientes, proyectos);
  if (dataClientes.length > 0) {
    const wsClientes = XLSX.utils.json_to_sheet(dataClientes);
    autoFitColumns(wsClientes, dataClientes);
    XLSX.utils.book_append_sheet(workbook, wsClientes, 'Clientes');
  }

  // 2. Proyectos
  const dataProyectos = generateProyectosSheetData(proyectos, clientes, quotes);
  if (dataProyectos.length > 0) {
    const wsProyectos = XLSX.utils.json_to_sheet(dataProyectos);
    autoFitColumns(wsProyectos, dataProyectos);
    XLSX.utils.book_append_sheet(workbook, wsProyectos, 'Proyectos');
  }

  // 3. Cotizaciones (con detección de duplicados)
  const dataQuotes = generateCotizacionesSheetData(quotes, proyectos, clientes);
  if (dataQuotes.length > 0) {
    const wsQuotes = XLSX.utils.json_to_sheet(dataQuotes);
    autoFitColumns(wsQuotes, dataQuotes);
    XLSX.utils.book_append_sheet(workbook, wsQuotes, 'Cotizaciones (Duplicados)');
  }

  // 4. Proveedores
  const dataProveedores = generateProveedoresSheetData(proveedores);
  if (dataProveedores.length > 0) {
    const wsProveedores = XLSX.utils.json_to_sheet(dataProveedores);
    autoFitColumns(wsProveedores, dataProveedores);
    XLSX.utils.book_append_sheet(workbook, wsProveedores, 'Proveedores');
  }

  // 5. Órdenes
  const dataOrdenes = generateOrdenesSheetData(ordenes, proveedores, proyectos, clientes);
  if (dataOrdenes.length > 0) {
    const wsOrdenes = XLSX.utils.json_to_sheet(dataOrdenes);
    autoFitColumns(wsOrdenes, dataOrdenes);
    XLSX.utils.book_append_sheet(workbook, wsOrdenes, 'Órdenes Compra-Servicio');
  }

  // 6. Pagos a Proveedores
  const dataPagos = generatePagosSheetData(pagos, proveedores, proyectos, ordenes);
  if (dataPagos.length > 0) {
    const wsPagos = XLSX.utils.json_to_sheet(dataPagos);
    autoFitColumns(wsPagos, dataPagos);
    XLSX.utils.book_append_sheet(workbook, wsPagos, 'Pagos Proveedores');
  }

  // 7. Facturación Clientes
  if (facturasCliente.length > 0) {
    const dataFacturas = generateFacturasSheetData(facturasCliente, proyectos, clientes);
    const wsFacturas = XLSX.utils.json_to_sheet(dataFacturas);
    autoFitColumns(wsFacturas, dataFacturas);
    XLSX.utils.book_append_sheet(workbook, wsFacturas, 'Facturación Clientes');
  }

  // 8. Gastos Producción
  if (gastosProduccion.length > 0) {
    const dataGastos = generateGastosSheetData(gastosProduccion, proyectos, clientes);
    const wsGastos = XLSX.utils.json_to_sheet(dataGastos);
    autoFitColumns(wsGastos, dataGastos);
    XLSX.utils.book_append_sheet(workbook, wsGastos, 'Gastos Producción');
  }

  const fileName = `SIG_Purple_Base_Completa_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};
