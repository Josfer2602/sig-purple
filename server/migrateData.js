const { PrismaClient } = require('@prisma/client');

const remotePrisma = new PrismaClient({
  datasources: {
    db: { url: "postgresql://postgres:K78Ba0tsU3Ng43g4@db.yxvjrgefltlhectejqfu.supabase.co:5432/postgres" }
  }
});

const localPrisma = new PrismaClient({
  datasources: {
    db: { url: "postgresql://postgres:admin123@localhost:5432/postgres?schema=public" }
  }
});

async function main() {
  console.log("Iniciando migración de datos desde Supabase a Local...");

  const tables = [
    'appConfig',
    'user',
    'actividadCalendario',
    'teamworkTask',
    'cliente',
    'proveedor',
    'proyecto',
    'cuentaBancaria',
    'quote',
    'quoteCategory',
    'quoteItem',
    'quoteSubItem',
    'quoteHistory',
    'projectGantt',
    'ganttTask',
    'orden',
    'ordenSubItem',
    'pago',
    'gastoProduccion',
    'gastoProduccionItem'
  ];

  for (const table of tables) {
    console.log(`Migrando tabla: ${table}...`);
    try {
      const records = await remotePrisma[table].findMany();
      if (records.length > 0) {
        await localPrisma[table].createMany({
          data: records,
          skipDuplicates: true
        });
        console.log(`  -> Copiados ${records.length} registros en ${table}`);
      } else {
        console.log(`  -> 0 registros en ${table}`);
      }
    } catch (e) {
      console.error(`Error migrando ${table}:`, e.message);
    }
  }

  console.log("¡Migración completada exitosamente!");
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await remotePrisma.$disconnect();
    await localPrisma.$disconnect();
  });
