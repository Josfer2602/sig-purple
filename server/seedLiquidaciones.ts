import { PrismaClient } from '@prisma/client';
function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const prisma = new PrismaClient();

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const clientesData = [
  { empresa: 'Acme Corp', contacto: 'Juan Perez', email: 'juan@acme.com', telefono: '987654321', estado: 'Activo' },
  { empresa: 'Global Logistics', contacto: 'Maria Gomez', email: 'maria@global.com', telefono: '987654322', estado: 'Activo' },
  { empresa: 'Tech Solutions', contacto: 'Carlos Ruiz', email: 'carlos@tech.com', telefono: '987654323', estado: 'Activo' },
];

const proveedoresData = [
  { razonSocial: 'Servicios Generales S.A.', nombre: 'Pedro Diaz', ruc: '20101010101', correo: 'pedro@servicios.com', telefono: '999888777', tipoDocumento: 'Factura' },
  { razonSocial: 'Transportes Rápidos EIRL', nombre: 'Luis Luna', ruc: '20202020202', correo: 'luis@transportes.com', telefono: '999888776', tipoDocumento: 'Factura' },
  { razonSocial: 'Juanita Flores (Freelance)', nombre: 'Juanita Flores', ruc: '10303030303', correo: 'juanita@gmail.com', telefono: '999888775', tipoDocumento: 'Recibo por Honorarios' },
  { razonSocial: 'Eventos del Sur S.A.C.', nombre: 'Carmen Rosa', ruc: '20404040404', correo: 'carmen@eventos.com', telefono: '999888774', tipoDocumento: 'Factura' },
  { razonSocial: 'Miguel Angel Fotografía', nombre: 'Miguel Angel', ruc: '10505050505', correo: 'miguel@foto.com', telefono: '999888773', tipoDocumento: 'Recibo por Honorarios' },
];

