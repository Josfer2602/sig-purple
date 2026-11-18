const { Client } = require('ssh2');
require('dotenv').config({ path: '.env.deploy' });

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`
    cd /var/www/sigpurple/api
    node -e "
      const { PrismaClient } = require('@prisma/client');
      const { sendEmail } = require('./dist/services/emailService');
      const prisma = new PrismaClient();

      async function test() {
        const u = await prisma.user.findUnique({ where: { id: 'c16e9f1c-4bd7-424f-9dfc-b3fe28db8cd2' } });
        console.log('User found:', u);
        console.log('process.env.SMTP_USER:', JSON.stringify(process.env.SMTP_USER));
        console.log('process.env.SMTP_PASS:', JSON.stringify(process.env.SMTP_PASS));
        const smtp = u?.smtpHost ? { host: u.smtpHost, port: u.smtpPort || 587, user: u.smtpUser || '', pass: u.smtpPass || '' } : undefined;
        console.log('SMTP object:', smtp);
        try {
          const res = await sendEmail('jose.narva@purplebtl.com', 'Test', '<p>Test</p>', [], smtp);
          console.log('Success:', res);
        } catch (e) {
          console.error('Error in sendEmail:', e);
        }
      }
      test().finally(() => prisma.\\$disconnect());
    "
  `, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
      .on('data', d => process.stdout.write(d))
      .stderr.on('data', d => process.stderr.write(d));
  });
}).connect({
  host: process.env.DEPLOY_HOST,
  port: 22,
  username: process.env.DEPLOY_USER,
  password: process.env.DEPLOY_PASS
});
