const fs = require('fs');

const logPath = 'C:/Users/josen/.gemini/antigravity/brain/639bbd39-811e-4a11-8e5c-cdad93e456dd/.system_generated/tasks/task-4013.log';
const content = fs.readFileSync(logPath, 'utf8');

const projectBlocks = content.split('======================================================================').slice(1);

let totalProjects = projectBlocks.length;
let totalOrdersInDB = 0;
let totalOrdersFoundInDrive = 0;
let totalPagosInDB = 0;
let totalPagosFoundInDrive = 0;

const projectsReport = [];

for (const block of projectBlocks) {
  const nameLine = block.split('\n').find(l => l.startsWith('PROYECTO:'));
  const clientLine = block.split('\n').find(l => l.startsWith('CLIENTE:'));
  const driveIdLine = block.split('\n').find(l => l.startsWith('DRIVE ID:'));

  if (!nameLine) continue;

  const proyMatch = nameLine.match(/PROYECTO: \[(.*?)\] "(.*?)"/);
  const proyId = proyMatch ? proyMatch[1] : '';
  const proyName = proyMatch ? proyMatch[2] : '';
  const clientName = clientLine ? clientLine.replace(/CLIENTE:\s+\[.*?\]\s+/, '').trim() : 'Sin Cliente';
  const driveId = driveIdLine ? driveIdLine.replace('DRIVE ID:', '').trim() : '';

  // Parse Orders in DB
  const lines = block.split('\n');
  const orderIdsInDb = [];
  const pagoIdsInDb = [];

  let inOrders = false;
  let inPagos = false;

  for (const line of lines) {
    if (line.startsWith('ÓRDENES EN BD')) {
      inOrders = true;
      inPagos = false;
      continue;
    }
    if (line.startsWith('PAGOS EN BD')) {
      inOrders = false;
      inPagos = true;
      continue;
    }
    if (line.startsWith('📁 Contenido') || line.startsWith('🔎 Buscando')) {
      inOrders = false;
      inPagos = false;
    }

    if (inOrders && line.trim().startsWith('- [')) {
      const m = line.match(/(OC|OS)-[\w-]+/);
      if (m) orderIdsInDb.push(m[0]);
    }
    if (inPagos && line.trim().startsWith('- Pago')) {
      const m = line.match(/PAG-[\w-]+/);
      if (m) pagoIdsInDb.push(m[0]);
    }
  }

  // Parse files found in Drive
  const ocSection = block.split('[Producción > Órdenes de compra]:')[1]?.split('[Producción >')[0] || '';
  const pagoSection = block.split('[Producción > Pago a proveedor]:')[1]?.split('[Producción >')[0] || '';

  const foundOrders = [];
  const missingOrders = [];
  for (const oid of orderIdsInDb) {
    totalOrdersInDB++;
    if (ocSection.includes(oid)) {
      foundOrders.push(oid);
      totalOrdersFoundInDrive++;
    } else {
      missingOrders.push(oid);
    }
  }

  const foundPagos = [];
  const missingPagos = [];
  for (const pid of pagoIdsInDb) {
    totalPagosInDB++;
    if (pagoSection.includes(pid)) {
      foundPagos.push(pid);
      totalPagosFoundInDrive++;
    } else {
      missingPagos.push(pid);
    }
  }

  const hasActivity = orderIdsInDb.length > 0 || pagoIdsInDb.length > 0 || ocSection.trim().length > 30 || pagoSection.trim().length > 30;

  projectsReport.push({
    proyId,
    proyName,
    clientName,
    hasDriveFolder: !driveId.includes('No registrado') && !driveId.includes('Ninguno') && driveId.length > 5,
    driveId,
    totalOrdersInDB: orderIdsInDb.length,
    foundOrders,
    missingOrders,
    totalPagosInDB: pagoIdsInDb.length,
    foundPagos,
    missingPagos,
    hasActivity
  });
}

const activeProjects = projectsReport.filter(p => p.hasActivity);

console.log('=== RESUMEN GLOBAL ===');
console.log('Total de proyectos auditados:', totalProjects);
console.log('Proyectos con órdenes o pagos:', activeProjects.length);
console.log('Total Órdenes en BD:', totalOrdersInDB);
console.log('Órdenes con PDF encontrado en Drive:', totalOrdersFoundInDrive);
console.log('Órdenes sin PDF en Drive:', totalOrdersInDB - totalOrdersFoundInDrive);
console.log('Total Pagos en BD:', totalPagosInDB);
console.log('Pagos con PDF encontrado en Drive:', totalPagosFoundInDrive);
console.log('Pagos sin PDF en Drive:', totalPagosInDB - totalPagosFoundInDrive);

console.log('\n=== DETALLE DE PROYECTOS CON ACTIVIDAD ===');
for (const p of activeProjects) {
  console.log(`\n• [${p.proyId}] ${p.proyName} (${p.clientName})`);
  console.log(`  Carpeta Drive: ${p.hasDriveFolder ? '✅ Creada (' + p.driveId + ')' : '❌ NO CREADA'}`);
  console.log(`  Órdenes (${p.foundOrders.length}/${p.totalOrdersInDB} en Drive):`);
  if (p.foundOrders.length > 0) console.log(`    ✅ En Drive: ${p.foundOrders.join(', ')}`);
  if (p.missingOrders.length > 0) console.log(`    ⚠️ Faltan en Drive: ${p.missingOrders.join(', ')}`);
  console.log(`  Pagos (${p.foundPagos.length}/${p.totalPagosInDB} en Drive):`);
  if (p.foundPagos.length > 0) console.log(`    ✅ En Drive: ${p.foundPagos.join(', ')}`);
  if (p.missingPagos.length > 0) console.log(`    ⚠️ Faltan en Drive: ${p.missingPagos.join(', ')}`);
}

