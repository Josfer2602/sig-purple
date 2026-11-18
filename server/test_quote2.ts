import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const cat = await prisma.quoteCategory.findFirst({
    include: { items: { include: { subItems: true } } }
  });
  console.log("DB value of details:", cat?.items[0]?.details);
  console.log("Type:", typeof cat?.items[0]?.details);
}
run().catch(console.error).finally(() => prisma.$disconnect());
