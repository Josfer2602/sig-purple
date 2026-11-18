const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function createTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIG Purple BTL';
  workbook.created = new Date();

  const PURPLE_HEADER_FILL = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF662D91' }
  };

  const HEADER_FONT = {
    name: 'Segoe UI',
    size: 11,
    bold: true,
    color: { argb: 'FFFFFFFF' }
  };

  const BORDER_STYLE = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
  };

  function styleHeaders(sheet, columns) {
    sheet.columns = columns;
    const headerRow = sheet.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.fill = PURPLE_HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF512374' } },
        bottom: { style: 'medium', color: { argb: 'FF512374' } }
      };
    });
  }

  function applyBordersAndFonts(sheet) {
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.height = 22;
        row.eachCell((cell) => {
          cell.font = { name: 'Segoe UI', size: 10 };
          cell.border = BORDER_STYLE;
          cell.alignment = { vertical: 'middle' };
        });
      }
    });
  }

  // ==========================================
  // 1. HOJA: CLIENTES
  // ==========================================
  const wsClientes = workbook.addWorksheet('1. Clientes', { properties: { tabColor: { argb: 'FF7C3AED' } } });
  styleHeaders(wsClientes, [
    { header: 'Empresa / Razón Social (*)', key: 'empresa', width: 35 },
    { header: 'RUC (11 dígitos)', key: 'ruc', width: 18 },
    { header: 'Contacto Principal', key: 'contacto', width: 28 },
    { header: 'Correo Electrónico', key: 'email', width: 30 },
    { header: 'Teléfono / Celular', key: 'telefono', width: 20 },
    { header: 'Estado (Activo / Inactivo)', key: 'estado', width: 22 }
  ]);

  wsClientes.addRow({ empresa: 'Cencosud Retail Perú S.A.', ruc: '20109072177', contacto: 'Mariana Flores', email: 'mflores@cencosud.com.pe', telefono: '987654321', estado: 'Activo' });
  wsClientes.addRow({ empresa: 'Alicorp S.A.A.', ruc: '20100055237', contacto: 'Carlos Mendoza', email: 'cmendoza@alicorp.com.pe', telefono: '998877665', estado: 'Activo' });
  wsClientes.addRow({ empresa: 'InRetail Pharma S.A. (Inkafarma)', ruc: '20338788647', contacto: 'Lucía Benavides', email: 'lbenavides@inkafarma.pe', telefono: '955443322', estado: 'Activo' });
  applyBordersAndFonts(wsClientes);

  // ==========================================
  // 2. HOJA: PROVEEDORES
  // ==========================================
  const wsProveedores = workbook.addWorksheet('2. Proveedores', { properties: { tabColor: { argb: 'FF2563EB' } } });
  styleHeaders(wsProveedores, [
    { header: 'Razón Social (*)', key: 'razonSocial', width: 35 },
    { header: 'Nombre Comercial', key: 'nombre', width: 28 },
    { header: 'RUC (11 dígitos) (*)', key: 'ruc', width: 18 },
    { header: 'Categoría de Servicio', key: 'categoria', width: 24 },
    { header: 'Tipo Documento', key: 'tipoDocumento', width: 20 },
    { header: 'Correo', key: 'correo', width: 28 },
    { header: 'Teléfono', key: 'telefono', width: 18 },
    { header: 'Ciudad', key: 'ciudad', width: 16 },
    { header: 'Tipo Proveedor', key: 'tipoProveedor', width: 18 },
    { header: 'Es Confiable (SI / NO)', key: 'esConfiable', width: 20 },
    { header: 'Banco', key: 'banco', width: 18 },
    { header: 'Número de Cuenta', key: 'numeroCuenta', width: 25 },
    { header: 'CCI (20 dígitos)', key: 'cci', width: 26 },
    { header: 'Tipo Cuenta', key: 'tipoCuenta', width: 18 }
  ]);

  wsProveedores.addRow({
    razonSocial: 'Grafica Publicitaria Express S.A.C.',
    nombre: 'Grafix BTL',
    ruc: '20556677881',
    categoria: 'Imprenta y Gigantografías',
    tipoDocumento: 'Factura',
    correo: 'ventas@grafixbtl.pe',
    telefono: '987112233',
    ciudad: 'Lima',
    tipoProveedor: 'Trabajado',
    esConfiable: 'SI',
    banco: 'BCP',
    numeroCuenta: '191-23456789-0-12',
    cci: '002-191-002345678901-23',
    tipoCuenta: 'Corriente Soles'
  });
  wsProveedores.addRow({
    razonSocial: 'Eventos & Estructuras Pro E.I.R.L.',
    nombre: 'Estructuras Pro',
    ruc: '20601234567',
    categoria: 'Estructuras y Escenarios',
    tipoDocumento: 'Factura',
    correo: 'contacto@estructuraspro.pe',
    telefono: '994556677',
    ciudad: 'Lima',
    tipoProveedor: 'Trabajado',
    esConfiable: 'SI',
    banco: 'BBVA',
    numeroCuenta: '0011-0123-0100045678',
    cci: '011-123-000100045678-90',
    tipoCuenta: 'Corriente Soles'
  });
  applyBordersAndFonts(wsProveedores);

  // ==========================================
  // 3. HOJA: PROYECTOS
  // ==========================================
  const wsProyectos = workbook.addWorksheet('3. Proyectos', { properties: { tabColor: { argb: 'FF10B981' } } });
  styleHeaders(wsProyectos, [
    { header: 'Código Proyecto (Opcional)', key: 'codigo', width: 22 },
    { header: 'Nombre del Proyecto / Campaña (*)', key: 'nombre', width: 38 },
    { header: 'Empresa Cliente (Igual a Hoja Clientes) (*)', key: 'cliente', width: 35 },
    { header: 'Fecha Registro (DD/MM/AAAA)', key: 'fechaRegistro', width: 24 },
    { header: 'Fecha Aprobación (DD/MM/AAAA)', key: 'fechaAprobacion', width: 24 },
    { header: 'Tipo de Servicio (*)', key: 'tipoServicio', width: 28 },
    { header: 'Tipo de Proyecto (*)', key: 'tipoProyecto', width: 20 },
    { header: 'Project Manager / Ejecutivo', key: 'pm', width: 26 },
    { header: 'Subtotal Venta sin IGV (S/.) (*)', key: 'subtotal', width: 26 },
    { header: 'Presupuesto Estimado (S/.)', key: 'presupuesto', width: 24 },
    { header: 'Estado (*)', key: 'estado', width: 20 },
    { header: 'Comentarios / Notas', key: 'comentarios', width: 35 }
  ]);

  wsProyectos.addRow({
    codigo: 'PRJ-2024-001',
    nombre: 'Activación Verano Wong Boulevard 2024',
    cliente: 'Cencosud Retail Perú S.A.',
    fechaRegistro: '15/01/2024',
    fechaAprobacion: '20/01/2024',
    tipoServicio: 'Purple Impulse & Promotion',
    tipoProyecto: 'Individual',
    pm: 'Fiorella Ramos',
    subtotal: 45000.00,
    presupuesto: 45000.00,
    estado: 'Cerrado',
    comentarios: 'Campaña culminada con liquidación conforme'
  });
  wsProyectos.addRow({
    codigo: 'PRJ-2024-002',
    nombre: 'Lanzamiento Nueva Línea Primor 2024',
    cliente: 'Alicorp S.A.A.',
    fechaRegistro: '05/03/2024',
    fechaAprobacion: '12/03/2024',
    tipoServicio: 'Purple Events',
    tipoProyecto: 'Individual',
    pm: 'Renato Silva',
    subtotal: 68500.00,
    presupuesto: 70000.00,
    estado: 'Cerrado',
    comentarios: 'Producción y streaming integral'
  });

  // Formato moneda en columna subtotal y presupuesto
  wsProyectos.getColumn('subtotal').numFmt = '"S/ "#,##0.00';
  wsProyectos.getColumn('presupuesto').numFmt = '"S/ "#,##0.00';
  applyBordersAndFonts(wsProyectos);

  // ==========================================
  // 4. HOJA: FACTURACION_CLIENTES
  // ==========================================
  const wsFacturacion = workbook.addWorksheet('4. Facturación', { properties: { tabColor: { argb: 'FFF59E0B' } } });
  styleHeaders(wsFacturacion, [
    { header: 'Nombre Proyecto (Igual a Hoja Proyectos) (*)', key: 'proyecto', width: 38 },
    { header: 'Tipo Orden (OC / OS)', key: 'tipoOrden', width: 18 },
    { header: 'N° Orden Cliente', key: 'numOrden', width: 20 },
    { header: 'Fecha Orden (DD/MM/AAAA)', key: 'fechaOrden', width: 22 },
    { header: 'N° Factura Emitida (*)', key: 'numFactura', width: 22 },
    { header: 'Fecha Emisión (DD/MM/AAAA) (*)', key: 'fechaEmision', width: 24 },
    { header: 'Condición de Pago', key: 'condicionPago', width: 22 },
    { header: 'Días Crédito', key: 'diasPago', width: 16 },
    { header: 'Monto sin IGV (S/.) (*)', key: 'montoSinIgv', width: 24 },
    { header: 'IGV 18% (S/.)', key: 'igv', width: 18 },
    { header: 'Total Facturado con IGV (S/.)', key: 'montoConIgv', width: 26 },
    { header: 'Aplica Detracción (SI/NO)', key: 'aplicaDetraccion', width: 22 },
    { header: 'Aplica Retención (SI/NO)', key: 'aplicaRetencion', width: 22 },
    { header: 'Monto Cobrado (S/.)', key: 'importeRecibido', width: 22 },
    { header: 'Fecha de Cobro / Pago', key: 'fechaPago', width: 22 },
    { header: 'Estado Factura', key: 'estado', width: 18 },
    { header: '% Facturado del Proyecto', key: 'porcentaje', width: 24 }
  ]);

  wsFacturacion.addRow({
    proyecto: 'Activación Verano Wong Boulevard 2024',
    tipoOrden: 'OC',
    numOrden: 'OC-45009812',
    fechaOrden: '18/01/2024',
    numFactura: 'F001-000452',
    fechaEmision: '25/01/2024',
    condicionPago: 'Crédito 30 días',
    diasPago: 30,
    montoSinIgv: 45000.00,
    igv: 8100.00,
    montoConIgv: 53100.00,
    aplicaDetraccion: 'SI',
    aplicaRetencion: 'NO',
    importeRecibido: 53100.00,
    fechaPago: '28/02/2024',
    estado: 'Pagado',
    porcentaje: 100
  });

  wsFacturacion.addRow({
    proyecto: 'Lanzamiento Nueva Línea Primor 2024',
    tipoOrden: 'OS',
    numOrden: 'OS-889921',
    fechaOrden: '10/03/2024',
    numFactura: 'F001-000489',
    fechaEmision: '15/03/2024',
    condicionPago: 'Crédito 45 días',
    diasPago: 45,
    montoSinIgv: 68500.00,
    igv: 12330.00,
    montoConIgv: 80830.00,
    aplicaDetraccion: 'SI',
    aplicaRetencion: 'NO',
    importeRecibido: 80830.00,
    fechaPago: '02/05/2024',
    estado: 'Pagado',
    porcentaje: 100
  });

  wsFacturacion.getColumn('montoSinIgv').numFmt = '"S/ "#,##0.00';
  wsFacturacion.getColumn('igv').numFmt = '"S/ "#,##0.00';
  wsFacturacion.getColumn('montoConIgv').numFmt = '"S/ "#,##0.00';
  wsFacturacion.getColumn('importeRecibido').numFmt = '"S/ "#,##0.00';
  wsFacturacion.getColumn('porcentaje').numFmt = '0"%"';
  applyBordersAndFonts(wsFacturacion);

  // ==========================================
  // 5. HOJA: INSTRUCCIONES
  // ==========================================
  const wsGuia = workbook.addWorksheet('0. Instrucciones', { properties: { tabColor: { argb: 'FFEC4899' } } });
  wsGuia.columns = [
    { header: 'SECCIÓN', key: 'sec', width: 25 },
    { header: 'REGLA DE LLENADO / DESCRIPCIÓN', key: 'desc', width: 85 }
  ];

  const guideRow = wsGuia.getRow(1);
  guideRow.height = 28;
  guideRow.eachCell((cell) => {
    cell.fill = PURPLE_HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const instructions = [
    ['Propósito', 'Esta plantilla oficial permite importar el historial completo de la agencia a SIG Purple BTL garantizando que quede como INFORMACIÓN HISTÓRICA PROTEGIDA (Solo lectura en tablas, pero sumando al 100% en KPIs, Dashboard y Finanzas).'],
    ['1. Clientes', 'Llena aquí la lista de marcas o clientes. La columna "Empresa / Razón Social" es la llave que conectará con los Proyectos.'],
    ['2. Proveedores', 'Registra todos los proveedores históricos con su RUC, categoría y cuentas bancarias (BCP, BBVA, Interbank, etc.) para tener su historial de pagos y compras listo.'],
    ['3. Proyectos', 'Cada fila representa una campaña o proyecto realizado. Asegúrate de que el campo "Empresa Cliente" coincida exactamente con el nombre de la empresa en la Hoja 1.'],
    ['4. Facturación', 'Contiene las facturas emitidas a los clientes por cada proyecto. El campo "Nombre Proyecto" debe coincidir con el nombre de la campaña de la Hoja 3.'],
    ['Campos Obligatorios (*)', 'Los campos marcados con asterisco (*) son esenciales para que el sistema vincule los registros y calcule los montos correctamente.'],
    ['Montos y Monedas', 'Todos los montos numéricos deben ingresarse en Soles (S/.) sin letras ni símbolos en la celda (el formato se aplica solo).'],
    ['Fechas', 'Usa formato estándar de fecha: DD/MM/AAAA (ej. 15/03/2024).'],
    ['Protección Automática', 'Al subir esta data mediante el importador, el sistema le asignará automáticamente el estado de Histórico Protegido contra modificaciones accidentales.']
  ];

  instructions.forEach(([sec, desc]) => {
    const row = wsGuia.addRow({ sec, desc });
    row.height = 26;
    row.getCell(1).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF662D91' } };
    row.getCell(2).font = { name: 'Segoe UI', size: 10 };
    row.getCell(1).alignment = { vertical: 'middle' };
    row.getCell(2).alignment = { vertical: 'middle', wrapText: true };
    row.getCell(1).border = BORDER_STYLE;
    row.getCell(2).border = BORDER_STYLE;
  });

  // Exportar archivos
  const publicPath = path.join(__dirname, '../public/Plantilla_Carga_Historica_PurpleBTL.xlsx');
  const rootPath = path.join(__dirname, '../Plantilla_Carga_Historica_PurpleBTL.xlsx');

  await workbook.xlsx.writeFile(publicPath);
  await workbook.xlsx.writeFile(rootPath);

  console.log(`✅ Plantilla Excel generada con éxito en:\n1. ${publicPath}\n2. ${rootPath}`);
}

createTemplate().catch(console.error);
