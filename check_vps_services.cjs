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
        const proys = await prisma.proyecto.findMany({ select: { tipoServicio: true } });
        const counts = {};
        proys.forEach(p => {
          counts[p.tipoServicio] = (counts[p.tipoServicio] || 0) + 1;
        });
        console.log('Distinct tipoServicio on VPS:', counts);
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
