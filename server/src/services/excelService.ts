import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export async function generateQuoteExcel(quote: any): Promise<Buffer> {
  const candidatePaths = [
    path.join(__dirname, 'Cotización.xlsm'),
    path.join(__dirname, 'Plantilla Cotización.xlsm'),
    path.join(__dirname, '../Cotización.xlsm'),
    path.join(__dirname, '../Plantilla Cotización.xlsm'),
    path.join(process.cwd(), 'Cotización.xlsm'),
    path.join(process.cwd(), 'Plantilla Cotización.xlsm'),
    '/var/www/sigpurple/api/Cotización.xlsm',
    '/var/www/sigpurple/api/Plantilla Cotización.xlsm',
    '/var/www/sigpurple/api/dist/services/Cotización.xlsm',
    '/var/www/sigpurple/api/dist/services/Plantilla Cotización.xlsm',
    '/var/www/sigpurple/Plantilla Cotización.xlsm',
    path.join(__dirname, '../../../Cotización Ejemplo.xlsm'),
    path.join(process.cwd(), 'Cotización Ejemplo.xlsm')
  ];

  let templatePath = candidatePaths.find(p => fs.existsSync(p));

  if (!templatePath) {
    throw new Error('Plantilla Cotización no encontrada en el servidor.');
  }

  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  const outputPath = path.join(os.tmpdir(), `temp_excel_${timestamp}_${randomSuffix}.xlsm`);
  const jsonPath = path.join(os.tmpdir(), `temp_data_${timestamp}_${randomSuffix}.json`);
  const scriptPath = path.join(__dirname, 'generate_excel.py');

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Script generate_excel.py no encontrado en: ${scriptPath}`);
  }

  // Write JSON to temp file to avoid shell escaping issues
  const dataObj = {
    client: quote.client || '',
    brand: quote.brand || '',
    requirement: quote.requirement || '',
    date: quote.date || '',
    businessName: quote.businessName || '',
    ruc: quote.ruc || '',
    paymentConditions: quote.paymentConditions || '',
    currency: quote.currency || 'PEN',
    exchangeRate: quote.exchangeRate !== undefined ? Number(quote.exchangeRate) : 1.0,
    includeIgv: Boolean(quote.includeIgv),
    categories: (quote.categories || []).map((cat: any) => ({
      name: cat.name || '',
      items: (cat.items || []).map((item: any) => ({
        name: item.name || '',
        quantity: typeof item.quantity === 'string' ? parseFloat(item.quantity.replace(',', '.')) || 0 : (item.quantity ?? 0),
        dates: typeof item.dates === 'string' ? parseFloat(item.dates.replace(',', '.')) || 0 : (item.dates ?? 0),
        details: item.details || '[]',
        internalMultiplierPercent: item.internalMultiplierPercent ?? 0,
        financialExpensePercent: item.financialExpensePercent ?? 10,
        providerContact: item.providerContact || '',
        productionTime: item.productionTime || '',
        subItems: (item.subItems || []).map((sub: any) => ({
          name: sub.name || '',
          description: sub.description || '',
          quantity: typeof sub.quantity === 'string' ? parseFloat(sub.quantity.replace(',', '.')) || 0 : (sub.quantity ?? 0),
          dates: typeof sub.dates === 'string' ? parseFloat(sub.dates.replace(',', '.')) || 0 : (sub.dates ?? 0),
          unitCost: typeof sub.unitCost === 'string' ? parseFloat(sub.unitCost.replace(',', '.')) || 0 : (sub.unitCost ?? 0),
          providerName: sub.providerName || ''
        }))
      }))
    }))
  };

  fs.writeFileSync(jsonPath, JSON.stringify(dataObj), 'utf-8');

  const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
  const cmd = `${pythonBin} "${scriptPath}" "${templatePath}" "${outputPath}" "${jsonPath}"`;

  const { stdout, stderr } = await execAsync(cmd);

  if (stderr && stderr.trim()) {
    console.warn('Python stderr:', stderr);
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Python script failed to produce output. stdout: ${stdout}, stderr: ${stderr}`);
  }

  const buffer = fs.readFileSync(outputPath);

  // Cleanup
  try { fs.unlinkSync(outputPath); } catch (_) {}
  try { fs.unlinkSync(jsonPath); } catch (_) {}

  return buffer;
}

export async function parseQuoteExcel(buffer: Buffer): Promise<{ metadata: any; categories: any[] }> {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  const inputPath = path.join(os.tmpdir(), `temp_input_quote_${timestamp}_${randomSuffix}.xlsm`);
  const outputPath = path.join(os.tmpdir(), `temp_output_quote_${timestamp}_${randomSuffix}.json`);

  const candidateScriptPaths = [
    path.join(__dirname, 'parse_quote_excel.py'),
    path.join(__dirname, '../services/parse_quote_excel.py'),
    path.join(process.cwd(), 'server/src/services/parse_quote_excel.py'),
    path.join(process.cwd(), 'src/services/parse_quote_excel.py'),
    '/var/www/sigpurple/api/dist/services/parse_quote_excel.py',
    '/var/www/sigpurple/api/src/services/parse_quote_excel.py'
  ];
  const scriptPath = candidateScriptPaths.find(p => fs.existsSync(p));
  if (!scriptPath) {
    throw new Error('Script parse_quote_excel.py no encontrado.');
  }

  fs.writeFileSync(inputPath, buffer);

  const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
  const cmd = `${pythonBin} "${scriptPath}" "${inputPath}" "${outputPath}"`;

  try {
    const { stdout, stderr } = await execAsync(cmd);
    if (stderr && stderr.trim()) {
      console.warn('Python parse stderr:', stderr);
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error(`Error al procesar el archivo Excel. stdout: ${stdout}, stderr: ${stderr}`);
    }

    const jsonStr = fs.readFileSync(outputPath, 'utf-8');
    const result = JSON.parse(jsonStr);
    return result;
  } finally {
    try { fs.unlinkSync(inputPath); } catch (_) {}
    try { fs.unlinkSync(outputPath); } catch (_) {}
  }
}

