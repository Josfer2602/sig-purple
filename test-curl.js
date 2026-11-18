import { Client } from 'ssh2';

const conn = new Client();
const config = {
  host: '178.156.196.20',
  port: 22,
  username: 'root',
  password: 'K4A3CanWuJfT'
};

conn.on('ready', () => {
  const cmd = `curl -I https://sigpurple.simplegoapp.de`;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT: ' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).connect(config);
