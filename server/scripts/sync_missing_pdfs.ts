import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { generatePdfFromUrl } from '../src/services/pdfService';
import { uploadToProjectDriveFolder } from '../src/services/driveService';
import jwt from 'jsonwebtoken';
import fs from 'fs';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'sig_purple_secret_key_2026';

const missingOrders = [
  'OC-2026-8651',
  'OC-2026-653', 'OS-2026-055', 'OS-2026-6586', 'OC-2026-6420', 'OC-2026-5646',
  'OS-2026-369', 'OS-2026-184', 'OS-2026-494', 'OS-2026-012', 'OS-2026-868', 'OS-2026-936', 'OS-2026-8288',
  'OC-2026-238',
  'OS-2026-3508', 'OS-2026-6570',
  'OS-2026-4066'
];

const missingPagos = [
  'PAG-2026-1429', 'PAG-2026-7900',
  'PAG-2026-5859', 'PAG-2026-6193', 'PAG-2026-5514', 'PAG-2026-4286', 'PAG-2026-3383', 'PAG-2026-2232', 'PAG-2026-1777'
];

async function sync() {
  console.log('=== INICIANDO SINCRONIZACIÓN DE PDFs FALTANTES A GOOGLE DRIVE ===\n');
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const token = jwt.sign({ id: 'system', email: 'system@purplebtl.com', role: 'Admin' }, JWT_SECRET, { expiresIn: '2h' });

  console.log(`1. Sincronizando ${missingOrders.length} Órdenes de Compra / Servicio...`);
  for (let i = 0; i < missingOrders.length; i++) {
    const ordenId = missingOrders[i];
    console.log(`\n[${i + 1}/${missingOrders.length}] Procesando orden ${ordenId}...`);
    const orden = await prisma.orden.findUnique({
      where: { id: ordenId },
      include: { cliente: true, proyecto: true, proveedor: true, items: true }
    });
    if (!orden) {
      console.warn(`  ⚠️ Orden ${ordenId} no encontrada en DB.`);
      continue;
    }

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
        console.log(`  ✅ Subida exitosa a Drive: ${driveRes.webViewLink}`);
      }
    } catch (e: any) {
      console.error(`  ❌ Error subiendo orden ${ordenId}:`, e.message);
    } finally {
      if (pdfPath && fs.existsSync(pdfPath)) {
        try { fs.unlinkSync(pdfPath); } catch {}
      }
    }
  }

  console.log(`\n2. Sincronizando ${missingPagos.length} Pagos a Proveedores...`);
  for (let i = 0; i < missingPagos.length; i++) {
    const pagoId = missingPagos[i];
    console.log(`\n[${i + 1}/${missingPagos.length}] Procesando pago ${pagoId}...`);
    const pago = await prisma.pago.findUnique({
      where: { id: pagoId },
      include: { cliente: true, proyecto: true, proveedor: true }
    });
    if (!pago) {
      console.warn(`  ⚠️ Pago ${pagoId} no encontrado en DB.`);
      continue;
    }

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
        console.log(`  ✅ Subida exitosa a Drive: ${driveRes.webViewLink}`);
      }
    } catch (e: any) {
      console.error(`  ❌ Error subiendo pago ${pagoId}:`, e.message);
    } finally {
      if (pdfPath && fs.existsSync(pdfPath)) {
        try { fs.unlinkSync(pdfPath); } catch {}
      }
    }
  }

  await prisma.$disconnect();
  console.log('\n=== SINCRONIZACIÓN FINALIZADA CON ÉXITO ===');
}

sync().catch(e => {
  console.error('Error fatal:', e);
  process.exit(1);
});

