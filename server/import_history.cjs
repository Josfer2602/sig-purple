const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DATASET_PATH = path.join(__dirname, 'history_dataset.json');

function normalizeStr(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

async function runImport() {
  console.log('🚀 Iniciando script de importación histórica a SIG Purple...');
  if (!fs.existsSync(DATASET_PATH)) {
    throw new Error('No se encontró history_dataset.json en: ' + DATASET_PATH);
  }

  const rawData = fs.readFileSync(DATASET_PATH, 'utf-8');
  const dataset = JSON.parse(rawData);
  console.log(`📊 Dataset cargado: ${dataset.clientes.length} clientes, ${dataset.proyectos.length} proyectos.`);

  // 1. CARGA / SINCRONIZACIÓN DE CLIENTES
  console.log('\n[Paso 1] Sincronizando Clientes...');
  const existingClientes = await prisma.cliente.findMany();
  const clienteMap = new Map(); // norm -> cliente

  for (const c of existingClientes) {
    clienteMap.set(normalizeStr(c.empresa), c);
  }

  // Aliases comunes entre Excel y BD
  const ALIASES = {
    'grupoa365': 'a365',
    'a365': 'a365',
    'izipaysac': 'izipay',
    'clinicadeojosopeluce': 'opeluce',
    'opeluce': 'opeluce',
    'bymainstrumentssac': 'bymainstruments',
    'corporacionarion': 'corporacionarion',
    'grupopatio': 'grupopatio'
  };

  let newClientsCount = 0;
  for (const clientName of dataset.clientes) {
    let norm = normalizeStr(clientName);
    if (ALIASES[norm]) norm = ALIASES[norm];

    let found = clienteMap.get(norm);
    if (!found) {
      for (const [k, existing] of clienteMap.entries()) {
        if (k === norm || (norm.length > 5 && (k.includes(norm) || norm.includes(k)))) {
          found = existing;
          break;
        }
      }
    }

    if (!found) {
      const newId = `CLI-HIST-${String(clienteMap.size + 1).padStart(4, '0')}`;
      const created = await prisma.cliente.create({
        data: {
          id: newId,
          empresa: clientName,
          contacto: 'Por Asignar',
          cargo: 'Comercial',
          email: `contacto@${norm || 'cliente'}.com`,
          telefono: '-',
          estado: 'Activo'
        }
      });
      clienteMap.set(norm, created);
      newClientsCount++;
    }
  }
  console.log(`✅ Clientes listos: ${existingClientes.length} existentes, ${newClientsCount} nuevos creados.`);

  // 2. OBTENER PROVEEDOR PARA COSTOS HISTÓRICOS
  let provHist = await prisma.proveedor.findFirst({
    where: { razonSocial: 'Costos Históricos de Producción' }
  });
  if (!provHist) {
    provHist = await prisma.proveedor.create({
      data: {
        id: 'PROV-HIST-001',
        razonSocial: 'Costos Históricos de Producción',
        nombre: 'Producción Purple',
        ruc: '20601846374',
        tipoDocumento: 'Otros',
        tipoProveedor: 'Trabajado',
        esConfiable: true,
        categoria: 'Producción General'
      }
    });
    console.log('✅ Proveedor genérico para costos históricos verificado.');
  }

  // 3. CARGA / SINCRONIZACIÓN DE PROYECTOS
  console.log('\n[Paso 2] Sincronizando Proyectos...');
  const preExistingProyectos = await prisma.proyecto.findMany({
    include: { cliente: true, facturasCliente: true }
  });
  console.log(`ℹ️ Proyectos existentes en base de datos antes de importar: ${preExistingProyectos.length}`);

  // Mapear proyectos preexistentes para evitar duplicados
  const preExistingMap = new Map();
  for (const p of preExistingProyectos) {
    const cliNorm = p.cliente ? normalizeStr(p.cliente.empresa) : '';
    const proyNorm = normalizeStr(p.nombre);
    preExistingMap.set(`${cliNorm}___${proyNorm}`, p);
  }

  // Secuencia de IDs por año
  const yearSeqMap = new Map();
  for (const p of preExistingProyectos) {
    const match = (p.id || '').match(/PRJ-(\d{4})-(\d+)/);
    if (match) {
      const y = parseInt(match[1], 10);
      const seq = parseInt(match[2], 10);
      yearSeqMap.set(y, Math.max(yearSeqMap.get(y) || 0, seq));
    }
  }

  function getNextProjectId(year) {
    const y = year || 2026;
    const current = yearSeqMap.get(y) || 0;
    const next = current + 1;
    yearSeqMap.set(y, next);
    return `PRJ-${y}-${String(next).padStart(3, '0')}`;
  }

  let projectsCreated = 0;
  let projectsUpdated = 0;
  let facturasCreated = 0;
  let historicalCostsCreated = 0;

  for (const item of dataset.proyectos) {
    let cliNorm = normalizeStr(item.cliente);
    if (ALIASES[cliNorm]) cliNorm = ALIASES[cliNorm];

    let clienteRecord = clienteMap.get(cliNorm);
    if (!clienteRecord) {
      for (const [k, c] of clienteMap.entries()) {
        if (k.includes(cliNorm) || cliNorm.includes(k)) {
          clienteRecord = c;
          break;
        }
      }
    }
    if (!clienteRecord) {
      console.warn(`Cliente no encontrado para: ${item.cliente}`);
      continue;
    }

    const proyNorm = normalizeStr(item.nombre);
    const key = `${normalizeStr(clienteRecord.empresa)}___${proyNorm}`;

    // Buscar si coincide con alguno de los proyectos preexistentes en la BD
    let matchedProject = preExistingMap.get(key);
    if (!matchedProject) {
      for (const [k, p] of preExistingMap.entries()) {
        const [existingCliNorm, existingProyNorm] = k.split('___');
        if (existingCliNorm === normalizeStr(clienteRecord.empresa)) {
          // Coincidencia exacta o contiene palabras clave clave
          if (
            (existingProyNorm.includes('perusostenible') && proyNorm.includes('perusostenible')) ||
            (existingProyNorm.includes('mercadomayorista') && proyNorm.includes('mercadomayorista')) ||
            (existingProyNorm.includes('futurevisions') && proyNorm.includes('futurevisions')) ||
            (existingProyNorm.includes('bancoripley') && proyNorm.includes('bancoripley')) ||
            (existingProyNorm.includes('plazadelsol') && proyNorm.includes('plazadelsol') && existingProyNorm === proyNorm)
          ) {
            matchedProject = p;
            break;
          }
        }
      }
    }

    let currentProjectId;

    if (matchedProject) {
      // ACTUALIZAR PROYECTO PREEXISTENTE (no duplicar)
      currentProjectId = matchedProject.id;
      const updates = {};
      if ((!matchedProject.subtotal || matchedProject.subtotal === 0) && item.subtotal > 0) {
        updates.subtotal = item.subtotal;
      }
      if (!matchedProject.ordenesCompra && item.ordenesCompra) {
        updates.ordenesCompra = item.ordenesCompra;
      }
      if (!matchedProject.fechaAprobacion && item.fechaAprobacion) {
        updates.fechaAprobacion = item.fechaAprobacion;
      }
      if (!matchedProject.statusActividad && item.statusActividad) {
        updates.statusActividad = item.statusActividad;
      }
      if (item.gastosAdicionales > 0 && (!matchedProject.gastosAdicionales || matchedProject.gastosAdicionales === 0)) {
        updates.gastosAdicionales = item.gastosAdicionales;
      }

      if (Object.keys(updates).length > 0) {
        await prisma.proyecto.update({
          where: { id: matchedProject.id },
          data: updates
        });
        projectsUpdated++;
      }
    } else {
      // CREAR PROYECTO HISTÓRICO
      const anioNum = parseInt(item.anio, 10) || (item.fechaRegistro ? parseInt(item.fechaRegistro.slice(0, 4), 10) : 2026);
      currentProjectId = getNextProjectId(anioNum);

      await prisma.proyecto.create({
        data: {
          id: currentProjectId,
          fechaRegistro: item.fechaRegistro || `${anioNum}-01-01`,
          fechaAprobacion: item.fechaAprobacion,
          nombre: item.nombre,
          clienteId: clienteRecord.id,
          tipoServicio: item.tipoServicio || 'PURPLE VISIBILITY',
          tipoProyecto: item.tipoProyecto || 'INDIVIDUAL',
          subtotal: item.subtotal || 0,
          estado: item.estado || 'Registrado',
          ordenesCompra: item.ordenesCompra,
          projectManager: item.projectManager || 'Eric Higa',
          statusActividad: item.statusActividad,
          comentarios: item.comentarios,
          gastosAdicionales: item.gastosAdicionales || 0,
          contactoNombre: item.contactoNombre
        }
      });
      projectsCreated++;
    }

    // 4. FACTURA CLIENTE
    if (item.factura && item.factura.numeroFactura) {
      const existingFact = await prisma.facturaCliente.findFirst({
        where: {
          proyectoId: currentProjectId,
          numeroFactura: item.factura.numeroFactura
        }
      });

      if (!existingFact) {
        const isPaid = item.factura.facturado === 'SI' || item.statusActividad === 'FINALIZADO';
        await prisma.facturaCliente.create({
          data: {
            proyectoId: currentProjectId,
            tipoOrden: 'OC',
            numeroOrden: item.factura.numeroOrden || '-',
            fechaGeneracionOrden: item.factura.fechaEmision || item.fechaRegistro || '-',
            condicionPago: item.factura.condicionPago || 'Contado',
            numeroFactura: item.factura.numeroFactura,
            fechaEmision: item.factura.fechaEmision || item.fechaRegistro || '-',
            diasPago: item.factura.diasPago || 30,
            montoSinIgv: item.factura.montoSinIgv || item.subtotal || 0,
            igv: Math.round((item.factura.montoSinIgv || item.subtotal || 0) * 0.18 * 100) / 100,
            montoConIgv: Math.round((item.factura.montoSinIgv || item.subtotal || 0) * 1.18 * 100) / 100,
            aplicaDetraccion: (item.factura.montoSinIgv || item.subtotal || 0) > 700,
            aplicaRetencion: false,
            importeRecibido: isPaid ? Math.round((item.factura.montoSinIgv || item.subtotal || 0) * 1.18 * 100) / 100 : 0,
            fechaPago: item.factura.fechaPago,
            pagoImpuestos: isPaid,
            estado: isPaid ? 'Pagado' : 'Pendiente',
            porcentajeFacturacion: 100
          }
        });
        facturasCreated++;
      }
    }

    // 5. REGISTRAR COSTO HISTÓRICO DE RENTABILIDAD PARA PROYECTOS APROBADOS
    if (item.estado === 'Aprobado' && item.rentabilidad && item.rentabilidad.costoSinIgv > 0) {
      const existingQuote = await prisma.quote.findFirst({
        where: { projectId: currentProjectId }
      });

      if (!existingQuote) {
        const qId = `Q-HIST-${currentProjectId}`;
        await prisma.quote.create({
          data: {
            id: qId,
            projectId: currentProjectId,
            version: 1,
            isTemplate: false,
            status: 'Aprobado',
            client: clienteRecord.empresa,
            brand: clienteRecord.empresa,
            requirement: item.nombre,
            date: item.fechaRegistro || '2026-01-01',
            businessName: 'PURPLE BTL S.A.C.',
            ruc: '20601846374',
            paymentConditions: 'Crédito',
            currency: 'PEN',
            exchangeRate: 1.0,
            includeIgv: false
          }
        });

        // Crear Orden con el costo exacto histórico
        const oId = `OC-HIST-${currentProjectId}`;
        await prisma.orden.create({
          data: {
            id: oId,
            proveedorId: provHist.id,
            clienteId: clienteRecord.id,
            proyectoId: currentProjectId,
            quoteId: qId,
            fechaEmision: item.fechaAprobacion || item.fechaRegistro || '2026-01-01',
            total: item.rentabilidad.costoSinIgv,
            estadoEntrega: 'Entregado',
            condicionesPago: 'Contado',
            tipoOrden: 'Servicio',
            items: {
              create: {
                quoteSubItemId: 'HIST-ITEM',
                name: 'Costo de Producción Histórico Consolidado',
                quantity: 1,
                unitCost: item.rentabilidad.costoSinIgv,
                total: item.rentabilidad.costoSinIgv,
                customDescription: `Registrado desde Cuadro de Gestión Comercial (${item.rentabilidad.statusRent || 'Finalizado'})`
              }
            }
          }
        });

        historicalCostsCreated++;
      }
    }
  }

  console.log(`\n==============================================`);
  console.log(`🎉 MIGRACIÓN COMPLETADA CON ÉXITO:`);
  console.log(` - Clientes nuevos creados: ${newClientsCount}`);
  console.log(` - Proyectos nuevos creados: ${projectsCreated}`);
  console.log(` - Proyectos existentes actualizados: ${projectsUpdated}`);
  console.log(` - Facturas de cliente creadas: ${facturasCreated}`);
  console.log(` - Costos y rentabilidades históricas enlazadas: ${historicalCostsCreated}`);
  console.log(`==============================================\n`);
}

runImport()
  .catch(err => {
    console.error('❌ Error en migración:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
