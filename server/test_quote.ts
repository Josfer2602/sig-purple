import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const quote = await prisma.quote.findFirst({
    orderBy: { id: 'desc' },
    include: {
      categories: {
        include: {
          items: {
            include: { subItems: true }
          }
        }
      }
    }
  });
  console.log(JSON.stringify(quote?.categories, null, 2));
}
run().catch(console.error).finally(() => prisma.$disconnect());
