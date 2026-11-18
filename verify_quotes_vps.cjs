const { Client } = require('ssh2');
require('dotenv').config({ path: '.env.deploy' });

const config = {
  host: process.env.DEPLOY_HOST,
  port: 22,
  username: process.env.DEPLOY_USER,
  password: process.env.DEPLOY_PASS
};

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`
    cd /var/www/sigpurple/api
    node -e "
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      async function main() {
        const totalQuotes = await prisma.quote.count();
        const totalCategories = await prisma.quoteCategory.count();
        const totalItems = await prisma.quoteItem.count();
        const totalSubItems = await prisma.quoteSubItem.count();
        console.log('--- REPORTE VPS COTIZACIONES ---');
        console.log('Total Cotizaciones:', totalQuotes);
        console.log('Total Categorías:', totalCategories);
        console.log('Total Ítems de Cotización:', totalItems);
        console.log('Total SubÍtems (Costos y Proveedores):', totalSubItems);
      }
      main().finally(() => prisma.\\$disconnect());
    "
  `, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
      .on('data', d => process.stdout.write(d))
      .stderr.on('data', d => process.stderr.write(d));
  });
}).connect(config);
