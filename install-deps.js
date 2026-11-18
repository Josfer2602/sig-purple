import { Client } from 'ssh2';

const conn = new Client();
const config = {
  host: '178.156.196.20',
  port: 22,
  username: 'root',
  password: 'K4A3CanWuJfT'
};

conn.on('ready', () => {
  console.log('Client :: ready');
  // Install all common Puppeteer dependencies for Ubuntu/Debian
  const cmd = 'apt-get update && apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2 libpangocairo-1.0-0';
  
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT: ' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).connect(config);
