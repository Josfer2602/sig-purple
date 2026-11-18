import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Actualizando documentos de proveedores...');
  const result = await prisma.proveedor.updateMany({
    where: {
      tipoDocumento: 'RUC'
    },
    data: {
      tipoDocumento: 'Factura'
    }
  });
  console.log(`✅ Actualizados ${result.count} proveedores.`);
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
