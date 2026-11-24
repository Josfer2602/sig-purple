import puppeteer, { Browser } from 'puppeteer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

let browserInstance: Browser | null = null;

async function resolveChromeExecutable(): Promise<string | undefined> {
  const candidates: string[] = [];

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    candidates.push(process.env.PUPPETEER_EXECUTABLE_PATH.trim());
  }

  try {
    const defaultPath = await Promise.resolve((puppeteer as any).executablePath?.());
    if (typeof defaultPath === 'string' && defaultPath.trim()) {
      candidates.push(defaultPath.trim());
    }
  } catch {
    // Ignore executablePath lookup error and check common locations
  }

  // Fallback paths in Render/Linux or custom workspace cache
  const localCacheBase = path.join(__dirname, '../../.cache/puppeteer');
  if (fs.existsSync(localCacheBase)) {
    try {
      const walkForChrome = (dir: string, depth: number = 0): string | null => {
        if (depth > 4) return null;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isFile() && (entry.name === 'chrome' || entry.name === 'chrome.exe')) {
            return full;
          }
          if (entry.isDirectory()) {
            const found = walkForChrome(full, depth + 1);
            if (found) return found;
          }
        }
        return null;
      };
      const foundInCache = walkForChrome(localCacheBase);
      if (foundInCache) candidates.push(foundInCache);
    } catch {
      // Ignore cache scan failures
    }
  }

  if (process.platform === 'linux') {
    candidates.push(
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    );
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export async function checkPdfEngineHealth(): Promise<{ available: boolean; executablePath?: string; error?: string }> {
  try {
    const execPath = await resolveChromeExecutable();
    if (execPath) {
      return { available: true, executablePath: execPath };
    }
    let expected = '';
    try {
      expected = String(await Promise.resolve((puppeteer as any).executablePath?.()) || '');
    } catch {
      expected = '';
    }
    return {
      available: false,
      error: expected
        ? `No se encontró el binario de Chrome en ${expected}.`
        : 'No se encontró ningún binario de Chromium/Chrome instalado.'
    };
  } catch (err: any) {
    return {
      available: false,
      error: err?.message || 'Error verificando motor PDF Puppeteer'
    };
  }
}

async function getBrowserInstance(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    try {
      if (browserInstance) {
        await browserInstance.close().catch(() => {});
      }
    } catch {}

    const executablePath = await resolveChromeExecutable();
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio'
    ];
    if (process.platform === 'linux') {
      launchArgs.push('--no-zygote');
    }

    browserInstance = await puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: launchArgs
    });
  }
  return browserInstance;
}

export async function closePdfBrowser(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {
      // Ignore close error
    } finally {
      browserInstance = null;
    }
  }
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
    } catch {}

    // Use domcontentloaded for fast response without waiting indefinitely for service workers/websockets
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Wait for the 'render-complete' element injected by React
    try {
      await page.waitForSelector('#render-complete', { timeout: 12000 });
    } catch {
      console.warn(`Timeout waiting for #render-complete on ${url}, proceeding anyway...`);
    }

    // Brief stabilization pause (300ms) for fonts/styles
    await new Promise(r => setTimeout(r, 300));

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
    } catch {}
  }
}
