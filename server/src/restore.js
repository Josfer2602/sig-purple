const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function runRestore() {
  const fileName = `SIG_Purple_Migration_Backup.json`;
  const filePath = path.join(__dirname, '../uploads', fileName);
  if (!fs.existsSync(filePath)) {
    console.error("Backup JSON no encontrado:", filePath);
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log("Restaurando datos...");

  try {
    for (const c of data.config || []) await prisma.appConfig.create({ data: c });
    for (const u of data.users || []) await prisma.user.create({ data: u });
    for (const cli of data.clientes || []) await prisma.cliente.create({ data: cli });
    for (const proy of data.proyectos || []) await prisma.proyecto.create({ data: proy });
    
    for (const prov of data.proveedores || []) {
      const cuentas = prov.cuentas;
      delete prov.cuentas;
      await prisma.proveedor.create({ data: prov });
      for (const cu of cuentas || []) await prisma.cuentaBancaria.create({ data: cu });
    }

    for (const q of data.quotes || []) {
      const categories = q.categories;
      delete q.categories;
      await prisma.quote.create({ data: q });
      for (const cat of categories || []) {
        const items = cat.items;
        delete cat.items;
        await prisma.quoteCategory.create({ data: cat });
        for (const item of items || []) {
           const subItems = item.subItems;
           delete item.subItems;
           await prisma.quoteItem.create({ data: item });
           for (const sub of subItems || []) await prisma.quoteSubItem.create({ data: sub });
        }
      }
    }

    for (const ord of data.ordenes || []) {
      const items = ord.items;
      delete ord.items;
      await prisma.orden.create({ data: ord });
      for (const it of items || []) await prisma.ordenSubItem.create({ data: it });
    }

    for (const p of data.pagos || []) await prisma.pago.create({ data: p });

    for (const g of data.gastos || []) {
      const items = g.items;
      delete g.items;
      await prisma.gastoProduccion.create({ data: g });
      for (const it of items || []) await prisma.gastoProduccionItem.create({ data: it });
    }

    for (const gt of data.gantts || []) {
      const tasks = gt.tasks;
      delete gt.tasks;
      await prisma.projectGantt.create({ data: gt });
      for (const t of tasks || []) await prisma.ganttTask.create({ data: t });
    }

    console.log("✅ Restauración completa.");
  } catch (err) {
    console.error("Error restaurando:", err);
  }
}

runRestore().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
