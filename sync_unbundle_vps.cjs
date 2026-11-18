const { Client } = require('ssh2');
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
require('dotenv').config({ path: '.env.deploy' });

const config = {
  host: process.env.DEPLOY_HOST,
  port: 22,
  username: process.env.DEPLOY_USER,
  password: process.env.DEPLOY_PASS
};

async function main() {
  console.log('🚀 Iniciando despliegue de normalización y desagrupado de facturas en VPS...');

  const sftp = new SftpClient();
  await sftp.connect(config);

  console.log('[1/3] 📤 Subiendo google_facturas.csv y unbundle_facturas.cjs a VPS...');
  await sftp.fastPut(
    path.join(__dirname, 'google_facturas.csv'),
    '/var/www/sigpurple/api/google_facturas.csv'
  );
  await sftp.fastPut(
    path.join(__dirname, 'server/unbundle_facturas.cjs'),
    '/var/www/sigpurple/api/unbundle_facturas.cjs'
  );
  await sftp.end();
  console.log('✅ Archivos subidos con éxito.');

  console.log('[2/3] ⚙️ Ejecutando unbundle_facturas.cjs en VPS...');
  await runRemoteCommands(`
    cd /var/www/sigpurple/api
    node unbundle_facturas.cjs
    pm2 restart sigpurple-api --update-env
  `);

  console.log('[3/3] ✨ Proceso completado en VPS.');
}

function runRemoteCommands(cmd) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        stream.on('close', (code) => {
          conn.end();
          if (code === 0) resolve();
          else reject(new Error('Código de salida remoto: ' + code));
        }).on('data', (data) => {
          process.stdout.write(data);
        }).stderr.on('data', (data) => {
          process.stderr.write(data);
        });
      });
    }).on('error', reject).connect(config);
  });
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
