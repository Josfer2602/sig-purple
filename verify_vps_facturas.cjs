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
        const total = await prisma.facturaCliente.count();
        const withSlash = await prisma.facturaCliente.count({ where: { numeroFactura: { contains: '/' } } });
        const sample = await prisma.facturaCliente.findMany({
          where: { numeroFactura: { in: ['E001-678', 'E001-680', 'FE001-1798', 'FE001-1856', 'E001-368', 'E001-369'] } },
          select: { numeroFactura: true, montoSinIgv: true, montoConIgv: true, aplicaDetraccion: true, estado: true }
        });
        console.log('Total facturas en BD:', total);
        console.log('Facturas con slash (/):', withSlash);
        console.log('Sample desagrupadas:', JSON.stringify(sample, null, 2));
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
