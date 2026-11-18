import { PrismaClient } from '@prisma/client';
import {
  ActivityCategoryType,
  BRIEF_ACTIVITY_TYPES,
  BriefPreguntaItem,
  BriefSeccionItem,
  RequerimientoBriefItem,
  VacioCriticoItem,
  HandoffAreasBrief,
  FuenteBriefItem,
  CreativeProposalDetailed,
  SmartBriefData,
  LiveQuestion,
  ProcessTranscriptResult,
  QuoteSubItemPayload,
  QuoteItemPayload,
  QuoteCategoryPayload,
  MeetingDeliverableResult,
  normalizeActivityType,
  BRIEF_TEMPLATE_ACTIVACION,
  BRIEF_TEMPLATE_EVENTO,
  BRIEF_TEMPLATE_PRODUCCION,
  BRIEF_TEMPLATE_MERCHANDISING,
  BRIEF_TEMPLATE_CAMPANA,
  BRIEF_TEMPLATES_BY_ACTIVITY,
  getBriefTemplateForActivity,
  OFFICIAL_PURPLE_BRIEF_TEMPLATE,
  callGeminiJsonWithModels,
  buildEffectiveTranscriptContext,
  transcribeAudioChunkEnhanced,
  runDeepBriefExtraction,
  extractSourceContent,
  populateOfficialBriefSections,
  computeHonestCompleteness,
  buildQuoteItemsFromRequirements,
  generateEnhancedMeetingDeliverables
} from './briefEngine';

export {
  ActivityCategoryType,
  BRIEF_ACTIVITY_TYPES,
  BriefPreguntaItem,
  BriefSeccionItem,
  RequerimientoBriefItem,
  VacioCriticoItem,
  HandoffAreasBrief,
  FuenteBriefItem,
  CreativeProposalDetailed,
  SmartBriefData,
  LiveQuestion,
  ProcessTranscriptResult,
  QuoteSubItemPayload,
  QuoteItemPayload,
  QuoteCategoryPayload,
  MeetingDeliverableResult,
  normalizeActivityType,
  BRIEF_TEMPLATE_ACTIVACION,
  BRIEF_TEMPLATE_EVENTO,
  BRIEF_TEMPLATE_PRODUCCION,
  BRIEF_TEMPLATE_MERCHANDISING,
  BRIEF_TEMPLATE_CAMPANA,
  BRIEF_TEMPLATES_BY_ACTIVITY,
  getBriefTemplateForActivity,
  OFFICIAL_PURPLE_BRIEF_TEMPLATE,
  populateOfficialBriefSections,
  computeHonestCompleteness,
  extractSourceContent
};

/**
 * Transcribe un chunk de audio usando el motor STT mejorado con glosario BTL y filtro anti-alucinación.
 */
export async function transcribeAudioChunk(
  base64Audio: string,
  mimeType: string = 'audio/webm',
  options?: {
    previousContext?: string;
    clienteNombre?: string;
    titulo?: string;
  }
): Promise<string> {
  return await transcribeAudioChunkEnhanced(base64Audio, mimeType, options);
}

/**
 * Procesa el texto acumulado y extrae el SmartBriefData completo + Inventario cuantificado + Preguntas.
 */
export async function updateBriefFromTranscript(
  transcripcionAcumulada: string,
  briefActual?: Partial<SmartBriefData>,
  preguntasPrevias: LiveQuestion[] = [],
  contextoCliente?: { clienteId?: string; clienteNombre?: string; titulo?: string }
): Promise<ProcessTranscriptResult> {
  return await runDeepBriefExtraction(transcripcionAcumulada, briefActual, preguntasPrevias, contextoCliente);
}

/**
 * Genera una propuesta creativa profunda, rica y detallada (Storytelling, Pilares, Slogan, Look&Feel).
 */
