const { Client } = require('ssh2');
require('dotenv').config({ path: '.env.deploy' });

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`
    cd /var/www/sigpurple/api
    node -e "
      const jwt = require('jsonwebtoken');
      const http = require('http');

      function test(user) {
        return new Promise((resolve) => {
          const token = jwt.sign(user, '7720120ef94c5d0396e41469ad81bd31a2898b18a1d0425254f105fc5971571e');
          const req = http.request({
            hostname: 'localhost',
            port: 5000,
            path: '/api/email/test',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            }
          }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
              console.log('USER:', user.email, '-> STATUS:', res.statusCode, 'DATA:', data);
              resolve();
            });
          });
          req.write(JSON.stringify({ to: 'jose.narva@purplebtl.com' }));
          req.end();
        });
      }

      async function run() {
        await test({ id: '3dd23338-dff7-4d78-9acb-4e57a268bba1', email: 'admin@purplebtl.com', role: 'Admin' });
        await test({ id: 'c16e9f1c-4bd7-424f-9dfc-b3fe28db8cd2', email: 'jose.narva@purplebtl.com', role: 'Admin' });
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
