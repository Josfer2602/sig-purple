import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import util from 'util';
import ExcelJS from 'exceljs';

const execAsync = util.promisify(exec);

export async function generateQuoteExcel(quote: any): Promise<Buffer> {
  const candidateNames = [
    'Cotización.xlsm',
    'Cotizacion.xlsm',
    'Plantilla Cotización.xlsm',
    'Plantilla_Cotizacion.xlsm',
    'Cotización Ejemplo.xlsm',
    'Cotizacion Ejemplo.xlsm'
  ];

  const candidateDirs = [
    __dirname,
    path.join(__dirname, 'templates'),
    path.join(__dirname, '../services'),
    path.join(__dirname, '..'),
    path.join(__dirname, '../../src/services'),
    path.join(process.cwd(), 'server/src/services'),
    path.join(process.cwd(), 'src/services'),
    path.join(process.cwd(), 'server/dist/services'),
    path.join(process.cwd(), 'dist/services'),
    path.join(process.cwd(), 'server'),
    process.cwd()
  ];

  const candidatePaths: string[] = [];
  for (const dir of candidateDirs) {
    for (const name of candidateNames) {
      candidatePaths.push(path.join(dir, name));
    }
  }

  let templatePath = candidatePaths.find(p => fs.existsSync(p));

  if (!templatePath) {
    throw new Error(`Plantilla Cotización no encontrada en el servidor. CWD: ${process.cwd()}, Dir: ${__dirname}`);
  }

  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  const outputPath = path.join(os.tmpdir(), `temp_excel_${timestamp}_${randomSuffix}.xlsm`);
  const jsonPath = path.join(os.tmpdir(), `temp_data_${timestamp}_${randomSuffix}.json`);
  
  const candidateScriptNames = ['generate_excel.py'];
  const candidateScriptPaths: string[] = [];
  for (const dir of candidateDirs) {
    for (const name of candidateScriptNames) {
      candidateScriptPaths.push(path.join(dir, name));
    }
  }
  const scriptPath = candidateScriptPaths.find(p => fs.existsSync(p));

  if (!scriptPath) {
    throw new Error(`Script generate_excel.py no encontrado. CWD: ${process.cwd()}, Dir: ${__dirname}`);
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
        id: item.id || '',
        name: item.name || '',
        quantity: typeof item.quantity === 'string' ? parseFloat(item.quantity.replace(',', '.')) || 0 : (item.quantity ?? 0),
        dates: typeof item.dates === 'string' ? parseFloat(item.dates.replace(',', '.')) || 0 : (item.dates ?? 0),
        details: item.details || '[]',
        internalMultiplierPercent: item.internalMultiplierPercent ?? 0,
        financialExpensePercent: item.financialExpensePercent ?? 10,
        isSpecial: Boolean(item.isSpecial),
        specialRatePercent: item.specialRatePercent !== undefined && item.specialRatePercent !== null
          ? Number(item.specialRatePercent)
          : (item.isSpecial ? 10 : undefined),
        specialSourceItemIds: Array.isArray(item.specialSourceItemIds)
          ? item.specialSourceItemIds
          : (() => {
            if (typeof item.specialSourceItemIds === 'string' && item.specialSourceItemIds.trim().startsWith('[')) {
              try {
                const parsed = JSON.parse(item.specialSourceItemIds);
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            }
            return [];
          })(),
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
  try { fs.unlinkSync(outputPath); } catch (_) { }
  try { fs.unlinkSync(jsonPath); } catch (_) { }

  return buffer;
}

function normStr(s: any): string {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function cleanTokens(s: any): Set<string> {
  const str = String(s || '').replace(/\(.*?\)/g, '');
  const n = normStr(str);
  const matches = n.match(/[a-z0-9]+/g) || [];
  const stopwords = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'para', 'con', 'un', 'una']);
  return new Set(matches.filter(t => !stopwords.has(t)));
}

function cleanStr(s: any): string {
  const str = String(s || '').replace(/\(.*?\)/g, '');
  const n = normStr(str);
  return n.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getCellRaw(cell: any): any {
  if (!cell || cell.value === null || cell.value === undefined) return null;
  const val = cell.value;
  if (typeof val === 'object') {
    if (val.result !== undefined && val.result !== null) return val.result;
    if (val.text !== undefined && val.text !== null) return val.text;
    if (val.richText && Array.isArray(val.richText)) {
      return val.richText.map((t: any) => t.text || '').join('');
    }
  }
  return val;
}

function getCellString(cell: any): string {
  const raw = getCellRaw(cell);
  return raw !== null && raw !== undefined ? String(raw).trim() : '';
}

function getCellNumber(cell: any, fallback = 0): number {
  const raw = getCellRaw(cell);
  if (raw === null || raw === undefined || raw === '') return fallback;
  const num = Number(raw);
  return isNaN(num) ? fallback : num;
}

function findSheet(wb: ExcelJS.Workbook, keywords: string[]): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find(ws => {
    const nClean = normStr(ws.name);
    return keywords.every(k => nClean.includes(k));
  });
}

export async function parseQuoteExcel(buffer: Buffer): Promise<{ metadata: any; categories: any[] }> {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    const ws_det = findSheet(wb, ['detalle', 'proveedor']) || findSheet(wb, ['detalle']);
    const ws_int = findSheet(wb, ['cotizacion', 'interna']) || findSheet(wb, ['interna']) || wb.worksheets[0];

    const metadata = {
      client: '',
      brand: '',
      requirement: '',
      date: '',
      businessName: '',
      paymentConditions: ''
    };

    if (ws_int) {
      try {
        metadata.client = getCellString(ws_int.getCell('G2'));
        metadata.brand = getCellString(ws_int.getCell('G3'));
        metadata.requirement = getCellString(ws_int.getCell('G4'));
        metadata.date = getCellString(ws_int.getCell('G5'));
        metadata.businessName = getCellString(ws_int.getCell('K2'));
        metadata.paymentConditions = getCellString(ws_int.getCell('K4'));
      } catch (_) { }
    }

    const detalle_blocks: any[] = [];
            if (ws_det) {
              let current_cat_name = '';
              let current_item_name = '';
              let collecting_subitems = false;
              let current_subitems: any[] = [];

              const totalRows = ws_det.rowCount || 0;
              for (let r = 1; r <= totalRows; r++) {
                const col2 = getCellRaw(ws_det.getCell(r, 2));
                const col3 = getCellRaw(ws_det.getCell(r, 3));
                const col4 = getCellRaw(ws_det.getCell(r, 4));
                const col5 = getCellRaw(ws_det.getCell(r, 5));
                const col6 = getCellRaw(ws_det.getCell(r, 6));
                const col7 = getCellRaw(ws_det.getCell(r, 7));
                const col9 = getCellRaw(ws_det.getCell(r, 9));

                const val2_str = col2 !== null && col2 !== undefined ? String(col2).trim() : '';
                const val3_str = col3 !== null && col3 !== undefined ? String(col3).trim() : '';
                const val5_str = col5 !== null && col5 !== undefined ? String(col5).trim() : '';

                if (val2_str.toLowerCase().includes('sub') && normStr(val2_str).includes('item')) {
                  collecting_subitems = true;
                  continue;
                }

                if (val2_str.toLowerCase().includes('total') || val5_str.toLowerCase() === 'cantidad') {
                  if (current_item_name && current_subitems.length > 0) {
                    detalle_blocks.push({
                      category: current_cat_name,
                      item: current_item_name,
                      subItems: [...current_subitems],
                      used: false
                    });
                  }
                  collecting_subitems = false;
                  current_subitems = [];
                  continue;
                }

                if (collecting_subitems) {
                  if (val2_str || val3_str) {
                    if (!isNaN(Number(val2_str)) && val2_str !== '') {
                      continue;
                    }

                    const q_val = col4 !== null && col4 !== undefined && !isNaN(Number(col4)) ? Number(col4) : 1.0;
                    const d_val = col5 !== null && col5 !== undefined && !isNaN(Number(col5)) ? Number(col5) : 1.0;
                    let u_val = col6 !== null && col6 !== undefined && !isNaN(Number(col6)) ? Number(col6) : 0.0;
                    const t_val = col7 !== null && col7 !== undefined && !isNaN(Number(col7)) ? Number(col7) : 0.0;

                    if ((u_val === 0.0 || u_val === null) && t_val > 0.0) {
                      const denom = (q_val * d_val) > 0 ? (q_val * d_val) : 1.0;
                      u_val = Math.round((t_val / denom) * 100) / 100;
                    }

                    let sub_name = val2_str || val3_str;
                    if (normStr(sub_name).includes('imprevisto')) {
                      sub_name = 'Imprevistos';
                    }

                    const sub = {
                      name: sub_name,
                      description: (val3_str && val3_str !== val2_str && !normStr(val3_str).includes('imprevisto')) ? val3_str : '',
                      quantity: q_val,
                      dates: d_val,
                      unitCost: u_val,
                      providerName: col9 ? String(col9).trim() : ''
                    };
                    current_subitems.push(sub);
                  }
                  continue;
                }

                if (val2_str && col3 === null && col4 === null && col5 === null) {
                  const next_val2 = getCellString(ws_det.getCell(r + 1, 2));
                  if (next_val2.toLowerCase().includes('sub') && normStr(next_val2).includes('item')) {
                    current_item_name = val2_str;
                  } else {
                    current_cat_name = val2_str;
                  }
                }
              }

              if (collecting_subitems && current_item_name && current_subitems.length > 0) {
                detalle_blocks.push({
                  category: current_cat_name,
                  item: current_item_name,
                  subItems: [...current_subitems],
                  used: false
                });
              }
            }

            const categories: any[] = [];
            let current_cat: any = null;

            let start_row = 10;
            if (ws_int) {
              for (let r = 1; r <= 15; r++) {
                const c6 = getCellString(ws_int.getCell(r, 6));
                if (c6 && ['descripcion', 'concepto', 'item'].some(k => normStr(c6).includes(k))) {
                  start_row = r + 1;
                  break;
                }
              }

              let item_index = 0;
              const maxRowsInt = ws_int.rowCount || 0;

              for (let r = start_row; r <= maxRowsInt; r++) {
                const col6 = ws_int.getCell(r, 6);
                const name_str = getCellString(col6);
                if (!name_str) continue;

                const n_clean = normStr(name_str);
                if (['sub total', 'total general', 'fee de agencia', 'fee agencia'].some(k => n_clean.includes(k))) {
                  break;
                }

                const qtyCell = ws_int.getCell(r, 7);
                const qty_raw = getCellRaw(qtyCell);
                const isCol7MergedWithCol6 = Boolean(qtyCell.isMerged && qtyCell.master && qtyCell.master.address === col6.master?.address);
                const isQtyNonNumeric = qty_raw === null || qty_raw === undefined || String(qty_raw).trim() === '' || isNaN(Number(qty_raw));

                if (isCol7MergedWithCol6 || isQtyNonNumeric) {
                  current_cat = {
                    name: name_str,
                    items: []
                  };
                  categories.push(current_cat);
                } else {
                  if (!current_cat) {
                    current_cat = { name: 'General', items: [] };
                    categories.push(current_cat);
                  }

                  const qty = getCellNumber(ws_int.getCell(r, 7), 1.0);
                  const dates = getCellNumber(ws_int.getCell(r, 8), 1.0);
                  const desc = getCellString(ws_int.getCell(r, 9));
                  const unit_cost = getCellNumber(ws_int.getCell(r, 10), 0.0);
                  let mult = getCellNumber(ws_int.getCell(r, 12), 10.0);
                  if (mult && mult < 1.0) {
                    mult = mult * 100.0;
                  }
                  const contact = getCellString(ws_int.getCell(r, 19));
                  const prod_time = getCellString(ws_int.getCell(r, 20));

                  const details: string[] = [];
                  for (const raw_line of desc.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
                    const s_strip = raw_line.trim();
                    if (!s_strip) continue;
                    if (s_strip.startsWith('*')) {
                      if (raw_line.startsWith('  *') || raw_line.startsWith('\t') || raw_line.startsWith('   ')) {
                        details.push('  * ' + s_strip.replace(/^\*+/, '').trim());
                      } else {
                        details.push('* ' + s_strip.replace(/^\*+/, '').trim());
                      }
                    } else if (s_strip.startsWith('-')) {
                      details.push('- ' + s_strip.replace(/^-+/, '').trim());
                    } else if (s_strip.startsWith('•')) {
                      details.push('• ' + s_strip.replace(/^•+/, '').trim());
                    } else {
                      details.push(s_strip);
                    }
                  }

                  let matched_subs: any = null;
                  let matched_block: any = null;
                  const it_norm = normStr(name_str);
                  const it_clean = cleanStr(name_str);
                  const it_toks = cleanTokens(name_str);
                  const cat_norm = normStr(current_cat.name);

                  // Tier 1: exact category + item name on unused blocks
                  for (const b of detalle_blocks) {
                    if (!b.used && normStr(b.item) === it_norm && normStr(b.category) === cat_norm) {
                      matched_block = b;
                      break;
                    }
                  }

                  // Tier 2: exact item name on unused blocks
                  if (!matched_block) {
                    for (const b of detalle_blocks) {
                      if (!b.used && normStr(b.item) === it_norm) {
                        matched_block = b;
                        break;
                      }
                    }
                  }

                  // Tier 3: clean string match
                  if (!matched_block) {
                    for (const b of detalle_blocks) {
                      if (!b.used && cleanStr(b.item) === it_clean) {
                        matched_block = b;
                        break;
                      }
                    }
                  }

                  // Tier 4: containment on clean string
                  if (!matched_block) {
                    for (const b of detalle_blocks) {
                      if (!b.used) {
                        const b_clean = cleanStr(b.item);
                        if ((b_clean && b_clean.includes(it_clean)) || (it_clean && it_clean.includes(b_clean))) {
                          matched_block = b;
                          break;
                        }
                      }
                    }
                  }

                  // Tier 5: token overlap >= 50%
                  if (!matched_block && it_toks.size > 0) {
                    for (const b of detalle_blocks) {
                      if (!b.used) {
                        const b_toks = cleanTokens(b.item);
                        if (b_toks.size > 0) {
                          let commonCount = 0;
                          for (const t of it_toks) {
                            if (b_toks.has(t)) commonCount++;
                          }
                          const ratio = commonCount / Math.max(it_toks.size, b_toks.size);
                          if (ratio >= 0.5 || (it_toks.size === 1 && commonCount === 1)) {
                            matched_block = b;
                            break;
                          }
                        }
                      }
                    }
                  }

                  // Tier 6: positional
                  if (!matched_block) {
                    if (item_index < detalle_blocks.length && !detalle_blocks[item_index].used) {
                      matched_block = detalle_blocks[item_index];
                    } else {
                      for (const b of detalle_blocks) {
                        if (!b.used) {
                          matched_block = b;
                          break;
                        }
                      }
                    }
                  }

                  if (matched_block) {
                    matched_block.used = true;
                    matched_subs = matched_block.subItems;
                  }

                  item_index++;

                  if (!matched_subs || matched_subs.length === 0) {
                    matched_subs = [{
                      name: name_str,
                      description: '',
                      quantity: qty,
                      dates: dates,
                      unitCost: unit_cost,
                      providerName: ''
                    }];
                  }

                  const has_imp = matched_subs.some((s: any) => String(s.name || '').trim().toLowerCase().includes('imprevisto'));
                  if (!has_imp) {
                    matched_subs.push({
                      name: 'Imprevistos',
                      description: '',
                      quantity: 1,
                      dates: 1,
                      unitCost: 0.0,
                      providerName: ''
                    });
                  }
                  matched_subs.sort((a: any, b: any) => {
                    const aImp = String(a.name || '').toLowerCase().includes('imprevisto') ? 1 : 0;
                    const bImp = String(b.name || '').toLowerCase().includes('imprevisto') ? 1 : 0;
                    return aImp - bImp;
                  });

                  const item = {
                    name: name_str,
                    quantity: qty,
                    dates: dates,
                    details: details,
                    internalMultiplierPercent: mult ? Math.round(mult * 100) / 100 : 10.0,
                    financialExpensePercent: 10.0,
                    providerContact: contact || '',
                    productionTime: prod_time || '',
                    subItems: matched_subs
                  };
                  current_cat.items.push(item);
                }
              }
            }

            const finalCategories = categories.filter(c => c.items && c.items.length > 0);

            return {
              metadata,
              categories: finalCategories
            };
          } catch (err: any) {
            console.error('Error in native parseQuoteExcel:', err);
            throw new Error(`Error al procesar el archivo Excel: ${err?.message || err}`);
          }
        }

