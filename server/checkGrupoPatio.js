const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const gp = await prisma.cliente.findFirst({ where: { empresa: { contains: 'Patio', mode: 'insensitive' } } });
  if (!gp) {
    console.log("No Grupo Patio found");
    return;
  }
  const projects = await prisma.proyecto.findMany({ where: { clienteId: gp.id } });
  console.log(`Found ${projects.length} projects for Grupo Patio:`);
  projects.forEach(p => {
    console.log(`- ${p.nombre} | Estado: ${p.estado} | subtotal: ${p.subtotal} | presupuestoEstimado: ${p.presupuestoEstimado}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
