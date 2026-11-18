const { Client } = require('ssh2');

const script = `
const fs = require('fs');
const buffer = fs.readFileSync('/var/www/sigpurple/api/test_download.pdf');
const str = buffer.toString('utf8');
const printable = str.replace(/[^\\x20-\\x7E]/g, '');
console.log(printable.substring(0, 1000));
`;

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
          .on('data', d => console.log(d.toString()))
          .stderr.on('data', d => console.error(d.toString()));
  });
}).connect({ host: '178.156.196.20', port: 22, username: 'root', password: 'K4A3CanWuJfT' });