export async function generateDetailedCreativeIdea(
  brief: SmartBriefData,
  transcripcion: string = ''
): Promise<CreativeProposalDetailed> {
  const effectiveContext = buildEffectiveTranscriptContext(transcripcion, brief);
  const prompt = `
Eres el Director Creativo General de "SIG Purple" (Agencia referente en Perú de BTL, eventos corporativos experienciales y campañas creativas).
El cliente y el equipo de cuentas necesitan una PROPUESTA CREATIVA PROFUNDA Y COMPLETA para presentar en pitch o propuesta formal.

DATOS DEL PROYECTO:
- Cliente: ${brief.clienteNombre || 'Cliente'} ${brief.marcaOProducto ? `(${brief.marcaOProducto})` : ''}
- Nombre Tentativo: ${brief.nombreTentativoProyecto || 'Proyecto BTL'}
- Objetivo: ${brief.objetivoPrincipal || 'Impacto, recordación y conexión'}
- Público Objetivo: ${brief.publicoObjetivo || 'Colaboradores o consumidores de la marca'}
- Línea de Servicio: ${brief.tipoServicio || 'PURPLE STRATEGY & CREATIVITY'}
- Tipo de Proyecto: ${brief.tipoProyecto || 'Activación / Evento'}
- Locación: ${(brief.locaciones?.lugares || []).join(', ') || brief.locaciones?.ciudad || 'Lima'}
- Presupuesto: ${brief.presupuestoEstimado?.monto || 'Por definir'} ${brief.presupuestoEstimado?.moneda || 'PEN'}

CONVERSACIÓN Y BRIEF COMPLETO:
"""
${effectiveContext}
"""

GENERA UNA PROPUESTA CREATIVA DE ALTO IMPACTO EN ESTE FORMATO JSON EXACTO:
{
  "bigIdea": "Nombre de la Big Idea, impactante, creativo y memorable",
  "slogan": "Frase rectora o claim de campaña/evento",
  "racionalStorytelling": "Dos párrafos elocuentes y persuasivos adaptados al cliente, objetivo y ciudad.",
  "pilaresExperiencia": [
    {
      "fase": "BIENVENIDA",
      "titulo": "Recepción Inmersiva & Primer Impacto",
      "descripcion": "Cómo se recibe a la gente y ambientación inicial.",
      "impactoEmocional": "Sensación de exclusividad y bienvenida."
    },
    {
      "fase": "DINAMICA_CENTRAL",
      "titulo": "Experiencia & Participación Central",
      "descripcion": "La mecánica interactiva principal.",
      "impactoEmocional": "Involucramiento activo con la marca."
    },
    {
      "fase": "MOMENTO_WOW",
      "titulo": "Clímax de Marca",
      "descripcion": "El momento memorable del encuentro.",
      "impactoEmocional": "Sorpresa y recordación."
    },
    {
      "fase": "CIERRE_RECUERDO",
      "titulo": "Cierre & Recordación",
      "descripcion": "Cierre, entrega de incentivo o captura social.",
      "impactoEmocional": "Gratitud y viralidad."
    }
  ],
  "lookAndFeel": {
    "estiloVisual": "Descripción detallada del estilo visual, colores de marca y acabados.",
    "paletaSugerida": ["#7c3aed", "#10b981", "#f59e0b", "#1e293b"],
    "ambienteMusicaIluminacion": "Criterio musical, animación e iluminación."
  },
  "mecanicasGamificacion": [
    {
      "nombre": "Dinámica Participativa",
      "pasoAPaso": "Flujo claro en tienda / evento.",
      "incentivoOPremio": "Premio o recompensa."
    }
  ]
}
`;

  return await callGeminiJsonWithModels<CreativeProposalDetailed>(prompt);
}

/**
 * Genera el reporte final especializado y el desglose de cotización
 * estructurado para SIG Purple usando los requerimientos cuantificados del Brief 2.0.
 */
export async function generateMeetingDeliverables(
  brief: SmartBriefData,
  transcripcion: string,
  tipoEntregable: 'CREATIVO' | 'PRODUCCION' | 'INTEGRAL' = 'INTEGRAL',
  requiereIdeaOverride?: boolean
): Promise<MeetingDeliverableResult> {
  return await generateEnhancedMeetingDeliverables(brief, transcripcion, tipoEntregable, requiereIdeaOverride);
}

/**
 * Construye una respuesta de fallback profesional priorizando requerimientos cuantificados reales.
 */
