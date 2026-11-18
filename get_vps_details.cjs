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
        const clientes = await prisma.cliente.findMany({ select: { id: true, empresa: true } });
        const proyectos = await prisma.proyecto.findMany({
          select: { id: true, nombre: true, estado: true, subtotal: true, fechaRegistro: true, cliente: { select: { empresa: true } } }
        });
        console.log('=== CLIENTES EN VPS (' + clientes.length + ') ===');
        clientes.forEach(c => console.log(' - [' + c.id + '] ' + c.empresa));
        console.log('\\n=== PROYECTOS EN VPS (' + proyectos.length + ') ===');
        proyectos.forEach(p => console.log(' - [' + p.id + '] (' + (p.cliente ? p.cliente.empresa : 'Sin Cli') + ') ' + p.nombre + ' | Subtotal: ' + p.subtotal + ' | Estado: ' + p.estado));
      }
      main().finally(() => prisma.\\$disconnect());
    "
  `, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.end();
    }).on('data', (d) => process.stdout.write(d)).stderr.on('data', (d) => process.stderr.write(d));
  });
}).connect(config);
