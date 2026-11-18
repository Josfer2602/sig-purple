const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseCurrency(val) {
  if (!val) return 0.0;
  const s = String(val).replace(/S\/\.?/g, '').replace(/\$/g, '').replace(/,/g, '').trim();
  const f = parseFloat(s);
  return isNaN(f) ? 0.0 : f;
}

function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || ['NONE', 'NO APLICA', '-', 'N/A'].includes(s.toUpperCase())) return null;
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2];
      return `${y}-${m}-${d}`;
    }
  }
  return s;
}

async function main() {
  console.log('🚀 Iniciando normalización de servicios y desagrupado de facturas en VPS...');

  // 1. Cargar Google Sheets CSV
  const csvPath = path.join(__dirname, 'google_facturas.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error('No se encontró google_facturas.csv');
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(l => l.trim().length > 0);
  
  // Parse CSV
  const googleMap = new Map(); // normInv -> data
  for (let i = 2; i < lines.length; i++) {
    const regex = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;
    const matches = [];
    let match;
    while ((match = regex.exec(lines[i])) !== null) {
      if (match.index === regex.lastIndex) regex.lastIndex++;
      let val = match[1] || '';
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/""/g, '"');
      }
      matches.push(val);
      if (regex.lastIndex >= lines[i].length) break;
    }

    if (matches.length > 2) {
      const nroFact = matches[2]?.trim();
      if (nroFact && nroFact !== 'Nro Factura') {
        const normKey = nroFact.toUpperCase().replace(/^F/, ''); // FE001-xxx -> E001-xxx
        googleMap.set(normKey, {
          rawFactura: nroFact,
          nroOc: matches[1]?.trim() || '-',
          cliente: matches[3]?.trim() || '',
          fechaEmision: parseDate(matches[5]),
          diasPago: parseInt(matches[6]) || 30,
          totalSinIgv: parseCurrency(matches[8]),
          totalConIgv: parseCurrency(matches[9]),
          detraccion: parseCurrency(matches[11]),
          retencion: parseCurrency(matches[10]),
          neto: parseCurrency(matches[12]),
          fechaPago: parseDate(matches[13]),
          status: matches[14]?.trim() || 'Pendiente',
          recibido: parseCurrency(matches[15])
        });
      }
    }
  }
  console.log(`📊 Google facturas del cuadro histórico mapeadas: ${googleMap.size}`);

  // 2. Normalizar tipoServicio en Proyectos
  console.log('\n[Paso 1] Normalizando tipoServicio en todos los Proyectos a Mayúsculas...');
  const allProys = await prisma.proyecto.findMany({ select: { id: true, tipoServicio: true } });
  let proysUpdated = 0;
  for (const p of allProys) {
    if (p.tipoServicio) {
      const normServ = p.tipoServicio.trim().toUpperCase();
      if (normServ !== p.tipoServicio) {
        await prisma.proyecto.update({
          where: { id: p.id },
          data: { tipoServicio: normServ }
        });
        proysUpdated++;
      }
    }
  }
  console.log(`✅ Proyectos actualizados a mayúsculas: ${proysUpdated}`);

  // 3. Buscar FacturaCliente agrupadas (con '/')
  console.log('\n[Paso 2] Desagrupando facturas combinadas...');
  const allFacturas = await prisma.facturaCliente.findMany();
  const grouped = allFacturas.filter(f => f.numeroFactura && f.numeroFactura.includes('/'));
  console.log(`Total facturas con '/': ${grouped.length}`);

  let createdCount = 0;
  let deletedCount = 0;

  for (const g of grouped) {
    const rawTokens = g.numeroFactura.split('/').map(t => t.trim()).filter(Boolean);
    if (rawTokens.length <= 1) continue;

    for (const token of rawTokens) {
      const normKey = token.toUpperCase().replace(/^F/, '');
      const gData = googleMap.get(normKey);

      let montoSin = g.montoSinIgv / rawTokens.length;
      let montoCon = g.montoConIgv / rawTokens.length;
      let fEmision = g.fechaEmision;
      let fPago = g.fechaPago;
      let isPaid = g.estado === 'Pagado';
      let nroOc = g.numeroOrden;
      let dias = g.diasPago;
      let hasDetr = g.aplicaDetraccion;
      let hasRet = g.aplicaRetencion;

      if (gData) {
        montoSin = gData.totalSinIgv;
        montoCon = gData.totalConIgv;
        if (gData.fechaEmision) fEmision = gData.fechaEmision;
        if (gData.fechaPago) fPago = gData.fechaPago;
        isPaid = ['cobrado', 'pagado'].includes(gData.status.toLowerCase());
        if (gData.nroOc && gData.nroOc !== 'No aplica' && gData.nroOc !== '-') nroOc = gData.nroOc;
        dias = gData.diasPago;
        hasDetr = gData.detraccion > 0;
        hasRet = gData.retencion > 0;
      }

      await prisma.facturaCliente.create({
        data: {
          proyectoId: g.proyectoId,
          tipoOrden: g.tipoOrden || 'OC',
          numeroOrden: nroOc || '-',
          fechaGeneracionOrden: fEmision || '-',
          condicionPago: g.condicionPago || 'Contado',
          numeroFactura: token,
          fechaEmision: fEmision || '-',
          diasPago: dias,
          montoSinIgv: Math.round(montoSin * 100) / 100,
          igv: Math.round((montoCon - montoSin) * 100) / 100,
          montoConIgv: Math.round(montoCon * 100) / 100,
          aplicaDetraccion: hasDetr,
          aplicaRetencion: hasRet,
          importeRecibido: isPaid ? Math.round(montoCon * 100) / 100 : 0,
          fechaPago: fPago,
          pagoImpuestos: isPaid,
          estado: isPaid ? 'Pagado' : 'Pendiente',
          porcentajeFacturacion: 100
        }
      });
      createdCount++;
    }

    // Eliminar la factura agrupada
    await prisma.facturaCliente.delete({
      where: { id: g.id }
    });
    deletedCount++;
  }

  console.log(`✅ Desagrupación terminada: ${deletedCount} facturas agrupadas eliminadas, ${createdCount} facturas individuales limpias creadas.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
