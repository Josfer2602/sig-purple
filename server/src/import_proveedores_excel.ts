import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function importProveedoresFromExcel(filePath?: string) {
  const targetPath = filePath || path.resolve(__dirname, '../../Base de proveedores.xlsx');
  if (!fs.existsSync(targetPath)) {
    console.error(`Archivo no encontrado en: ${targetPath}`);
    return { success: false, error: 'Archivo no encontrado' };
  }

  console.log(`Leyendo archivo Excel desde: ${targetPath}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(targetPath);
  const ws = wb.getWorksheet(1);
  if (!ws) {
    return { success: false, error: 'No se encontró la primera hoja en el Excel' };
  }

  let totalRows = 0;
  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  // Row 1 is header: ['Proveedor', 'Nro_Contacto', 'E-mail', 'Categoria']
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const valProv = row.getCell(1).value;
    if (!valProv) continue;

    totalRows++;
    const razonSocial = String(valProv).trim();
    if (!razonSocial) continue;

    // Contact number
    const valTel = row.getCell(2).value;
    let telefono = '';
    if (valTel !== null && valTel !== undefined) {
      if (typeof valTel === 'object' && 'text' in valTel) {
        telefono = String((valTel as any).text || '').trim();
      } else {
        telefono = String(valTel).trim();
      }
    }

    // Email
    const valEmail = row.getCell(3).value;
    let correo = '';
    if (valEmail !== null && valEmail !== undefined) {
      if (typeof valEmail === 'object' && 'text' in valEmail) {
        correo = String((valEmail as any).text || '').trim();
      } else {
        correo = String(valEmail).trim();
      }
    }
    if (correo === '-' || correo.toLowerCase().includes('notiene')) {
      if (correo === '-') correo = '';
    }

    // Category
    const valCat = row.getCell(4).value;
    let categoria = '';
    if (valCat !== null && valCat !== undefined) {
      if (typeof valCat === 'object' && 'text' in valCat) {
        categoria = String((valCat as any).text || '').trim();
      } else {
        categoria = String(valCat).trim();
      }
    }

    // Check if provider already exists by razonSocial (case-insensitive)
    const existing = await prisma.proveedor.findFirst({
      where: {
        razonSocial: {
          equals: razonSocial,
          mode: 'insensitive'
        }
      }
    });

    if (existing) {
      // Update missing fields
      await prisma.proveedor.update({
        where: { id: existing.id },
        data: {
          categoria: existing.categoria || categoria || null,
          telefono: existing.telefono || telefono || '',
          correo: existing.correo || correo || '',
        }
      });
      updatedCount++;
    } else {
      await prisma.proveedor.create({
        data: {
          razonSocial,
          nombre: razonSocial,
          ruc: '',
          correo,
          telefono,
          tipoDocumento: 'Factura',
          categoria: categoria || 'General',
          ciudad: 'Lima',
          tipoProveedor: 'Trabajado',
          esConfiable: true,
          motivoNoConfiable: null,
          web: '',
          documentos: '[]',
          servicios: categoria || ''
        }
      });
      importedCount++;
    }
  }

  console.log(`Importación finalizada.`);
  console.log(`Total procesados: ${totalRows}`);
  console.log(`Nuevos creados: ${importedCount}`);
  console.log(`Actualizados: ${updatedCount}`);
  console.log(`Omitidos: ${skippedCount}`);

  return {
    success: true,
    totalRows,
    importedCount,
    updatedCount,
    skippedCount
  };
}

// Allow direct execution from CLI
if (require.main === module) {
  importProveedoresFromExcel()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('Error importando proveedores:', err);
      prisma.$disconnect();
      process.exit(1);
    });
}