export function buildFallbackDeliverables(
  brief: SmartBriefData,
  _tipo: 'CREATIVO' | 'PRODUCCION' | 'INTEGRAL',
  requiereIdea: boolean
): MeetingDeliverableResult {
  const nombreProyecto = brief.nombreTentativoProyecto || 'Activación y Campaña SIG Purple';
  const cliente = brief.clienteNombre || 'Cliente';

  let categoriasCotizacion: QuoteCategoryPayload[] = [];
  if (brief.requerimientosCuantificados && brief.requerimientosCuantificados.length > 0) {
    categoriasCotizacion = buildQuoteItemsFromRequirements(brief.requerimientosCuantificados, brief.locaciones?.ciudad);
  } else {
    const escenografiaItems: QuoteItemPayload[] = (brief.produccion?.escenografiaYMontaje || []).map((item, idx) => ({
      name: item.length > 60 ? item.slice(0, 57) + '...' : item.toUpperCase(),
      quantity: 1,
      dates: 1,
      details: [` - ${item}`, ' - Incluye fabricación/montaje y desmontaje'],
      internalMultiplierPercent: 10,
      financialExpensePercent: 10,
      subItems: [{
        name: `Producción: ${item.slice(0, 35)}`,
        quantity: 1,
        dates: 1,
        unitCost: 850 + (idx * 250),
        providerName: 'Proveedor Escenografía'
      }]
    }));
    const audiovisualItems: QuoteItemPayload[] = (brief.produccion?.audiovisualYTecnica || []).map((item, idx) => ({
      name: item.length > 60 ? item.slice(0, 57) + '...' : item.toUpperCase(),
      quantity: 1,
      dates: 1,
      details: [` - ${item}`, ' - Instalación técnica y operación en sitio'],
      internalMultiplierPercent: 10,
      financialExpensePercent: 10,
      subItems: [{
        name: `Equipo/Técnica: ${item.slice(0, 35)}`,
        quantity: 1,
        dates: 1,
        unitCost: 550 + (idx * 200),
        providerName: 'Proveedor Audiovisual'
      }]
    }));
    const staffItems: QuoteItemPayload[] = (brief.produccion?.staffRequerido || []).map((item) => ({
      name: item.length > 60 ? item.slice(0, 57) + '...' : item.toUpperCase(),
      quantity: 1,
      dates: 1,
      details: [` - ${item}`, ' - Uniformidad, inducción y SCTR'],
      internalMultiplierPercent: 10,
      financialExpensePercent: 10,
      subItems: [{
        name: `Honorarios ${item.slice(0, 35)}`,
        quantity: 1,
        dates: 1,
        unitCost: 220,
        providerName: 'Agencia Staff BTL'
      }]
    }));
    if (escenografiaItems.length) categoriasCotizacion.push({ name: '1. PRODUCCIÓN, ESTRUCTURAS & DECORACIÓN', items: escenografiaItems });
    if (audiovisualItems.length) categoriasCotizacion.push({ name: '2. AUDIOVISUAL & TÉCNICA', items: audiovisualItems });
    if (staffItems.length) categoriasCotizacion.push({ name: '3. PERSONAL OPERATIVO & STAFF', items: staffItems });
  }

  return {
    tipo: requiereIdea ? 'INTEGRAL' : 'PRODUCCION',
    titulo: `Propuesta y Desglose Operativo: ${nombreProyecto}`,
    resumenEjecutivo: brief.resumenEjecutivo || `Propuesta operativa integral diseñada para ${cliente}.`,
    requiereIdeaCreativa: requiereIdea,
    propuestaCreativa: null,
    desgloseProduccion: {
      escenografiaYBranding: (brief.produccion?.escenografiaYMontaje || []).map(item => ({
        item,
        especificacion: 'Según brief',
        cantidadAprox: '1 lote'
      })),
      equipamientoTecnico: (brief.produccion?.audiovisualYTecnica || []).map(item => ({
        categoria: 'Audiovisual',
        descripcion: item
      })),
      requerimientoStaff: (brief.produccion?.staffRequerido || []).map(item => ({
        rol: item,
        cantidad: 1,
        funciones: 'Operación según brief'
      })),
      cronogramaProduccion: [
        { fase: 'Preproducción', duracionEstimada: '3 a 5 días', entregable: 'Aprobación de artes y compras' },
        { fase: 'Ejecución / Montaje', duracionEstimada: brief.fechasTentativas?.duracionJornada || 'Según fecha acordada', entregable: 'Actividad operativa' }
      ],
      matrizRiesgosYPermisos: (brief.produccion?.permisosYSeguridad || []).map(item => ({
        riesgoOPermiso: item,
        planMitigacion: 'Tramitar con anticipación'
      })),
      proveedoresSugeridosCategorias: ['Escenografía', 'Audiovisual', 'Personal BTL', 'Transporte']
    },
    categoriasCotizacion,
    proximosPasosInmediatos: [
      'Revisar cantidades y costos directos en la vista previa',
      'Crear Proyecto y Cotización oficial en SIG Purple'
    ]
  };
}

