/**
 * Helper para gestión, personalización visual y renderizado de plantillas HTML
 * para Órdenes de Compra/Servicio y Pagos a Proveedores.
 */

export interface DocumentTemplateVariables {
  tituloDocumento?: string;
  numeroDocumento?: string;
  fechaDocumento?: string;
  titulo?: string;
  proveedorNombre?: string;
  proveedorRuc?: string;
  clienteNombre?: string;
  proyectoNombre?: string;
  condicionesPago?: string;
  total?: string;
  moneda?: string;
}

export function replaceDocumentVariables(rawHtml: string, vars: DocumentTemplateVariables): string {
  if (!rawHtml) return '';
  const titulo = (vars.titulo || '').trim();

  let res = rawHtml
    .replace(/\{\{TITULO_DOCUMENTO\}\}/gi, vars.tituloDocumento || '')
    .replace(/\{\{NUMERO_DOCUMENTO\}\}/gi, vars.numeroDocumento || '')
    .replace(/\{\{FECHA_DOCUMENTO\}\}/gi, vars.fechaDocumento || '')
    .replace(/\{\{TITULO_ORDEN\}\}/gi, titulo)
    .replace(/\{\{TITULO_PAGO\}\}/gi, titulo)
    .replace(/\{\{TITULO\}\}/gi, titulo)
    .replace(/\{\{PROVEEDOR_NOMBRE\}\}/gi, vars.proveedorNombre || '')
    .replace(/\{\{PROVEEDOR_RUC\}\}/gi, vars.proveedorRuc || '')
    .replace(/\{\{PROYECTO_NOMBRE\}\}/gi, vars.proyectoNombre || '')
    .replace(/\{\{CLIENTE_NOMBRE\}\}/gi, vars.clienteNombre || '')
    .replace(/\{\{CONDICIONES_PAGO\}\}/gi, vars.condicionesPago || '')
    .replace(/\{\{TOTAL\}\}/gi, vars.total || '')
    .replace(/\{\{MONEDA\}\}/gi, vars.moneda || 'PEN');

  // Fallback regex for incomplete tags
  res = res.replace(/\{\{TITULO(_PAGO|_ORDEN)?\}?/gi, titulo);
  return res;
}

export interface VisualTemplateConfig {
  empresaNombre: string;
  empresaRuc: string;
  empresaDireccion: string;
  empresaContacto: string;
  logoUrl: string;
  accentColor: string;
  terminos: string[];
  mostrarFirmas: boolean;
  firmaIzquierda: string;
  cargoIzquierda: string;
  firmaDerecha: string;
  cargoDerecha: string;
}

export const DEFAULT_ORDEN_VISUAL_CONFIG: VisualTemplateConfig = {
  empresaNombre: 'PURPLE S.A.C.',
  empresaRuc: '20123456789',
  empresaDireccion: 'Calle Santa Isabel Nro. 236 Int. 602 Miraflores, Lima',
  empresaContacto: 'consultas@purplebtl.com | +51 (01) 234-5678',
  logoUrl: 'https://brandgeeks.pe/wp-content/uploads/2026/06/PurpleNEW-01-1-1.png',
  accentColor: '#7c3aed',
  terminos: [
    'Toda factura física o electrónica debe emitirse a nombre de PURPLE S.A.C. indicando el número de esta orden.',
    'Adjuntar a la factura los archivos XML y PDF, junto con la presente orden y la constancia de entrega a satisfacción.',
    'Los pagos se programan de acuerdo a las condiciones pactadas y se abonan directamente a la cuenta bancaria registrada del proveedor.',
    'Cualquier modificación en ítems, cantidades o costos deberá contar con una adenda u orden complementaria previa.'
  ],
  mostrarFirmas: true,
  firmaIzquierda: 'AUTORIZADO POR',
  cargoIzquierda: 'Administración y Operaciones - SIG Purple',
  firmaDerecha: 'RECIBIDO Y CONFORME',
  cargoDerecha: 'Firma y Sello - Proveedor'
};

export const DEFAULT_PAGO_VISUAL_CONFIG: VisualTemplateConfig = {
  empresaNombre: 'PURPLE S.A.C.',
  empresaRuc: '20123456789',
  empresaDireccion: 'Calle Santa Isabel Nro. 236 Int. 602 Miraflores, Lima',
  empresaContacto: 'consultas@purplebtl.com | +51 (01) 234-5678',
  logoUrl: 'https://brandgeeks.pe/wp-content/uploads/2026/06/PurpleNEW-01-1-1.png',
  accentColor: '#7c3aed',
  terminos: [
    'El presente formato certifica la programación o ejecución del pago correspondiente a la orden de compra/servicio vinculada.',
    'El abono se efectúa vía transferencia interbancaria a la cuenta bancaria informada por el proveedor.',
    'La constancia de transferencia emitida por la entidad bancaria sirve como constancia oficial de pago.',
    'Para cualquier duda o aclaración sobre detracciones o retenciones comunicarse con el área de Contabilidad.'
  ],
  mostrarFirmas: true,
  firmaIzquierda: 'PROCESADO POR',
  cargoIzquierda: 'Tesorería y Contabilidad - SIG Purple',
  firmaDerecha: 'CONFORMIDAD DE PAGO',
  cargoDerecha: 'Firma y Sello del Proveedor'
};

/**
 * Genera el HTML del encabezado a partir de la configuración visual
 */
export function buildHeaderHtmlFromVisual(cfg: VisualTemplateConfig): string {
  return `<div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${cfg.accentColor}; padding-bottom: 18px; margin-bottom: 24px; font-family: Arial, sans-serif;">
  <div style="max-width: 60%;">
    ${cfg.logoUrl ? `<img src="${cfg.logoUrl}" alt="${cfg.empresaNombre}" style="height: auto; max-height: 65px; max-width: 220px; object-fit: contain; margin-bottom: 10px; display: block;" />` : ''}
    <p style="margin: 2px 0; font-size: 11px; font-weight: bold; color: #1e293b;">${cfg.empresaNombre}</p>
    <p style="margin: 2px 0; font-size: 11px; color: #64748b;">RUC: ${cfg.empresaRuc}</p>
    <p style="margin: 2px 0; font-size: 11px; color: #64748b;">${cfg.empresaDireccion}</p>
    <p style="margin: 2px 0; font-size: 11px; color: #64748b;">${cfg.empresaContacto}</p>
  </div>
  <div style="text-align: right; min-width: 220px;">
    <div style="display: inline-block; background: ${cfg.accentColor}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 13px; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 6px;">
      {{TITULO_DOCUMENTO}}
    </div>
    <p style="margin: 4px 0; font-size: 16px; font-weight: 800; color: #1e293b;">N° {{NUMERO_DOCUMENTO}}</p>
    <p style="margin: 3px 0; font-size: 12px; color: #64748b;">Fecha: <strong style="color: #1e293b;">{{FECHA_DOCUMENTO}}</strong></p>
  </div>
</div>`;
}

/**
 * Genera el HTML del pie de página y términos a partir de la configuración visual
 */
export function buildFooterHtmlFromVisual(cfg: VisualTemplateConfig): string {
  const terminosHtml = cfg.terminos && cfg.terminos.length > 0
    ? `<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin-bottom: 24px;">
    <h4 style="margin: 0 0 8px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; font-weight: 700;">
      Términos y Condiciones Predeterminados:
    </h4>
    <ul style="margin: 0; padding-left: 18px; font-size: 11px; color: #64748b; line-height: 1.55;">
      ${cfg.terminos.map(t => `<li>${t}</li>`).join('\n      ')}
    </ul>
  </div>`
    : '';

  const firmasHtml = cfg.mostrarFirmas
    ? `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 36px; padding: 0 20px;">
    <div style="text-align: center; border-top: 1px solid #94a3b8; padding-top: 8px;">
      <p style="margin: 0; font-size: 11px; font-weight: bold; color: #1e293b;">${cfg.firmaIzquierda}</p>
      <p style="margin: 2px 0 0; font-size: 10px; color: #64748b;">${cfg.cargoIzquierda}</p>
    </div>
    <div style="text-align: center; border-top: 1px solid #94a3b8; padding-top: 8px;">
      <p style="margin: 0; font-size: 11px; font-weight: bold; color: #1e293b;">${cfg.firmaDerecha}</p>
      <p style="margin: 2px 0 0; font-size: 10px; color: #64748b;">${cfg.cargoDerecha}</p>
    </div>
  </div>`
    : '';

  return `<div style="margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 18px; font-family: Arial, sans-serif;">
  ${terminosHtml}
  ${firmasHtml}
</div>`;
}

// Datos de muestra realistas para la vista previa A4
export const SAMPLE_ORDEN_PREVIEW = {
  documentTitle: 'ORDEN DE COMPRA',
  documentNumber: 'OC-2026-0042',
  documentDate: '2026-10-22',
  concepto: 'Producción de Módulos BTL y Tótems para Campaña Verano 2026',
  proveedor: {
    razonSocial: 'SERVICIOS GRAFICOS & PRODUCCIÓN S.A.C.',
    ruc: '20608976541',
    direccion: 'Av. Las Industrias 850, Ate, Lima',
    correo: 'contacto@graficosyproduccion.pe',
    banco: 'BCP (Cuenta Corriente)',
    cuenta: '191-45678912-0-45',
    cci: '002-191-004567891204-56'
  },
  cliente: {
    empresa: 'CORPORACIÓN ALICORP S.A.',
    proyecto: 'Activación BTL Nacional 2026',
    condiciones: '50% Adelanto / 50% Saldo contra entrega'
  },
  items: [
    { descripcion: 'Fabricación de Tótem Publicitario 2.20m x 0.90m con iluminación LED y estructura metálica', cant: 3, unit: 1450.00, total: 4350.00 },
    { descripcion: 'Módulo de degustación en madera MDF con acabado poliuretano y brandeo completo', cant: 2, unit: 1800.00, total: 3600.00 },
    { descripcion: 'Servicio de traslado, instalación técnica y desmontaje en puntos de activación', cant: 1, unit: 950.00, total: 950.00 }
  ],
  subtotal: 8900.00,
  tieneIgv: true,
  igv: 1602.00,
  total: 10502.00,
  adelanto: 5251.00,
  saldo: 5251.00
};

export const SAMPLE_PAGO_PREVIEW = {
  documentTitle: 'PAGO A PROVEEDOR',
  documentNumber: 'PAG-2026-1941',
  documentDate: '2026-10-22',
  concepto: '50% Adelanto - Producción de Módulos BTL y Tótems Verano 2026',
  proveedor: {
    razonSocial: 'SERVICIOS GRAFICOS & PRODUCCIÓN S.A.C.',
    ruc: '20608976541',
    direccion: 'Av. Las Industrias 850, Ate, Lima',
    correo: 'contacto@graficosyproduccion.pe',
    banco: 'BCP (Cuenta Corriente)',
    cuenta: '191-45678912-0-45',
    cci: '002-191-004567891204-56'
  },
  cliente: {
    empresa: 'CORPORACIÓN ALICORP S.A.',
    proyecto: 'Activación BTL Nacional 2026',
    condiciones: '50% Adelanto / 50% Saldo'
  },
  ordenId: 'OC-2026-0042',
  tipoPago: 'Adelanto (50%)',
  numeroComprobante: 'Factura F001-000452',
  monto: 5251.00,
  total: 5251.00,
  montoSinIgv: 4450.00,
  igv: 801.00,
  totalOrden: 10502.00,
  saldoPendienteOrden: 5251.00
};
