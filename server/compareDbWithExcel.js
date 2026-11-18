const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const excelVentas = {
  '2018': 198171.52,
  '2019': 892816.26,
  '2020': 470412.58,
  '2021': 595214.08,
  '2022': 621434.57,
  '2023': 804661.75,
  '2024': 761520.07,
  '2025': 1355243.01
};

async function main() {
  const ganados = await prisma.proyecto.findMany({ where: { estado: 'Ganado' } });
  console.log(`Total Ganados in DB: ${ganados.length}`);

  const dbVentasYear = {};

  ganados.forEach(p => {
    const dateStr = p.fechaAprobacion || p.fechaRegistro;
    if (dateStr) {
      const parts = dateStr.split(/[-/]/);
      const year = parts[0].length === 4 ? parts[0] : parts[2];
      if (year) {
        dbVentasYear[year] = (dbVentasYear[year] || 0) + (Number(p.subtotal) || 0);
      }
    }
  });

  console.log("\n=== COMPARACION DE VENTAS (EXCEL VS PLATAFORMA DB) ===");
  console.log("Año   | Excel Totales     | Plataforma DB     | Diferencia    | Coincidencia");
  console.log("----------------------------------------------------------------------------");

  const years = ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
  years.forEach(y => {
    const ex = excelVentas[y] || 0;
    const db = dbVentasYear[y] || 0;
    const diff = Math.abs(ex - db);
    const match = diff < 1.0 ? '✅ 100% MATCH' : `⚠️ Diff: S/${diff.toFixed(2)}`;
    console.log(`${y}  | S/${ex.toLocaleString('es-PE', {minimumFractionDigits: 2}).padStart(14)} | S/${db.toLocaleString('es-PE', {minimumFractionDigits: 2}).padStart(14)} | S/${diff.toFixed(2).padStart(11)} | ${match}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
