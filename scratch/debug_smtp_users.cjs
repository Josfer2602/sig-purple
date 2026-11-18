const { Client } = require('ssh2');
require('dotenv').config({ path: '.env.deploy' });

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`
    cd /var/www/sigpurple/api
    node -e "
      const { PrismaClient } = require('@prisma/client');
      const nodemailer = require('nodemailer');
      const prisma = new PrismaClient();

      async function testUser(email) {
        console.log('=== TESTING USER:', email);
        const userDb = await prisma.user.findFirst({ where: { email } });
        console.log('userDb:', JSON.stringify(userDb));

        const userSmtp = (userDb?.smtpHost && userDb.smtpHost.trim()) ? {
          host: userDb.smtpHost.trim(),
          port: userDb.smtpPort || 587,
          user: userDb.smtpUser?.trim() || '',
          pass: userDb.smtpPass?.trim() || ''
        } : (userDb?.smtpPass ? {
          host: userDb?.smtpHost || 'smtp.gmail.com',
          port: userDb?.smtpPort || 587,
          user: userDb?.smtpUser || userDb?.email,
          pass: userDb?.smtpPass
        } : undefined);

        console.log('Calculated smtp:', userSmtp);

        // Now test what sendEmail does:
        const host = (userSmtp?.host && userSmtp.host.trim()) || process.env.SMTP_HOST || 'smtp.gmail.com';
        const port = userSmtp?.port || parseInt(process.env.SMTP_PORT || '587');
        const user = (userSmtp?.user && userSmtp.user.trim()) || process.env.SMTP_USER;
        const pass = (userSmtp?.pass && userSmtp.pass.trim()) || process.env.SMTP_PASS;

        console.log('Final credentials -> Host:', host, 'Port:', port, 'User:', user, 'Pass:', pass);

        const transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass }
        });

        try {
          await transporter.verify();
          console.log('VERIFY SUCCESS for', email);
        } catch(e) {
          console.log('VERIFY ERROR for', email, e.message);
        }
      }

      async function run() {
        await testUser('admin@purplebtl.com');
        await testUser('jose.narva@purplebtl.com');
        await prisma.\\$disconnect();
      }
      run();
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
