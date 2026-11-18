const puppeteer = require('puppeteer');

async function test() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  const url = 'https://sigpurple.simplegoapp.de/?printOrden=OC-2026-650';
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('#render-complete', { timeout: 10000 }).catch(e => console.log('Timeout waiting for #render-complete'));
  const buffer = await page.pdf({ format: 'A4', printBackground: true });
  require('fs').writeFileSync('/var/www/sigpurple/api/test_puppeteer.pdf', buffer);
  console.log('PDF generated size:', buffer.length);
  await browser.close();
}
test();
