import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { generatePdfFromUrl } from '../src/services/pdfService';
import { uploadToProjectDriveFolder } from '../src/services/driveService';
import jwt from 'jsonwebtoken';
import fs from 'fs';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'sig_purple_secret_key_2026';

async function syncAll() {
  console.log('=== VINCULANDO / SUBIENDO EL RESTO DE DOCUMENTOS A GOOGLE DRIVE ===\n');
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const token = jwt.sign({ id: 'system', email: 'system@purplebtl.com', role: 'Admin' }, JWT_SECRET, { expiresIn: '2h' });

  const pendingOrders = await prisma.orden.findMany({
    where: { pdfUrl: null },
    include: { cliente: true, proyecto: true, proveedor: true, items: true }
  });

  const pendingPagos = await prisma.pago.findMany({
    where: { pdfUrl: null },
    include: { cliente: true, proyecto: true, proveedor: true }
  });

  console.log(`Órdenes pendientes por subir/vincular: ${pendingOrders.length}`);
  console.log(`Pagos pendientes por subir/vincular:    ${pendingPagos.length}\n`);

  for (let i = 0; i < pendingOrders.length; i++) {
    const orden = pendingOrders[i];
    console.log(`[${i + 1}/${pendingOrders.length}] Órden ${orden.id} (${orden.proyecto?.nombre || '-'} - ${orden.proveedor?.razonSocial || '-'})`);

    let pdfPath: string | null = null;
    try {
      pdfPath = await generatePdfFromUrl(`${baseUrl}/?printOrden=${orden.id}&token=${token}`, `orden_${orden.id}`);
      const tipoDoc = orden.tipoOrden ? orden.tipoOrden.toUpperCase() : 'COMPRA';
      const fileName = `Orden_${tipoDoc}_${orden.id}.pdf`;
      const provName = (orden.proveedor?.razonSocial || orden.proveedor?.nombre || '').trim();

      const driveRes = await uploadToProjectDriveFolder({
        projectId: orden.proyectoId,
        clienteId: orden.clienteId,
        clientName: orden.cliente?.empresa,
        projectName: orden.proyecto?.nombre,
        area: 'Producción',
        subfolder: 'Órdenes de compra',
        fileName,
        mimeType: 'application/pdf',
        filePath: pdfPath,
        prisma,
        versioning: true,
        itemIdentifier: orden.id,
        entityName: provName
      });

      if (driveRes?.webViewLink) {
        await prisma.orden.update({
          where: { id: orden.id },
          data: { pdfUrl: driveRes.webViewLink, driveFileId: driveRes.id }
        });
        console.log(`  ✅ Subido a Drive: ${driveRes.webViewLink}`);
      }
    } catch (e: any) {
      console.error(`  ❌ Error:`, e.message);
    } finally {
      if (pdfPath && fs.existsSync(pdfPath)) {
        try { fs.unlinkSync(pdfPath); } catch {}
      }
    }
  }

  for (let i = 0; i < pendingPagos.length; i++) {
    const pago = pendingPagos[i];
    console.log(`[${i + 1}/${pendingPagos.length}] Pago ${pago.id} (${pago.proyecto?.nombre || '-'} - ${pago.proveedor?.razonSocial || '-'})`);

    let pdfPath: string | null = null;
    try {
      pdfPath = await generatePdfFromUrl(`${baseUrl}/?printPago=${pago.id}&token=${token}`, `pago_${pago.id}`);
      const provName = (pago.proveedor?.razonSocial || pago.proveedor?.nombre || '').trim();
      const cleanId = pago.numeroComprobante ? `Comprobante_${pago.numeroComprobante}` : pago.id;
      const fileName = `Pago_${cleanId}.pdf`;

      const driveRes = await uploadToProjectDriveFolder({
        projectId: pago.proyectoId,
        clienteId: pago.clienteId,
        clientName: pago.cliente?.empresa,
        projectName: pago.proyecto?.nombre,
        area: 'Producción',
        subfolder: 'Pago a proveedor',
        fileName,
        mimeType: 'application/pdf',
        filePath: pdfPath,
        prisma,
        versioning: true,
        itemIdentifier: pago.id,
        entityName: provName
      });

      if (driveRes?.webViewLink) {
        await prisma.pago.update({
          where: { id: pago.id },
          data: { pdfUrl: driveRes.webViewLink, driveFileId: driveRes.id }
        });
        console.log(`  ✅ Subido a Drive: ${driveRes.webViewLink}`);
      }
    } catch (e: any) {
      console.error(`  ❌ Error:`, e.message);
    } finally {
      if (pdfPath && fs.existsSync(pdfPath)) {
        try { fs.unlinkSync(pdfPath); } catch {}
      }
    }
  }

  const [finalOrdCount, finalPagCount] = await Promise.all([
    prisma.orden.count({ where: { pdfUrl: { not: null } } }),
    prisma.pago.count({ where: { pdfUrl: { not: null } } })
  ]);

  console.log(`\n🎉 TOTALES FINALES:`);
  console.log(`Órdenes con PDF oficial en Google Drive: ${finalOrdCount} de 43`);
  console.log(`Pagos con PDF oficial en Google Drive:   ${finalPagCount} de 34`);

  await prisma.$disconnect();
}

syncAll().catch(e => {
  console.error('Error fatal:', e);
  process.exit(1);
});

