const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const logPath = 'C:/Users/josen/.gemini/antigravity/brain/639bbd39-811e-4a11-8e5c-cdad93e456dd/.system_generated/tasks/task-4013.log';
const content = fs.readFileSync(logPath, 'utf8');

async function linkExisting() {
  const fileLines = content.split('\n').filter(l => l.includes('📄 ') && l.includes('ID: '));
  let updatedOrders = 0;
  let updatedPagos = 0;

  for (const line of fileLines) {
    const idMatch = line.match(/ID: ([a-zA-Z0-9_-]+)/);
    const driveId = idMatch ? idMatch[1] : null;
    if (!driveId) continue;

    const webViewLink = `https://drive.google.com/file/d/${driveId}/view?usp=drivesdk`;

    const ocMatch = line.match(/(OC|OS)-[\w-]+/);
    if (ocMatch) {
      const ocId = ocMatch[0];
      const ord = await prisma.orden.findUnique({ where: { id: ocId } });
      if (ord && !ord.pdfUrl) {
        await prisma.orden.update({
          where: { id: ocId },
          data: { pdfUrl: webViewLink, driveFileId: driveId }
        });
        updatedOrders++;
      }
    }

    const pagMatch = line.match(/PAG-[\w-]+/);
    if (pagMatch) {
      const pagId = pagMatch[0];
      const p = await prisma.pago.findUnique({ where: { id: pagId } });
      if (p && !p.pdfUrl) {
        await prisma.pago.update({
          where: { id: pagId },
          data: { pdfUrl: webViewLink, driveFileId: driveId }
        });
        updatedPagos++;
      }
    }
  }

  const [totalOrd, withPdfOrd, totalPag, withPdfPag] = await Promise.all([
    prisma.orden.count(),
    prisma.orden.count({ where: { pdfUrl: { not: null } } }),
    prisma.pago.count(),
    prisma.pago.count({ where: { pdfUrl: { not: null } } })
  ]);

  console.log(`ORDENES EN BD VINCULADAS: ${withPdfOrd} de ${totalOrd} (${Math.round((withPdfOrd/totalOrd)*100)}%)`);
  console.log(`PAGOS EN BD VINCULADOS:    ${withPdfPag} de ${totalPag} (${Math.round((withPdfPag/totalPag)*100)}%)`);
  process.exit(0);
}

linkExisting();

