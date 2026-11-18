import { PrismaClient } from '@prisma/client';
import { generateQuoteExcel } from './src/services/excelService';
import * as fs from 'fs';

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

  if (!quote) {
    console.log('No quote found');
    return;
  }

  console.log('Testing with quote:', quote.id);
  console.log('Categories:', quote.categories.length);
  quote.categories.forEach(cat => {
    console.log('  Cat:', cat.name, 'Items:', cat.items.length);
    cat.items.forEach(item => {
      console.log('    Item:', item.name, 'details:', item.details);
    });
  });

  try {
    const buffer = await generateQuoteExcel(quote as any);
    fs.writeFileSync('./test_output.xlsm', buffer);
    console.log('SUCCESS: Wrote test_output.xlsm');
  } catch (e: any) {
    console.error('ERROR:', e.message);
    console.error(e.stack);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
