const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
  const jsonPath = 'C:/Users/josen/.gemini/antigravity/brain/9a06be32-e8a7-4f37-b8b3-f0e88f2a68b2/scratch/import_teamboard.json';
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  console.log(`Loaded ${data.length} TeamBoard tasks to import into PostgreSQL...`);

  const countBefore = await prisma.teamworkTask.count();
  console.log(`Existing Teamwork tasks in DB: ${countBefore}`);

  const chunkSize = 500;
  let inserted = 0;

  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    await prisma.teamworkTask.createMany({
      data: chunk.map(item => ({
        area: item.area,
        cliente: item.cliente,
        proyecto: item.proyecto,
        tarea: item.tarea,
        responsable: item.responsable,
        fechaEntrega: item.fechaEntrega,
        status: item.status
      }))
    });
    inserted += chunk.length;
    console.log(`Inserted ${inserted}/${data.length} tasks...`);
  }

  const countAfter = await prisma.teamworkTask.count();
  console.log(`\n=== IMPORT COMPLETE ===`);
  console.log(`- Teamwork tasks in DB now: ${countAfter}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
