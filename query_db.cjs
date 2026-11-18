const { Client } = require('ssh2');
require('dotenv').config({ path: '.env.deploy' });

const remoteScript = `
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function run() {
  const count = await p.proyecto.count();
  const sample = await p.proyecto.findMany({
    take: 8,
    orderBy: { id: 'asc' },
    include: { cliente: true }
  });
  console.log(JSON.stringify({ count, sample }, null, 2));
}
run().finally(() => p['$disconnect']());
`;

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`cd /var/www/sigpurple/api && node -e "${remoteScript.replace(/\n/g, ' ')}"`, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', () => conn.end());
  });
}).connect({
  host: process.env.DEPLOY_HOST,
  port: 22,
  username: process.env.DEPLOY_USER,
  password: process.env.DEPLOY_PASS
});
