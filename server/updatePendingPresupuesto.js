const { PrismaClient } = require('@prisma/client');
const openpyxl = require('child_process');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
  const jsonPath = 'C:/Users/josen/.gemini/antigravity/brain/9a06be32-e8a7-4f37-b8b3-f0e88f2a68b2/scratch/import_data.json';
  if (!fs.existsSync(jsonPath)) {
    console.log("JSON path not found");
    return;
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Loaded ${data.projects.length} imported projects from JSON...`);

  let updatedCount = 0;
  for (const p of data.projects) {
    if (p.presupuestoEstimado || p.subtotal) {
      const sub = p.subtotal || p.presupuestoEstimado || 0;
      const est = p.presupuestoEstimado ? String(p.presupuestoEstimado) : (p.subtotal ? String(p.subtotal) : null);
      
      // Update DB project if subtotal is 0 or presupuestoEstimado is null
      await prisma.proyecto.updateMany({
        where: { nombre: p.nombre, clienteId: { not: undefined } },
        data: {
          subtotal: sub,
          presupuestoEstimado: est
        }
      });
      updatedCount++;
    }
  }
  console.log(`Updated subtotals and estimated budgets for ${updatedCount} projects!`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
