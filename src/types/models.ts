export interface ContactoCliente {
  id?: string;
  clienteId?: string;
  nombre: string;
  cargo?: string;
  email?: string;
  telefono?: string;
  esPrincipal?: boolean;
}

export interface Cliente {
  id: string;
  empresa: string;
  contacto: string;
  cargo?: string;
  email: string;
  telefono: string;
  estado: string;
  contactos?: ContactoCliente[];
}

export interface Proyecto {
  id: string;
  fechaRegistro: string;
  fechaAprobacion?: string;
  fechaEstado?: string;
  nombre: string;
  clienteId: string;
  tipoServicio: string;
  tipoProyecto: string;
  presupuestoEstimado?: string;
  subtotal: number;
  moneda?: 'PEN' | 'USD' | string;
  estado: 'PENDIENTE CP' | 'PENDIENTE MP' | 'PENDIENTE LP' | 'APROBADO' | 'RECHAZADO' | 'EN EJECUCIÓN' | 'FINALIZADO' | 'Registrado' | 'Cotización Enviada' | 'Aprobado' | 'Rechazado' | 'En Ejecución' | 'Finalizado' | 'CP' | 'MP' | 'LP' | string;
  ordenesCompra?: string;
  ordenesServicio?: string;
  projectManager?: string;
  statusActividad?: string;
  comentarios?: string;
  gastosAdicionales?: number;
  gastosAdicionalesNota?: string;
  driveFolderId?: string;
  driveFolderUrl?: string;
  facturasCliente?: FacturaCliente[];
  contactoId?: string;
  contactoNombre?: string;
  contactoCargo?: string;
  contactoEmail?: string;
  contactoTelefono?: string;
}

export interface FacturaCliente {
  id: string;
  proyectoId: string;
  tipoOrden: string; // 'OC' o 'OS'
  numeroOrden: string;
  fechaGeneracionOrden: string;
  condicionPago: string;
  numeroFactura: string;
  fechaEmision: string;
  diasPago: number;
  porcentajeFacturacion?: number; // % facturado del subtotal del proyecto (ej: 50, 100, 30, etc.)
  montoSinIgv: number;
  igv: number;
  montoConIgv: number;
  aplicaDetraccion: boolean;
  aplicaRetencion: boolean;
  importeRecibido: number;
  fechaPago: string | null;
  pagoImpuestos: boolean;
  estado: string; // Pendiente, Pagado Parcial, Pagado
  comprobanteUrl?: string;
  comprobantePagoUrl?: string;
}

export interface CuentaBancaria {
  id: string;
  banco: string;
  numeroCuenta: string;
  cci: string;
  tipoCuenta?: string;
}

export interface ProveedorDocumento {
  id: string;
  name: string;
  url: string;
  tipo: 'Brochure' | 'Catálogo' | 'Referencia' | 'Otro';
  fecha?: string;
  size?: number;
}

export interface Proveedor {
  id: string;
  razonSocial: string;
  nombre: string;
  ruc: string;
  correo: string;
  telefono: string;
  tipoDocumento: 'Factura' | 'Recibo por Honorarios' | string;
  categoria?: string;
  categorias?: string[];
  subcategorias?: string[];
  tags?: string[];
  web?: string;
  ciudad?: string;
  tipoProveedor?: 'Trabajado' | 'Brochure' | string;
  esConfiable?: boolean;
  motivoNoConfiable?: string;
  documentos?: string;
  documentosList?: ProveedorDocumento[];
  servicios?: string;
  direccion?: string;
  driveFolderId?: string;
  driveFolderUrl?: string;
  cuentas: CuentaBancaria[];
}

export interface OrdenSubItem {
  id: string;
  ordenId: string;
  quoteSubItemId: string;
  name: string;
  quantity: number;
  unitCost: number;
  total: number;
  customDescription?: string;
  costPercentage?: number;
}

export interface Orden {
  id: string;
  proveedorId: string;
  clienteId: string;
  proyectoId: string;
  quoteId: string;
  items: OrdenSubItem[];
  fechaEmision: string;
  total: number;
  estadoEntrega: 'Pendiente' | 'En Proceso' | 'Recibido';
  condicionesPago?: string;
  tipoOrden?: 'Compra' | 'Servicio';
  cuentaBancariaId?: string;
  titulo?: string;
  pdfUrl?: string;
  driveFileId?: string;
  cotizacionProveedorUrl?: string;
  cotizacionProveedorName?: string;
  aplicaDetraccion?: boolean;
  porcentajeDetraccion?: number;
  montoDetraccion?: number;
  montoNeto?: number;
}

