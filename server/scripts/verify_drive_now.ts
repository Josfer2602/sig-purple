import { getDriveClient } from '../src/services/driveService';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const drive = await getDriveClient();
  const ordenes = await prisma.orden.findMany({ select: { id: true, pdfUrl: true, proyectoId: true, tipoOrden: true } });
  const pagos = await prisma.pago.findMany({ select: { id: true, pdfUrl: true, proyectoId: true } });

  console.log(`TOTAL ÓRDENES EN BD: ${ordenes.length}`);
  console.log(`Órdenes con pdfUrl en BD: ${ordenes.filter(o => o.pdfUrl).length}`);

  console.log(`TOTAL PAGOS EN BD: ${pagos.length}`);
  console.log(`Pagos con pdfUrl en BD: ${pagos.filter(p => p.pdfUrl).length}`);

  // Verificar un proyecto que antes tenía faltantes: PRJ-2026-002 (Stand Perú Sostenible 2026)
  const proy = await prisma.proyecto.findUnique({ where: { id: 'PRJ-2026-002' } });
  console.log(`\nVerificando archivos en Google Drive para "${proy?.nombre}" (${proy?.driveFolderId}):`);
  
  if (proy?.driveFolderId) {
    const areasRes = await drive.files.list({
      q: `'${proy.driveFolderId}' in parents and name = 'Producción' and trashed = false`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives'
    });
    const prodId = areasRes.data.files?.[0]?.id;
    if (prodId) {
      const subRes = await drive.files.list({
        q: `'${prodId}' in parents and trashed = false`,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'allDrives'
      });
      for (const sf of subRes.data.files || []) {
        console.log(`  📁 Subcarpeta: ${sf.name} (${sf.id})`);
        const filesRes = await drive.files.list({
          q: `'${sf.id}' in parents and trashed = false`,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          corpora: 'allDrives'
        });
        for (const f of filesRes.data.files || []) {
          console.log(`     📄 ${f.name}`);
        }
      }
    }
  }

  await prisma.$disconnect();
}

check();

