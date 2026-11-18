const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const projects = await prisma.proyecto.findMany({ take: 25 });
  console.log("Sample 25 projects from DB:");
  projects.forEach(p => {
    console.log(`ID: ${p.id.substring(0,8)} | Nombre: ${p.nombre.substring(0,30)} | subtotal: ${p.subtotal} | presupuestoEstimado: ${p.presupuestoEstimado} | estado: ${p.estado}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
