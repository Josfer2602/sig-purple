const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
  const jsonPath = 'C:/Users/josen/.gemini/antigravity/brain/9a06be32-e8a7-4f37-b8b3-f0e88f2a68b2/scratch/import_data.json';
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  console.log(`Loaded ${data.length} records to import into PostgreSQL...`);

  // 1. Process Clientes
  const clienteMap = new Map(); // clientName -> clienteId

  for (const item of data) {
    const clientName = item.cliente || 'CLIENTE GENERAL';
    const clientKey = clientName.trim().toLowerCase();

    if (!clienteMap.has(clientKey)) {
      let existing = await prisma.cliente.findFirst({
        where: { empresa: { equals: clientName, mode: 'insensitive' } }
      });

      if (!existing) {
        existing = await prisma.cliente.create({
          data: {
            empresa: clientName,
            contacto: item.contacto || 'Contacto Principal',
            email: `contacto@${clientName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
            telefono: 'S/N',
            estado: 'Activo'
          }
        });
      }
      clienteMap.set(clientKey, existing.id);
    }
  }
  console.log(`Clientes synchronized: ${clienteMap.size} unique clients.`);

  // 2. Process Proyectos & Facturas
  let projectCount = 0;
  let facturaCount = 0;

  for (const item of data) {
    const clientName = item.cliente || 'CLIENTE GENERAL';
    const clienteId = clienteMap.get(clientName.trim().toLowerCase());

    const proyecto = await prisma.proyecto.create({
      data: {
        fechaRegistro: item.fechaPropuesta || new Date().toISOString().split('T')[0],
        fechaAprobacion: item.fechaEstado || null,
        nombre: item.actividad || 'Proyecto Sin Nombre',
        clienteId: clienteId,
        tipoServicio: item.servicio || 'PURPLE VISIBILITY',
        tipoProyecto: item.tipoServicio || 'INDIVIDUAL',
        subtotal: item.subtotal || 0,
        estado: item.estado,
        ordenesCompra: item.nroOrdenCompra || (item.ordenCompraStatus ? item.ordenCompraStatus : null),
        projectManager: item.pm || null,
        statusActividad: item.statusActividad || null,
        comentarios: item.comentarios || null
      }
    });
    projectCount++;

    // 3. Process FacturaCliente if approved or has invoice details
    const hasInvoiceNumber = item.nroFactura && item.nroFactura.length > 0;
    const isFacturado = item.facturadoStatus === 'OK' || item.facturadoStatus === 'PENDIENTE';

    if (item.estado === 'Ganado' || hasInvoiceNumber || isFacturado) {
      const montoSinIgv = item.subtotal || 0;
      const igv = Math.round(montoSinIgv * 0.18 * 100) / 100;
      const montoConIgv = Math.round((montoSinIgv + igv) * 100) / 100;

      const aplicaDetraccion = montoConIgv > 700;
      const aplicaRetencion = false;

      const numFactura = hasInvoiceNumber ? item.nroFactura : `F001-${String(facturaCount + 1).padStart(5, '0')}`;

      let estadoFactura = 'Pendiente';
      let importeRecibido = 0;
      if (item.facturadoStatus === 'OK' && item.fechaEstPago && item.fechaEstPago !== 'NO APLICA') {
        estadoFactura = 'Pagado';
        importeRecibido = montoConIgv;
      }

      await prisma.facturaCliente.create({
        data: {
          proyectoId: proyecto.id,
          tipoOrden: item.nroOrdenCompra ? 'OC' : 'OS',
          numeroOrden: item.nroOrdenCompra || 'S/N',
          fechaGeneracionOrden: item.fechaPropuesta || new Date().toISOString().split('T')[0],
          condicionPago: item.tipoCredito || '30 DÍAS CRÉDITO',
          numeroFactura: numFactura,
          fechaEmision: item.fechaFacturacion || item.fechaPropuesta || new Date().toISOString().split('T')[0],
          diasPago: item.diasCredito || 30,
          montoSinIgv: montoSinIgv,
          igv: igv,
          montoConIgv: montoConIgv,
          aplicaDetraccion: aplicaDetraccion,
          aplicaRetencion: aplicaRetencion,
          importeRecibido: importeRecibido,
          fechaPago: item.fechaEstPago && item.fechaEstPago !== 'NO APLICA' ? item.fechaEstPago : null,
          pagoImpuestos: false,
          estado: estadoFactura
        }
      });
      facturaCount++;
    }
  }

  console.log(`\n=== IMPORT COMPLETE ===`);
  console.log(`- Proyectos imported: ${projectCount}`);
  console.log(`- Facturas Cliente created: ${facturaCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