export interface ProjectGantt {
  id: string;
  projectId: string;
  version: number;
  status: string;
  name?: string;
  shareToken: string;
  tasks: GanttTask[];
}

export interface GanttTask {
  id: string;
  ganttId: string;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
  dependencies: string; // Comma separated IDs
  type: string; // "task", "milestone", "project"
  assignee?: string;
}

export interface Pago {
  id: string;
  clienteId: string;
  proyectoId: string;
  quoteId: string;
  ordenId: string;
  proveedorId: string;
  tipoPago: 'Adelanto' | 'Restante' | string;
  monto: number;
  numeroComprobante: string;
  comprobanteUrl?: string;
  comprobanteDeposito?: string;
  fechaRegistro: string;
  fechaPago: string;
  estado: 'Pendiente' | 'Pagado' | 'Rechazado' | string;
  concepto?: string;
  cuentaBancaria?: string;
  comentarios?: string;
  notas?: string;
  pdfUrl?: string;
  driveFileId?: string;
  aplicaDetraccion?: boolean;
  porcentajeDetraccion?: number;
  montoDetraccion?: number;
  montoNeto?: number;
}

export interface ListasDinamicas {
  tipoServicio: string[];
  tipoProyecto: string[];
  estadoProyecto: string[];
  estadoCotizacion: string[];
  estadoOrdenEntrega: string[];
  estadoOrdenPago: string[];
  estadoPagoProveedor: string[];
  categoriasProveedor?: string[];
  subcategoriasProveedor?: string[];
  tagsProveedor?: string[];
  condicionesPagoOrden?: string[];
  plantillasVisualConfig?: {
    ordenVisual?: any;
    pagoVisual?: any;
  };
}

export interface AppConfig {
  id: string;
  headerHtml?: string;
  footerHtml?: string;
  ordenHeaderHtml?: string;
  ordenFooterHtml?: string;
  pagoHeaderHtml?: string;
  pagoFooterHtml?: string;
  listasDinamicas?: string; // JSON string
  notificacionPagosEmails?: string;
  notificacionPagosSubject?: string;
  notificacionPagosTemplate?: string;
  habilitarNotificacionPagos?: boolean;
  notificarProveedorPago?: boolean;
}

export interface GastoProduccionItem {
  id: string;
  gastoId: string;
  quoteSubItemId: string;
  name: string;
  costPercentage: number;
  monto: number;
}

export interface GastoProduccion {
  id: string;
  clienteId: string;
  proyectoId: string;
  quoteId: string;
  tipoComprobante: string;
  numeroComprobante: string;
  comprobanteUrl?: string;
  fechaEmision: string;
  total: number;
  montoBase?: number;
  montoIgv?: number;
  estadoGasto: string;
  areaResponsable: string;
  comprobanteDevolucionUrl?: string;
  fechaDevolucion?: string;
  codigoDevolucion?: string;
  esGastoAdicional?: boolean;
  motivoAdicional?: string;
  items: GastoProduccionItem[];
}

export interface User {
  id: string;
  email: string;
  role: string;
  nombre?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  createdAt?: string;
}


export interface BookMediaItem {
  id: string;
  url: string;
  filename: string;
  mediaType: 'image' | 'video';
  mimeType?: string;
  caption?: string;
  width?: number;
  height?: number;
}

export interface BookSlide {
  id?: string;
  bookId?: string;
  tipo: 'section' | 'item' | string;
  titulo: string;
  subtitulo?: string | null;
  itemsJson?: string;
  items?: BookMediaItem[];
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectBook {
  id: string;
  proyectoId: string;
  proyecto?: Proyecto & { cliente?: Cliente | null };
  nombre: string;
  tipoPresentacion: 'book' | 'reporte' | string;
  clienteNombre?: string | null;
  requerimiento?: string | null;
  fechaActivacion?: string | null;
  clientLogoUrl?: string | null;
  includeCover: boolean;
  includeGeneralData: boolean;
  includeClosing: boolean;
  shareToken?: string;
  slides: BookSlide[];
  createdAt?: string;
  updatedAt?: string;
}
