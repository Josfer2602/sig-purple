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
  // Reset the postgres user password to admin123
  const cmd = `su - postgres -c "psql -c \\"ALTER USER postgres WITH PASSWORD 'admin123';\\""`;
  
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
