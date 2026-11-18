const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function showCuentas() {
  const cuentas = await prisma.cuentaBancaria.findMany({
    take: 20
  });
  console.log('Sample cuentas:', JSON.stringify(cuentas, null, 2));

  const bnCuentas = await prisma.cuentaBancaria.findMany({
    where: {
      OR: [
        { banco: { contains: 'Nación', mode: 'insensitive' } },
        { banco: { contains: 'Nacion', mode: 'insensitive' } },
        { tipoCuenta: { contains: 'Detracción', mode: 'insensitive' } },
        { tipoCuenta: { contains: 'Detraccion', mode: 'insensitive' } }
      ]
    }
  });
  console.log('Cuentas Banco de la Nacion / Detracciones:', bnCuentas.length);
  if (bnCuentas.length > 0) {
    console.log(JSON.stringify(bnCuentas.slice(0, 5), null, 2));
  }
  await prisma.$disconnect();
}

showCuentas().catch(console.error);

