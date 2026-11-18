const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
  const rawPath = 'C:/Users/josen/.gemini/antigravity/brain/9a06be32-e8a7-4f37-b8b3-f0e88f2a68b2/scratch/excel_subtotals.json';
  const data = JSON.parse(fs.readFileSync(rawPath, 'utf8'));

  console.log(`Updating PostgreSQL projects with ${data.length} records...`);

  let count = 0;
  for (const item of data) {
    const finalSub = item.col16 > 0 ? item.col16 : item.col29;
    if (finalSub > 0) {
      const res = await prisma.proyecto.updateMany({
        where: { nombre: item.actividad },
        data: {
          subtotal: finalSub,
          presupuestoEstimado: String(finalSub)
        }
      });
      count += res.count;
    }
  }

  console.log(`\n=== UPDATE COMPLETE ===`);
  console.log(`Updated subtotals for ${count} project records in PostgreSQL database!`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
