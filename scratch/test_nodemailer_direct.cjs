const { Client } = require('ssh2');
require('dotenv').config({ path: '.env.deploy' });

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`
    cd /var/www/sigpurple/api
    node -e "
      const n = require('nodemailer');
      const t = n.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: 'jose.narva@purplebtl.com',
          pass: 'dilkijawrxjcuaba'
        }
      });
      t.verify()
        .then(() => console.log('DIRECT VERIFY SUCCESS!'))
        .catch(e => console.error('DIRECT VERIFY ERROR:', e.message));
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
