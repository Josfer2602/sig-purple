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
          const quote = await prisma.quote.findFirst({
            where: { requirement: 'Actividades Noviembre 2026' },
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
            console.log('Quote not found');
            return;
          }
          console.log('ID:', quote.id, 'Client:', quote.client, 'Brand:', quote.brand, 'Requirement:', quote.requirement);
          console.log('Date:', quote.date, 'version:', quote.version, 'isTemplate:', quote.isTemplate);
          console.log('Categories count:', quote.categories.length);
          for (const cat of quote.categories) {
            console.log('Cat:', cat.name, 'items:', cat.items.length);
            for (const it of cat.items) {
              console.log('  Item:', it.name, 'unitCost:', it.unitCost, 'total:', it.total);
              it.subItems.forEach(s => {
                console.log('    Sub:', s.name, 'cost:', s.unitCost, 'qty:', s.quantity, 'dates:', s.dates);
              });
            }
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
