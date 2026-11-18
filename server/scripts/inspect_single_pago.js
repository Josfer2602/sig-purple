const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspect() {
  const p = await prisma.pago.findUnique({
    where: { id: 'PAG-2026-4297' },
    include: { orden: true }
  });
  console.log('Pago:', p);
  await prisma.$disconnect();
}
inspect();

