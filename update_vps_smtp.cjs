const { Client } = require('ssh2');
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
require('dotenv').config({ path: '.env.deploy' });

const sshConfig = {
  host: process.env.DEPLOY_HOST,
  port: 22,
  username: process.env.DEPLOY_USER,
  password: process.env.DEPLOY_PASS
};

async function run() {
  console.log('1. Uploading updated .env to VPS...');
  const sftp = new SftpClient();
  await sftp.connect(sshConfig);
  await sftp.fastPut(path.join(__dirname, 'server/.env.production'), '/var/www/sigpurple/api/.env');
  await sftp.end();
  console.log('2. .env uploaded.');

  console.log('3. Updating DB and restarting PM2 on VPS...');
  const conn = new Client();
  conn.on('ready', () => {
    conn.exec(`
      cd /var/www/sigpurple/api
      node -e '
        const { PrismaClient } = require("@prisma/client");
        const prisma = new PrismaClient();
        prisma.user.updateMany({
          where: { email: "jose.narva@purplebtl.com" },
          data: { smtpPass: "dilkijawrxjcuaba" }
        }).then(r => { console.log("VPS DB user updated:", r); process.exit(0); });
      '
      pm2 restart sigpurple-api --update-env
      sleep 2
      node -e '
        const nodemailer = require("nodemailer");
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 587,
          secure: false,
          auth: { user: "jose.narva@purplebtl.com", pass: "dilkijawrxjcuaba" }
        });
        transporter.verify((err, success) => {
          if (err) console.error("VPS SMTP ERROR:", err.message);
          else console.log("VPS SMTP SUCCESS:", success);
          process.exit(0);
        });
      '
    `, (err, stream) => {
      if (err) throw err;
      stream.on('close', () => {
        conn.end();
        console.log('Done!');
      })
      .on('data', d => process.stdout.write(d))
      .stderr.on('data', d => process.stderr.write(d));
    });
  }).connect(sshConfig);
}

run().catch(console.error);
