import { PrismaClient } from '@prisma/client';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const prisma = new PrismaClient();

const CLIENTES = ['Nike', 'Coca Cola', 'Samsung', 'BCP', 'Toyota', 'Nestle', 'Claro', 'Adidas', 'Interbank', 'BBVA', 'Falabella', 'Ripley', 'Entel', 'Movistar', 'Plaza Vea', 'Tottus', 'Promart', 'Sodimac', 'Gloria', 'Alicorp'];
const SERVICIOS = ['PURPLE IMPULSE', 'PURPLE LOYALTY', 'PURPLE EVENTS', 'PURPLE PR', 'BTL', 'TRADE MARKETING', 'DIGITAL'];
const TIPOS_PROYECTO = ['FEE MENSUAL', 'INDIVIDUAL'];
const CATEGORIAS = ['Producción General', 'Personal y Talento', 'Equipos Audiovisuales', 'Logística y Transporte', 'Permisos y Trámites', 'Merchandising'];
const ITEMS = ['Tarimas y Escenarios', 'Anfitrionas y Promotores', 'Sonido Line Array', 'Pantallas LED', 'Catering y Alimentación', 'Unidades Móviles', 'Merchandising', 'Impresión de Gigantografías', 'Luces Robóticas', 'Seguridad y Prevencionistas'];
const CAMPAIGN_PREFIXES = ['Lanzamiento de', 'Activación Verano', 'Campaña Navideña', 'Convención Anual', 'Fidelización', 'Roadshow', 'Aniversario', 'Campaña Escolar', 'Activación BTL en', 'Concierto Auspicio'];

function generateSuppliers(count: number) {
  const prefixes = ['Imprenta', 'Producciones', 'Logística', 'Eventos', 'Visuales', 'Sonido', 'Luces', 'Catering', 'Transporte', 'Agencia', 'Servicios', 'Comercializadora'];
  const suffixes = ['SAC', 'SRL', 'EIRL', 'Perú', '360', 'Creativa', 'Total', 'Premium', 'Plus', 'Group', 'Express', 'Global'];
  const colors = ['Rojo', 'Azul', 'Verde', 'Alfa', 'Beta', 'Omega', 'Pro', 'Max', 'Ultra', 'Elite'];
  
  const suppliers = [];
  for(let i=0; i<count; i++) {
    const name = `${randomChoice(prefixes)} ${randomChoice(colors)} ${randomChoice(suffixes)}`;
    suppliers.push(name);
  }
  return Array.from(new Set(suppliers)); // Unique names
}

