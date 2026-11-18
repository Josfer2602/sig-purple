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
          const impSubs = await prisma.quoteSubItem.findMany({
            where: { name: { contains: 'Imprevisto' } }
          });
          console.log('Total Imprevistos subitems:', impSubs.length);
          const zero = impSubs.filter(s => Number(s.unitCost) === 0);
          const nonZero = impSubs.filter(s => Number(s.unitCost) > 0);
          console.log('Zero cost:', zero.length);
          console.log('Non-zero cost:', nonZero.length);
          console.log('Sample non-zero:', nonZero.slice(0, 10).map(s => s.unitCost));
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
