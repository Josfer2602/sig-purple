const { Client } = require('ssh2');
const fs = require('fs');

const script = `
const fs = require('fs');
const buffer = fs.readFileSync('/var/www/sigpurple/api/test_download.pdf');
console.log(buffer.toString('base64'));
`;

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, (err, stream) => {
    if (err) throw err;
    let base64 = '';
    stream.on('close', () => {
      conn.end();
      fs.writeFileSync('f:/SIG Purple V2/test_download.pdf', Buffer.from(base64.trim(), 'base64'));
      console.log('Saved locally to test_download.pdf');
    })
    .on('data', d => { base64 += d.toString(); })
    .stderr.on('data', d => console.error(d.toString()));
  });
}).connect({ host: '178.156.196.20', port: 22, username: 'root', password: 'K4A3CanWuJfT' });