function randomChoice(arr: any[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(year: number) {
  const month = randomInt(1, 12).toString().padStart(2, '0');
  const day = randomInt(1, 28).toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function main() {
  console.log('--- Iniciando limpieza profunda de la Base de Datos ---');
  await prisma.gastoProduccionItem.deleteMany();
  await prisma.gastoProduccion.deleteMany();
  await prisma.pago.deleteMany();
  await prisma.ordenSubItem.deleteMany();
  await prisma.orden.deleteMany();
  await prisma.ganttTask.deleteMany();
  await prisma.projectGantt.deleteMany();
  await prisma.quoteSubItem.deleteMany();
  await prisma.quoteItem.deleteMany();
  await prisma.quoteCategory.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.proyecto.deleteMany();
  await prisma.cuentaBancaria.deleteMany();
  await prisma.proveedor.deleteMany();
  await prisma.cliente.deleteMany();
  console.log('--- Base de Datos Limpia ---');

  console.log('--- Creando Clientes y 100+ Proveedores ---');
  const createdClientes = [];
  for (const c of CLIENTES) {
    createdClientes.push(
      await prisma.cliente.create({
        data: {
          empresa: c,
          contacto: `Contacto ${c}`,
          email: `contacto@${c.toLowerCase().replace(/ /g, '')}.com`,
          telefono: `9${randomInt(10000000, 99999999)}`,
          estado: 'Activo'
        }
      })
    );
  }

  const supplierNames = generateSuppliers(120).slice(0, 100); // Take 100 unique
  const createdProveedores = [];
  for (const p of supplierNames) {
    const prov = await prisma.proveedor.create({
      data: {
        razonSocial: p,
        nombre: p,
        ruc: `20${randomInt(100000000, 999999999)}`,
        correo: `ventas@${p.toLowerCase().replace(/ /g, '')}.com`,
        telefono: `9${randomInt(10000000, 99999999)}`,
        tipoDocumento: 'RUC'
      }
    });
    
    // Create multiple accounts sometimes
    const accountsCount = randomInt(1, 2);
    for (let ac = 0; ac < accountsCount; ac++) {
      const cb = await prisma.cuentaBancaria.create({
        data: {
          banco: randomChoice(['BCP', 'BBVA', 'Interbank', 'Scotiabank', 'BanBif']),
          numeroCuenta: `193-${randomInt(10000000, 99999999)}-0-00`,
          cci: `002193${randomInt(10000000, 99999999)}000000`,
          proveedorId: prov.id
        }
      });
      if (ac === 0) {
        // attach the first account to the provider object for easy access later
        (prov as any).defaultAccountId = cb.id;
      }
    }
    createdProveedores.push(prov);
  }

  console.log('--- Generando Historial (2018 - 2026) ---');
  for (let year = 2018; year <= 2026; year++) {
    const numProjects = randomInt(20, 50);
    console.log(`Generando ${numProjects} proyectos para el año ${year}...`);

    for (let i = 1; i <= numProjects; i++) {
      const cliente = randomChoice(createdClientes);
      const servicio = randomChoice(SERVICIOS);
      const tipoProj = randomChoice(TIPOS_PROYECTO);
      
      const randEstado = Math.random();
      let estadoProj = 'En Espera';
      if (randEstado > 0.4) estadoProj = 'Aprobado'; // 60% Aprobados
      else if (randEstado > 0.1) estadoProj = 'Rechazado'; // 30% Rechazados

      const dateStr = randomDate(year);
      const projName = `${randomChoice(CAMPAIGN_PREFIXES)} ${cliente.empresa} - ${servicio}`;
      
      const numCategories = randomInt(1, 3);
      let totalCost = 0;
      let totalClient = 0;
      const categoriesData = [];

      for (let c = 0; c < numCategories; c++) {
        const numItems = randomInt(1, 3);
        const itemsData = [];
        for (let j = 0; j < numItems; j++) {
          const numSub = randomInt(1, 3);
          const subData = [];
          
          let itemCost = 0;
          for (let k = 0; k < numSub; k++) {
            const qty = randomInt(1, 10);
            const ucost = randomInt(100, 3000);
            itemCost += (qty * ucost);
            subData.push({
              name: `Detalle específico ${k+1} - ${randomChoice(['Alquiler', 'Servicio', 'Compra'])}`,
              description: 'Detalle de ejecución técnica y logística',
              quantity: qty,
              dates: randomInt(1, 3),
              unitCost: ucost,
              providerName: randomChoice(createdProveedores).nombre
            });
          }

          const intMult = randomInt(10, 30);
          const finExp = randomInt(5, 15);
          const rawClientCost = itemCost + (itemCost * (intMult/100)) + (itemCost * (finExp/100));
          
          totalCost += itemCost;
          totalClient += rawClientCost;

          itemsData.push({
            name: randomChoice(ITEMS),
            quantity: 1,
            dates: 1,
            details: JSON.stringify([{text: 'Incluye traslados y seguros', selected: true}]),
            internalMultiplierPercent: intMult,
            financialExpensePercent: finExp,
            providerContact: 'N/A',
            productionTime: `${randomInt(2, 7)} días`,
            subItems: { create: subData }
          });
        }
        categoriesData.push({
          name: randomChoice(CATEGORIAS),
          items: { create: itemsData }
        });
      }
      
      const subtotalVenta = totalClient * 1.12;

      const proyecto = await prisma.proyecto.create({
        data: {
          nombre: projName,
          fechaRegistro: dateStr,
          fechaAprobacion: estadoProj === 'Aprobado' ? dateStr : null,
          clienteId: cliente.id,
          tipoServicio: servicio,
          tipoProyecto: tipoProj,
          subtotal: subtotalVenta,
          estado: estadoProj
        }
      });

      const quote = await prisma.quote.create({
        data: {
          projectId: proyecto.id,
          version: 1,
          isTemplate: false,
          status: estadoProj,
          client: cliente.empresa,
          brand: cliente.empresa,
          requirement: `Requerimientos para ${projName}`,
          date: dateStr,
          businessName: cliente.empresa,
          ruc: `20${randomInt(100000000, 999999999)}`,
          paymentConditions: randomChoice(['Al Contado', '30 Días', '60 Días', '50% Adelanto - 50% Final']),
          categories: {
            create: categoriesData
          }
        },
        include: {
          categories: {
            include: { items: { include: { subItems: true } } }
          }
        }
      });

      if (estadoProj === 'Aprobado') {
        // Gantt with multiple tasks
        const t1Id = generateUUID();
        const t2Id = generateUUID();
        const t3Id = generateUUID();
        const t4Id = generateUUID();
        const t5Id = generateUUID();

        await prisma.projectGantt.create({
          data: {
            projectId: proyecto.id,
            version: 1,
            status: 'Publicado',
            name: `Cronograma de Producción - ${projName}`,
            shareToken: generateUUID(),
            tasks: {
              create: [
                { id: t1Id, name: 'Kickoff y Alineación', startDate: dateStr, endDate: dateStr, progress: 100, dependencies: '', type: 'milestone', color: '#6366f1' },
                { id: t2Id, name: 'Pre-producción y Compras', startDate: dateStr, endDate: dateStr, progress: 100, dependencies: t1Id, type: 'task', color: '#3b82f6' },
                { id: t3Id, name: 'Montaje y Pruebas Técnicas', startDate: dateStr, endDate: dateStr, progress: 100, dependencies: t2Id, type: 'task', color: '#f59e0b' },
                { id: t4Id, name: 'Ejecución de Campaña', startDate: dateStr, endDate: dateStr, progress: 100, dependencies: t3Id, type: 'task', color: '#10b981' },
                { id: t5Id, name: 'Desmontaje y Cierre', startDate: dateStr, endDate: dateStr, progress: 100, dependencies: t4Id, type: 'task', color: '#64748b' }
              ]
            }
          }
        });

        // Get subitems safely
        let subitems: any[] = [];
        quote.categories.forEach(c => {
          c.items.forEach(it => {
            it.subItems.forEach(si => subitems.push(si));
          });
        });

        // Generate OC for a random subitem
        if (subitems.length > 0) {
          const prov = randomChoice(createdProveedores);
          const ocId = `OC-${year}-${i.toString().padStart(4, '0')}`;
          const randomSubItem = randomChoice(subitems);

          const orden = await prisma.orden.create({
            data: {
              id: ocId,
              proveedorId: prov.id,
              clienteId: cliente.id,
              proyectoId: proyecto.id,
              quoteId: quote.id,
              fechaEmision: dateStr,
              total: randomSubItem.unitCost * randomSubItem.quantity,
              estadoPago: 'Pagado',
              estadoEntrega: 'Entregado',
              condicionesPago: 'Contado',
              tipoOrden: 'Compra',
              cuentaBancariaId: (prov as any).defaultAccountId,
              items: {
                create: [{
                  quoteSubItemId: randomSubItem.id,
                  name: randomSubItem.name,
                  quantity: randomSubItem.quantity,
                  unitCost: randomSubItem.unitCost,
                  total: randomSubItem.unitCost * randomSubItem.quantity,
                  costPercentage: 100
                }]
              }
            }
          });

          await prisma.pago.create({
            data: {
              clienteId: cliente.id,
              proyectoId: proyecto.id,
              quoteId: quote.id,
              ordenId: orden.id,
              proveedorId: prov.id,
              tipoPago: '100%',
              monto: orden.total,
              numeroComprobante: `F001-${randomInt(1000, 9999)}`,
              fechaRegistro: dateStr,
              fechaPago: dateStr,
              estado: 'Pagado'
            }
          });

          // Generate Gasto Produccion for another subitem
          const gastoSubItem = randomChoice(subitems);
          const gastoTotal = randomInt(50, 500);

          await prisma.gastoProduccion.create({
            data: {
              clienteId: cliente.id,
              proyectoId: proyecto.id,
              quoteId: quote.id,
              tipoComprobante: 'Boleta',
              numeroComprobante: `B001-${randomInt(1000, 9999)}`,
              fechaEmision: dateStr,
              total: gastoTotal,
              estadoGasto: 'Generado',
              areaResponsable: 'Cuentas',
              items: {
                create: [{
                  quoteSubItemId: gastoSubItem.id,
                  name: gastoSubItem.name,
                  costPercentage: 100,
                  monto: gastoTotal
                }]
              }
            }
          });
        }
      }
    }
  }

  console.log('--- Proceso Completado con Éxito ---');
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
