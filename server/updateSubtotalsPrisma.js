const { PrismaClient } = require('@prisma/client');
const openpyxl = require('child_process');
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
  // Read import_data.json
  const rawPath = 'C:/Users/josen/.gemini/antigravity/brain/9a06be32-e8a7-4f37-b8b3-f0e88f2a68b2/scratch/import_data.json';
  const data = JSON.parse(fs.readFileSync(rawPath, 'utf8'));

  console.log(`Checking ${data.length} records in import_data.json...`);

  let count = 0;
  for (const item of data) {
    if (item.nombre) {
      const sub = Number(item.subtotal || item.presupuestoEstimado || 0);
      const est = item.presupuestoEstimado ? String(item.presupuestoEstimado) : (sub > 0 ? String(sub) : null);

      if (sub > 0) {
        const res = await prisma.proyecto.updateMany({
          where: { nombre: item.nombre },
          data: { subtotal: sub, presupuestoEstimado: est }
        });
        count += res.count;
      }
    }
  }

  console.log(`Updated subtotals in PostgreSQL for ${count} project records!`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
