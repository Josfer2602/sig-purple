const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
  const rawPath = 'C:/Users/josen/.gemini/antigravity/brain/9a06be32-e8a7-4f37-b8b3-f0e88f2a68b2/scratch/import_data.json';
  const data = JSON.parse(fs.readFileSync(rawPath, 'utf8'));

  console.log(`Processing ${data.length} projects from import_data.json...`);

  // Let's also parse Excel sheet BASE DE DATOS directly for Col 29 presupuestoEstimado!
  const pythonScript = `
import openpyxl, glob, json, sys
sys.stdout.reconfigure(encoding='utf-8')
wb = openpyxl.load_workbook(glob.glob('f:/SIG Purple V2/*Cuadro*.xlsm')[0], data_only=True)
sheet = wb['BASE DE DATOS']
res = []
for r in range(14, sheet.max_row + 1):
    act = sheet.cell(row=r, column=5).value
    if act:
        c16 = sheet.cell(row=r, column=16).value
        c29 = sheet.cell(row=r, column=29).value
        res.append({"actividad": str(act).strip(), "col16": float(c16) if c16 else 0.0, "col29": float(c29) if c29 else 0.0})
with open('C:/Users/josen/.gemini/antigravity/brain/9a06be32-e8a7-4f37-b8b3-f0e88f2a68b2/scratch/excel_subtotals.json', 'w', encoding='utf-8') as f:
    json.dump(res, f)
`;

  fs.writeFileSync('C:/Users/josen/.gemini/antigravity/brain/9a06be32-e8a7-4f37-b8b3-f0e88f2a68b2/scratch/run_py.py', pythonScript);
  require('child_process').execSync('python "C:/Users/josen/.gemini/antigravity/brain/9a06be32-e8a7-4f37-b8b3-f0e88f2a68b2/scratch/run_py.py"');

  const excelSubtotals = JSON.parse(fs.readFileSync('C:/Users/josen/.gemini/antigravity/brain/9a06be32-e8a7-4f37-b8b3-f0e88f2a68b2/scratch/excel_subtotals.json', 'utf8'));
  console.log(`Loaded ${excelSubtotals.length} subtotals from Excel...`);

  let count = 0;
  for (const item of excelSubtotals) {
    const finalSub = item.col16 > 0 ? item.col16 : item.col29;
    if (finalSub > 0) {
      const res = await prisma.proyecto.updateMany({
        where: { nombre: item.actividad },
        data: {
          subtotal: finalSub,
          presupuestoEstimado: String(finalSub)
        }
      });
      count += res.count;
    }
  }

  console.log(`Updated subtotals for ${count} projects in database!`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
