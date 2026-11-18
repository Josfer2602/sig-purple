const { Client } = require('ssh2');
const fs = require('fs');

const script = `
const { google } = require('googleapis');
const fs = require('fs');

async function test() {
  const auth = new google.auth.GoogleAuth({
    keyFile: '/var/www/sigpurple/api/google-credentials.json',
    scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'],
  });
  const drive = google.drive({ version: 'v3', auth });

  const fileId = '1s9a8yxq_lH16fE7aN_2apvVs8316hdX0';
  
  try {
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    fs.writeFileSync('test_download.pdf', Buffer.from(res.data));
    console.log('Downloaded file size:', res.data.byteLength);
  } catch (e) {
    console.error('Error:', e.message);
  }
}
test();
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
