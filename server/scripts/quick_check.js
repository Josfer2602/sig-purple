const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const [totalOrd, withPdfOrd, totalPag, withPdfPag] = await Promise.all([
    prisma.orden.count(),
    prisma.orden.count({ where: { pdfUrl: { not: null } } }),
    prisma.pago.count(),
    prisma.pago.count({ where: { pdfUrl: { not: null } } })
  ]);
  console.log(`ORDENES_TOTAL: ${totalOrd}`);
  console.log(`ORDENES_CON_PDF: ${withPdfOrd}`);
  console.log(`PAGOS_TOTAL: ${totalPag}`);
  console.log(`PAGOS_CON_PDF: ${withPdfPag}`);
  process.exit(0);
}
run();

