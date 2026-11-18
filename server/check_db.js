const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const clientes = await prisma.cliente.findMany({ select: { id: true, empresa: true } });
  const proyectos = await prisma.proyecto.findMany({
    select: { id: true, nombre: true, estado: true, subtotal: true, fechaRegistro: true, cliente: { select: { empresa: true } } }
  });
  const facturas = await prisma.facturaCliente.findMany({
    select: { id: true, numeroFactura: true, numeroOrden: true, montoSinIgv: true, montoConIgv: true, estado: true, proyecto: { select: { nombre: true } } }
  });
  const quotes = await prisma.quote.findMany({
    select: { id: true, client: true, requirement: true, status: true, version: true }
  });
  const ordenes = await prisma.orden.findMany({
    select: { id: true, total: true, estadoEntrega: true, tipoOrden: true }
  });
  const pagos = await prisma.pago.findMany({
    select: { id: true, monto: true, estado: true, tipoPago: true }
  });

  console.log('=== CLIENTES EN BD (' + clientes.length + ') ===');
  clientes.forEach(c => console.log(' - [' + c.id + '] ' + c.empresa));

  console.log('\n=== PROYECTOS EN BD (' + proyectos.length + ') ===');
  proyectos.forEach(p => console.log(' - [' + p.id + '] ' + p.cliente.empresa + ' -> ' + p.nombre + ' | Subtotal: ' + p.subtotal + ' | Estado: ' + p.estado));

  console.log('\n=== FACTURAS CLIENTE EN BD (' + facturas.length + ') ===');
  facturas.forEach(f => console.log(' - Factura: ' + f.numeroFactura + ' | Orden: ' + f.numeroOrden + ' | Proy: ' + f.proyecto.nombre + ' | S/: ' + f.montoSinIgv + ' | Estado: ' + f.estado));

  console.log('\n=== COTIZACIONES (' + quotes.length + ') ===');
  quotes.forEach(q => console.log(' - [' + q.id + '] ' + q.client + ' -> ' + q.requirement + ' | ' + q.status));

  console.log('\n=== ORDENES (' + ordenes.length + ') ===');
  ordenes.forEach(o => console.log(' - [' + o.id + '] Total: ' + o.total + ' | Tipo: ' + o.tipoOrden + ' | Estado: ' + o.estadoEntrega));

  console.log('\n=== PAGOS (' + pagos.length + ') ===');
  pagos.forEach(p => console.log(' - [' + p.id + '] Monto: ' + p.monto + ' | Estado: ' + p.estado));
}

main().catch(console.error).finally(() => prisma.$disconnect());
