const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  const updated = await prisma.pago.update({
    where: { id: 'PAG-2026-4297' },
    data: {
      monto: 135.70
    }
  });
  console.log('Pago actualizado con éxito:', updated);
  await prisma.$disconnect();
}

fix().catch(console.error);

