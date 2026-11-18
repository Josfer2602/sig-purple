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
        const c = await prisma.cliente.count();
        const p = await prisma.proyecto.count();
        const f = await prisma.facturaCliente.count();
        const q = await prisma.quote.count();
        const o = await prisma.orden.count();
        console.log('--- REPORTE FINAL VPS ---');
        console.log('Clientes:', c);
        console.log('Proyectos:', p);
        console.log('Facturas Cliente:', f);
        console.log('Cotizaciones / Rentabilidad:', q);
        console.log('Ordenes:', o);
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
