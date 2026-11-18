const { Client } = require('ssh2');

const script = `
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: 'jose.narva@purplebtl.com', pass: 'ujpwxrmnuqmrudlt' } });
transporter.verify((err, success) => {
  if (err) {
    console.error('SMTP Error:', err.message);
    process.exit(1);
  } else {
    console.log('Server is ready');
    process.exit(0);
  }
});
`;

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`cd /var/www/sigpurple/api && node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
          .on('data', d => console.log(d.toString()))
          .stderr.on('data', d => console.error(d.toString()));
  });
}).connect({ host: '178.156.196.20', port: 22, username: 'root', password: 'K4A3CanWuJfT' });
