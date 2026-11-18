import { GoogleGenAI } from '@google/genai';
import JSZip from 'jszip';

export type ActivityCategoryType =
  | 'Activación'
  | 'Evento Corporativo'
  | 'Producción de Elemento'
  | 'Merchandising'
  | 'Campaña Integral';

export const BRIEF_ACTIVITY_TYPES: ActivityCategoryType[] = [
  'Activación',
  'Evento Corporativo',
  'Producción de Elemento',
  'Merchandising',
  'Campaña Integral'
];

export interface BriefPreguntaItem {
  numero: number;
  pregunta: string;
  respuesta: string;
  respondida: boolean;
  origenManual?: boolean;
}

export interface BriefSeccionItem {
  numeroRomano: string;
  titulo: string;
  preguntas: BriefPreguntaItem[];
}

export interface RequerimientoBriefItem {
  id: string;
  categoria: 'PRODUCCION' | 'AUDIOVISUAL' | 'STAFF' | 'MERCHANDISING' | 'LOGISTICA' | 'DISENO' | 'CATERING';
  cantidad: number | string;
  item: string;
  especificaciones: string;
  jornadaOHorario?: string;
  locacion?: string;
  estado: 'CONFIRMADO' | 'POR_CONFIRMAR';
}

export interface VacioCriticoItem {
  punto: string;
  impacto: string;
  prioridad: 'ALTA' | 'MEDIA';
}

export interface HandoffAreasBrief {
  cuentas: string[];
  diseno: string[];
  produccion: string[];
  cotizacion: string[];
}

export interface FuenteBriefItem {
  id: string;
  tipo: 'VOZ' | 'TEXTO_CORREO' | 'ARCHIVO' | 'NOTA';
  nombre: string;
  fecha: string;
  caracteres: number;
}

export interface CreativeProposalDetailed {
  bigIdea: string;
  slogan: string;
  racionalStorytelling: string;
  pilaresExperiencia: {
    fase: 'BIENVENIDA' | 'DINAMICA_CENTRAL' | 'MOMENTO_WOW' | 'CIERRE_RECUERDO';
    titulo: string;
    descripcion: string;
    impactoEmocional: string;
  }[];
  lookAndFeel: {
    estiloVisual: string;
    paletaSugerida: string[];
    ambienteMusicaIluminacion: string;
  };
  mecanicasGamificacion: {
    nombre: string;
    pasoAPaso: string;
    incentivoOPremio: string;
  }[];
}

export interface SmartBriefData {
  clienteId?: string;
  clienteNombre?: string;
  marcaOProducto?: string;
  contactoNombre?: string;
  contactoCargo?: string;
  contactoEmail?: string;
  contactoTelefono?: string;
  nombreTentativoProyecto: string;
  tipoServicio: string;
  tipoProyecto: string;
  tipoProyectoManual?: boolean;
  subTipoActividad?: string;
  projectManager?: string;
  requiereIdeaCreativa?: boolean;
  objetivoPrincipal: string;
  publicoObjetivo: string;
  mensajeClaveOConcepto: string;
  fechasTentativas: {
    inicio?: string;
    fin?: string;
    duracionJornada?: string;
    diasClave?: string[];
  };
  locaciones: {
    ciudad: string;
    lugares: string[];
    esExterior: boolean;
  };
  referenciasMencionadas?: string[];
  presupuestoEstimado?: {
    monto?: number | string;
    moneda: 'PEN' | 'USD';
    esFlexible: boolean;
    observacion?: string;
  };
  produccion: {
    escenografiaYMontaje: string[];
    audiovisualYTecnica: string[];
    staffRequerido: string[];
    permisosYSeguridad: string[];
  };
  requerimientosCuantificados?: RequerimientoBriefItem[];
  vaciosCriticos?: VacioCriticoItem[];
  mensajeSeguimientoCliente?: string;
  handoffAreas?: HandoffAreasBrief;
  fuentesIngresadas?: FuenteBriefItem[];
  kpisOMetricas: string[];
  restricciones: string[];
  fechaLimitePropuesta: string;
  completitudPorcentaje: number;
  resumenEjecutivo?: string;
  seccionesBrief?: BriefSeccionItem[];
  propuestaCreativaDetallada?: CreativeProposalDetailed | null;
}

export interface LiveQuestion {
  id: string;
  pregunta: string;
  motivo: string;
  categoria: 'PRESUPUESTO' | 'FECHAS' | 'PRODUCCION' | 'CREATIVIDAD' | 'PERMISOS' | 'GENERAL';
  prioridad: 'ALTA' | 'MEDIA' | 'BAJA';
  respondida?: boolean;
}

export interface ProcessTranscriptResult {
  brief: SmartBriefData;
  preguntasSugeridas: LiveQuestion[];
  completitudPorcentaje: number;
}

export interface QuoteSubItemPayload {
  id?: string;
  name: string;
  description?: string;
  quantity: number;
  dates: number;
  unitCost: number;
  providerName?: string;
}

export interface QuoteItemPayload {
  id?: string;
  name: string;
  quantity: number;
  dates: number;
  details: string[];
  internalMultiplierPercent?: number;
  financialExpensePercent?: number;
  providerContact?: string;
  productionTime?: string;
  subItems: QuoteSubItemPayload[];
}

export interface QuoteCategoryPayload {
  id?: string;
  name: string;
  items: QuoteItemPayload[];
}

export interface MeetingDeliverableResult {
  tipo: 'CREATIVO' | 'PRODUCCION' | 'INTEGRAL';
  titulo: string;
  resumenEjecutivo: string;
  requiereIdeaCreativa?: boolean;
  propuestaCreativa?: {
    bigIdea: string;
    racionalEstrategico: string;
    mecanicas: {
      titulo: string;
      descripcion: string;
      experienciaUsuario: string;
    }[];
    sugerenciasVisualesYStorytelling: string[];
    canalesOAcciones: string[];
  } | null;
  desgloseProduccion?: {
    escenografiaYBranding: { item: string; especificacion: string; cantidadAprox?: string }[];
    equipamientoTecnico: { categoria: string; descripcion: string }[];
    requerimientoStaff: { rol: string; cantidad: number; funciones: string }[];
    cronogramaProduccion: { fase: string; duracionEstimada: string; entregable: string }[];
    matrizRiesgosYPermisos: { riesgoOPermiso: string; planMitigacion: string }[];
    proveedoresSugeridosCategorias: string[];
  };
  categoriasCotizacion?: QuoteCategoryPayload[];
  proximosPasosInmediatos: string[];
}

/**
 * Normaliza cualquier variante de tipo de proyecto a una de las 5 categorías oficiales de brief.
 */
export function normalizeActivityType(tipo?: string): ActivityCategoryType {
  if (!tipo) return 'Activación';
  const norm = tipo.toLowerCase().trim();
  if (/merchandis|merch|regalo|art[ií]culo|souvenir|textil|tomatodo|polo|mug|bolso|mochila/i.test(norm)) {
    return 'Merchandising';
  }
  if (/produc.*element|elemento|stand|m[oó]dulo|retail|carpinter|implement|isla|t[oó]tem|backing|letras\s*3d|vitrina|pop\b/i.test(norm)) {
    return 'Producción de Elemento';
  }
  if (/event|corporat|aniversari|fiesta|conferen|lanzam|gala|convenci[oó]n|cena|agasajo/i.test(norm)) {
    return 'Evento Corporativo';
  }
  if (/campa[nñ]a|integral|360|multicanal/i.test(norm)) {
    return 'Campaña Integral';
  }
  return 'Activación';
}

