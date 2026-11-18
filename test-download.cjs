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
