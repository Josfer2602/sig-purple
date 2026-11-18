import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { uploadToDrive } from './driveService';

const prisma = new PrismaClient();

export const runFullBackup = async () => {
  console.log('🔄 Iniciando backup automático...');
  try {
    // 1. Extraer toda la data de las tablas importantes
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
      gantts: await prisma.projectGantt.findMany({ include: { tasks: true } })
    };

    // 2. Guardar en un archivo temporal JSON en directorio privado (NO público)
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `SIG_Purple_Backup_${dateStr}_${Date.now()}.json`;
    const backupsDir = path.join(__dirname, '../../backups');
    
    // Asegurarse de que el directorio privado existe
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const filePath = path.join(backupsDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf-8');
    
    console.log(`✅ Archivo temporal de backup creado en: ${filePath}`);

    // 3. Subir a Google Drive
    // Usamos la carpeta configurada en .env o pasamos undefined para guardarlo en la raíz
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    console.log('☁️ Subiendo backup a Google Drive...');
    const result = await uploadToDrive(filePath, fileName, folderId);
    console.log(`✅ Backup subido exitosamente a Google Drive. Enlace: ${result.webViewLink}`);

    // 4. Limpiar archivo temporal local
    fs.unlinkSync(filePath);
    console.log('🧹 Archivo temporal eliminado.');

    return { success: true, link: result.webViewLink };
  } catch (error) {
    console.error('❌ Error fatal durante el backup:', error);
    throw error;
  }
};

export const startBackupCron = () => {
  // Configurado para ejecutarse todos los días a las 02:00 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      await runFullBackup();
    } catch (e) {
      console.error('El backup automático falló:', e);
    }
  });
  console.log('⏰ Tarea de Backup Automático (Cron) programada para las 02:00 AM diariamente.');
};
