const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
  const q = await prisma.quote.findUnique({
    where: { id: 'COT-5276' },
    include: { categories: { include: { items: true } } }
  });
  console.log(JSON.stringify(q, null, 2));
}
check().finally(() => prisma.$disconnect());
