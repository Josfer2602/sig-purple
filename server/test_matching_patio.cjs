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
  return subTotal * 1.12;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

async function testMatch() {
  const jsonPath = path.join(__dirname, 'extracted_quotes.json');
  const quotesList = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const patioQuotes = quotesList.filter(q => q.clientFolder.toLowerCase().includes('patio') || (q.metadata.client && q.metadata.client.toLowerCase().includes('patio')));
  console.log(`Verificando emparejamiento de ${patioQuotes.length} cotizaciones de Grupo Patio...`);

  const patioProyectos = await prisma.proyecto.findMany({
    where: { cliente: { empresa: { contains: 'Patio', mode: 'insensitive' } } }
  });
  console.log(`Total proyectos de Grupo Patio en BD: ${patioProyectos.length}`);

  let matches = 0;
  for (const qData of patioQuotes) {
    const meta = qData.metadata || {};
    const reqName = meta.requirement || qData.projectFolder || '';
    const reqNorm = normalizeStr(reqName);
    const folderNorm = normalizeStr(qData.projectFolder);
    const calculatedSubtotal = Math.round(calculateQuoteSubtotal(qData.categories) * 100) / 100;

    const allSourceText = `${reqName} ${qData.projectFolder} ${qData.fileName} ${qData.filePath}`;
    const quoteTokens = new Set(getTokens(allSourceText));

    let matchedProject = null;
    let highestScore = 0;

    for (const p of patioProyectos) {
      let score = 0;
      const pNorm = normalizeStr(p.nombre);
      const pTokens = getTokens(p.nombre);

      if (pNorm === reqNorm || pNorm === folderNorm) {
        score += 200;
      } else if (pNorm.includes(reqNorm) || reqNorm.includes(pNorm)) {
        score += 100;
      } else if (pNorm.includes(folderNorm) || folderNorm.includes(pNorm)) {
        score += 80;
      }

      for (const t of pTokens) {
        if (quoteTokens.has(t)) {
          score += 15;
          if (MONTHS.includes(t)) score += 30;
          if (/^\d{4}$/.test(t)) score += 20;
        }
      }

      if (p.subtotal > 0 && calculatedSubtotal > 0) {
        if (Math.abs(calculatedSubtotal - p.subtotal) < 2) {
          score += 250;
        } else if (Math.abs(calculatedSubtotal * 1.12 - p.subtotal) < 5 || Math.abs(calculatedSubtotal / 1.12 - p.subtotal) < 5) {
          score += 220;
        } else if (Math.abs(calculatedSubtotal - p.subtotal) / p.subtotal < 0.05) {
          score += 100;
        }
      }

      if (score > highestScore && score >= 50) {
        highestScore = score;
        matchedProject = p;
      }
    }

    if (matchedProject) {
      matches++;
      console.log(`✅ [Score ${highestScore}] "${qData.fileName.slice(0, 35)}..." --> "${matchedProject.nombre}" (BD Subtotal: ${matchedProject.subtotal} vs Calc: ${calculatedSubtotal})`);
    } else {
      console.log(`⚠️ Sin match: "${qData.fileName.slice(0, 35)}..." | Req: ${reqName} | Folder: ${qData.projectFolder}`);
    }
  }

  console.log(`\nResultado: ${matches} de ${patioQuotes.length} cotizaciones de Grupo Patio emparejadas con proyectos reales.`);
}

testMatch()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
