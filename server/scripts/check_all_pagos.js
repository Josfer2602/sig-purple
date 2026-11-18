const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPagos() {
  const pagos = await prisma.pago.findMany({
    include: {
      orden: true
    }
  });

  console.log(`Total pagos: ${pagos.length}`);
  pagos.forEach(p => {
    const ordTotal = p.orden ? p.orden.total : null;
    const cond = p.orden ? p.orden.condicionesPago : null;
    console.log(`Pago: ${p.id} | Tipo: ${p.tipoPago.padEnd(8)} | Monto Pago: ${p.monto.toFixed(2).padStart(8)} | Orden: ${p.ordenId} (Total: ${ordTotal ? ordTotal.toFixed(2) : '-'}) | Cond: ${cond || '-'}`);
  });

  await prisma.$disconnect();
}

checkPagos().catch(console.error);

