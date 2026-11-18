import { PrismaClient } from '@prisma/client';
import { getDriveClient } from '../src/services/driveService';

const prisma = new PrismaClient();

async function audit() {
  console.log('=== INICIANDO AUDITORÍA DE PROYECTOS Y DRIVE ===\n');

  let drive: any = null;
  try {
    drive = await getDriveClient();
    console.log('✅ Conexión con Google Drive establecida correctamente.\n');
  } catch (err: any) {
    console.error('❌ Error conectando con Google Drive:', err.message);
  }

  const [proyectos, clientes, ordenes, pagos] = await Promise.all([
    prisma.proyecto.findMany(),
    prisma.cliente.findMany(),
    prisma.orden.findMany({ include: { proveedor: true, items: true } }),
    prisma.pago.findMany({ include: { proveedor: true } })
  ]);

  const clienteDict = new Map(clientes.map(c => [c.id, c]));

  console.log(`Total de proyectos registrados en la BD: ${proyectos.length}`);
  console.log(`Total de órdenes registradas en la BD: ${ordenes.length}`);
  console.log(`Total de pagos registrados en la BD: ${pagos.length}\n`);

  for (const proy of proyectos) {
    const cli = clienteDict.get(proy.clienteId);
    const proyOrdenes = ordenes.filter(o => o.proyectoId === proy.id);
    const proyPagos = pagos.filter(p => p.proyectoId === proy.id);

    console.log(`======================================================================`);
    console.log(`PROYECTO: [${proy.id}] "${proy.nombre}"`);
    console.log(`CLIENTE:  [${proy.clienteId}] ${cli?.empresa || 'Sin Cliente'}`);
    console.log(`ESTADO:   ${proy.estado}`);
    console.log(`DRIVE ID: ${proy.driveFolderId || '(No registrado en BD)'}`);
    console.log(`DRIVE URL: ${proy.driveFolderUrl || '(No registrada en BD)'}`);
    console.log(`ÓRDENES EN BD (${proyOrdenes.length}):`);
    for (const o of proyOrdenes) {
      console.log(`  - [${o.tipoOrden || 'Compra'}] ${o.id} | Proveedor: ${o.proveedor?.razonSocial || '-'} | S/ ${o.total.toFixed(2)} | PDF Drive en BD: ${o.pdfUrl ? 'SÍ' : 'NO'} | Cotiz Proveedor: ${o.cotizacionProveedorUrl ? 'SÍ' : 'NO'}`);
    }
    console.log(`PAGOS EN BD (${proyPagos.length}):`);
    for (const p of proyPagos) {
      console.log(`  - Pago ${p.id} (Orden: ${p.ordenId || '-'}) | Proveedor: ${p.proveedor?.razonSocial || '-'} | S/ ${p.monto.toFixed(2)} | PDF Drive en BD: ${p.pdfUrl ? 'SÍ' : 'NO'} | Comprobante: ${p.comprobanteUrl ? 'SÍ' : 'NO'}`);
    }

    if (!drive) {
      console.log('⚠️ No hay conexión con Drive para auditar carpetas.');
      continue;
    }

    // Resolver ID de la carpeta en Drive
    let targetFolderId = proy.driveFolderId;
    if (!targetFolderId) {
      console.log('\n🔎 Buscando carpeta del proyecto en Drive por nombre...');
      const cleanProject = proy.nombre.trim();
      const escProj = cleanProject.replace(/'/g, "\\'");
      try {
        const searchRes = await drive.files.list({
          q: `mimeType = 'application/vnd.google-apps.folder' and name = '${escProj}' and trashed = false`,
          corpora: 'allDrives',
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          fields: 'files(id, name, webViewLink)',
          pageSize: 5
        });
        if (searchRes.data.files && searchRes.data.files.length > 0) {
          targetFolderId = searchRes.data.files[0].id;
          console.log(`  Encontrada carpeta en Drive: "${searchRes.data.files[0].name}" (ID: ${targetFolderId})`);
        } else {
          console.log(`  ❌ No se encontró ninguna carpeta en Drive para "${cleanProject}".`);
        }
      } catch (e: any) {
        console.error('  Error buscando carpeta en Drive:', e.message);
      }
    }

    if (targetFolderId) {
      console.log(`\n📁 Contenido de Drive para el proyecto (${targetFolderId}):`);
      try {
        // Listar subcarpetas principales
        const areasRes = await drive.files.list({
          q: `mimeType = 'application/vnd.google-apps.folder' and '${targetFolderId}' in parents and trashed = false`,
          corpora: 'allDrives',
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          fields: 'files(id, name)',
          pageSize: 20
        });
        const areas = areasRes.data.files || [];
        console.log(`  Áreas encontradas:`, areas.map((a: any) => a.name).join(', ') || 'Ninguna');

        const prodArea = areas.find((a: any) => a.name.toLowerCase().includes('producci'));
        if (prodArea) {
          const prodSubfoldersRes = await drive.files.list({
            q: `'${prodArea.id}' in parents and trashed = false`,
            corpora: 'allDrives',
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'files(id, name, mimeType)',
            pageSize: 30
          });
          const prodItems = prodSubfoldersRes.data.files || [];
          console.log(`  Subcarpetas en Producción:`, prodItems.map((p: any) => p.name).join(', ') || 'Ninguna');

          // Revisar Órdenes de compra
          const ocFolder = prodItems.find((p: any) => p.name.toLowerCase().includes('compra') || p.name.toLowerCase().includes('orden'));
          if (ocFolder) {
            console.log(`    📁 [Producción > Órdenes de compra]:`);
            const ocFilesRes = await drive.files.list({
              q: `'${ocFolder.id}' in parents and trashed = false`,
              corpora: 'allDrives',
              includeItemsFromAllDrives: true,
              supportsAllDrives: true,
              fields: 'files(id, name, mimeType, webViewLink)',
              pageSize: 50
            });
            const ocFiles = ocFilesRes.data.files || [];
            if (ocFiles.length === 0) {
              console.log(`      (Vacía - no hay archivos)`);
            } else {
              for (const f of ocFiles) {
                console.log(`      📄 ${f.name} (${f.mimeType === 'application/vnd.google-apps.folder' ? 'CARPETA DESGLOSE' : 'ARCHIVO'})`);
                if (f.mimeType === 'application/vnd.google-apps.folder') {
                  const subRes = await drive.files.list({
                    q: `'${f.id}' in parents and trashed = false`,
                    corpora: 'allDrives',
                    includeItemsFromAllDrives: true,
                    supportsAllDrives: true,
                    fields: 'files(id, name)',
                    pageSize: 20
                  });
                  for (const sf of (subRes.data.files || [])) {
                    console.log(`         └── 📄 ${sf.name}`);
                  }
                }
              }
            }
          } else {
            console.log(`    ❌ No existe subcarpeta "Órdenes de compra" en Producción.`);
          }

          // Revisar Pago a proveedor
          const pagoFolder = prodItems.find((p: any) => p.name.toLowerCase().includes('pago'));
          if (pagoFolder) {
            console.log(`    📁 [Producción > Pago a proveedor]:`);
            const pagoFilesRes = await drive.files.list({
              q: `'${pagoFolder.id}' in parents and trashed = false`,
              corpora: 'allDrives',
              includeItemsFromAllDrives: true,
              supportsAllDrives: true,
              fields: 'files(id, name, mimeType, webViewLink)',
              pageSize: 50
            });
            const pagoFiles = pagoFilesRes.data.files || [];
            if (pagoFiles.length === 0) {
              console.log(`      (Vacía - no hay archivos)`);
            } else {
              for (const f of pagoFiles) {
                console.log(`      📄 ${f.name} (${f.mimeType === 'application/vnd.google-apps.folder' ? 'CARPETA DESGLOSE' : 'ARCHIVO'})`);
                if (f.mimeType === 'application/vnd.google-apps.folder') {
                  const subRes = await drive.files.list({
                    q: `'${f.id}' in parents and trashed = false`,
                    corpora: 'allDrives',
                    includeItemsFromAllDrives: true,
                    supportsAllDrives: true,
                    fields: 'files(id, name)',
                    pageSize: 20
                  });
                  for (const sf of (subRes.data.files || [])) {
                    console.log(`         └── 📄 ${sf.name}`);
                  }
                }
              }
            }
          } else {
            console.log(`    ❌ No existe subcarpeta "Pago a proveedor" en Producción.`);
          }

          // Revisar Cotizaciones de proveedores
          const cotizFolder = prodItems.find((p: any) => p.name.toLowerCase().includes('cotizac'));
          if (cotizFolder) {
            console.log(`    📁 [Producción > Cotizaciones de proveedores]:`);
            const cotFilesRes = await drive.files.list({
              q: `'${cotizFolder.id}' in parents and trashed = false`,
              corpora: 'allDrives',
              includeItemsFromAllDrives: true,
              supportsAllDrives: true,
              fields: 'files(id, name, mimeType)',
              pageSize: 50
            });
            const cotFiles = cotFilesRes.data.files || [];
            if (cotFiles.length === 0) {
              console.log(`      (Vacía - no hay archivos)`);
            } else {
              for (const f of cotFiles) {
                console.log(`      📄 ${f.name}`);
              }
            }
          }
        } else {
          console.log(`  ❌ No existe carpeta "Producción" en este proyecto.`);
        }
      } catch (err: any) {
        console.error('  Error listando contenidos de Drive:', err.message);
      }
    }
  }

  await prisma.$disconnect();
  console.log('\n=== AUDITORÍA FINALIZADA ===');
}

audit().catch(e => {
  console.error('Error fatal en auditoría:', e);
  process.exit(1);
});
