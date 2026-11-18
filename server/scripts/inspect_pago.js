const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const pago = await prisma.pago.findUnique({
    where: { id: 'PAG-2026-4297' },
    include: {
      orden: {
        include: {
          items: true,
          proveedor: true
        }
      },
      proveedor: true,
      proyecto: true
    }
  });

  console.log('PAGO DETAILS:');
  console.log(JSON.stringify(pago, null, 2));

  if (pago && pago.ordenId) {
    const orden = await prisma.orden.findUnique({
      where: { id: pago.ordenId },
      include: {
        pagos: true,
        items: true
      }
    });
    console.log('\nORDEN DETAILS:');
    console.log(JSON.stringify(orden, null, 2));
  }

  await prisma.$disconnect();
}

run().catch(console.error);

