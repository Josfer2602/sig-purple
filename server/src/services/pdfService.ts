import puppeteer, { Browser } from 'puppeteer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

let browserInstance: Browser | null = null;

async function getBrowserInstance(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    try {
      if (browserInstance) {
        await browserInstance.close().catch(() => {});
      }
    } catch (e) {}
    browserInstance = await puppeteer.launch({ 
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run'
      ]
    });
  }
  return browserInstance;
}

export async function generatePdfFromUrl(url: string, prefix: string = 'document'): Promise<string> {
  const browser = await getBrowserInstance();
  const page = await browser.newPage();
  
  try {
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 1 });

    // Si la URL contiene token, inyectarlo como header Authorization para cualquier request interno
    try {
      const parsedUrl = new URL(url);
      const token = parsedUrl.searchParams.get('token');
      if (token) {
        await page.setExtraHTTPHeaders({
          'Authorization': `Bearer ${token}`
        });
      }
    } catch (e) {}

    // Use domcontentloaded for fast response without waiting indefinitely for service workers/websockets
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    
    // Wait for the 'render-complete' element injected by React
    try {
      await page.waitForSelector('#render-complete', { timeout: 12000 });
    } catch (e) {
      console.warn(`Timeout waiting for #render-complete on ${url}, proceeding anyway...`);
    }

    // Brief stabilization pause (300ms) for fonts/styles
    await new Promise(r => setTimeout(r, 300));

    // Create uploads dir if it doesn't exist
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filename = `${prefix}_${crypto.randomBytes(4).toString('hex')}.pdf`;
    const filePath = path.join(uploadsDir, filename);

    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });

    return filePath;
  } catch (err) {
    if (browserInstance && !browserInstance.connected) {
      browserInstance = null;
    }
    throw err;
  } finally {
    try {
      await page.close();
    } catch (e) {}
  }
}
