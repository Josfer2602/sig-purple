import * as XLSX from 'xlsx';

export interface ParsedGastoItem {
  id: string;
  filaExcel: number;
  fechaEmision: string;
  tipoComprobante: string;
  esFactura: boolean;
  numeroComprobante: string;
  concepto: string;
  areaResponsable: string;
  costoBase: number;
  montoIgv: number;
  total: number;
  esGastoAdicional: boolean;
  motivoAdicional: string;
  isValid: boolean;
  validationError?: string;
}

export interface ParseGastosResult {
  items: ParsedGastoItem[];
  totalCostoBase: number;
  totalIgv: number;
  totalGeneral: number;
  facturasCount: number;
  noFacturasCount: number;
  errors: string[];
}

/**
 * Genera y descarga la plantilla de Excel (.xlsx) para Gastos de Producción
 * Incluye fórmulas automáticas de IGV (18%) condicionadas a si es Factura o no.
 */
export const downloadGastosTemplate = (projectName?: string, clientName?: string) => {
  const wb = XLSX.utils.book_new();

  // Encabezados oficiales
  const headers = [
    'Fecha (AAAA-MM-DD)',
    'Tipo de Comprobante',
    'N° Comprobante',
    'Descripción / Concepto',
    'Responsable / Rendidor',
    'Costo Base (S/)',
    'IGV 18% (S/)',
    'Total a Rendir (S/)',
    '¿Es Gasto Adicional?',
    'Motivo Adicional (Opcional)'
  ];

  // Filas de ejemplo claras
  const rows = [
    headers,
    [
      '2026-11-10',
      'Factura',
      'F001-0004521',
      'Materiales de escenografía, perfiles y pintura',
      'Producción',
      200.00,
      { f: 'IF(UPPER(TRIM(B2))="FACTURA",ROUND(F2*0.18,2),0)', v: 36.00 },
      { f: 'F2+G2', v: 236.00 },
      'NO',
      ''
    ],
    [
      '2026-11-10',
      'Boleta',
      'B002-0012891',
      'Cintas de embalaje, tornillos y lijas de ferretería',
      'Producción',
      85.50,
      { f: 'IF(UPPER(TRIM(B3))="FACTURA",ROUND(F3*0.18,2),0)', v: 0.00 },
      { f: 'F3+G3', v: 85.50 },
      'NO',
      ''
    ],
    [
      '2026-11-10',
      'Movilidad / Vale',
      'VALE-012',
      'Taxi transporte de herramientas y equipo a locación',
      'Campo',
      35.00,
      { f: 'IF(UPPER(TRIM(B4))="FACTURA",ROUND(F4*0.18,2),0)', v: 0.00 },
      { f: 'F4+G4', v: 35.00 },
      'NO',
      ''
    ],
    [
      '2026-11-10',
      'Factura',
      'F003-0001092',
      'Alquiler express de generador eléctrico para activación',
      'Producción',
      350.00,
      { f: 'IF(UPPER(TRIM(B5))="FACTURA",ROUND(F5*0.18,2),0)', v: 63.00 },
      { f: 'F5+G5', v: 413.00 },
      'SÍ',
      'Requerimiento de energía extra no contemplado en presupuesto'
    ]
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Anchos de columna optimizados
  ws['!cols'] = [
    { wch: 20 }, // Fecha
    { wch: 22 }, // Tipo de Comprobante
    { wch: 18 }, // N° Comprobante
    { wch: 45 }, // Descripción
    { wch: 24 }, // Responsable
    { wch: 16 }, // Costo Base
    { wch: 14 }, // IGV 18%
    { wch: 18 }, // Total a Rendir
    { wch: 20 }, // ¿Es Adicional?
    { wch: 35 }  // Motivo Adicional
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Gastos de Producción');

  // Hoja de instrucciones y tipos válidos
  const instrucciones = [
    ['GUÍA DE LLENADO - PLANTILLA DE GASTOS DE PRODUCCIÓN'],
    [''],
    ['1. REGLA DE CÁLCULO DE IGV:'],
    ['   • Si el "Tipo de Comprobante" es FACTURA: El sistema y la plantilla calculan automáticamente el IGV (+18%) sobre el Costo Base.'],
    ['   • Si el "Tipo de Comprobante" es BOLETA, TICKET, VALE o RECIBO: NO se agrega IGV (Total a Rendir = Costo Base).'],
    [''],
    ['2. TIPOS DE COMPROBANTE VÁLIDOS:'],
    ['   • Factura (Aplica +18% IGV)'],
    ['   • Boleta (Sin IGV)'],
    ['   • Ticket (Sin IGV)'],
    ['   • Recibo por Honorarios (Sin IGV)'],
    ['   • Movilidad / Vale (Sin IGV)'],
    ['   • Declaración Jurada (Sin IGV)'],
    ['   • Sin Comprobante (Sin IGV)'],
    [''],
    ['3. ASOCIACIÓN AL PROYECTO:'],
    [projectName ? `   • Proyecto asignado: ${projectName}` : '   • Al importar el archivo en el sistema, podrás seleccionar el proyecto de destino.'],
    [clientName ? `   • Cliente: ${clientName}` : ''],
    [''],
    ['4. FORMATO DE FECHA: AAAA-MM-DD (ejemplo: 2026-11-10) o formato estándar de Excel.']
  ];
  const wsInstrucciones = XLSX.utils.aoa_to_sheet(instrucciones);
  wsInstrucciones['!cols'] = [{ wch: 95 }];
  XLSX.utils.book_append_sheet(wb, wsInstrucciones, 'Instrucciones y Reglas');

  const cleanProject = (projectName || 'General').replace(/[/\\?%*:|"<>]/g, '_').trim();
  const fileName = `Plantilla_Gastos_Produccion_${cleanProject}_${new Date().toISOString().split('T')[0]}.xlsx`;

  XLSX.writeFile(wb, fileName);
};

/**
 * Convierte un número de serie de fecha de Excel o string a formato YYYY-MM-DD
 */
const parseExcelDate = (val: any): string => {
  if (!val) return new Date().toISOString().split('T')[0];

  // Si es un número serial de Excel (ej: 45600)
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }

  const str = String(val).trim();

  // Formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // Formato DD/MM/YYYY o DD-MM-YYYY
  const parts = str.split(/[/.-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY/MM/DD
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else {
      // DD/MM/YYYY
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return new Date().toISOString().split('T')[0];
};

/**
 * Parsea el archivo Excel cargado por el usuario y aplica la regla de IGV:
 * - Factura: Agrega el 18% de IGV al costo base.
 * - Otros comprobantes: NO agrega IGV (Total = Costo base).
 */
export const parseGastosExcel = async (file: File): Promise<ParseGastosResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellFormula: true });

        // Tomar la primera hoja o la que contenga "Gasto"
        const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('gasto')) || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        if (!worksheet) {
          throw new Error('No se encontró ninguna hoja de datos en el archivo Excel.');
        }

        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (rawRows.length < 2) {
          throw new Error('El archivo Excel está vacío o no contiene filas de datos.');
        }

        // Encontrar la fila del encabezado
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
          const rowText = (rawRows[i] || []).map(cell => String(cell).toLowerCase()).join(' ');
          if (
            (rowText.includes('comprobante') || rowText.includes('tipo')) &&
            (rowText.includes('costo') || rowText.includes('monto') || rowText.includes('total') || rowText.includes('precio'))
          ) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          headerRowIndex = 0; // Fallback al primer renglón
        }

        const headerRow = (rawRows[headerRowIndex] || []).map(cell => String(cell).trim().toLowerCase());

        // Mapeo dinámico de columnas
        const colMap = {
          fecha: headerRow.findIndex(h => h.includes('fecha')),
          tipo: headerRow.findIndex(h => h.includes('tipo') || h.includes('comprobante')),
          numero: headerRow.findIndex(h => h.includes('n°') || h.includes('numero') || h.includes('número') || h.includes('comprobante ref')),
          concepto: headerRow.findIndex(h => h.includes('concepto') || h.includes('descrip') || h.includes('detalle') || h.includes('item')),
          responsable: headerRow.findIndex(h => h.includes('responsable') || h.includes('rendidor') || h.includes('persona') || h.includes('quien')),
          costoBase: headerRow.findIndex(h => h.includes('costo base') || h.includes('costo') || h.includes('subtotal') || h.includes('base') || h.includes('monto sin igv')),
          igv: headerRow.findIndex(h => h.includes('igv')),
          total: headerRow.findIndex(h => h.includes('total a rendir') || h.includes('total') || h.includes('importe final')),
          esAdicional: headerRow.findIndex(h => h.includes('adicional') || h.includes('extra') || h.includes('fuera')),
          motivoAdicional: headerRow.findIndex(h => h.includes('motivo') || h.includes('justific'))
        };

        // Si la columna tipo no se encontró o se solapó con número
        if (colMap.tipo === -1) colMap.tipo = 1;
        if (colMap.costoBase === -1 && colMap.total !== -1) colMap.costoBase = colMap.total;
        if (colMap.costoBase === -1) colMap.costoBase = 5;

        const items: ParsedGastoItem[] = [];
        const errors: string[] = [];

        for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || row.length === 0) continue;

          // Obtener los valores crudos
          const rawFecha = colMap.fecha !== -1 ? row[colMap.fecha] : '';
          const rawTipo = colMap.tipo !== -1 ? String(row[colMap.tipo] || '').trim() : '';
          const rawNumero = colMap.numero !== -1 ? String(row[colMap.numero] || '').trim() : '';
          const rawConcepto = colMap.concepto !== -1 ? String(row[colMap.concepto] || '').trim() : '';
          const rawResponsable = colMap.responsable !== -1 ? String(row[colMap.responsable] || '').trim() : '';
          const rawCosto = colMap.costoBase !== -1 ? row[colMap.costoBase] : 0;
          const rawTotal = colMap.total !== -1 ? row[colMap.total] : 0;
          const rawAdic = colMap.esAdicional !== -1 ? String(row[colMap.esAdicional] || '').trim().toLowerCase() : '';
          const rawMotivo = colMap.motivoAdicional !== -1 ? String(row[colMap.motivoAdicional] || '').trim() : '';

          // Limpiar costo base numérico
          let costoNum = typeof rawCosto === 'number' 
            ? rawCosto 
            : parseFloat(String(rawCosto).replace(/[^0-9.-]+/g, '')) || 0;

          // Si el costo numérico está vacío pero el total tiene valor, usar el total
          if (costoNum === 0 && rawTotal) {
            const totNum = typeof rawTotal === 'number' ? rawTotal : parseFloat(String(rawTotal).replace(/[^0-9.-]+/g, '')) || 0;
            if (totNum > 0) costoNum = totNum;
          }

          // Si la fila está totalmente vacía, ignorarla
          if (!rawTipo && !rawConcepto && costoNum === 0) {
            continue;
          }

          // Validación de Tipo de Comprobante
          const tipoLower = rawTipo.toLowerCase();
          const esFactura = tipoLower.includes('factur');

          let tipoComprobanteNormalized = 'Boleta';
          if (esFactura) {
            tipoComprobanteNormalized = 'Factura';
          } else if (tipoLower.includes('bolet')) {
            tipoComprobanteNormalized = 'Boleta';
          } else if (tipoLower.includes('ticket')) {
            tipoComprobanteNormalized = 'Ticket';
          } else if (tipoLower.includes('honorario') || tipoLower.includes('rhe')) {
            tipoComprobanteNormalized = 'Recibo por Honorarios';
          } else if (tipoLower.includes('movilidad') || tipoLower.includes('vale')) {
            tipoComprobanteNormalized = 'Movilidad / Vale';
          } else if (tipoLower.includes('declaraci')) {
            tipoComprobanteNormalized = 'Declaración Jurada';
          } else if (rawTipo) {
            tipoComprobanteNormalized = rawTipo;
          }

          // REGLA CLAVE SOLICITADA POR EL USUARIO:
          // Si es FACTURA -> Agrega el IGV (+18%)
          // Si NO es factura -> NO agrega IGV (Total = Costo)
          let montoIgv = 0;
          let totalFinal = costoNum;

          if (esFactura) {
            montoIgv = Math.round((costoNum * 0.18) * 100) / 100;
            totalFinal = Math.round((costoNum + montoIgv) * 100) / 100;
          } else {
            montoIgv = 0;
            totalFinal = Math.round(costoNum * 100) / 100;
          }

          // Validación de fila
          let isValid = true;
          let validationError = '';

          if (costoNum <= 0) {
            isValid = false;
            validationError = 'El costo debe ser mayor a 0.';
          } else if (!rawConcepto && !rawNumero) {
            isValid = false;
            validationError = 'Falta descripción o concepto del gasto.';
          }

          const esGastoAdicional = rawAdic === 'si' || rawAdic === 'sí' || rawAdic === 'true' || rawAdic === '1';

          items.push({
            id: `excel-row-${r}-${Date.now()}`,
            filaExcel: r + 1,
            fechaEmision: parseExcelDate(rawFecha),
            tipoComprobante: tipoComprobanteNormalized,
            esFactura,
            numeroComprobante: rawNumero || 'S/N',
            concepto: rawConcepto || `Gasto de producción (${tipoComprobanteNormalized})`,
            areaResponsable: rawResponsable || 'Producción',
            costoBase: costoNum,
            montoIgv,
            total: totalFinal,
            esGastoAdicional,
            motivoAdicional: rawMotivo,
            isValid,
            validationError
          });
        }

        if (items.length === 0) {
          throw new Error('No se encontraron registros de gastos válidos en el archivo Excel.');
        }

        const totalCostoBase = items.reduce((sum, it) => sum + it.costoBase, 0);
        const totalIgv = items.reduce((sum, it) => sum + it.montoIgv, 0);
        const totalGeneral = items.reduce((sum, it) => sum + it.total, 0);
        const facturasCount = items.filter(it => it.esFactura).length;
        const noFacturasCount = items.length - facturasCount;

        resolve({
          items,
          totalCostoBase: Number(totalCostoBase.toFixed(2)),
          totalIgv: Number(totalIgv.toFixed(2)),
          totalGeneral: Number(totalGeneral.toFixed(2)),
          facturasCount,
          noFacturasCount,
          errors
        });
      } catch (err: any) {
        reject(err);
      }
    };

    reader.onerror = () => {
      reject(new Error('Error al leer el archivo Excel en el navegador.'));
    };

    reader.readAsArrayBuffer(file);
  });
};