/**
 * Crea simultáneamente el Proyecto y la Cotización oficial en SIG Purple
 * con código consecutivo oficial (PRJ-YYYY-XXX y COT-XXXX).
 */
export async function createProjectAndQuoteFromBrief(
  prisma: PrismaClient,
  brief: SmartBriefData,
  usuarioNombre: string = 'Eric Higa',
  customCategories?: QuoteCategoryPayload[]
) {
  let clienteId = brief.clienteId;
  let clienteEmpresa = brief.clienteNombre || 'Cliente Nuevo';
  const clienteRuc = '20603757417';

  if (!clienteId && brief.clienteNombre) {
    const existing = await prisma.cliente.findFirst({
      where: {
        empresa: {
          contains: brief.clienteNombre,
          mode: 'insensitive'
        }
      }
    });

    if (existing) {
      clienteId = existing.id;
      clienteEmpresa = existing.empresa;
    } else {
      const nuevoCliente = await prisma.cliente.create({
        data: {
          empresa: brief.clienteNombre,
          contacto: brief.contactoNombre || 'Por definir',
          cargo: brief.contactoCargo || '',
          email: brief.contactoEmail || ('contacto@' + brief.clienteNombre.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'),
          telefono: brief.contactoTelefono || '999999999',
          estado: 'Activo'
        }
      });
      clienteId = nuevoCliente.id;
      clienteEmpresa = nuevoCliente.empresa;
    }
  } else if (clienteId) {
    const existing = await prisma.cliente.findUnique({ where: { id: clienteId } });
    if (existing) {
      clienteEmpresa = existing.empresa;
    }
  }

  if (!clienteId) {
    const firstClient = await prisma.cliente.findFirst();
    if (firstClient) {
      clienteId = firstClient.id;
      clienteEmpresa = firstClient.empresa;
    } else {
      throw new Error('No se encontró ningún cliente en el sistema para asociar al proyecto.');
    }
  }

  const currentYear = new Date().getFullYear();
  const allProjects = await prisma.proyecto.findMany({ select: { id: true } });
  const existingNums = allProjects
    .map(p => {
      const match = p.id?.match(/PRJ-\d{4}-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => !isNaN(n));
  const nextNum = (existingNums.length > 0 ? Math.max(...existingNums) : 0) + 1;
  const projectId = `PRJ-${currentYear}-${String(nextNum).padStart(3, '0')}`;

  const moneda = brief.presupuestoEstimado?.moneda || 'PEN';
  const presupuestoStr = brief.presupuestoEstimado?.monto
    ? `${moneda} ${brief.presupuestoEstimado.monto}`
    : 'POR COTIZAR';

  const reqsTxt = (brief.requerimientosCuantificados || []).length > 0
    ? `\nRequerimientos: ${brief.requerimientosCuantificados!.map(r => `${r.cantidad}x ${r.item}`).join(', ')}`
    : '';

  const nuevoProyecto = await prisma.proyecto.create({
    data: {
      id: projectId,
      fechaRegistro: new Date().toLocaleDateString('es-PE'),
      fechaAprobacion: '-',
      nombre: brief.nombreTentativoProyecto || `Proyecto ${brief.tipoServicio} - ${clienteEmpresa}`,
      clienteId,
      tipoServicio: brief.tipoServicio || 'PURPLE STRATEGY & CREATIVITY',
      tipoProyecto: brief.tipoProyecto || 'Activación',
      presupuestoEstimado: presupuestoStr,
      subtotal: typeof brief.presupuestoEstimado?.monto === 'number' ? brief.presupuestoEstimado.monto : 0,
      moneda,
      estado: 'PENDIENTE CP',
      projectManager: brief.projectManager || usuarioNombre,
      statusActividad: 'EN PROCESO',
      contactoNombre: brief.contactoNombre || '',
      comentarios: `Generado desde Smart Brief IA 2.0.\nCiudad: ${brief.locaciones?.ciudad || 'N/A'} | Lugares: ${(brief.locaciones?.lugares || []).join(', ')}\nObjetivo: ${brief.objetivoPrincipal || 'N/A'}${reqsTxt}\nResumen: ${brief.resumenEjecutivo || ''}`
    }
  });

  let nuevaCotizacion: any = null;
  let rawCategories = customCategories && customCategories.length > 0 ? customCategories : [];
  if (rawCategories.length === 0 && brief.requerimientosCuantificados && brief.requerimientosCuantificados.length > 0) {
    rawCategories = buildQuoteItemsFromRequirements(brief.requerimientosCuantificados, brief.locaciones?.ciudad);
  }

  if (rawCategories.length > 0) {
    const allQuotes = await prisma.quote.findMany({ select: { id: true } });
    const existingQuoteNums = allQuotes
      .map(q => {
        const match = q.id?.match(/COT-(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => !isNaN(n));
    const nextQuoteNum = (existingQuoteNums.length > 0 ? Math.max(...existingQuoteNums) : 1000) + 1;
    const quoteId = `COT-${String(nextQuoteNum).padStart(4, '0')}`;

    nuevaCotizacion = await prisma.quote.create({
      data: {
        id: quoteId,
        projectId: nuevoProyecto.id,
        version: 1,
        isTemplate: false,
        status: 'En Creación',
        client: clienteEmpresa,
        brand: brief.marcaOProducto || clienteEmpresa,
        requirement: brief.nombreTentativoProyecto || nuevoProyecto.nombre,
        date: new Date().toLocaleDateString('es-PE'),
        businessName: clienteEmpresa || 'Purple BTL S.A.C.',
        ruc: clienteRuc,
        paymentConditions: '30 días de crédito',
        currency: moneda,
        exchangeRate: 1.0,
        includeIgv: false,
        categories: {
          create: rawCategories.map((cat: any) => ({
            name: cat.name,
            items: {
              create: (cat.items || []).map((item: any) => ({
                name: item.name || '',
                quantity: parseFloat(String(item.quantity).replace(',', '.')) || 1,
                dates: parseFloat(String(item.dates).replace(',', '.')) || 1,
                details: typeof item.details === 'string' ? item.details : JSON.stringify(item.details || []),
                internalMultiplierPercent: Number(item.internalMultiplierPercent) || 10,
                financialExpensePercent: Number(item.financialExpensePercent) || 10,
                providerContact: item.providerContact || '',
                productionTime: item.productionTime || '',
                subItems: {
                  create: (item.subItems && item.subItems.length > 0 ? item.subItems : [
                    { name: item.name || 'Servicio', description: '', quantity: 1, dates: 1, unitCost: 100, providerName: '' }
                  ]).map((s: any) => ({
                    name: s.name || '',
                    description: s.description || '',
                    quantity: parseFloat(String(s.quantity).replace(',', '.')) || 1,
                    dates: parseFloat(String(s.dates).replace(',', '.')) || 1,
                    unitCost: parseFloat(String(s.unitCost).replace(',', '.')) || 0,
                    providerName: s.providerName || ''
                  }))
                }
              }))
            }
          }))
        }
      },
      include: {
        categories: {
          include: {
            items: {
              include: { subItems: true }
            }
          }
        }
      }
    });

    await prisma.quoteHistory.create({
      data: {
        quoteId: nuevaCotizacion.id,
        userName: usuarioNombre,
        action: 'Creación Inteligente',
        details: 'Cotización generada automáticamente a partir del Smart Brief IA 2.0'
      }
    });
  }

  return {
    project: nuevoProyecto,
    quote: nuevaCotizacion
  };
}

/**
 * Alias retrocompatible.
 */
export async function createProjectFromBrief(
  prisma: PrismaClient,
  brief: SmartBriefData,
  usuarioNombre: string = 'Eric Higa'
) {
  const res = await createProjectAndQuoteFromBrief(prisma, brief, usuarioNombre);
  return res.project;
}