async function main() {
  console.log('Iniciando sembrado de datos...');

  // 1. Clientes
  const clientes = [];
  for (const c of clientesData) {
    clientes.push(await prisma.cliente.create({ data: { id: randomUUID(), ...c } }));
  }

  // 2. Proyectos
  const proyectos = [];
  for (let i = 1; i <= 10; i++) {
    const cliente = randomItem(clientes);
    proyectos.push(await prisma.proyecto.create({
      data: {
        id: randomUUID(),
        nombre: `Proyecto ${i} - ${cliente.empresa}`,
        fechaRegistro: new Date().toISOString().split('T')[0],
        clienteId: cliente.id,
        tipoServicio: 'BTL',
        tipoProyecto: 'Activación',
        subtotal: 0, // Se actualizará luego
        estado: 'Aprobado',
      }
    }));
  }

  // 3. Proveedores
  const proveedores = [];
  for (const p of proveedoresData) {
    proveedores.push(await prisma.proveedor.create({
      data: {
        id: randomUUID(),
        ...p,
        cuentas: {
          create: [
            { id: randomUUID(), banco: 'BCP', numeroCuenta: '191-12345678-0-01', cci: '002-191-12345678-0-01' }
          ]
        }
      }
    }));
  }

  // Borrar datos semilla anteriores
  console.log('Borrando cotizaciones semilla anteriores...');
  await prisma.pago.deleteMany({ where: { quoteId: { startsWith: 'COT-SEED-' } } });
  await prisma.orden.deleteMany({ where: { quoteId: { startsWith: 'COT-SEED-' } } });
  await prisma.quote.deleteMany({ where: { id: { startsWith: 'COT-SEED-' } } });

  // 4. Cotizaciones (30 aprobadas)
  for (let i = 1; i <= 30; i++) {
    const proyecto = randomItem(proyectos);
    const cliente = clientes.find(c => c.id === proyecto.clienteId)!;
    const dateStr = new Date().toISOString().split('T')[0];

    const quoteId = `COT-SEED-${i.toString().padStart(4, '0')}`;
    
    // Generate 6 to 12 categories
    const numCategories = randomInt(6, 12);
    const categoriesToCreate = [];
    
    for (let c = 1; c <= numCategories; c++) {
      const numItems = randomInt(3, 7);
      const itemsToCreate = [];
      
      for (let it = 1; it <= numItems; it++) {
        // Generate 1 to 3 subitems
        const numSub = randomInt(1, 3);
        const subItemsToCreate = [];
        for (let s = 1; s <= numSub; s++) {
          subItemsToCreate.push({
            id: randomUUID(),
            name: `Servicio Específico ${s}`,
            description: `Descripción detallada de la parte ${s} del servicio, incluyendo materiales y mano de obra necesaria para su ejecución.`,
            quantity: randomInt(1, 5),
            dates: randomInt(1, 3),
            unitCost: randomInt(100, 2500),
            providerName: `Proveedor Genérico ${s}`
          });
        }
        
        itemsToCreate.push({
          id: randomUUID(),
          name: `Ítem Principal ${it}`,
          quantity: 1,
          dates: randomInt(1, 4),
          details: JSON.stringify([
            `• Servicio profesional especializado para ${cliente.empresa}.`,
            `• Incluye supervisión y control de calidad.`,
            `• Garantía de cumplimiento de estándares de la marca.`
          ]),
          internalMultiplierPercent: 12,
          financialExpensePercent: 3,
          providerContact: `Contacto It-${it}`,
          productionTime: `${randomInt(2, 7)} días`,
          subItems: {
            create: subItemsToCreate
          }
        });
      }

      categoriesToCreate.push({
        id: randomUUID(),
        name: `Categoría ${c} - ${['Producción', 'Logística', 'Personal', 'Estructuras', 'Tecnología', 'Audiovisual', 'Mobiliario', 'Branding'][randomInt(0, 7)]}`,
        items: {
          create: itemsToCreate
        }
      });
    }

    // Crear Quote con categorías y subítems
    await prisma.quote.create({
      data: {
        id: quoteId,
        projectId: proyecto.id,
        version: 1,
        isTemplate: false,
        status: 'Aprobado',
        client: cliente.id,
        brand: cliente.empresa,
        requirement: `Liquidación Masiva Req ${i}`,
        date: dateStr,
        businessName: cliente.empresa,
        ruc: '20000000000',
        paymentConditions: '30 días',
        categories: {
          create: categoriesToCreate
        }
      }
    });

    // 5. Órdenes y Pagos para esta cotización
    const quote = await prisma.quote.findUnique({ where: { id: quoteId }, include: { categories: { include: { items: { include: { subItems: true } } } } } });
    if (!quote) continue;

    let subItemsCount = 0;
    for (const cat of quote.categories) {
      for (const item of cat.items) {
        for (const subItem of item.subItems) {
          subItemsCount++;
          const proveedor = randomItem(proveedores);
          // Gasto Real es ligeramente diferente al proyectado (puede haber ahorro o sobrecosto)
          const isAhorro = Math.random() > 0.5;
          const variance = randomInt(50, 300);
          const realUnitCost = isAhorro ? Math.max(10, subItem.unitCost - variance) : subItem.unitCost + variance;
          const totalReal = realUnitCost * subItem.quantity * subItem.dates;

          const ordenId = `OC-SEED-${i}-${subItemsCount}`;
          await prisma.orden.create({
            data: {
              id: ordenId,
              proveedorId: proveedor.id,
              clienteId: cliente.id,
              proyectoId: proyecto.id,
              quoteId: quote.id,
              fechaEmision: dateStr,
              total: totalReal,
              estadoPago: 'Pendiente', // luego lo actualizamos si hay pago
              estadoEntrega: 'Recibido',
              condicionesPago: 'Contado',
              tipoOrden: 'Servicio',
              items: {
                create: [
                  {
                    id: randomUUID(),
                    quoteSubItemId: subItem.id,
                    name: subItem.name,
                    quantity: subItem.quantity * subItem.dates,
                    unitCost: realUnitCost,
                    total: totalReal,
                  }
                ]
              }
            }
          });

          // 6. Pagos
          // Hacemos que algunas órdenes estén 100% pagadas, otras 50%, otras 0%.
          const r = Math.random();
          if (r > 0.3) {
            // Pagado total
            const pagoId = randomUUID();
            await prisma.pago.create({
              data: {
                id: pagoId,
                clienteId: cliente.id,
                proyectoId: proyecto.id,
                quoteId: quote.id,
                ordenId: ordenId,
                proveedorId: proveedor.id,
                tipoPago: 'Adelanto 100%',
                monto: totalReal,
                numeroComprobante: `COMP-${pagoId.substring(0, 5)}`,
                fechaRegistro: dateStr,
                fechaPago: dateStr,
                estado: 'Pagado'
              }
            });
            await prisma.orden.update({ where: { id: ordenId }, data: { estadoPago: 'Pagado' } });
          } else if (r > 0.1) {
            // Pago parcial
            const pagoId = randomUUID();
            await prisma.pago.create({
              data: {
                id: pagoId,
                clienteId: cliente.id,
                proyectoId: proyecto.id,
                quoteId: quote.id,
                ordenId: ordenId,
                proveedorId: proveedor.id,
                tipoPago: 'Adelanto 50%',
                monto: totalReal / 2,
                numeroComprobante: `COMP-${pagoId.substring(0, 5)}`,
                fechaRegistro: dateStr,
                fechaPago: dateStr,
                estado: 'Pagado'
              }
            });
          }
        }
      }
    }
  }

  console.log('Sembrado completado. Se generaron 30 cotizaciones masivas con órdenes y pagos.');
}

main()
  .catch(e => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
