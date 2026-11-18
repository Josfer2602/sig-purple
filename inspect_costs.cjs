const { PrismaClient } = require('./server/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const proj = await prisma.proyecto.findFirst({
    where: { nombre: { contains: 'Stand' } }
  });
  console.log('--- PROYECTO ---');
  console.log({ id: proj?.id, nombre: proj?.nombre, subtotal: proj?.subtotal });

  if (proj) {
    const ords = await prisma.orden.findMany({
      where: { proyectoId: proj.id }
    });
    console.log('--- ORDENES ---');
    for (const o of ords) {
      console.log({
        id: o.id,
        tipoOrden: o.tipoOrden,
        total: o.total,
        proveedorId: o.proveedorId,
        items: o.items
      });
    }

    const gastos = await prisma.gastoProduccion.findMany({
      where: { proyectoId: proj.id }
    });
    console.log('--- GASTOS PRODUCCION ---');
    for (const g of gastos) {
      console.log({
        id: g.id,
        tipoComprobante: g.tipoComprobante,
        total: g.total,
        esGastoAdicional: g.esGastoAdicional
      });
    }
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
