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
          const quotes = await prisma.quote.findMany({
            where: { requirement: { contains: 'Noviembre' } },
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
          console.log('Noviembre quotes:', quotes.length);
          quotes.forEach(q => {
            console.log('ID:', q.id, '| req:', q.requirement, '| client:', q.client, '| brand:', q.brand);
            for (const c of q.categories) {
              console.log('  Cat:', c.name);
              for (const it of c.items) {
                console.log('    Item:', it.name, 'subs:', it.subItems.map(s => s.name + '=' + s.unitCost).join(', '));
              }
            }
          });
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
