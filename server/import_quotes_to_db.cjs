const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

function normalizeStr(str) {
  if (!str) return '';
  return str.toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function getTokens(str) {
  if (!str) return [];
  const stopWords = new Set([
    'de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'e', 'o', 'u',
    'para', 'en', 'con', 'por', 'al', 'del', 'a', 'sobre', 'cotizacion', 'cotiz', 'ppto',
    'presupuesto', 'cliente', 'grupo', 'sac', 'sa', 'srl', 'v1', 'v2', 'v3', 'v4', 'v5',
    'opc', 'opcion', 'ok', 'aprobado', 'adicional', 'parte', 'servicio', 'produccion'
  ]);
  return str.toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[()_.\-–—,/]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !stopWords.has(t));
}

function calculateQuoteSubtotal(categories) {
  let subTotal = 0;
  for (const cat of categories || []) {
    for (const item of cat.items || []) {
      const totalProvider = (item.subItems || []).reduce((acc, sub) => {
        return acc + ((sub.unitCost || 0) * (sub.quantity || 0) * (sub.dates || 0));
      }, 0);
      const internalMultiplier = totalProvider * ((item.internalMultiplierPercent || 0) / 100);
      const financialExpense = totalProvider * ((item.financialExpensePercent || 0) / 100);
      subTotal += Math.round(totalProvider + internalMultiplier + financialExpense);
    }
  }
  return subTotal * 1.12; // final total client con fee
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

async function runQuoteImport() {
  console.log('Iniciando vinculación e importación masiva de cotizaciones a la base de datos...');
  
  const jsonPath = path.join(__dirname, 'extracted_quotes.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ No se encontró el archivo extracted_quotes.json');
    return;
  }

  const quotesList = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`📦 Se cargaron ${quotesList.length} cotizaciones parseadas.`);

  const existingClientes = await prisma.cliente.findMany();
  const clienteMap = new Map();
  for (const c of existingClientes) {
    clienteMap.set(normalizeStr(c.empresa), c);
  }

  const existingProyectos = await prisma.proyecto.findMany({
    include: { cliente: true, ordenes: true }
  });

  const ALIASES = {
    'grupoa365': 'a365',
    'a365': 'a365',
    'izipaysac': 'izipay',
    'clinicadeojosopeluce': 'opeluce',
    'opeluce': 'opeluce',
    'bymainstrumentssac': 'bymainstruments',
    'corporacionarion': 'corporacionarion',
    'grupopatio': 'grupopatio',
    'patio': 'grupopatio'
  };

  let quotesCreated = 0;
  let quotesLinkedToProject = 0;
  let placeholderQuotesReplaced = 0;
  let projectSubtotalsUpdated = 0;

  for (let i = 0; i < quotesList.length; i++) {
    const qData = quotesList[i];
    const meta = qData.metadata || {};

    // 1. Resolver Cliente
    let cliName = meta.client || qData.clientFolder || 'General';
    let cliNorm = normalizeStr(cliName);
    if (ALIASES[cliNorm]) cliNorm = ALIASES[cliNorm];

    let clienteRecord = clienteMap.get(cliNorm);
    if (!clienteRecord) {
      for (const [k, c] of clienteMap.entries()) {
        if (k === cliNorm || (cliNorm.length > 4 && (k.includes(cliNorm) || cliNorm.includes(k)))) {
          clienteRecord = c;
          break;
        }
      }
    }

    if (!clienteRecord) {
      const newId = `CLI-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      clienteRecord = await prisma.cliente.create({
        data: {
          id: newId,
          empresa: cliName,
          contacto: 'Por Asignar',
          cargo: 'Comercial',
          email: `contacto@${cliNorm || 'cliente'}.com`,
          telefono: '-',
          estado: 'Activo'
        }
      });
      clienteMap.set(cliNorm, clienteRecord);
    }

    // 2. Resolver Proyecto vinculado
    const reqName = meta.requirement || qData.projectFolder || '';
    const reqNorm = normalizeStr(reqName);
    const folderNorm = normalizeStr(qData.projectFolder);
    const fileNorm = normalizeStr(qData.fileName);
    const pathNorm = normalizeStr(qData.filePath);
    const calculatedSubtotal = Math.round(calculateQuoteSubtotal(qData.categories) * 100) / 100;

    const allSourceText = `${reqName} ${qData.projectFolder} ${qData.fileName} ${qData.filePath}`;
    const quoteTokens = new Set(getTokens(allSourceText));

    let matchedProject = null;
    let highestScore = 0;

    const clientProyectos = existingProyectos.filter(p => p.clienteId === clienteRecord.id);

    for (const p of clientProyectos) {
      let score = 0;
      const pNorm = normalizeStr(p.nombre);
      const pTokens = getTokens(p.nombre);

      // Exact match
      if (pNorm === reqNorm || pNorm === folderNorm) {
        score += 200;
      } else if (pNorm.includes(reqNorm) || reqNorm.includes(pNorm)) {
        score += 100;
      } else if (pNorm.includes(folderNorm) || folderNorm.includes(pNorm)) {
        score += 80;
      }

      // Token overlap
      let matchingTokens = 0;
      for (const t of pTokens) {
        if (quoteTokens.has(t)) {
          matchingTokens++;
          score += 15;
          // Bonus for months
          if (MONTHS.includes(t)) score += 30;
          // Bonus for years
          if (/^\d{4}$/.test(t)) score += 20;
        }
      }

      // Check subtotal match (Key insight from user!)
      if (p.subtotal > 0 && calculatedSubtotal > 0) {
        if (Math.abs(calculatedSubtotal - p.subtotal) < 2) {
          score += 250; // Exact match!
        } else if (Math.abs(calculatedSubtotal * 1.12 - p.subtotal) < 5 || Math.abs(calculatedSubtotal / 1.12 - p.subtotal) < 5) {
          score += 220; // Exact match with fee
        } else if (Math.abs(calculatedSubtotal - p.subtotal) / p.subtotal < 0.05) {
          score += 100; // Within 5%
        }
      }

      if (score > highestScore && score >= 50) {
        highestScore = score;
        matchedProject = p;
      }
    }

    const quoteId = `Q-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`.toUpperCase();
    const versionNum = parseInt(qData.version, 10) || 1;

    let quoteStatus = 'Enviado';
    if (matchedProject) {
      if (matchedProject.estado === 'Aprobado') quoteStatus = 'Aprobado';
      else if (matchedProject.estado === 'Rechazado') quoteStatus = 'Rechazado';
      else quoteStatus = 'Registrado';
    }

    // Si el proyecto tenía una cotización dummy histórica Q-HIST-, vincular órdenes y prepararse para reemplazarla
    let placeholderQuote = null;
    if (matchedProject) {
      // Verificar si ya existe una cotización idéntica ya importada con categorías para este proyecto
      const existingSameQuote = await prisma.quote.findFirst({
        where: {
          projectId: matchedProject.id,
          requirement: reqName,
          id: { not: { startsWith: 'Q-HIST-' } }
        },
        include: { categories: true }
      });
      if (existingSameQuote && existingSameQuote.categories.length > 0) {
        // Ya fue importada con éxito anteriormente
        continue;
      }

      placeholderQuote = await prisma.quote.findFirst({
        where: { id: `Q-HIST-${matchedProject.id}` }
      });
    }

    // 3. Crear la Cotización con su árbol completo
    const createdQuote = await prisma.quote.create({
      data: {
        id: quoteId,
        projectId: matchedProject ? matchedProject.id : null,
        version: versionNum,
        isTemplate: false,
        status: quoteStatus,
        client: clienteRecord.empresa,
        brand: meta.brand || clienteRecord.empresa,
        requirement: reqName,
        date: meta.date ? String(meta.date).split(' ')[0] : '2026-01-01',
        businessName: meta.businessName || 'PURPLE BTL S.A.C.',
        ruc: '20601846374',
        paymentConditions: meta.paymentConditions || '30 días de crédito',
        currency: 'PEN',
        exchangeRate: 1.0,
        includeIgv: false,
        categories: {
          create: (qData.categories || []).map(cat => ({
            name: cat.name || 'General',
            items: {
              create: (cat.items || []).map(it => ({
                name: it.name || 'Ítem',
                quantity: parseInt(it.quantity, 10) || 1,
                dates: parseInt(it.dates, 10) || 1,
                details: JSON.stringify(it.details || []),
                internalMultiplierPercent: parseFloat(it.internalMultiplierPercent) || 0,
                financialExpensePercent: parseFloat(it.financialExpensePercent) || 0,
                providerContact: it.providerContact || '',
                productionTime: it.productionTime || '',
                subItems: {
                  create: (it.subItems || []).map(sub => ({
                    name: sub.name || '',
                    description: sub.description || '',
                    quantity: parseInt(sub.quantity, 10) || 1,
                    dates: parseInt(sub.dates, 10) || 1,
                    unitCost: parseFloat(sub.unitCost) || 0,
                    providerName: sub.providerName || ''
                  }))
                }
              }))
            }
          }))
        }
      }
    });

    quotesCreated++;
    if (matchedProject) {
      quotesLinkedToProject++;

      // Si las órdenes apuntaban a la cotización dummy, reasignarlas a la cotización real desglosada
      if (placeholderQuote) {
        await prisma.orden.updateMany({
          where: { quoteId: placeholderQuote.id },
          data: { quoteId: quoteId }
        });
        // Eliminar el placeholder antiguo
        await prisma.quote.delete({ where: { id: placeholderQuote.id } }).catch(() => {});
        placeholderQuotesReplaced++;
      }

      // Si el proyecto tenía subtotal en 0 y la cotización tiene monto, actualizar subtotal del proyecto
      if ((!matchedProject.subtotal || matchedProject.subtotal === 0) && calculatedSubtotal > 0) {
        await prisma.proyecto.update({
          where: { id: matchedProject.id },
          data: { subtotal: calculatedSubtotal }
        });
        projectSubtotalsUpdated++;
      }
    }

    if ((i + 1) % 50 === 0 || i === quotesList.length - 1) {
      console.log(`  -> Progreso: ${i + 1}/${quotesList.length} cotizaciones registradas...`);
    }
  }

  console.log(`\n======================================================`);
  console.log(`🎉 REGISTRO DE COTIZACIONES COMPLETADO:`);
  console.log(` - Total cotizaciones creadas con desglose completo: ${quotesCreated}`);
  console.log(` - Cotizaciones vinculadas a proyectos existentes: ${quotesLinkedToProject}`);
  console.log(` - Cotizaciones dummy (Q-HIST-) reemplazadas por cotizaciones reales: ${placeholderQuotesReplaced}`);
  console.log(` - Subtotales de proyectos actualizados desde cotizaciones: ${projectSubtotalsUpdated}`);
  console.log(`======================================================\n`);
}

runQuoteImport()
  .catch(err => {
    console.error('❌ Error registrando cotizaciones:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
