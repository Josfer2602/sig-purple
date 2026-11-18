const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const localPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:admin123@127.0.0.1:5432/sig_purple_db'
    }
  }
});

const supabaseDirectUrl = 'postgresql://postgres.hexhbcoeskeaoqqpxoxv:e-tqWYb9Uu9f3d!@aws-1-us-east-1.pooler.supabase.com:5432/postgres';

const cloudPrisma = new PrismaClient({
  datasources: {
    db: {
      url: supabaseDirectUrl
    }
  }
});

async function migrateTable(name, localModel, cloudModel, batchSize = 100) {
  try {
    const total = await localModel.count();
    if (total === 0) {
      console.log(`[${name}] Sin registros locales. Omitiendo.`);
      return;
    }
    console.log(`[${name}] Migrando ${total} registros...`);
    const records = await localModel.findMany();
    
    // Insert in batches
    for (let i = 0; i < records.length; i += batchSize) {
      const slice = records.slice(i, i + batchSize);
      if (cloudModel.createMany) {
        await cloudModel.createMany({
          data: slice,
          skipDuplicates: true
        });
      } else {
        for (const item of slice) {
          try {
            await cloudModel.create({ data: item });
          } catch (e) {
            // ignore duplicate
          }
        }
      }
    }
    const cloudCount = await cloudModel.count();
    console.log(`[${name}] ? Migrado con éxito. Total en Supabase: ${cloudCount}`);
  } catch (err) {
    console.error(`[${name}] Error migrando:`, err.message);
  }
}

async function main() {
  console.log('=== INICIANDO MIGRACIÓN DE DATOS LOCAL -> SUPABASE ===\n');

  // 1. Configuraciones y Usuarios base
  await migrateTable('User', localPrisma.user, cloudPrisma.user);
  await migrateTable('AppConfig', localPrisma.appConfig, cloudPrisma.appConfig);
  await migrateTable('ActividadCalendario', localPrisma.actividadCalendario, cloudPrisma.actividadCalendario);
  await migrateTable('TeamworkTask', localPrisma.teamworkTask, cloudPrisma.teamworkTask);

  // 2. Entidades Principales
  await migrateTable('Cliente', localPrisma.cliente, cloudPrisma.cliente);
  await migrateTable('ContactoCliente', localPrisma.contactoCliente, cloudPrisma.contactoCliente);
  await migrateTable('Proveedor', localPrisma.proveedor, cloudPrisma.proveedor);
  await migrateTable('CuentaBancaria', localPrisma.cuentaBancaria, cloudPrisma.cuentaBancaria);

  // 3. Proyectos y Cotizaciones
  await migrateTable('Proyecto', localPrisma.proyecto, cloudPrisma.proyecto);
  await migrateTable('Quote', localPrisma.quote, cloudPrisma.quote);
  await migrateTable('QuoteCategory', localPrisma.quoteCategory, cloudPrisma.quoteCategory);
  await migrateTable('QuoteItem', localPrisma.quoteItem, cloudPrisma.quoteItem);
  await migrateTable('QuoteSubItem', localPrisma.quoteSubItem, cloudPrisma.quoteSubItem);
  await migrateTable('QuoteHistory', localPrisma.quoteHistory, cloudPrisma.quoteHistory);

  // 4. Órdenes y Pagos
  await migrateTable('Orden', localPrisma.orden, cloudPrisma.orden);
  await migrateTable('OrdenSubItem', localPrisma.ordenSubItem, cloudPrisma.ordenSubItem);
  await migrateTable('Pago', localPrisma.pago, cloudPrisma.pago);

  // 5. Gastos de Producción y Facturas
  await migrateTable('GastoProduccion', localPrisma.gastoProduccion, cloudPrisma.gastoProduccion);
  await migrateTable('GastoProduccionItem', localPrisma.gastoProduccionItem, cloudPrisma.gastoProduccionItem);
  await migrateTable('FacturaCliente', localPrisma.facturaCliente, cloudPrisma.facturaCliente);

  // 6. Gantts, Reuniones IA y Books
  await migrateTable('ProjectGantt', localPrisma.projectGantt, cloudPrisma.projectGantt);
  await migrateTable('GanttTask', localPrisma.ganttTask, cloudPrisma.ganttTask);
  await migrateTable('ReunionAsistente', localPrisma.reunionAsistente, cloudPrisma.reunionAsistente);
  await migrateTable('ProjectBook', localPrisma.projectBook, cloudPrisma.projectBook);
  await migrateTable('BookSlide', localPrisma.bookSlide, cloudPrisma.bookSlide);

  console.log('\n=== MIGRACIÓN A SUPABASE COMPLETADA CON ÉXITO ===');
  await localPrisma.$disconnect();
  await cloudPrisma.$disconnect();
}

main().catch(err => {
  console.error('Error fatal durante la migración:', err);
  process.exit(1);
});

