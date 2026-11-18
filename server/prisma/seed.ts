import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Limpiando base de datos...');
  await prisma.pago.deleteMany();
  await prisma.ordenSubItem.deleteMany();
  await prisma.orden.deleteMany();
  await prisma.quoteSubItem.deleteMany();
  await prisma.quoteItem.deleteMany();
  await prisma.quoteCategory.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.cuentaBancaria.deleteMany();
  await prisma.proveedor.deleteMany();
  await prisma.proyecto.deleteMany();
  await prisma.cliente.deleteMany();

  console.log('Creando Cliente...');
  const cliente = await prisma.cliente.create({
    data: {
      empresa: 'TechCorp S.A.',
      contacto: 'Juan Pérez',
      email: 'juan.perez@techcorp.com',
      telefono: '987654321',
      estado: 'Activo'
    }
  });

  console.log('Creando Proveedor...');
  const proveedor = await prisma.proveedor.create({
    data: {
      razonSocial: 'Impresiones y Medios SAC',
      nombre: 'Impresiones SAC',
      ruc: '20123456789',
      correo: 'ventas@impresionessac.com',
      telefono: '999888777',
      tipoDocumento: 'RUC',
      cuentas: {
        create: [
          {
            banco: 'BCP',
            numeroCuenta: '193-12345678-0-00',
            cci: '002-193-12345678-0-00-11'
          }
        ]
      }
    }
  });

  console.log('Creando Proyecto...');
  const proyecto = await prisma.proyecto.create({
    data: {
      fechaRegistro: new Date().toISOString().split('T')[0],
      fechaAprobacion: new Date().toISOString().split('T')[0],
      nombre: 'Campaña Lanzamiento 2026',
      clienteId: cliente.id,
      tipoServicio: 'BTL',
      tipoProyecto: 'Campaña Integral',
      subtotal: 50000,
      estado: 'Activo'
    }
  });

  console.log('Creando Cotización...');
  const quote = await prisma.quote.create({
    data: {
      projectId: proyecto.id,
      version: 1,
      isTemplate: false,
      status: 'Aprobado',
      client: cliente.id,
      brand: 'TechCorp Brand',
      requirement: 'Activación BTL Mall',
      date: new Date().toISOString().split('T')[0],
      businessName: 'SIG Purple',
      ruc: '20555666777',
      paymentConditions: '50/50',
      categories: {
        create: [
          {
            name: 'Producción BTL',
            items: {
              create: [
                {
                  name: 'Módulo de Exhibición',
                  quantity: 1,
                  dates: 1,
                  details: '["Estructura de madera", "Iluminación LED"]',
                  internalMultiplierPercent: 15,
                  financialExpensePercent: 5,
                  providerContact: 'Carlos',
                  productionTime: '5 días',
                  subItems: {
                    create: [
                      {
                        name: 'Carpintería',
                        description: 'Armado de módulo principal',
                        quantity: 1,
                        dates: 1,
                        unitCost: 2000,
                        providerName: proveedor.id
                      },
                      {
                        name: 'Impresión de Viniles',
                        description: 'Gráficas para módulo',
                        quantity: 1,
                        dates: 1,
                        unitCost: 500,
                        providerName: proveedor.id
                      }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    },
    include: {
      categories: {
        include: {
          items: {
            include: {
              subItems: true
            }
          }
        }
      }
    }
  });

  console.log('Creando Orden de Compra...');
  const subItemId = quote.categories[0].items[0].subItems[0].id; // Carpinteria
  const orden = await prisma.orden.create({
    data: {
      id: 'OC-2026-001',
      proveedorId: proveedor.id,
      clienteId: cliente.id,
      proyectoId: proyecto.id,
      quoteId: quote.id,
      fechaEmision: new Date().toISOString().split('T')[0],
      total: 2000,
      estadoEntrega: 'En Proceso',
      condicionesPago: '50% Adelanto, 50% Fin',
      tipoOrden: 'Compra',
      items: {
        create: [
          {
            quoteSubItemId: subItemId,
            name: 'Carpintería - Módulo de Exhibición',
            quantity: 1,
            unitCost: 2000,
            total: 2000,
            costPercentage: 100
          }
        ]
      }
    }
  });

  console.log('Creando Pago...');
  await prisma.pago.create({
    data: {
      clienteId: cliente.id,
      proyectoId: proyecto.id,
      quoteId: quote.id,
      ordenId: orden.id,
      proveedorId: proveedor.id,
      tipoPago: 'Adelanto',
      monto: 1000,
      numeroComprobante: 'F001-00123',
      fechaRegistro: new Date().toISOString().split('T')[0],
      fechaPago: new Date().toISOString().split('T')[0], // Mismo dia por ser ficticio
      estado: 'Pendiente'
    }
  });

  console.log('Seed completo!');
}

main()
  .catch(e => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
