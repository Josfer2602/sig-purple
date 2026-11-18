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
          const hist = await prisma.quoteHistory.findMany({
            where: { quoteId: 'Q-MVA2FIH7-TO8P' }
          });
          console.log('History count:', hist.length);
          hist.forEach(h => {
            console.log(' - Date:', h.date, 'summary:', h.summary, 'author:', h.author);
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
