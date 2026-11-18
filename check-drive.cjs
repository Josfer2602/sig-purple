const { Client } = require('ssh2');

const script = `
const { google } = require('googleapis');
async function test() {
  const auth = new google.auth.GoogleAuth({
    keyFile: '/var/www/sigpurple/api/google-credentials.json',
    scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.metadata.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });
  try {
    const res = await drive.files.get({ fileId: '1s9a8yxq_lH16fE7aN_2apvVs8316hdX0', fields: '*' });
    console.log(JSON.stringify(res.data, null, 2));
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
