import puppeteer, { Browser, Page } from 'puppeteer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

let browserInstance: Browser | null = null;
let activePdfJobs = 0;
let closeRequested = false;

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
  // Si hay PDFs generándose, cerrar recién cuando termine el último para no cortarlos
  if (activePdfJobs > 0) {
    closeRequested = true;
    return;
  }
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

/**
 * Cuando el frontend y la API viven en el mismo dominio, las vistas de impresión
 * deben consultar `/api/...` contra ese mismo dominio. Si el bundle quedó compilado
 * con una URL de API antigua (por ejemplo un dominio de Render/Vercel ya retirado),
 * redirigimos esas llamadas al origen actual para que el PDF siempre se genere.
 */
const buildSameOriginApiBridgeScript = (apiOrigin: string) => `
(() => {
  try {
    var apiOrigin = ${JSON.stringify(apiOrigin)};
    if (!apiOrigin || window.location.origin !== apiOrigin) return;

    function rewrite(input) {
      try {
        var raw = typeof input === 'string' ? input : (input && input.url) || '';
        if (!raw) return input;
        var parsed = new URL(raw, window.location.href);
        if (parsed.origin === apiOrigin) return input;
        if (parsed.pathname.indexOf('/api/') !== 0) return input;
        return parsed.pathname + parsed.search + parsed.hash;
      } catch (e) {
        return input;
      }
    }

    if (window.fetch) {
      var nativeFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        return nativeFetch(rewrite(input), init);
      };
    }

    if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {
      var nativeOpen = window.XMLHttpRequest.prototype.open;
      window.XMLHttpRequest.prototype.open = function (method, requestUrl) {
        var args = Array.prototype.slice.call(arguments);
        args[1] = rewrite(requestUrl);
        return nativeOpen.apply(this, args);
      };
    }
  } catch (e) {
    // Si el navegador no permite el puente, la vista de impresión funciona igual.
  }
})();
`;

// Evita filtrar tokens JWT en los logs de diagnóstico
const sanitizePdfUrlForLog = (raw: string): string => {
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.searchParams.has('token')) parsed.searchParams.set('token', '***');
    return parsed.toString();
  } catch {
    return raw.replace(/([?&]token=)[^&]+/i, '$1***');
  }
};

export async function generatePdfFromUrl(
  url: string,
  prefix: string = 'document',
  options?: { sameOriginApiOrigin?: string }
): Promise<string> {
  activePdfJobs++;
  let page: Page | null = null;

  try {
    const browser = await getBrowserInstance();
    page = await browser.newPage();

    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 1 });

    if (options?.sameOriginApiOrigin) {
      await page.evaluateOnNewDocument(buildSameOriginApiBridgeScript(options.sameOriginApiOrigin));
    }

    page.on('pageerror', (err: any) => {
      console.warn(`[PDF] Error JS en ${sanitizePdfUrlForLog(url)}: ${err?.message || err}`);
    });
    page.on('requestfailed', (request: any) => {
      const failure = request?.failure?.();
      console.warn(`[PDF] Request falló en ${sanitizePdfUrlForLog(url)}: ${sanitizePdfUrlForLog(request?.url?.() || '')} (${failure?.errorText || 'sin detalle'})`);
    });

    // Use domcontentloaded without injecting global extraHTTPHeaders (prevents CORS preflight errors on external logos and keeps standalone print views clean)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

    // Wait for the 'render-complete' element injected by React once /api/print/* resolves
    try {
      await page.waitForSelector('#render-complete', { timeout: 20000 });
    } catch (waitErr: any) {
      let pageSnippet = '';
      try {
        pageSnippet = await page.evaluate(() => (document.body?.innerText || '').slice(0, 500));
      } catch {}
      throw new Error(
        `La vista de impresión no terminó de renderizar (${sanitizePdfUrlForLog(url)}). ` +
        `Verifica que la web pública cargue y que /api/print responda. ` +
        `Detalle: ${waitErr?.message || waitErr}${pageSnippet ? ` | Contenido: ${pageSnippet.replace(/\s+/g, ' ').trim()}` : ''}`
      );
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
    if (page) {
      try {
        await page.close();
      } catch {}
    }
    activePdfJobs = Math.max(0, activePdfJobs - 1);
    if (activePdfJobs === 0 && closeRequested) {
      closeRequested = false;
      await closePdfBrowser();
    }
  }
}
