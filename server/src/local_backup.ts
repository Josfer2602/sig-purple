import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function runLocalBackup() {
  console.log('🔄 Extrayendo data...');
  const backupData = {
    timestamp: new Date().toISOString(),
    config: await prisma.appConfig.findMany(),
    clientes: await prisma.cliente.findMany(),
    proyectos: await prisma.proyecto.findMany(),
    proveedores: await prisma.proveedor.findMany({ include: { cuentas: true } }),
    quotes: await prisma.quote.findMany({
      include: {
        categories: {
          include: {
            items: {
              include: { subItems: true }
            }
          }
        }
      }
    }),
    ordenes: await prisma.orden.findMany({ include: { items: true } }),
    pagos: await prisma.pago.findMany(),
    gastos: await prisma.gastoProduccion.findMany({ include: { items: true } }),
    gantts: await prisma.projectGantt.findMany({ include: { tasks: true } }),
    users: await prisma.user.findMany()
  };

  const fileName = `SIG_Purple_Migration_Backup.json`;
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const filePath = path.join(uploadsDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`✅ Backup JSON creado exitosamente en: ${filePath}`);
}

runLocalBackup().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
