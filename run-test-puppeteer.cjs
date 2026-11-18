const { Client } = require('ssh2');
const fs = require('fs');
const script = fs.readFileSync('test-puppeteer.cjs', 'utf8');

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`cd /var/www/sigpurple/api && node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
          .on('data', d => console.log(d.toString()))
          .stderr.on('data', d => console.error(d.toString()));
  });
}).connect({ host: '178.156.196.20', port: 22, username: 'root', password: 'K4A3CanWuJfT' });
