import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function resetDatabase() {
  console.log('====================================================');
  console.log('🚀 INICIANDO VACIADO DE DATOS OPERACIONALES (RESET)');
  console.log('====================================================\n');

  // 1. RESPALDO PREVENTIVO COMPLETO
  console.log('📦 Paso 1: Generando copia de seguridad preventiva...');
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `SIG_Purple_Backup_PreReset_${timestamp}.json`);

  const fullData = {
    timestamp: new Date().toISOString(),
    clientes: await prisma.cliente.findMany(),
    proveedores: await prisma.proveedor.findMany({ include: { cuentas: true } }),
    proyectos: await prisma.proyecto.findMany(),
    quotes: await prisma.quote.findMany({
      include: {
        categories: {
          include: {
            items: {
              include: { subItems: true }
            }
          }
        },
        history: true
      }
    }),
    ordenes: await prisma.orden.findMany({ include: { items: true } }),
    pagos: await prisma.pago.findMany(),
    gastos: await prisma.gastoProduccion.findMany({ include: { items: true } }),
    gantts: await prisma.projectGantt.findMany({ include: { tasks: true } }),
    facturasCliente: await prisma.facturaCliente.findMany(),
    teamworkTasks: await prisma.teamworkTask.findMany(),
    actividadesCalendario: await prisma.actividadCalendario.findMany()
  };

  fs.writeFileSync(backupFile, JSON.stringify(fullData, null, 2), 'utf-8');
  console.log(`✅ Copia de seguridad guardada exitosamente en:\n   ${backupFile}\n`);

  // 2. BORRADO ORDENADO DE TABLAS OPERACIONALES (Respetando Foreign Keys)
  console.log('🧹 Paso 2: Eliminando datos operacionales...');

  const deletedFacturas = await prisma.facturaCliente.deleteMany();
  console.log(`   - Facturas de Clientes: ${deletedFacturas.count} eliminadas`);

  const deletedTeamwork = await prisma.teamworkTask.deleteMany();
  console.log(`   - Tareas Teamwork: ${deletedTeamwork.count} eliminadas`);

  const deletedActividades = await prisma.actividadCalendario.deleteMany();
  console.log(`   - Actividades Calendario: ${deletedActividades.count} eliminadas`);

  const deletedGastosItems = await prisma.gastoProduccionItem.deleteMany();
  console.log(`   - Ítems de Gastos Producción: ${deletedGastosItems.count} eliminados`);

  const deletedGastos = await prisma.gastoProduccion.deleteMany();
  console.log(`   - Gastos de Producción: ${deletedGastos.count} eliminados`);

  const deletedPagos = await prisma.pago.deleteMany();
  console.log(`   - Pagos a Proveedores: ${deletedPagos.count} eliminados`);

  const deletedOrdenesItems = await prisma.ordenSubItem.deleteMany();
  console.log(`   - Ítems de Órdenes: ${deletedOrdenesItems.count} eliminados`);

  const deletedOrdenes = await prisma.orden.deleteMany();
  console.log(`   - Órdenes de Compra/Servicio: ${deletedOrdenes.count} eliminadas`);

  const deletedGanttTasks = await prisma.ganttTask.deleteMany();
  console.log(`   - Tareas de Gantt: ${deletedGanttTasks.count} eliminadas`);

  const deletedGantts = await prisma.projectGantt.deleteMany();
  console.log(`   - Cronogramas Gantt: ${deletedGantts.count} eliminados`);

  const deletedQuoteHistory = await prisma.quoteHistory.deleteMany();
  console.log(`   - Historial de Cotizaciones: ${deletedQuoteHistory.count} eliminados`);

  const deletedQuoteSubItems = await prisma.quoteSubItem.deleteMany();
  console.log(`   - Subítems de Cotizaciones: ${deletedQuoteSubItems.count} eliminados`);

  const deletedQuoteItems = await prisma.quoteItem.deleteMany();
  console.log(`   - Ítems de Cotizaciones: ${deletedQuoteItems.count} eliminados`);

  const deletedQuoteCategories = await prisma.quoteCategory.deleteMany();
  console.log(`   - Categorías de Cotizaciones: ${deletedQuoteCategories.count} eliminadas`);

  const deletedQuotes = await prisma.quote.deleteMany();
  console.log(`   - Cotizaciones: ${deletedQuotes.count} eliminadas`);

  const deletedProyectos = await prisma.proyecto.deleteMany();
  console.log(`   - Proyectos: ${deletedProyectos.count} eliminados`);

  const deletedCuentasBancarias = await prisma.cuentaBancaria.deleteMany();
  console.log(`   - Cuentas Bancarias de Proveedores: ${deletedCuentasBancarias.count} eliminadas`);

  const deletedProveedores = await prisma.proveedor.deleteMany();
  console.log(`   - Proveedores: ${deletedProveedores.count} eliminados`);

  const deletedClientes = await prisma.cliente.deleteMany();
  console.log(`   - Clientes: ${deletedClientes.count} eliminados`);

  // 3. VERIFICAR QUE USUARIOS Y CONFIGURACIÓN SIGUEN INTACTOS
  console.log('\n🔒 Paso 3: Verificando persistencia de Usuarios y Configuración...');
  const usersCount = await prisma.user.count();
  const configCount = await prisma.appConfig.count();
  console.log(`   ✅ Usuarios conservados: ${usersCount} (Tu acceso y login siguen activos)`);
  console.log(`   ✅ Configuraciones globales conservadas: ${configCount}`);

  console.log('\n====================================================');
  console.log('🎉 BASE DE DATOS LIMPIA Y LISTA PARA EMPEZAR DE CERO');
  console.log('====================================================');
}

resetDatabase()
  .catch((e) => {
    console.error('❌ Error durante el reseteo:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
