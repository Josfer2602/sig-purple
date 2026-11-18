const { Client } = require('ssh2');
require('dotenv').config({ path: '.env.deploy' });

const conn = new Client();
conn.on('ready', () => {
  const script = `
    cd /var/www/sigpurple/api && node -e "
      require('dotenv').config();
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      (async () => {
        try {
          const items = await prisma.quoteItem.findMany({
            where: {
              OR: [
                { name: { contains: 'CANTA' } },
                { name: { contains: 'SANTA' } }
              ]
            },
            include: { subItems: true, category: { include: { quote: true } } }
          });
          console.log('Found items in DB:', items.length);
          for (const it of items) {
            console.log('--- Item:', it.name, 'in Quote:', it.category?.quote?.requirement || it.category?.quote?.id);
            console.log('    internalMultiplierPercent:', it.internalMultiplierPercent, 'financialExpensePercent:', it.financialExpensePercent);
            console.log('    SubItems count:', it.subItems?.length);
            it.subItems.forEach(s => {
              console.log('      - SubItem:', s.name, 'qty:', s.quantity, 'dates:', s.dates, 'unitCost:', s.unitCost, 'provider:', s.providerName);
            });
          }
        } catch (e) {
          console.error(e);
        } finally {
          await prisma.\\$disconnect();
        }
      })();
    "
  `;
  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('close', () => conn.end());
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
  });
}).on('error', err => {
  console.error('SSH Error:', err);
}).connect({
  host: process.env.DEPLOY_HOST,
  port: 22,
  username: process.env.DEPLOY_USER,
  password: process.env.DEPLOY_PASS,
  readyTimeout: 60000
});