// =========================================================================
// PLANTILLAS OFICIALES DE BRIEF POR CATEGORÍA (FUENTE ÚNICA BACKEND)
// =========================================================================
export const BRIEF_TEMPLATE_ACTIVACION: BriefSeccionItem[] = [
  {
    numeroRomano: 'I',
    titulo: 'OBJETIVO, TARGET Y PRESUPUESTO',
    preguntas: [
      { numero: 1, pregunta: '¿Cuál es el objetivo principal de la activación (awareness, sampling/prueba, generación de leads, ventas directas, engagement)?', respuesta: '', respondida: false },
      { numero: 2, pregunta: '¿Cuál es el target o público objetivo (NSE, rango de edad, género, perfil de consumidor)?', respuesta: '', respondida: false },
      { numero: 3, pregunta: '¿Cuál es el Presupuesto Total referencial asignado para la activación? (Monto estimado o rango)', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'II',
    titulo: 'FECHAS, LOCACIONES Y PERMISOS',
    preguntas: [
      { numero: 4, pregunta: '¿En qué fechas, fines de semana o periodo debemos programar la activación?', respuesta: '', respondida: false },
      { numero: 5, pregunta: '¿En qué puntos específicos se activará (centros comerciales, supermercados, tiendas, vía pública, playas, eventos)?', respuesta: '', respondida: false },
      { numero: 6, pregunta: '¿Cuál es el horario de atención al público y la ventana horaria permitida para montaje y desmontaje?', respuesta: '', respondida: false },
      { numero: 7, pregunta: '¿Se requiere tramitar permiso municipal o autorización del centro comercial / recinto? ¿Desean que SIG Purple lo gestione?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'III',
    titulo: 'MECÁNICA, GAMIFICACIÓN Y EXPERIENCIA',
    preguntas: [
      { numero: 8, pregunta: '¿Qué mecánica o dinámica interactiva les gustaría implementar (ruleta física/digital, juego interactivo, reto fotográfico, canje por compra, sampling)?', respuesta: '', respondida: false },
      { numero: 9, pregunta: '¿Cuentan con un concepto creativo rector o desean que SIG Purple desarrolle la Big Idea y el storytelling de la experiencia?', respuesta: '', respondida: false },
      { numero: 10, pregunta: '¿Se requiere desarrollo digital (app de registro en tablet, ruleta interactiva, landing page o lectura de códigos QR)?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'IV',
    titulo: 'PERSONAL, STAFF Y UNIFORMES',
    preguntas: [
      { numero: 11, pregunta: '¿Qué staff operativo debemos considerar (promotores, impulsadoras, anfitrionas, volanteo, supervisor en campo, animador) y cuántas horas?', respuesta: '', respondida: false },
      { numero: 12, pregunta: '¿Qué perfil de personal desean que consideremos (Tipo A1, A, B, etc.)?', respuesta: '', respondida: false },
      { numero: 13, pregunta: '¿Consideramos la confección y producción de uniformes / indumentaria brandeada (polos, gorros, chalecos, vestidos de anfitriona)?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'V',
    titulo: 'PREMIOS, SAMPLING Y SOUVENIRS',
    preguntas: [
      { numero: 14, pregunta: '¿Qué incentivos o premios inmediatos se entregarán a los participantes (merchandising, producto de muestra, gift cards)?', respuesta: '', respondida: false },
      { numero: 15, pregunta: '¿Qué volumen estimado de contactos, impactos o muestras de sampling esperan alcanzar por día y por punto?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'VI',
    titulo: 'ELEMENTOS VISUALES, EQUIPO TÉCNICO Y BRANDING',
    preguntas: [
      { numero: 16, pregunta: '¿Qué elementos físicos de visibilidad, decoración o equipo técnico se deben producir/alquilar (photocall, backing, counter, ruleta, parlantes, globos, cintillo)?', respuesta: '', respondida: false },
      { numero: 17, pregunta: '¿Desean que consideremos el diseño 3D/2D y adaptación gráfica de todos los elementos o nos brindan el Key Visual en alta resolución?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'VII',
    titulo: 'LOGÍSTICA, RESTRICCIONES Y FECHA LÍMITE',
    preguntas: [
      { numero: 18, pregunta: '¿Consideramos almacén temporal, transporte, envío a provincia y logística de recojo/traslado de materiales?', respuesta: '', respondida: false },
      { numero: 19, pregunta: '¿Restricciones operativas a tomar en cuenta (póliza de seguro SCTR, carnets de sanidad, inducciones del establecimiento)?', respuesta: '', respondida: false },
      { numero: 20, pregunta: '¿Cuál es la fecha límite para presentar la propuesta y cotización de SIG Purple?', respuesta: '', respondida: false }
    ]
  }
];

export const BRIEF_TEMPLATE_EVENTO: BriefSeccionItem[] = [
  {
    numeroRomano: 'I',
    titulo: 'OBJETIVO, ASISTENTES Y PRESUPUESTO',
    preguntas: [
      { numero: 1, pregunta: '¿Cuál es el motivo y objetivo del evento (aniversario, fiesta de fin de año, integración, lanzamiento de producto, convención corporativa)?', respuesta: '', respondida: false },
      { numero: 2, pregunta: '¿A cuántos asistentes esperan recibir y cuál es su perfil (colaboradores internos, directivos, clientes VIP, familias)?', respuesta: '', respondida: false },
      { numero: 3, pregunta: '¿Cuál es el Presupuesto Total referencial asignado para el evento? (Monto estimado o rango)', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'II',
    titulo: 'FECHA, LOCACIÓN Y HORARIOS',
    preguntas: [
      { numero: 4, pregunta: '¿En qué fecha(s) o periodo está previsto realizar el evento?', respuesta: '', respondida: false },
      { numero: 5, pregunta: '¿Cuentan ya con una locación definida (hotel, centro de convenciones, local campestre) o desean que SIG Purple proponga y gestione el espacio?', respuesta: '', respondida: false },
      { numero: 6, pregunta: '¿Cuál es el cronograma horario previsto (montaje previo, llegada de invitados, protocolo oficial, fiesta/cierre y desmontaje)?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'III',
    titulo: 'CONCEPTO, TEMÁTICA Y STORYTELLING',
    preguntas: [
      { numero: 7, pregunta: '¿Cuentan con un concepto, temática o dress code definido (Gala formal, Festival, Años 80/90, Rústico Chic) o requieren propuesta creativa integral?', respuesta: '', respondida: false },
      { numero: 8, pregunta: '¿Desean que consideremos el diseño de Key Visual, invitaciones digitales personalizadas, credenciales y piezas gráficas temáticas?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'IV',
    titulo: 'AUDIOVISUAL, TÉCNICA Y ESCENARIO',
    preguntas: [
      { numero: 9, pregunta: '¿Desean que consideremos Pantallas LED gigantes (central, laterales) o Ecran con proyector de alta luminosidad?', respuesta: '', respondida: false },
      { numero: 10, pregunta: '¿Qué requerimientos de sonido e iluminación se contemplan (audio para banda/DJ, microfonía inalámbrica, luces robóticas perimetrales, efectos especiales)?', respuesta: '', respondida: false },
      { numero: 11, pregunta: '¿Se requiere escenario estructurado, tarima, atril para expositores o pasarela?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'V',
    titulo: 'PROGRAMA, PROTOCOLO Y ENTRETENIMIENTO',
    preguntas: [
      { numero: 12, pregunta: '¿Qué momentos protocolares se contemplan (palabras de gerencia, video corporativo, premiaciones, reconocimientos, brindis institucional)?', respuesta: '', respondida: false },
      { numero: 13, pregunta: '¿Qué entretenimiento en vivo desean considerar (maestro de ceremonias / animador reconocido, banda en vivo, DJ profesional, shows artísticos, hora loca)?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'VI',
    titulo: 'ALIMENTOS, BEBIDAS Y CATERING',
    preguntas: [
      { numero: 14, pregunta: '¿Qué formato de catering se requiere (almuerzo/cena servida de 3 tiempos, buffet temático, finger food / bocaditos, coffee break)?', respuesta: '', respondida: false },
      { numero: 15, pregunta: '¿Se debe considerar servicio de bar (barra libre con coctelería de autor, cerveza, vinos, gaseosas y mocktails)?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'VII',
    titulo: 'DECORACIÓN, MOBILIARIO Y PHOTO OPPORTUNITY',
    preguntas: [
      { numero: 16, pregunta: '¿Qué mobiliario se debe considerar (juegos de salas lounge, mesas altas de bar, mesas redondas vestidas, toldo arquitectónico)?', respuesta: '', respondida: false },
      { numero: 17, pregunta: '¿Qué espacios interactivos desean incluir (photocall temático de bienvenida, cabina de fotos 360°, backing de prensa)?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'VIII',
    titulo: 'REGISTRO, SOUVENIRS Y RESTRICCIONES',
    preguntas: [
      { numero: 18, pregunta: '¿Desean Registro Audiovisual Profesional (cobertura fotográfica, video reel resumen, circuito cerrado de TV o streaming)?', respuesta: '', respondida: false },
      { numero: 19, pregunta: '¿Qué recuerdos, merchandising o regalos corporativos se estarán entregando a los asistentes?', respuesta: '', respondida: false },
      { numero: 20, pregunta: '¿Restricciones del local, normativas de seguridad (ambulancia en sitio, seguro SCTR, extintores, brigadistas)?', respuesta: '', respondida: false },
      { numero: 21, pregunta: '¿Cuál es la fecha límite para presentar la propuesta y cotización de SIG Purple?', respuesta: '', respondida: false }
    ]
  }
];

export const BRIEF_TEMPLATE_PRODUCCION: BriefSeccionItem[] = [
  {
    numeroRomano: 'I',
    titulo: 'OBJETIVO DEL ELEMENTO Y UBICACIÓN',
    preguntas: [
      { numero: 1, pregunta: '¿Qué elemento físico específico se requiere producir (stand de feria, módulo comercial, isla de venta, backing, tótem, letras 3D, exhibidor POP, vitrina retail)?', respuesta: '', respondida: false },
      { numero: 2, pregunta: '¿Dónde se instalará el elemento (centro comercial, tienda retail, feria/convención, sede corporativa, vía pública)?', respuesta: '', respondida: false },
      { numero: 3, pregunta: '¿La estructura será temporal (días/semanas) o permanente (larga duración / retail)?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'II',
    titulo: 'MEDIDAS, DIMENSIONES Y PLANOS TÉCNICOS',
    preguntas: [
      { numero: 4, pregunta: '¿Cuáles son las medidas o dimensiones requeridas (alto, ancho, profundidad, área total en m2 o metros lineales)?', respuesta: '', respondida: false },
      { numero: 5, pregunta: '¿Cuentan con planos técnicos 2D, renders 3D o despiece, o SIG Purple debe realizar el diseño estructural y modelado 3D?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'III',
    titulo: 'MATERIALES, ACABADOS Y CARPINTERÍA',
    preguntas: [
      { numero: 6, pregunta: '¿Qué materiales se deben emplear (MDF ruteado, melamine, estructuras de fierro/aluminio, acrílico, lona tensada, policarbonato)?', respuesta: '', respondida: false },
      { numero: 7, pregunta: '¿Qué tipo de acabados se requieren (pintura automotriz gloss/mate, enchape imitación madera, vinil laminado, tapizado)?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'IV',
    titulo: 'ILUMINACIÓN, ELECTRICIDAD Y GRÁFICAS',
    preguntas: [
      { numero: 8, pregunta: '¿El elemento requiere iluminación integrada (tiras LED neón flex, dicroicos cálidos/fríos, cajas de luz backlight)?', respuesta: '', respondida: false },
      { numero: 9, pregunta: '¿El punto de instalación cuenta con punto de energía eléctrica cercano o se requiere cableado especial y tablero térmico?', respuesta: '', respondida: false },
      { numero: 10, pregunta: '¿Qué aplicaciones gráficas incluye (logotipos en alto relieve corte CNC, vinil adhesivo mate/brillante impreso en alta resolución, floor graphics)?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'V',
    titulo: 'MONTAJE, LOGÍSTICA Y SEGURIDAD',
    preguntas: [
      { numero: 11, pregunta: '¿En qué horarios se debe realizar el montaje y desmontaje (madrugada/montaje nocturno, horario comercial cerrado)?', respuesta: '', respondida: false },
      { numero: 12, pregunta: '¿Qué exigencias de seguridad y acceso solicita el recinto (póliza de seguro SCTR pensión y salud, EPPs completos, permisos de trabajo en altura)?', respuesta: '', respondida: false },
      { numero: 13, pregunta: '¿Dónde se entregará o instalará el elemento (Lima metropolitana, transporte a provincias, flete y maniobras de carga/descarga)?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'VI',
    titulo: 'DESMONTAJE, PRESUPUESTO Y ENTREGA',
    preguntas: [
      { numero: 14, pregunta: '¿Al finalizar la actividad, el elemento se desmonta y traslada a almacén, se entrega al cliente o se realiza disposición final?', respuesta: '', respondida: false },
      { numero: 15, pregunta: '¿Cuál es el Presupuesto Total referencial asignado para la fabricación, transporte e instalación?', respuesta: '', respondida: false },
      { numero: 16, pregunta: '¿Cuál es la fecha límite improrrogable para la entrega e instalación terminada (fecha de inauguración)?', respuesta: '', respondida: false }
    ]
  }
];

export const BRIEF_TEMPLATE_MERCHANDISING: BriefSeccionItem[] = [
  {
    numeroRomano: 'I',
    titulo: 'OBJETIVO, OCASIÓN Y DESTINATARIOS',
    preguntas: [
      { numero: 1, pregunta: '¿Para qué ocasión o campaña es el merchandising (evento corporativo, bienvenida/onboarding, regalo ejecutivo, feria comercial, campaña masiva)?', respuesta: '', respondida: false },
      { numero: 2, pregunta: '¿A qué público específico va dirigido (clientes VIP, colaboradores internos, ejecutivos, consumidores masivos, distribuidores)?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'II',
    titulo: 'TIPO DE ARTÍCULOS Y CANTIDADES',
    preguntas: [
      { numero: 3, pregunta: '¿Qué artículo(s) promocional(es) específico(s) se requiere cotizar (tomatodos térmicos, libretas, polos/textil, mochilas, tazas, USB, lapiceros, kits)?', respuesta: '', respondida: false },
      { numero: 4, pregunta: '¿Cuáles son las cantidades exactas o escalas requeridas por cada ítem (ej: 100, 300, 500, 1000 unidades)?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'III',
    titulo: 'MATERIALES, CALIDAD Y ESPECIFICACIONES TÉCNICAS',
    preguntas: [
      { numero: 5, pregunta: '¿Qué nivel de calidad y materiales se requieren (acero inoxidable doble pared, algodón pima 100%, bambú/ecológico, plástico libre de BPA, cuero PU)?', respuesta: '', respondida: false },
      { numero: 6, pregunta: '¿Se requiere algún color corporativo específico para el cuerpo del producto (código Pantone institucional o color de línea disponible)?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'IV',
    titulo: 'PERSONALIZACIÓN, BRANDING Y MUESTRA',
    preguntas: [
      { numero: 7, pregunta: '¿Qué técnica de personalización se prefiere (grabado láser, serigrafía a 1 o más colores, bordado computarizado, transfer digital, DTF, tampografía)?', respuesta: '', respondida: false },
      { numero: 8, pregunta: '¿La personalización va en una sola cara, ambas caras o grabado circular 360°?', respuesta: '', respondida: false },
      { numero: 9, pregunta: '¿Cuentan con el logotipo en formato vector editable (.AI, .EPS, .PDF vector)?', respuesta: '', respondida: false },
      { numero: 10, pregunta: '¿Se requiere la elaboración y aprobación de una muestra física previa antes de iniciar la producción total del lote?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'V',
    titulo: 'EMPAQUE Y PRESENTACIÓN (PACKAGING)',
    preguntas: [
      { numero: 11, pregunta: '¿Qué tipo de empaque o presentación se requiere (caja individual personalizada con logo, bolsa ecológica, envoltura de celofán, tarjeta con dedicatoria)?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'VI',
    titulo: 'LOGÍSTICA, PRESUPUESTO Y ENTREGA',
    preguntas: [
      { numero: 12, pregunta: '¿Dónde se realizará la entrega (almacén central en Lima, despacho fraccionado a múltiples oficinas o envíos a provincia/domicilio)?', respuesta: '', respondida: false },
      { numero: 13, pregunta: '¿Cuál es el Presupuesto Total referencial o costo unitario objetivo por artículo?', respuesta: '', respondida: false },
      { numero: 14, pregunta: '¿Cuál es la fecha límite improrrogable de entrega del lote completo?', respuesta: '', respondida: false }
    ]
  }
];

export const BRIEF_TEMPLATE_CAMPANA: BriefSeccionItem[] = [
  {
    numeroRomano: 'I',
    titulo: 'OBJETIVO ESTRATÉGICO Y KPIS',
    preguntas: [
      { numero: 1, pregunta: '¿Cuál es el objetivo estratégico de marketing de la campaña (lanzamiento de producto, reposicionamiento, generación de leads calificados, ventas directas)?', respuesta: '', respondida: false },
      { numero: 2, pregunta: '¿Cuáles son los KPIs principales de éxito esperados (alcance, contactos cara a cara, tasa de conversión, menciones en redes)?', respuesta: '', respondida: false },
      { numero: 3, pregunta: '¿Cuál es el Presupuesto Total estimado o rango asignado para toda la campaña?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'II',
    titulo: 'TARGET, BUYER PERSONA E INSIGHT',
    preguntas: [
      { numero: 4, pregunta: '¿Cuál es el perfil demográfico y psicográfico del público objetivo (segmento, hábitos de consumo, buyer persona)?', respuesta: '', respondida: false },
      { numero: 5, pregunta: '¿Existe algún insight del consumidor o tensión relevante que la campaña deba capitalizar?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'III',
    titulo: 'CONCEPTO CREATIVO, BIG IDEA Y TONO',
    preguntas: [
      { numero: 6, pregunta: '¿Desean que SIG Purple desarrolle el concepto rector, Big Idea, slogan y Key Visual principal de la campaña?', respuesta: '', respondida: false },
      { numero: 7, pregunta: '¿Cuál es el tono de comunicación de la marca (cercano, innovador, audaz, corporativo)?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'IV',
    titulo: 'CANALES Y MIX DE ACCIONES (360°)',
    preguntas: [
      { numero: 8, pregunta: '¿Qué canales y puntos de contacto contempla el mix (activaciones BTL, eventos experienciales, visibilidad en retail, amplificación digital, influencers)?', respuesta: '', respondida: false },
      { numero: 9, pregunta: '¿Qué piezas gráficas, audiovisuales y de contenido digital se deben producir?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'V',
    titulo: 'PRODUCCIÓN, DESPLIEGUE EN CAMPO Y MERCH',
    preguntas: [
      { numero: 10, pregunta: '¿Qué elementos de producción física, escenografía o merchandising requiere la campaña?', respuesta: '', respondida: false },
      { numero: 11, pregunta: '¿En qué ciudades, regiones o plazas a nivel nacional se ejecutará la campaña?', respuesta: '', respondida: false }
    ]
  },
  {
    numeroRomano: 'VI',
    titulo: 'FASES, CRONOGRAMA Y FECHAS CLAVE',
    preguntas: [
      { numero: 12, pregunta: '¿Cuáles son las fases de la campaña (fase teaser/expectativa, lanzamiento oficial, sostenimiento, cierre)?', respuesta: '', respondida: false },
      { numero: 13, pregunta: '¿Cuáles son las fechas de inicio, hitos clave y duración total de la campaña?', respuesta: '', respondida: false },
      { numero: 14, pregunta: '¿Cuál es la fecha límite para la presentación de la propuesta integral y cotización de SIG Purple?', respuesta: '', respondida: false }
    ]
  }
];

export const BRIEF_TEMPLATES_BY_ACTIVITY: Record<ActivityCategoryType, BriefSeccionItem[]> = {
  'Activación': BRIEF_TEMPLATE_ACTIVACION,
  'Evento Corporativo': BRIEF_TEMPLATE_EVENTO,
  'Producción de Elemento': BRIEF_TEMPLATE_PRODUCCION,
  'Merchandising': BRIEF_TEMPLATE_MERCHANDISING,
  'Campaña Integral': BRIEF_TEMPLATE_CAMPANA
};

export function getBriefTemplateForActivity(tipoProyecto?: string): BriefSeccionItem[] {
  const norm = normalizeActivityType(tipoProyecto);
  return BRIEF_TEMPLATES_BY_ACTIVITY[norm] || BRIEF_TEMPLATE_ACTIVACION;
}

export const OFFICIAL_PURPLE_BRIEF_TEMPLATE: BriefSeccionItem[] = BRIEF_TEMPLATE_ACTIVACION;

// =========================================================================
// MOTOR GEMINI VERIFICADO & HELPERS TRANSVERSALES
// =========================================================================
const MODELS_FAST_JSON = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.8-flash'
];

const MODELS_DEEP_QUOTE = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.7-flash',
  'gemini-3.8-flash'
];

const AUDIO_STT_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.5-flash-lite'
];

const GEMINI_ATTEMPT_TIMEOUT_MS = 35000;

async function generateContentWithTimeout(
  ai: GoogleGenAI,
  params: { model: string; contents: any; config?: Record<string, any> },
  timeoutMs = GEMINI_ATTEMPT_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await Promise.race([
      ai.models.generateContent({
        model: params.model,
        contents: params.contents,
        config: {
          ...(params.config || {}),
          abortSignal: controller.signal
        }
      }),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`Timeout (${Math.round(timeoutMs / 1000)}s) esperando respuesta de ${params.model}`));
        }, { once: true });
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const getGenAI = (): GoogleGenAI | null => {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'TU_CLAVE_AQUI') {
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export function getLimaDateContext(): { isoDate: string; year: number; formattedEs: string } {
  const now = new Date();
  const isoParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  const formattedEs = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(now);
  const year = parseInt(isoParts.split('-')[0], 10) || now.getFullYear();
  return { isoDate: isoParts, year, formattedEs };
}

export function extractAndParseJson<T>(rawText: string): T {
  let clean = (rawText || '').trim();
  clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(clean) as T;
  } catch {
    // Intento defensivo contra comas colgantes
    const noTrailingCommas = clean.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(noTrailingCommas) as T;
  }
}

export async function callGeminiJsonWithModels<T>(
  contents: any,
  models: string[] = MODELS_FAST_JSON,
  temperature = 0.15
): Promise<T> {
  const ai = getGenAI();
  if (!ai) {
    throw new Error('GEMINI_API_KEY no configurada.');
  }

  let lastError: any = null;
  for (const model of models) {
    try {
      const response = await generateContentWithTimeout(ai, {
        model,
        contents,
        config: {
          responseMimeType: 'application/json',
          temperature
        }
      });
      const text = response.text || '{}';
      return extractAndParseJson<T>(text);
    } catch (err: any) {
      console.warn(`[briefEngine] Error JSON con ${model}:`, err?.message || err);
      lastError = err;
    }
  }

  // Último intento sin responseMimeType estricto usando el modelo primario
  const fallbackModel = models[0] || 'gemini-3.6-flash';
  try {
    const response = await generateContentWithTimeout(ai, {
      model: fallbackModel,
      contents,
      config: { temperature }
    });
    return extractAndParseJson<T>(response.text || '{}');
  } catch (fallbackErr: any) {
    throw lastError || fallbackErr;
  }
}

export async function callGeminiTextWithModels(
  contents: any,
  models: string[] = MODELS_FAST_JSON,
  temperature = 0.1
): Promise<string> {
  const ai = getGenAI();
  if (!ai) {
    throw new Error('GEMINI_API_KEY no configurada.');
  }
  let lastError: any = null;
  for (const model of models) {
    try {
      const response = await generateContentWithTimeout(ai, {
        model,
        contents,
        config: { temperature }
      });
      return (response.text || '').trim();
    } catch (err: any) {
      console.warn(`[briefEngine] Error texto con ${model}:`, err?.message || err);
      lastError = err;
    }
  }
  throw lastError || new Error('No se pudo obtener respuesta de texto de Gemini.');
}

// =========================================================================
// SANITIZACIÓN DE TRANSCRIPCIÓN STT Y DEDUPLICACIÓN
// =========================================================================
const STT_HALLUCINATION_PATTERNS: RegExp[] = [
  /<noise>/gi,
  /\[(?:m[uú]sica|music|aplausos|applause|risa|laughter|inaudible|silencio|silence|noise|ruido)\]/gi,
  /\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/g,
  /la vaca lola[,\s\wáéíóúñ]*/gi,
  /suscr[ií]bete.*?(canal|campanita|$)/gi,
  /gracias por ver( el video)?/gi,
  /subt[ií]tulos realizados por.*$/gim
];

export function sanitizeTranscriptText(rawText: string, previousContext: string = ''): string {
  let clean = (rawText || '').trim();
  if (!clean) return '';

  for (const rx of STT_HALLUCINATION_PATTERNS) {
    clean = clean.replace(rx, ' ');
  }

  // Colapsar cantos/alucinaciones repetitivas de la misma sílaba/palabra 4+ veces ("Mari, Mari, Mari, Mari...")
  clean = clean.replace(/\b([\wáéíóúñÁÉÍÓÚÑ]{2,20})(?:[\s,.;]+\1){3,}/gi, '$1');
  clean = clean.replace(/\s+/g, ' ').trim();

  // Descartar si tras limpiar no queda contenido verbal significativo
  const alphaOnly = clean.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ0-9]/g, '');
  if (alphaOnly.length < 3) return '';

  // Deduplicar solapamiento de palabras al límite del bloque previo (últimas 2-6 palabras)
  if (previousContext) {
    const prevWords = previousContext.trim().split(/\s+/).slice(-8);
    const currWords = clean.split(/\s+/);
    for (let overlap = Math.min(6, prevWords.length, currWords.length); overlap >= 2; overlap--) {
      const tail = prevWords.slice(-overlap).join(' ').toLowerCase();
      const head = currWords.slice(0, overlap).join(' ').toLowerCase();
      if (tail === head) {
        clean = currWords.slice(overlap).join(' ').trim();
        break;
      }
    }
  }

  return clean;
}

export async function transcribeAudioChunkEnhanced(
  base64Audio: string,
  mimeType: string = 'audio/webm',
  options?: {
    previousContext?: string;
    clienteNombre?: string;
    titulo?: string;
  }
): Promise<string> {
  if (!base64Audio || base64Audio.length < 400) return '';
  const ai = getGenAI();
  if (!ai) return '';

  const prevTail = (options?.previousContext || '').slice(-280).trim();
  const domainHint = [
    options?.clienteNombre ? `Cliente: ${options.clienteNombre}.` : '',
    options?.titulo ? `Tema reunión: ${options.titulo}.` : ''
  ].filter(Boolean).join(' ');

  const prompt = `Eres un transcriptor profesional de una agencia BTL y producción en Lima, Perú (SIG Purple).
Transcribe ÚNICAMENTE las palabras habladas en español peruano en este fragmento de audio.
${domainHint}
${prevTail ? `Contexto inmediato previo (para mantener continuidad de nombres y palabras, NO lo repitas):\n"${prevTail}"\n` : ''}
GLOSARIO FRECUENTE EN LA AGENCIA (ortografía correcta):
photocall, backing, counter, tótem, roll screen, trovicel, MDF, vinil laminado, banner mate, ruleta, sampling, anfitriona A1, animador, promotor, parlante con parante, pedestales dorados, globos satinados, cinta de corte personalizada, SCTR, EPPs, key visual, merchandising, tomatodo, Topitop.

REGLAS ESTRICTAS:
1. Si solo hay silencio, ruido ambiental, respiración, música de fondo o audio ininteligible, responde EXACTAMENTE con cadena vacía (nada).
2. PROHIBIDO escribir "<noise>", "[Música]", "[inaudible]", timestamps SRT ("00:00:00 -->"), letras de canciones infantiles o frases de cierre de YouTube.
3. Conserva cifras exactas (cantidades, medidas en metros/cm, horas, fechas, montos en soles/dólares).
4. Responde SOLO con el texto transcrito, sin comillas ni prefijos.`;

  for (const model of AUDIO_STT_MODELS) {
    try {
      const response = await generateContentWithTimeout(
        ai,
        {
          model,
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: base64Audio } }
              ]
            }
          ],
          config: { temperature: 0.0 }
        },
        25000
      );
      const raw = (response.text || '').trim();
      const sanitized = sanitizeTranscriptText(raw, prevTail);
      if (sanitized || raw === '') {
        return sanitized;
      }
    } catch (err: any) {
      console.warn(`[briefEngine] Audio STT error con ${model}:`, err?.message || err);
    }
  }
  return '';
}

// =========================================================================
// INGESTA MULTIMODAL DE FUENTES (PDF, IMAGEN, AUDIO, DOCX, PPTX, TEXTO)
// =========================================================================
export interface ExtractedSourceResult {
  extractedText: string;
  sourceLabel: string;
  sourceType: FuenteBriefItem['tipo'];
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function extractTextFromDocxBuffer(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const candidateFiles = ['word/document.xml', 'word/header1.xml', 'word/header2.xml'];
  const chunks: string[] = [];

  for (const fileName of candidateFiles) {
    const file = zip.file(fileName);
    if (!file) continue;
    const xml = await file.async('string');
    const paragraphs = xml
      .split(/<\/w:p>/)
      .map(p => {
        const runs = Array.from(p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)).map(m => decodeXmlEntities(m[1]));
        return runs.join('').trim();
      })
      .filter(Boolean);
    if (paragraphs.length > 0) {
      chunks.push(paragraphs.join('\n'));
    }
  }

  return chunks.join('\n\n').trim();
}

async function extractTextFromPptxBuffer(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)\.xml$/i)?.[1] || '0', 10);
      const nb = parseInt(b.match(/(\d+)\.xml$/i)?.[1] || '0', 10);
      return na - nb;
    });

  const sections: string[] = [];
  for (const sf of slideFiles) {
    const xml = await zip.file(sf)!.async('string');
    const texts = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g))
      .map(m => decodeXmlEntities(m[1]).trim())
      .filter(Boolean);
    if (texts.length > 0) {
      sections.push(`[Lámina ${sections.length + 1}]\n${texts.join(' | ')}`);
    }
  }
  return sections.join('\n\n').trim();
}

export async function extractSourceContent(params: {
  text?: string;
  file?: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  };
  sourceLabel?: string;
}): Promise<ExtractedSourceResult> {
  const { text, file, sourceLabel } = params;

  if (text && !file) {
    return {
      extractedText: text.trim(),
      sourceLabel: sourceLabel || 'Correo / WhatsApp / Notas',
      sourceType: 'TEXTO_CORREO'
    };
  }

  if (!file) {
    throw new Error('No se recibió texto ni archivo para importar.');
  }

  const lowerName = (file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  const cleanLabel = sourceLabel || file.originalname || 'Archivo adjunto';

  // 1. Word (.docx)
  if (lowerName.endsWith('.docx') || mime.includes('wordprocessingml')) {
    const extracted = await extractTextFromDocxBuffer(file.buffer);
    if (!extracted) throw new Error('No se pudo extraer texto legible del documento Word.');
    return { extractedText: extracted, sourceLabel: cleanLabel, sourceType: 'ARCHIVO' };
  }

  // 2. PowerPoint (.pptx)
  if (lowerName.endsWith('.pptx') || mime.includes('presentationml')) {
    const extracted = await extractTextFromPptxBuffer(file.buffer);
    if (!extracted) throw new Error('No se pudo extraer texto de la presentación PPTX.');
    return { extractedText: extracted, sourceLabel: cleanLabel, sourceType: 'ARCHIVO' };
  }

  // 3. Texto plano / CSV / EML / MD / JSON
  if (
    mime.startsWith('text/') ||
    /\.(txt|csv|md|eml|log|json)$/i.test(lowerName)
  ) {
    const extracted = file.buffer.toString('utf8').trim();
    if (!extracted) throw new Error('El archivo de texto está vacío.');
    return { extractedText: extracted, sourceLabel: cleanLabel, sourceType: 'TEXTO_CORREO' };
  }

  // 4. PDF o Imagen -> OCR + Visión Multimodal con Gemini
  if (mime === 'application/pdf' || lowerName.endsWith('.pdf') || mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(lowerName)) {
    const targetMime = lowerName.endsWith('.pdf') ? 'application/pdf' : (mime || 'image/jpeg');
    const b64 = file.buffer.toString('base64');
    const ocrPrompt = `Analiza íntegramente este documento o captura (${file.originalname}).
Extrae TODA la información textual y visual útil para el brief de la agencia BTL SIG Purple:
- Si hay texto, tablas, mensajes de chat/WhatsApp, correos o listas de ítems: transcríbelos literalmente conservando cantidades exactas, medidas, materiales, fechas, horas, direcciones/tiendas, montos y nombres de contacto.
- Si es una imagen o render de referencia (stand, photocall, polo, merchandising, plano): describe detalladamente los elementos visibles, materiales aparentes, colores, dimensiones acotadas y acabados.
Devuelve el contenido estructurado en español claro, sin omitir cifras ni detalles.`;

    const extracted = await callGeminiTextWithModels([
      {
        role: 'user',
        parts: [
          { text: ocrPrompt },
          { inlineData: { mimeType: targetMime, data: b64 } }
        ]
      }
    ]);
    if (!extracted) throw new Error('No se pudo leer contenido relevante del PDF/imagen.');
    return { extractedText: extracted, sourceLabel: cleanLabel, sourceType: 'ARCHIVO' };
  }

  // 5. Archivo de Audio (.mp3, .wav, .m4a, .ogg, .webm) -> Transcripción íntegra
  if (mime.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac|webm|flac)$/i.test(lowerName)) {
    const targetMime = mime.startsWith('audio/') ? mime : 'audio/mpeg';
    const b64 = file.buffer.toString('base64');
    const audioPrompt = `Transcribe íntegramente y con máxima fidelidad en español peruano esta grabación o nota de voz (${file.originalname}) para un brief de agencia BTL.
Conserva todas las cifras exactas (cantidades, horarios, medidas, fechas, locales, presupuestos), separa intervenciones si notas más de un hablante y corrige términos técnicos de agencia (photocall, backing, counter, anfitriona A1, MDF, vinil, SCTR).
Si algún segmento es ruido sin habla, omítelo sin inventar palabras.`;

    const extracted = await callGeminiTextWithModels([
      {
        role: 'user',
        parts: [
          { text: audioPrompt },
          { inlineData: { mimeType: targetMime, data: b64 } }
        ]
      }
    ], AUDIO_STT_MODELS);
    const cleaned = sanitizeTranscriptText(extracted);
    if (!cleaned) throw new Error('No se detectó diálogo audible en el archivo de audio.');
    return { extractedText: cleaned, sourceLabel: cleanLabel, sourceType: 'VOZ' };
  }

  throw new Error(`Formato de archivo no soportado (${file.originalname}). Usa PDF, Imagen, Audio (MP3/WAV/M4A), DOCX, PPTX o TXT.`);
}

// =========================================================================
// CONSTRUCCIÓN DE CONTEXTO COMPLETO SIN AMNESIA DE 8K
// =========================================================================
export function buildEffectiveTranscriptContext(
  fullTranscript: string,
  briefActual?: Partial<SmartBriefData>
): string {
  const clean = (fullTranscript || '').trim();
  if (!clean) return '';

  // Ventana generosa de 50k chars (~1 hora de llamada) sin mutilar el inicio ni el cierre
  if (clean.length <= 50000) {
    return clean;
  }

  const head = clean.slice(0, 18000);
  const tail = clean.slice(-32000);
  const priorFacts: string[] = [];
  if (briefActual?.objetivoPrincipal) priorFacts.push(`Objetivo previo: ${briefActual.objetivoPrincipal}`);
  if (briefActual?.locaciones?.ciudad) priorFacts.push(`Ciudad previa: ${briefActual.locaciones.ciudad}`);
  if (briefActual?.requerimientosCuantificados?.length) {
    priorFacts.push(`Requerimientos previos: ${briefActual.requerimientosCuantificados.map(r => `${r.cantidad}x ${r.item}`).join(', ')}`);
  }

  return `${head}\n\n... [FRAGMENTO INTERMEDIO OMITIDO POR LONGITUD; HECHOS PREVIOS: ${priorFacts.join(' | ')}] ...\n\n${tail}`;
}

// =========================================================================
// CLASIFICACIÓN INTELIGENTE + EXTRACCIÓN PROFUNDA GROUNDED
// =========================================================================
async function classifyActivityTypeFromContext(
  transcript: string,
  contextoCliente?: { clienteNombre?: string; titulo?: string }
): Promise<ActivityCategoryType> {
  const prompt = `Clasifica este requerimiento/reunión de la agencia BTL "SIG Purple" en EXACTAMENTE UNA de estas 5 categorías oficiales:
1. "Activación": BTL en tiendas/malls/vía pública, inauguraciones de tienda, sampling, animador/anfitrionas, ruletas, activaciones en punto de venta.
2. "Evento Corporativo": Fiestas corporativas, aniversarios, lanzamientos empresariales, convenciones, cenas, premiaciones, eventos internos/VIP o coberturas audiovisuales de evento.
3. "Producción de Elemento": Fabricación/implementación física de stands, módulos retail, vitrinas, letreros 3D, backings, exhibidores POP, tótems o carpintería publicitaria donde el foco es la estructura/elemento físico.
4. "Merchandising": Fabricación/personalización de artículos promocionales, regalos corporativos, polos, tomatodos, libretas, mochilas, kits por volumen.
5. "Campaña Integral": Estrategia 360° multidisciplinaria que combina campaña creativa, varios canales (BTL + digital + medios) y múltiples entregables en distintas etapas.

DATOS DE REFERENCIA:
Título: ${contextoCliente?.titulo || 'Sin título'}
Cliente: ${contextoCliente?.clienteNombre || 'No definido'}

TEXTO / CONVERSACIÓN:
"""
${transcript.slice(0, 14000)}
"""

Responde ÚNICAMENTE este JSON:
{
  "tipoProyecto": "Activación | Evento Corporativo | Producción de Elemento | Merchandising | Campaña Integral",
  "razon": "Breve motivo en 1 línea"
}`;

  try {
    const res = await callGeminiJsonWithModels<{ tipoProyecto: string }>(prompt, MODELS_FAST_JSON, 0.05);
    return normalizeActivityType(res?.tipoProyecto);
  } catch {
    return 'Activación';
  }
}

export function computeHonestCompleteness(brief: SmartBriefData): number {
  const sections = brief.seccionesBrief || [];
  const allQuestions = sections.flatMap(s => s.preguntas || []);
  const answeredCount = allQuestions.filter(q => q.respondida && q.respuesta.trim().length > 1).length;
  const questionScore = allQuestions.length > 0 ? (answeredCount / allQuestions.length) * 55 : 0;

  let coreHits = 0;
  const totalCore = 6;
  if (brief.clienteNombre && !/pendiente|no espec/i.test(brief.clienteNombre)) coreHits++;
  if (brief.objetivoPrincipal && brief.objetivoPrincipal.trim().length > 6) coreHits++;
  if (brief.locaciones?.ciudad || (brief.locaciones?.lugares && brief.locaciones.lugares.length > 0)) coreHits++;
  if (brief.fechasTentativas?.inicio || (brief.fechasTentativas?.diasClave && brief.fechasTentativas.diasClave.length > 0)) coreHits++;
  if (brief.requerimientosCuantificados && brief.requerimientosCuantificados.length > 0) coreHits++;
  if (brief.presupuestoEstimado?.monto || brief.fechasTentativas?.duracionJornada || brief.fechaLimitePropuesta) coreHits++;

  const coreScore = (coreHits / totalCore) * 45;
  return Math.min(100, Math.round(questionScore + coreScore));
}

interface RawGeminiExtraction {
  datosGenerales?: {
    clienteNombre?: string;
    marcaOProducto?: string;
    contactoNombre?: string;
    contactoCargo?: string;
    contactoEmail?: string;
    contactoTelefono?: string;
    nombreTentativoProyecto?: string;
    tipoServicio?: string;
    subTipoActividad?: string;
    requiereIdeaCreativa?: boolean;
    objetivoPrincipal?: string;
    publicoObjetivo?: string;
    mensajeClaveOConcepto?: string;
    resumenEjecutivo?: string;
  };
  fechasYHorarios?: {
    inicio?: string;
    fin?: string;
    duracionJornada?: string;
    diasClave?: string[];
    fechaLimitePropuesta?: string;
  };
  locacionRealVsReferencia?: {
    ciudadDestino?: string;
    lugaresDestino?: string[];
    esExterior?: boolean;
    referenciasMencionadas?: string[];
  };
  presupuesto?: {
    monto?: number | string | null;
    moneda?: 'PEN' | 'USD';
    esFlexible?: boolean;
    observacion?: string;
  };
  requerimientosCuantificados?: Array<{
    categoria?: string;
    cantidad?: number | string;
    item?: string;
    especificaciones?: string;
    jornadaOHorario?: string;
    locacion?: string;
    estado?: 'CONFIRMADO' | 'POR_CONFIRMAR';
  }>;
  produccionResumen?: {
    escenografiaYMontaje?: string[];
    audiovisualYTecnica?: string[];
    staffRequerido?: string[];
    permisosYSeguridad?: string[];
  };
  respuestasBrief?: Array<{
    numero: number;
    respuesta: string;
    respondida?: boolean;
  }>;
  preguntasCriticas?: Array<{
    pregunta: string;
    motivo: string;
    categoria?: string;
    prioridad?: string;
  }>;
  vaciosCriticos?: Array<{
    punto: string;
    impacto: string;
    prioridad?: 'ALTA' | 'MEDIA';
  }>;
  mensajeSeguimientoCliente?: string;
  handoffAreas?: {
    cuentas?: string[];
    diseno?: string[];
    produccion?: string[];
    cotizacion?: string[];
  };
  kpisOMetricas?: string[];
  restricciones?: string[];
}

export async function runDeepBriefExtraction(
  transcripcionAcumulada: string,
  briefActual?: Partial<SmartBriefData>,
  preguntasPrevias: LiveQuestion[] = [],
  contextoCliente?: { clienteId?: string; clienteNombre?: string; titulo?: string }
): Promise<ProcessTranscriptResult> {
  const { isoDate, year, formattedEs } = getLimaDateContext();
  const cleanTranscript = (transcripcionAcumulada || '').trim();
  const effectiveTranscript = buildEffectiveTranscriptContext(cleanTranscript, briefActual);

  // 1. Determinar categoría real (si usuario la fijó manualmente se respeta; si no, la IA clasifica)
  let resolvedActivity: ActivityCategoryType = normalizeActivityType(briefActual?.tipoProyecto);
  if (!briefActual?.tipoProyectoManual && cleanTranscript.length >= 60) {
    resolvedActivity = await classifyActivityTypeFromContext(effectiveTranscript, {
      clienteNombre: contextoCliente?.clienteNombre || briefActual?.clienteNombre,
      titulo: contextoCliente?.titulo || briefActual?.nombreTentativoProyecto
    });
  }

  const targetTemplate = getBriefTemplateForActivity(resolvedActivity);

  // Preservar respuestas editadas manualmente por el usuario para no sobreescribir trabajo humano
  const manualAnswersMap = new Map<number, string>();
  if (briefActual?.seccionesBrief) {
    for (const sec of briefActual.seccionesBrief) {
      for (const q of sec.preguntas || []) {
        if (q.origenManual && q.respuesta?.trim()) {
          manualAnswersMap.set(q.numero, q.respuesta.trim());
        }
      }
    }
  }

  const templateQuestionsPrompt = targetTemplate
    .map(sec =>
      `${sec.numeroRomano}. ${sec.titulo}\n` +
      sec.preguntas.map(q => `  [${q.numero}] ${q.pregunta}`).join('\n')
    )
    .join('\n\n');

  const prompt = `Eres el Director de Cuentas Senior y Director de Producción de "SIG Purple" (Agencia BTL líder en Perú).
Tu trabajo es convertir el contenido completo de esta reunión / correo / documento en un BRIEF EJECUTIVO DE ALTA PRECISIÓN que le sirva INMEDIATAMENTE a Cuentas, Diseño 3D/2D, Producción y Cotización para trabajar sin releer todo.

FECHA ACTUAL DEL SISTEMA (Lima, Perú): ${formattedEs} (${isoDate}) — AÑO ACTUAL: ${year}.

CONTEXTO CONOCIDO:
- Título de sesión: ${contextoCliente?.titulo || 'No especificado'}
- Cliente pre-vinculado: ${contextoCliente?.clienteNombre || briefActual?.clienteNombre || 'Identificar del texto'}
- Tipo de actividad seleccionado para plantilla: ${resolvedActivity}

CONVERSACIÓN / FUENTES COMPLETAS A ANALIZAR:
"""
${effectiveTranscript || '(Sin transcripción aún)'}
"""

PLANTILLA DE PREGUNTAS EXACTAS PARA "${resolvedActivity.toUpperCase()}" (DEBE RESPONDERSE CADA NÚMERO DIRECTAMENTE):
${templateQuestionsPrompt}

REGLAS ANTI-ERRORES CRÍTICAS (OBLIGATORIAS):
1. FECHAS CORRECTAS (${year}): Cualquier fecha mencionada sin año ("quincena de noviembre", "este viernes", "1 de diciembre") pertenece a ${year} o ${year + 1} si el mes ya pasó. NUNCA inventes años pasados como 2024 o 2025.
2. SEPARAR LOCACIÓN REAL VS REFERENCIAS: Si hablan de otra ciudad o evento anterior solo como ejemplo ("como lo que hicimos en Lima, pero esto es en Tumbes"), entonces "ciudadDestino" = "Tumbes" y "Lima (evento previo de referencia)" va SOLO en "referenciasMencionadas". Nunca confundas el ejemplo con el destino real.
3. EXTRACCIÓN EXHAUSTIVA DEL INVENTARIO (requerimientosCuantificados): Extrae CADA elemento físico, equipo audiovisual, staff/talento, decoración, impresión o servicio solicitado en el texto como una fila independiente con su CANTIDAD exacta (ej. 1 parlante, 1 animador, 1 anfitriona A1, 1 photocall, 2 pedestales dorados, 1 columna de globos satinados, 1 letrero con cinta personalizada). Si un dato de medida/material no se dijo, pon "[Por confirmar]" en especificaciones, pero NO omitas ningún ítem mencionado.
4. CERO RELLENO / CERO DUPLICACIÓN ABSURDA:
   - En "respuestasBrief", responde directamente al sentido exacto de cada pregunta [1..N] usando hechos concretos, cantidades y citas del texto.
   - Si una pregunta NO fue respondida en el texto ni se deduce con certeza real, devuelve "respuesta": "" y "respondida": false. ¡Es preferible dejarla vacía y detectarla como vacío crítico que inventar texto genérico!
   - Nunca metas contenido audiovisual (ej. "video grupal") dentro de escenografía ni pongas nombres de equipos dentro de staff/perfil.
5. MENSAJE LISTO PARA CLIENTE: Redacta "mensajeSeguimientoCliente" como un mensaje breve, cordial y profesional listo para copiar y pegar por WhatsApp o correo al cliente, agradeciendo la reunión y enlistando puntualmente SOLO los datos concretos que faltan para cerrar la cotización/cronograma.

DEVUELVE ÚNICAMENTE ESTE JSON VÁLIDO:
{
  "datosGenerales": {
    "clienteNombre": "Nombre exacto de la empresa/marca cliente o vacío",
    "marcaOProducto": "Sub-marca, línea o producto específico si aplica",
    "contactoNombre": "Nombre de contacto del cliente o vacío",
    "contactoCargo": "Cargo si se mencionó o vacío",
    "contactoEmail": "",
    "contactoTelefono": "",
    "nombreTentativoProyecto": "Nombre claro y comercial del proyecto (ej: Inauguración Tienda Tumbes - Topitop)",
    "tipoServicio": "PURPLE STRATEGY & CREATIVITY | PURPLE IMPULSE & PROMOTION | PURPLE VISIBILITY | PURPLE LOYALTY",
    "subTipoActividad": "Ej: Inauguración de tienda retail, Producción audiovisual corporativa, Stand de feria",
    "requiereIdeaCreativa": true,
    "objetivoPrincipal": "Objetivo concreto extraído del texto",
    "publicoObjetivo": "Público / asistentes mencionados o vacío si no se dijo",
    "mensajeClaveOConcepto": "Concepto visual/mensaje o vacío si no se definió",
    "resumenEjecutivo": "Resumen ejecutivo de 3-4 líneas con qué se hace, dónde, cuándo, principales ítems y qué falta definir"
  },
  "fechasYHorarios": {
    "inicio": "YYYY-MM-DD o descripción exacta del periodo (con año ${year}) o vacío",
    "fin": "YYYY-MM-DD o vacío",
    "duracionJornada": "Ej: 4 horas de activación / 2 días / vacío",
    "diasClave": ["Ej: Quincena de noviembre ${year}"],
    "fechaLimitePropuesta": "YYYY-MM-DD o plazo mencionado o vacío"
  },
  "locacionRealVsReferencia": {
    "ciudadDestino": "Ciudad o distrito REAL donde se ejecuta",
    "lugaresDestino": ["Tienda, centro comercial o sede exacta donde se ejecuta"],
    "esExterior": false,
    "referenciasMencionadas": ["Ej: Activación previa de referencia en Lima"]
  },
  "presupuesto": {
    "monto": null,
    "moneda": "PEN",
    "esFlexible": true,
    "observacion": "Comentario literal sobre presupuesto o vacío"
  },
  "requerimientosCuantificados": [
    {
      "categoria": "PRODUCCION | AUDIOVISUAL | STAFF | MERCHANDISING | LOGISTICA | DISENO | CATERING",
      "cantidad": 1,
      "item": "Nombre concreto del elemento o rol",
      "especificaciones": "Detalles mencionados (color, material, perfil, acabado) o '[Medidas/material por confirmar]'",
      "jornadaOHorario": "Ej: 4 horas / 1 jornada / Todo el evento",
      "locacion": "Ej: Tienda Tumbes",
      "estado": "CONFIRMADO | POR_CONFIRMAR"
    }
  ],
  "produccionResumen": {
    "escenografiaYMontaje": ["Solo elementos físicos, decoración y estructuras mencionadas"],
    "audiovisualYTecnica": ["Solo sonido, parlantes, pantallas, luces, video o cámaras"],
    "staffRequerido": ["Solo personal operativo/talento humano con cantidad y perfil"],
    "permisosYSeguridad": ["Solo SCTR, permisos municipales/mall o requisitos de ingreso"]
  },
  "respuestasBrief": [
    { "numero": 1, "respuesta": "Respuesta concreta basada estrictamente en el texto o vacío si no se mencionó", "respondida": true }
  ],
  "vaciosCriticos": [
    { "punto": "Ej: Medidas exactas y material del photocall", "impacto": "Necesario para cotizar carpintería y envío a Tumbes", "prioridad": "ALTA" }
  ],
  "preguntasCriticas": [
    {
      "pregunta": "Pregunta directa y específica para resolver un vacío real de este proyecto",
      "motivo": "Por qué se necesita antes de cotizar o diseñar",
      "categoria": "PRODUCCION | PRESUPUESTO | FECHAS | PERMISOS | CREATIVIDAD | GENERAL",
      "prioridad": "ALTA | MEDIA | BAJA"
    }
  ],
  "mensajeSeguimientoCliente": "Hola [Nombre o equipo], gracias por la reunión sobre [proyecto]. Para cerrar la cotización y propuesta de [locación], te confirmo lo que faltaría precisar:\\n1) ...\\n2) ...\\nCon esto te enviamos el presupuesto y cronograma. ¡Quedo atento!",
  "handoffAreas": {
    "cuentas": ["Acción 1 para Ejecutivo de Cuentas"],
    "diseno": ["Acción 1 para Diseño 3D/2D"],
    "produccion": ["Acción 1 para Producción/Logística"],
    "cotizacion": ["Acción 1 clave para armar presupuestos/fletes"]
  },
  "kpisOMetricas": [],
  "restricciones": []
}`;

  try {
    const raw = await callGeminiJsonWithModels<RawGeminiExtraction>(prompt, MODELS_FAST_JSON, 0.12);

    const respuestasMap = new Map<number, { respuesta: string; respondida: boolean }>();
    for (const r of raw.respuestasBrief || []) {
      const txt = (r.respuesta || '').trim();
      const valid = Boolean(
        txt &&
        !/^(no especificado|por definir|pendiente|n\/a|-)$/i.test(txt)
      );
      respuestasMap.set(Number(r.numero), {
        respuesta: valid ? txt : '',
        respondida: valid && r.respondida !== false
      });
    }

    // Construir secciones del brief con preservación de ediciones manuales humanas
    const populatedSections: BriefSeccionItem[] = targetTemplate.map(sec => ({
      numeroRomano: sec.numeroRomano,
      titulo: sec.titulo,
      preguntas: sec.preguntas.map(q => {
        const manualVal = manualAnswersMap.get(q.numero);
        if (manualVal) {
          return { ...q, respuesta: manualVal, respondida: true, origenManual: true };
        }
        const aiAnswer = respuestasMap.get(q.numero);
        return {
          ...q,
          respuesta: aiAnswer?.respuesta || '',
          respondida: Boolean(aiAnswer?.respondida),
          origenManual: false
        };
      })
    }));

    const validCatSet = new Set(['PRODUCCION', 'AUDIOVISUAL', 'STAFF', 'MERCHANDISING', 'LOGISTICA', 'DISENO', 'CATERING']);
    const reqs: RequerimientoBriefItem[] = (raw.requerimientosCuantificados || [])
      .filter(r => r && r.item && r.item.trim().length > 1)
      .map((r, idx) => ({
        id: `req_${idx + 1}_${Date.now().toString(36)}`,
        categoria: (validCatSet.has((r.categoria || '').toUpperCase()) ? r.categoria!.toUpperCase() : 'PRODUCCION') as RequerimientoBriefItem['categoria'],
        cantidad: r.cantidad ?? 1,
        item: r.item!.trim(),
        especificaciones: (r.especificaciones || '').trim() || 'Por confirmar especificaciones',
        jornadaOHorario: (r.jornadaOHorario || '').trim() || undefined,
        locacion: (r.locacion || '').trim() || undefined,
        estado: r.estado === 'POR_CONFIRMAR' ? 'POR_CONFIRMAR' : 'CONFIRMADO'
      }));

    // Conservar ítems manualmente agregados por el usuario que no empiecen con req_ o fusionar si ya existen
    const existingManualReqs = (briefActual?.requerimientosCuantificados || []).filter(r => r.id.startsWith('manual_'));
    const mergedReqs = [...reqs, ...existingManualReqs];

    const dg = raw.datosGenerales || {};
    const loc = raw.locacionRealVsReferencia || {};
    const fh = raw.fechasYHorarios || {};
    const pres = raw.presupuesto;

    const mergedBrief: SmartBriefData = {
      clienteId: briefActual?.clienteId || contextoCliente?.clienteId,
      clienteNombre: (briefActual?.clienteId ? briefActual.clienteNombre : dg.clienteNombre) || briefActual?.clienteNombre || contextoCliente?.clienteNombre || '',
      marcaOProducto: dg.marcaOProducto || briefActual?.marcaOProducto || '',
      contactoNombre: dg.contactoNombre || briefActual?.contactoNombre || '',
      contactoCargo: dg.contactoCargo || briefActual?.contactoCargo || '',
      contactoEmail: dg.contactoEmail || briefActual?.contactoEmail || '',
      contactoTelefono: dg.contactoTelefono || briefActual?.contactoTelefono || '',
      nombreTentativoProyecto: dg.nombreTentativoProyecto || briefActual?.nombreTentativoProyecto || contextoCliente?.titulo || '',
      tipoServicio: dg.tipoServicio || briefActual?.tipoServicio || 'PURPLE STRATEGY & CREATIVITY',
      tipoProyecto: resolvedActivity,
      tipoProyectoManual: Boolean(briefActual?.tipoProyectoManual),
      subTipoActividad: dg.subTipoActividad || briefActual?.subTipoActividad || '',
      projectManager: briefActual?.projectManager,
      requiereIdeaCreativa: dg.requiereIdeaCreativa !== undefined ? Boolean(dg.requiereIdeaCreativa) : (briefActual?.requiereIdeaCreativa ?? true),
      objetivoPrincipal: dg.objetivoPrincipal || briefActual?.objetivoPrincipal || '',
      publicoObjetivo: dg.publicoObjetivo || briefActual?.publicoObjetivo || '',
      mensajeClaveOConcepto: dg.mensajeClaveOConcepto || briefActual?.mensajeClaveOConcepto || '',
      resumenEjecutivo: dg.resumenEjecutivo || briefActual?.resumenEjecutivo || '',
      fechasTentativas: {
        inicio: fh.inicio || briefActual?.fechasTentativas?.inicio || '',
        fin: fh.fin || briefActual?.fechasTentativas?.fin || '',
        duracionJornada: fh.duracionJornada || briefActual?.fechasTentativas?.duracionJornada || '',
        diasClave: (fh.diasClave && fh.diasClave.length > 0) ? fh.diasClave : (briefActual?.fechasTentativas?.diasClave || [])
      },
      locaciones: {
        ciudad: loc.ciudadDestino || briefActual?.locaciones?.ciudad || '',
        lugares: (loc.lugaresDestino && loc.lugaresDestino.length > 0) ? loc.lugaresDestino : (briefActual?.locaciones?.lugares || []),
        esExterior: loc.esExterior ?? briefActual?.locaciones?.esExterior ?? false
      },
      referenciasMencionadas: loc.referenciasMencionadas || briefActual?.referenciasMencionadas || [],
      presupuestoEstimado: {
        monto: pres?.monto ?? briefActual?.presupuestoEstimado?.monto ?? undefined,
        moneda: pres?.moneda === 'USD' ? 'USD' : (briefActual?.presupuestoEstimado?.moneda || 'PEN'),
        esFlexible: pres?.esFlexible ?? briefActual?.presupuestoEstimado?.esFlexible ?? true,
        observacion: pres?.observacion || briefActual?.presupuestoEstimado?.observacion || ''
      },
      produccion: {
        escenografiaYMontaje: raw.produccionResumen?.escenografiaYMontaje || [],
        audiovisualYTecnica: raw.produccionResumen?.audiovisualYTecnica || [],
        staffRequerido: raw.produccionResumen?.staffRequerido || [],
        permisosYSeguridad: raw.produccionResumen?.permisosYSeguridad || []
      },
      requerimientosCuantificados: mergedReqs,
      vaciosCriticos: (raw.vaciosCriticos || []).map(v => ({
        punto: v.punto,
        impacto: v.impacto,
        prioridad: v.prioridad === 'MEDIA' ? 'MEDIA' : 'ALTA'
      })),
      mensajeSeguimientoCliente: raw.mensajeSeguimientoCliente || briefActual?.mensajeSeguimientoCliente || '',
      handoffAreas: {
        cuentas: raw.handoffAreas?.cuentas || [],
        diseno: raw.handoffAreas?.diseno || [],
        produccion: raw.handoffAreas?.produccion || [],
        cotizacion: raw.handoffAreas?.cotizacion || []
      },
      fuentesIngresadas: briefActual?.fuentesIngresadas || [],
      kpisOMetricas: raw.kpisOMetricas || briefActual?.kpisOMetricas || [],
      restricciones: raw.restricciones || briefActual?.restricciones || [],
      fechaLimitePropuesta: fh.fechaLimitePropuesta || briefActual?.fechaLimitePropuesta || '',
      completitudPorcentaje: 0,
      seccionesBrief: populatedSections,
      propuestaCreativaDetallada: briefActual?.propuestaCreativaDetallada || null
    };

    mergedBrief.completitudPorcentaje = computeHonestCompleteness(mergedBrief);

    const dismissedTextSet = new Set(
      preguntasPrevias
        .filter(q => q.respondida)
        .map(q => q.pregunta.toLowerCase().trim())
    );

    const validQCats = new Set(['PRESUPUESTO', 'FECHAS', 'PRODUCCION', 'CREATIVIDAD', 'PERMISOS', 'GENERAL']);
    const suggestedQuestions: LiveQuestion[] = (raw.preguntasCriticas || [])
      .filter(q => q && q.pregunta && !dismissedTextSet.has(q.pregunta.toLowerCase().trim()))
      .slice(0, 8)
      .map((q, idx) => ({
        id: `q_${idx}_${Date.now().toString(36)}`,
        pregunta: q.pregunta,
        motivo: q.motivo || 'Necesario para presupuestar y producir sin riesgos',
        categoria: (validQCats.has((q.categoria || '').toUpperCase()) ? q.categoria!.toUpperCase() : 'GENERAL') as LiveQuestion['categoria'],
        prioridad: (q.prioridad === 'MEDIA' || q.prioridad === 'BAJA' ? q.prioridad : 'ALTA') as LiveQuestion['prioridad'],
        respondida: false
      }));

    return {
      brief: mergedBrief,
      preguntasSugeridas: suggestedQuestions,
      completitudPorcentaje: mergedBrief.completitudPorcentaje
    };
  } catch (err: any) {
    console.warn('[briefEngine] Fallback tras error en runDeepBriefExtraction:', err?.message || err);
    const fallbackSections = briefActual?.seccionesBrief?.length
      ? briefActual.seccionesBrief
      : getBriefTemplateForActivity(resolvedActivity);
    const fallbackBrief: SmartBriefData = {
      nombreTentativoProyecto: briefActual?.nombreTentativoProyecto || contextoCliente?.titulo || 'Nuevo Proyecto BTL',
      tipoServicio: briefActual?.tipoServicio || 'PURPLE STRATEGY & CREATIVITY',
      tipoProyecto: resolvedActivity,
      tipoProyectoManual: briefActual?.tipoProyectoManual,
      objetivoPrincipal: briefActual?.objetivoPrincipal || '',
      publicoObjetivo: briefActual?.publicoObjetivo || '',
      mensajeClaveOConcepto: briefActual?.mensajeClaveOConcepto || '',
      fechasTentativas: briefActual?.fechasTentativas || { diasClave: [] },
      locaciones: briefActual?.locaciones || { ciudad: '', lugares: [], esExterior: false },
      produccion: briefActual?.produccion || { escenografiaYMontaje: [], audiovisualYTecnica: [], staffRequerido: [], permisosYSeguridad: [] },
      requerimientosCuantificados: briefActual?.requerimientosCuantificados || [],
      kpisOMetricas: briefActual?.kpisOMetricas || [],
      restricciones: briefActual?.restricciones || [],
      fechaLimitePropuesta: briefActual?.fechaLimitePropuesta || '',
      completitudPorcentaje: 0,
      seccionesBrief: fallbackSections,
      ...briefActual
    };
    fallbackBrief.completitudPorcentaje = computeHonestCompleteness(fallbackBrief);
    return {
      brief: fallbackBrief,
      preguntasSugeridas: preguntasPrevias,
      completitudPorcentaje: fallbackBrief.completitudPorcentaje
    };
  }
}

// =========================================================================
// GENERACIÓN DE COTIZACIÓN Y ENTREGABLE DESDE INVENTARIO CUANTIFICADO
// =========================================================================
export function buildQuoteItemsFromRequirements(reqs: RequerimientoBriefItem[], ciudadDefault?: string): QuoteCategoryPayload[] {
  const categoryLabels: Record<RequerimientoBriefItem['categoria'], string> = {
    PRODUCCION: '1. PRODUCCIÓN, ESTRUCTURAS & DECORACIÓN',
    AUDIOVISUAL: '2. AUDIOVISUAL, SONIDO & PANTALLAS',
    STAFF: '3. PERSONAL OPERATIVO, ANIMACIÓN & TALENTO',
    MERCHANDISING: '4. MERCHANDISING & MATERIAL IMPRESO',
    CATERING: '5. CATERING & ALIMENTOS',
    LOGISTICA: '6. LOGÍSTICA, FLETE A PROVINCIA & PERMISOS',
    DISENO: '7. DISEÑO, ARTE & DIRECCIÓN CREATIVA'
  };

  const defaultCosts: Record<RequerimientoBriefItem['categoria'], number> = {
    PRODUCCION: 650,
    AUDIOVISUAL: 450,
    STAFF: 220,
    MERCHANDISING: 25,
    CATERING: 45,
    LOGISTICA: 450,
    DISENO: 850
  };

  const grouped = new Map<RequerimientoBriefItem['categoria'], QuoteItemPayload[]>();

  for (const r of reqs) {
    const numericQty = typeof r.cantidad === 'number'
      ? Math.max(1, r.cantidad)
      : Math.max(1, parseFloat(String(r.cantidad).replace(/[^0-9.]/g, '')) || 1);

    const specDetails = [
      ` - 01 ${r.item}${typeof r.cantidad === 'string' && isNaN(Number(r.cantidad)) ? ` (${r.cantidad})` : ''}.`,
      ` - Especificaciones: ${r.especificaciones}`,
      ...(r.jornadaOHorario ? [` - Horario / Duración: ${r.jornadaOHorario}`] : []),
      ...((r.locacion || ciudadDefault) ? [` - Punto / Locación: ${r.locacion || ciudadDefault}`] : [])
    ];

    const unitCostEstimate = defaultCosts[r.categoria] || 300;
    const itemPayload: QuoteItemPayload = {
      name: r.item.toUpperCase(),
      quantity: numericQty,
      dates: 1,
      details: specDetails,
      internalMultiplierPercent: 10,
      financialExpensePercent: 10,
      subItems: [
        {
          name: r.item,
          description: r.especificaciones,
          quantity: numericQty,
          dates: 1,
          unitCost: unitCostEstimate,
          providerName: 'Proveedor por asignar'
        },
        {
          name: 'Imprevistos',
          description: 'Contingencia operativa / producción (estimado)',
          quantity: 1,
          dates: 1,
          unitCost: Math.max(30, Math.round(unitCostEstimate * numericQty * 0.08)),
          providerName: 'Reserva Purple'
        }
      ]
    };

    const existing = grouped.get(r.categoria) || [];
    existing.push(itemPayload);
    grouped.set(r.categoria, existing);
  }

  const order: RequerimientoBriefItem['categoria'][] = [
    'PRODUCCION', 'AUDIOVISUAL', 'STAFF', 'MERCHANDISING', 'CATERING', 'LOGISTICA', 'DISENO'
  ];

  const categories: QuoteCategoryPayload[] = [];
  for (const catKey of order) {
    const items = grouped.get(catKey);
    if (items && items.length > 0) {
      categories.push({ name: categoryLabels[catKey], items });
    }
  }
  return categories;
}

export async function generateEnhancedMeetingDeliverables(
  brief: SmartBriefData,
  transcripcion: string,
  tipoEntregable: 'CREATIVO' | 'PRODUCCION' | 'INTEGRAL' = 'INTEGRAL',
  requiereIdeaOverride?: boolean
): Promise<MeetingDeliverableResult> {
  const requiereIdea = requiereIdeaOverride !== undefined
    ? requiereIdeaOverride
    : (brief.requiereIdeaCreativa !== false);

  const effectiveTranscript = buildEffectiveTranscriptContext(transcripcion, brief);
  const reqsSummary = (brief.requerimientosCuantificados || []).length > 0
    ? brief.requerimientosCuantificados!.map(r => `- [${r.categoria}] ${r.cantidad} x ${r.item} | Specs: ${r.especificaciones}${r.jornadaOHorario ? ` | Horario: ${r.jornadaOHorario}` : ''}${r.locacion ? ` | Lugar: ${r.locacion}` : ''}`).join('\n')
    : 'No se registraron ítems previos en tabla; extráelos directamente de la transcripción.';

  const answeredBriefSummary = (brief.seccionesBrief || [])
    .flatMap(sec => sec.preguntas.filter(p => p.respondida && p.respuesta))
    .map(p => `${p.numero}. ${p.pregunta} => ${p.respuesta}`)
    .join('\n');

  const prompt = `Eres el Director de Operaciones, Producción y Cotizaciones de la agencia BTL "SIG Purple" en Perú.
Debes transformar este Brief en el desglose oficial de cotización (formato exacto SIG Purple Perú, moneda ${brief.presupuestoEstimado?.moneda || 'PEN'}) y el plan operativo${requiereIdea ? ' + Propuesta Creativa Estratégica' : ''}.

BRIEF ESTRUCTURADO:
- Cliente: ${brief.clienteNombre || 'Cliente'} ${brief.marcaOProducto ? `(${brief.marcaOProducto})` : ''}
- Proyecto: ${brief.nombreTentativoProyecto || 'Proyecto BTL'}
- Actividad: ${brief.tipoProyecto || 'Activación'} | Servicio: ${brief.tipoServicio || 'PURPLE STRATEGY & CREATIVITY'}
- Locación REAL de ejecución: ${brief.locaciones?.ciudad || 'Por definir'} — ${(brief.locaciones?.lugares || []).join(', ') || 'Por definir'}
- Fechas / Duración: ${brief.fechasTentativas?.inicio || 'Por definir'} ${brief.fechasTentativas?.duracionJornada ? `(${brief.fechasTentativas.duracionJornada})` : ''}
- Presupuesto Ref: ${brief.presupuestoEstimado?.monto ? `${brief.presupuestoEstimado.moneda} ${brief.presupuestoEstimado.monto}` : 'Por definir'}

INVENTARIO CUANTIFICADO OBLIGATORIO (CADA ÍTEM DEBE APARECER EN categoriasCotizacion CON SU CANTIDAD EXACTA):
${reqsSummary}

PREGUNTAS DEL BRIEF YA RESPONDIDAS:
${answeredBriefSummary || '(Ver transcripción)'}

TRANSCRIPCIÓN COMPLETA DE RESPALDO:
"""
${effectiveTranscript.slice(0, 28000)}
"""

REGLAS OBLIGATORIAS DE COTIZACIÓN PURPLE BTL:
1. NOMBRES EN MAYÚSCULAS compactas (ej: "PHOTOCALL PUBLICITARIO", "ANIMADOR", "ANFITRIONA A1", "SISTEMA DE SONIDO Y PARLANTE", "PEDESTALES DORADOS", "COLUMNA DE GLOBOS SATINADOS", "LETRERO Y CINTA PERSONALIZADA", "TRANSPORTE Y LOGÍSTICA A TUMBES").
2. CADA ítem de "requerimientosCuantificados" debe mapearse a su cantidad y especificaciones reales (NO pongas cantidad 2 si pidieron 1, ni inventes ítems irrelevantes). Si la ejecución es fuera de Lima (ej. Tumbes, provincias), INCLUYE un ítem explícito de Flete / Envío / Viáticos o Proveedor Local según corresponda.
3. Formato de "details" estándar Purple BTL:
   - " - [Detalle principal o medidas]"
   - "   * [Sub-especificación material o alcance]"
4. REGLA DE ORO: Todo item.subItems DEBE incluir un último sub-ítem llamado "Imprevistos" (~5%–10% del costo directo).
5. Costos unitarios ("unitCost") realistas de mercado proveedor en Perú (${brief.presupuestoEstimado?.moneda || 'PEN'}).

DEVUELVE ÚNICAMENTE ESTE JSON:
{
  "tipo": "${requiereIdea ? 'INTEGRAL' : tipoEntregable}",
  "titulo": "Propuesta y Cotización: ${brief.nombreTentativoProyecto || 'Proyecto SIG Purple'}",
  "resumenEjecutivo": "Resumen gerencial adaptado al cliente, locación real y objetivos",
  "requiereIdeaCreativa": ${requiereIdea},
  "propuestaCreativa": ${requiereIdea ? `{
    "bigIdea": "Big Idea potente y aterrizada al rubro del cliente",
    "racionalEstrategico": "Racional estratégico conectado al público y plaza",
    "mecanicas": [
      { "titulo": "Paso 1", "descripcion": "...", "experienciaUsuario": "..." }
    ],
    "sugerenciasVisualesYStorytelling": ["..."],
    "canalesOAcciones": ["..."]
  }` : 'null'},
  "desgloseProduccion": {
    "escenografiaYBranding": [{ "item": "...", "especificacion": "...", "cantidadAprox": "..." }],
    "equipamientoTecnico": [{ "categoria": "...", "descripcion": "..." }],
    "requerimientoStaff": [{ "rol": "...", "cantidad": 1, "funciones": "..." }],
    "cronogramaProduccion": [
      { "fase": "Preproducción", "duracionEstimada": "...", "entregable": "..." }
    ],
    "matrizRiesgosYPermisos": [{ "riesgoOPermiso": "...", "planMitigacion": "..." }],
    "proveedoresSugeridosCategorias": ["Carpintería y Estructuras", "Audiovisual", "Staff BTL", "Transporte"]
  },
  "categoriasCotizacion": [
    {
      "name": "1. PRODUCCIÓN, ESTRUCTURAS & DECORACIÓN",
      "items": [
        {
          "name": "NOMBRE ÍTEM",
          "quantity": 1,
          "dates": 1,
          "details": [" - ...", "   * ..."],
          "internalMultiplierPercent": 10,
          "financialExpensePercent": 10,
          "subItems": [
            { "name": "Costo base proveedor", "description": "...", "quantity": 1, "dates": 1, "unitCost": 350, "providerName": "Por definir" },
            { "name": "Imprevistos", "description": "Contingencia de producción", "quantity": 1, "dates": 1, "unitCost": 35, "providerName": "Reserva Purple" }
          ]
        }
      ]
    }
  ],
  "proximosPasosInmediatos": ["Validar medidas/horarios pendientes con el cliente", "Cerrar cotización oficial en SIG Purple"]
}`;

  try {
    const result = await callGeminiJsonWithModels<MeetingDeliverableResult>(prompt, MODELS_DEEP_QUOTE, 0.2);
    if (!requiereIdea) result.propuestaCreativa = null;
    result.requiereIdeaCreativa = requiereIdea;
    if (!result.categoriasCotizacion || result.categoriasCotizacion.length === 0) {
      if ((brief.requerimientosCuantificados || []).length > 0) {
        result.categoriasCotizacion = buildQuoteItemsFromRequirements(
          brief.requerimientosCuantificados!,
          brief.locaciones?.ciudad
        );
      }
    }
    return result;
  } catch (err: any) {
    console.warn('[briefEngine] Fallback de entregables tras error Gemini:', err?.message || err);
    const cats = (brief.requerimientosCuantificados || []).length > 0
      ? buildQuoteItemsFromRequirements(brief.requerimientosCuantificados!, brief.locaciones?.ciudad)
      : [];
    return {
      tipo: requiereIdea ? 'INTEGRAL' : 'PRODUCCION',
      titulo: `Propuesta: ${brief.nombreTentativoProyecto || 'Proyecto SIG Purple'}`,
      resumenEjecutivo: brief.resumenEjecutivo || `Propuesta operativa para ${brief.clienteNombre || 'Cliente'}.`,
      requiereIdeaCreativa: requiereIdea,
      propuestaCreativa: null,
      categoriasCotizacion: cats,
      proximosPasosInmediatos: ['Validar requerimientos cuantificados y completar precios proveedor en el cotizador']
    };
  }
}

/**
 * Remapea secciones del brief cuando se cambia el tipo de actividad manualmente
 * sin perder respuestas existentes ni requerimientos cuantificados.
 */
export function populateOfficialBriefSections(
  brief: Partial<SmartBriefData>,
  existingSections?: BriefSeccionItem[]
): BriefSeccionItem[] {
  const targetTemplate = getBriefTemplateForActivity(brief.tipoProyecto);
  const existingMapByText = new Map<string, { respuesta: string; origenManual?: boolean }>();

  if (Array.isArray(existingSections)) {
    for (const sec of existingSections) {
      for (const q of sec.preguntas || []) {
        if (q.respuesta && q.respuesta.trim()) {
          const norm = q.pregunta.toLowerCase().replace(/[^a-z0-9áéíóúñ]/gi, ' ').replace(/\s+/g, ' ').trim();
          existingMapByText.set(norm, { respuesta: q.respuesta.trim(), origenManual: q.origenManual });
        }
      }
    }
  }

  const reqs = brief.requerimientosCuantificados || [];
  const reqSummaryByCat = (cats: RequerimientoBriefItem['categoria'][]) =>
    reqs
      .filter(r => cats.includes(r.categoria))
      .map(r => `${r.cantidad}x ${r.item}${r.especificaciones && !/por confirmar/i.test(r.especificaciones) ? ` (${r.especificaciones})` : ''}`)
      .join('; ');

  const locStr = [brief.locaciones?.ciudad, ...(brief.locaciones?.lugares || [])].filter(Boolean).join(' - ');
  const fechasStr = [
    brief.fechasTentativas?.inicio,
    brief.fechasTentativas?.fin && brief.fechasTentativas.fin !== brief.fechasTentativas.inicio ? `al ${brief.fechasTentativas.fin}` : '',
    ...(brief.fechasTentativas?.diasClave || [])
  ].filter(Boolean).join(' ');

  return targetTemplate.map(sec => ({
    numeroRomano: sec.numeroRomano,
    titulo: sec.titulo,
    preguntas: sec.preguntas.map(q => {
      const norm = q.pregunta.toLowerCase().replace(/[^a-z0-9áéíóúñ]/gi, ' ').replace(/\s+/g, ' ').trim();
      const prev = existingMapByText.get(norm);
      if (prev) {
        return { ...q, respuesta: prev.respuesta, respondida: true, origenManual: prev.origenManual };
      }

      const pLower = q.pregunta.toLowerCase();
      let candidate = '';
      if (/objetivo|motivo|elemento f[ií]sico|ocasi[oó]n/.test(pLower)) candidate = brief.objetivoPrincipal || '';
      else if (/target|p[uú]blico|asistentes/.test(pLower)) candidate = brief.publicoObjetivo || '';
      else if (/presupuesto|costo unitario/.test(pLower)) candidate = brief.presupuestoEstimado?.monto ? `${brief.presupuestoEstimado.moneda || 'PEN'} ${brief.presupuestoEstimado.monto}` : '';
      else if (/en qu[eé] fecha|cu[aá]ndo|fecha/.test(pLower) && !/l[ií]mite/.test(pLower)) candidate = fechasStr;
      else if (/horario|jornada|cronograma/.test(pLower)) candidate = brief.fechasTentativas?.duracionJornada || '';
      else if (/puntos espec|locaci[oó]n|d[oó]nde se/.test(pLower)) candidate = locStr;
      else if (/staff|personal|promotor|anfitrion|animador/.test(pLower)) candidate = reqSummaryByCat(['STAFF']) || (brief.produccion?.staffRequerido || []).join(', ');
      else if (/elemento|escenograf|photocall|stand|m[oó]dulo|sonido|parlante|pantalla/.test(pLower)) candidate = reqSummaryByCat(['PRODUCCION', 'AUDIOVISUAL']) || (brief.produccion?.escenografiaYMontaje || []).join(', ');
      else if (/art[ií]culo|merchandising|premio|souvenir/.test(pLower)) candidate = reqSummaryByCat(['MERCHANDISING']);
      else if (/fecha l[ií]mite|inauguraci[oó]n/.test(pLower)) candidate = brief.fechaLimitePropuesta || '';

      const clean = candidate.trim();
      return { ...q, respuesta: clean, respondida: Boolean(clean) };
    })
  }));
}

