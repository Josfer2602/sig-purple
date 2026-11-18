import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react';
import { API_URL, getBaseServerUrl } from '../utils/apiUrl';
import { useGlobalContext } from './GlobalContext';
import toast from 'react-hot-toast';

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

export interface BriefPreguntaItem {
  numero: number;
  pregunta: string;
  respuesta: string;
  respondida: boolean;
  origenManual?: boolean;
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

export interface BriefSeccionItem {
  numeroRomano: string;
  titulo: string;
  preguntas: BriefPreguntaItem[];
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

/**
 * Normaliza cualquier variante de tipo de proyecto a una de las 5 categorías oficiales de brief.
 */
export function normalizeActivityType(tipo?: string): ActivityCategoryType {
  if (!tipo) return 'Activación';
  const norm = tipo.toLowerCase().trim();
  if (/merchandis|merch|regalo|art[ií]culo|souvenir|textil|tomatodo|polo|mug|bolso|mochila/i.test(norm)) {
    return 'Merchandising';
  }
  if (/produc|element|stand|m[oó]dulo|retail|carpinter|implement|isla|t[oó]tem|backing|letras\s*3d|vitrina|pop\b/i.test(norm)) {
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

// -------------------------------------------------------------
// 1. BRIEF ESPECIALIZADO: ACTIVACIÓN (BTL, Puntos de Venta, Malls, Sampling)
// -------------------------------------------------------------
export const BRIEF_TEMPLATE_ACTIVACION: BriefSeccionItem[] = [
  {
    numeroRomano: "I",
    titulo: "OBJETIVO, TARGET Y PRESUPUESTO",
    preguntas: [
      { numero: 1, pregunta: "¿Cuál es el objetivo principal de la activación (awareness, sampling/prueba, generación de leads, ventas directas, engagement)?", respuesta: "", respondida: false },
      { numero: 2, pregunta: "¿Cuál es el target o público objetivo (NSE, rango de edad, género, perfil de consumidor)?", respuesta: "", respondida: false },
      { numero: 3, pregunta: "¿Cuál es el Presupuesto Total referencial asignado para la activación? (Monto estimado o rango)", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "II",
    titulo: "FECHAS, LOCACIONES Y PERMISOS",
    preguntas: [
      { numero: 4, pregunta: "¿En qué fechas, fines de semana o periodo debemos programar la activación?", respuesta: "", respondida: false },
      { numero: 5, pregunta: "¿En qué puntos específicos se activará (centros comerciales, supermercados, vía pública, playas, eventos)?", respuesta: "", respondida: false },
      { numero: 6, pregunta: "¿Cuál es el horario de atención al público y la ventana horaria permitida para montaje y desmontaje?", respuesta: "", respondida: false },
      { numero: 7, pregunta: "¿Se requiere tramitar permiso municipal o autorización del centro comercial / recinto? ¿Desean que SIG Purple lo gestione?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "III",
    titulo: "MECÁNICA, GAMIFICACIÓN Y EXPERIENCIA",
    preguntas: [
      { numero: 8, pregunta: "¿Qué mecánica o dinámica interactiva les gustaría implementar (ruleta física/digital, juego interactivo, reto fotográfico, canje por compra, sampling)?", respuesta: "", respondida: false },
      { numero: 9, pregunta: "¿Cuentan con un concepto creativo rector o desean que SIG Purple desarrolle la Big Idea y el storytelling de la experiencia?", respuesta: "", respondida: false },
      { numero: 10, pregunta: "¿Se requiere desarrollo digital (app de registro en tablet, ruleta interactiva, landing page o lectura de códigos QR)?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "IV",
    titulo: "PERSONAL, STAFF Y UNIFORMES",
    preguntas: [
      { numero: 11, pregunta: "¿Qué staff operativo debemos considerar (promotores, impulsadoras, anfitrionas, volanteo, supervisor en campo, animador)?", respuesta: "", respondida: false },
      { numero: 12, pregunta: "¿Qué perfil de personal desean que consideremos (Tipo A, B, etc.)?", respuesta: "", respondida: false },
      { numero: 13, pregunta: "¿Consideramos la confección y producción de uniformes / indumentaria brandeada (polos, gorros, chalecos, vestidos de anfitriona)?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "V",
    titulo: "PREMIOS, SAMPLING Y SOUVENIRS",
    preguntas: [
      { numero: 14, pregunta: "¿Qué incentivos o premios inmediatos se entregarán a los participantes (merchandising, producto de muestra, gift cards)?", respuesta: "", respondida: false },
      { numero: 15, pregunta: "¿Qué volumen estimado de contactos, impactos o muestras de sampling esperan alcanzar por día y por punto?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "VI",
    titulo: "ELEMENTOS VISUALES, STAND Y BRANDING",
    preguntas: [
      { numero: 16, pregunta: "¿Qué elementos físicos de visibilidad se deben producir (counter de activación, backing de fotos, ruleta, rollers, tótems, piso vinil)?", respuesta: "", respondida: false },
      { numero: 17, pregunta: "¿Desean que consideremos el diseño 3D/2D y adaptación gráfica de todos los elementos o nos brindan el Key Visual en alta resolución?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "VII",
    titulo: "LOGÍSTICA, RESTRICCIONES Y FECHA LÍMITE",
    preguntas: [
      { numero: 18, pregunta: "¿Consideramos almacén temporal, transporte y logística de recojo/traslado de materiales entre puntos?", respuesta: "", respondida: false },
      { numero: 19, pregunta: "¿Restricciones operativas a tomar en cuenta (póliza de seguro SCTR, carnets de sanidad, inducciones del establecimiento)?", respuesta: "", respondida: false },
      { numero: 20, pregunta: "¿Cuál es la fecha límite para presentar la propuesta y cotización de SIG Purple?", respuesta: "", respondida: false }
    ]
  }
];

// -------------------------------------------------------------
// 2. BRIEF ESPECIALIZADO: EVENTO CORPORATIVO (Lanzamientos, Fiestas, Aniversarios)
// -------------------------------------------------------------
export const BRIEF_TEMPLATE_EVENTO: BriefSeccionItem[] = [
  {
    numeroRomano: "I",
    titulo: "OBJETIVO, ASISTENTES Y PRESUPUESTO",
    preguntas: [
      { numero: 1, pregunta: "¿Cuál es el motivo y objetivo del evento (aniversario, fiesta de fin de año, integración, lanzamiento de producto, convención corporativa)?", respuesta: "", respondida: false },
      { numero: 2, pregunta: "¿A cuántos asistentes esperan recibir y cuál es su perfil (colaboradores internos, directivos, clientes VIP, familias)?", respuesta: "", respondida: false },
      { numero: 3, pregunta: "¿Cuál es el Presupuesto Total referencial asignado para el evento? (Monto estimado o rango)", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "II",
    titulo: "FECHA, LOCACIÓN Y HORARIOS",
    preguntas: [
      { numero: 4, pregunta: "¿En qué fecha(s) o periodo está previsto realizar el evento?", respuesta: "", respondida: false },
      { numero: 5, pregunta: "¿Cuentan ya con una locación definida (hotel, centro de convenciones, local campestre) o desean que SIG Purple proponga y gestione el espacio?", respuesta: "", respondida: false },
      { numero: 6, pregunta: "¿Cuál es el cronograma horario previsto (montaje previo, llegada de invitados, protocolo oficial, fiesta/cierre y desmontaje)?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "III",
    titulo: "CONCEPTO, TEMÁTICA Y STORYTELLING",
    preguntas: [
      { numero: 7, pregunta: "¿Cuentan con un concepto, temática o dress code definido (Gala formal, Festival, Años 80/90, Rústico Chic) o requieren propuesta creativa integral?", respuesta: "", respondida: false },
      { numero: 8, pregunta: "¿Desean que consideremos el diseño de Key Visual, invitaciones digitales personalizadas, credenciales y piezas gráficas temáticas?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "IV",
    titulo: "AUDIOVISUAL, TÉCNICA Y ESCENARIO",
    preguntas: [
      { numero: 9, pregunta: "¿Desean que consideremos Pantallas LED gigantes (central, laterales) o Ecran con proyector de alta luminosidad?", respuesta: "", respondida: false },
      { numero: 10, pregunta: "¿Qué requerimientos de sonido e iluminación se contemplan (audio para banda/DJ, microfonía inalámbrica, luces robóticas perimetrales, efectos especiales de humo frío/chispas)?", respuesta: "", respondida: false },
      { numero: 11, pregunta: "¿Se requiere escenario estructurado, tarima, atril para expositores o pasarela?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "V",
    titulo: "PROGRAMA, PROTOCOLO Y ENTRETENIMIENTO",
    preguntas: [
      { numero: 12, pregunta: "¿Qué momentos protocolares se contemplan (palabras de gerencia, video corporativo, premiaciones, reconocimientos, brindis institucional)?", respuesta: "", respondida: false },
      { numero: 13, pregunta: "¿Qué entretenimiento en vivo desean considerar (maestro de ceremonias / animador reconocido, banda en vivo, DJ profesional, shows artísticos, hora loca tematica)?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "VI",
    titulo: "ALIMENTOS, BEBIDAS Y CATERING",
    preguntas: [
      { numero: 14, pregunta: "¿Qué formato de catering se requiere (almuerzo/cena servida de 3 tiempos, buffet temático, finger food / bocaditos calientes y fríos, coffee break)?", respuesta: "", respondida: false },
      { numero: 15, pregunta: "¿Se debe considerar servicio de bar (barra libre con coctelería de autor, cerveza, vinos, gaseosas y mocktails)?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "VII",
    titulo: "DECORACIÓN, MOBILIARIO Y PHOTO OPPORTUNITY",
    preguntas: [
      { numero: 16, pregunta: "¿Qué mobiliario se debe considerar (juegos de salas lounge, mesas altas de bar, mesas redondas vestidas, toldo arquitectónico)?", respuesta: "", respondida: false },
      { numero: 17, pregunta: "¿Qué espacios interactivos desean incluir (photocall temático de bienvenida, cabina de fotos 360°, backing de prensa)?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "VIII",
    titulo: "REGISTRO, SOUVENIRS Y RESTRICCIONES",
    preguntas: [
      { numero: 18, pregunta: "¿Desean Registro Audiovisual Profesional (cobertura fotográfica, video reel resumen para redes, circuito cerrado de TV o streaming)?", respuesta: "", respondida: false },
      { numero: 19, pregunta: "¿Qué recuerdos, merchandising o regalos corporativos se estarán entregando a los asistentes?", respuesta: "", respondida: false },
      { numero: 20, pregunta: "¿Restricciones del local, normativas de seguridad (ambulancia en sitio, seguro SCTR, extintores, brigadistas)?", respuesta: "", respondida: false },
      { numero: 21, pregunta: "¿Cuál es la fecha límite para presentar la propuesta y cotización de SIG Purple?", respuesta: "", respondida: false }
    ]
  }
];

// -------------------------------------------------------------
// 3. BRIEF ESPECIALIZADO: PRODUCCIÓN DE UN ELEMENTO (Stands, Módulos, POP, Retail, 3D)
// -------------------------------------------------------------
export const BRIEF_TEMPLATE_PRODUCCION: BriefSeccionItem[] = [
  {
    numeroRomano: "I",
    titulo: "OBJETIVO DEL ELEMENTO Y UBICACIÓN",
    preguntas: [
      { numero: 1, pregunta: "¿Qué elemento físico específico se requiere producir (stand de feria, módulo comercial, isla de venta, backing, tótem, letras 3D, exhibidor POP, vitrina retail)?", respuesta: "", respondida: false },
      { numero: 2, pregunta: "¿Dónde se instalará el elemento (centro comercial, tienda retail, feria/convención, sede corporativa, vía pública)?", respuesta: "", respondida: false },
      { numero: 3, pregunta: "¿La estructura será temporal (días/semanas) o permanente (larga duración / retail)?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "II",
    titulo: "MEDIDAS, DIMENSIONES Y PLANOS TÉCNICOS",
    preguntas: [
      { numero: 4, pregunta: "¿Cuáles son las medidas o dimensiones requeridas (alto, ancho, profundidad, área total en m2 o metros lineales)?", respuesta: "", respondida: false },
      { numero: 5, pregunta: "¿Cuentan con planos técnicos 2D, renders 3D o despiece, o SIG Purple debe realizar el diseño estructural y modelado 3D?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "III",
    titulo: "MATERIALES, ACABADOS Y CARPINTERÍA",
    preguntas: [
      { numero: 6, pregunta: "¿Qué materiales se deben emplear (MDF ruteado, melamine, estructuras de fierro/aluminio, acrílico, lona tensada, policarbonato)?", respuesta: "", respondida: false },
      { numero: 7, pregunta: "¿Qué tipo de acabados se requieren (pintura automotriz gloss/mate, enchape imitación madera, vinil laminado, tapizado)?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "IV",
    titulo: "ILUMINACIÓN, ELECTRICIDAD Y GRÁFICAS",
    preguntas: [
      { numero: 8, pregunta: "¿El elemento requiere iluminación integrada (tiras LED neón flex, dicroicos cálidos/fríos, cajas de luz backlight)?", respuesta: "", respondida: false },
      { numero: 9, pregunta: "¿El punto de instalación cuenta con punto de energía eléctrica cercano o se requiere cableado especial y tablero térmico?", respuesta: "", respondida: false },
      { numero: 10, pregunta: "¿Qué aplicaciones gráficas incluye (logotipos en alto relieve corte CNC, vinil adhesivo mate/brillante impreso en alta resolución, floor graphics)?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "V",
    titulo: "MONTAJE, LOGÍSTICA Y SEGURIDAD",
    preguntas: [
      { numero: 11, pregunta: "¿En qué horarios se debe realizar el montaje y desmontaje (madrugada/montaje nocturno, horario comercial cerrado)?", respuesta: "", respondida: false },
      { numero: 12, pregunta: "¿Qué exigencias de seguridad y acceso solicita el recinto (póliza de seguro SCTR pensión y salud, EPPs completos, permisos de trabajo en altura)?", respuesta: "", respondida: false },
      { numero: 13, pregunta: "¿Dónde se entregará o instalará el elemento (Lima metropolitana, transporte a provincias, flete y maniobras de carga/descarga)?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "VI",
    titulo: "DESMONTAJE, PRESUPUESTO Y ENTREGA",
    preguntas: [
      { numero: 14, pregunta: "¿Al finalizar la actividad, el elemento se desmonta y traslada a almacén, se entrega al cliente o se realiza disposición final?", respuesta: "", respondida: false },
      { numero: 15, pregunta: "¿Cuál es el Presupuesto Total referencial asignado para la fabricación, transporte e instalación?", respuesta: "", respondida: false },
      { numero: 16, pregunta: "¿Cuál es la fecha límite improrrogable para la entrega e instalación terminada (fecha de inauguración)?", respuesta: "", respondida: false }
    ]
  }
];

// -------------------------------------------------------------
// 4. BRIEF ESPECIALIZADO: MERCHANDISING (Artículos Promocionales, Textil, Kits)
// -------------------------------------------------------------
export const BRIEF_TEMPLATE_MERCHANDISING: BriefSeccionItem[] = [
  {
    numeroRomano: "I",
    titulo: "OBJETIVO, OCASIÓN Y DESTINATARIOS",
    preguntas: [
      { numero: 1, pregunta: "¿Para qué ocasión o campaña es el merchandising (evento corporativo, bienvenida de colaboradores/onboarding, regalo ejecutivo de fin de año, feria comercial, campaña masiva)?", respuesta: "", respondida: false },
      { numero: 2, pregunta: "¿A qué público específico va dirigido (clientes VIP, colaboradores internos, ejecutivos, consumidores masivos, distribuidores)?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "II",
    titulo: "TIPO DE ARTÍCULOS Y CANTIDADES",
    preguntas: [
      { numero: 3, pregunta: "¿Qué artículo(s) promocional(es) específico(s) se requiere cotizar (tomatodos térmicos, libretas, polos/textil, mochilas, tazas, USB, lapiceros, paraguas, kits de bienvenida)?", respuesta: "", respondida: false },
      { numero: 4, pregunta: "¿Cuáles son las cantidades exactas o escalas requeridas por cada ítem (ej: 100, 300, 500, 1000 unidades)?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "III",
    titulo: "MATERIALES, CALIDAD Y ESPECIFICACIONES TÉCNICAS",
    preguntas: [
      { numero: 5, pregunta: "¿Qué nivel de calidad y materiales se requieren (acero inoxidable doble pared, algodón pima 100%, bambú/ecológico, plástico libre de BPA, cuero PU)?", respuesta: "", respondida: false },
      { numero: 6, pregunta: "¿Se requiere algún color corporativo específico para el cuerpo del producto (código Pantone institucional o color de línea disponible)?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "IV",
    titulo: "PERSONALIZACIÓN, BRANDING Y MUESTRA",
    preguntas: [
      { numero: 7, pregunta: "¿Qué técnica de personalización se prefiere (grabado láser, serigrafía a 1 o más colores, bordado computarizado, transfer digital, DTF, tampografía)?", respuesta: "", respondida: false },
      { numero: 8, pregunta: "¿La personalización va en una sola cara, ambas caras o grabado circular 360°?", respuesta: "", respondida: false },
      { numero: 9, pregunta: "¿Cuentan con el logotipo en formato vector editable (.AI, .EPS, .PDF vector)?", respuesta: "", respondida: false },
      { numero: 10, pregunta: "¿Se requiere la elaboración y aprobación de una muestra física previa antes de iniciar la producción total del lote?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "V",
    titulo: "EMPAQUE Y PRESENTACIÓN (PACKAGING)",
    preguntas: [
      { numero: 11, pregunta: "¿Qué tipo de empaque o presentación se requiere (caja individual personalizada con logo, bolsa ecológica, envoltura individual de celofán, tarjeta con dedicatoria)?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "VI",
    titulo: "LOGÍSTICA, PRESUPUESTO Y ENTREGA",
    preguntas: [
      { numero: 12, pregunta: "¿Dónde se realizará la entrega (almacén central en Lima, despacho fraccionado a múltiples oficinas o envíos individuales a domicilio)?", respuesta: "", respondida: false },
      { numero: 13, pregunta: "¿Cuál es el Presupuesto Total referencial o costo unitario objetivo por artículo?", respuesta: "", respondida: false },
      { numero: 14, pregunta: "¿Cuál es la fecha límite improrrogable de entrega del lote completo?", respuesta: "", respondida: false }
    ]
  }
];

// -------------------------------------------------------------
// 5. BRIEF ESPECIALIZADO: CAMPAÑA INTEGRAL (Mix 360°, Estrategia Creativa)
// -------------------------------------------------------------
export const BRIEF_TEMPLATE_CAMPANA: BriefSeccionItem[] = [
  {
    numeroRomano: "I",
    titulo: "OBJETIVO ESTRATÉGICO Y KPIS",
    preguntas: [
      { numero: 1, pregunta: "¿Cuál es el objetivo estratégico de marketing de la campaña (lanzamiento de producto, reposicionamiento, generación de leads calificados, ventas directas)?", respuesta: "", respondida: false },
      { numero: 2, pregunta: "¿Cuáles son los KPIs principales de éxito esperados (alcance, contactos cara a cara, tasa de conversión, menciones en redes)?", respuesta: "", respondida: false },
      { numero: 3, pregunta: "¿Cuál es el Presupuesto Total estimado o rango asignado para toda la campaña?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "II",
    titulo: "TARGET, BUYER PERSONA E INSIGHT",
    preguntas: [
      { numero: 4, pregunta: "¿Cuál es el perfil demográfico y psicográfico del público objetivo (segmento, hábitos de consumo, buyer persona)?", respuesta: "", respondida: false },
      { numero: 5, pregunta: "¿Existe algún insight del consumidor o tensión relevante que la campaña deba capitalizar?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "III",
    titulo: "CONCEPTO CREATIVO, BIG IDEA Y TONO",
    preguntas: [
      { numero: 6, pregunta: "¿Desean que SIG Purple desarrolle el concepto rector, Big Idea, slogan y Key Visual principal de la campaña?", respuesta: "", respondida: false },
      { numero: 7, pregunta: "¿Cuál es el tono de comunicación de la marca (cercano, innovador, audaz, corporativo)?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "IV",
    titulo: "CANALES Y MIX DE ACCIONES (360°)",
    preguntas: [
      { numero: 8, pregunta: "¿Qué canales y puntos de contacto contempla el mix (activaciones BTL, eventos experienciales, visibilidad en retail, amplificación digital, influencers)?", respuesta: "", respondida: false },
      { numero: 9, pregunta: "¿Qué piezas gráficas, audiovisuales y de contenido digital se deben producir?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "V",
    titulo: "PRODUCCIÓN, DESPLIEGUE EN CAMPO Y MERCH",
    preguntas: [
      { numero: 10, pregunta: "¿Qué elementos de producción física, escenografía o merchandising requiere la campaña?", respuesta: "", respondida: false },
      { numero: 11, pregunta: "¿En qué ciudades, regiones o plazas a nivel nacional se ejecutará la campaña?", respuesta: "", respondida: false }
    ]
  },
  {
    numeroRomano: "VI",
    titulo: "FASES, CRONOGRAMA Y FECHAS CLAVE",
    preguntas: [
      { numero: 12, pregunta: "¿Cuáles son las fases de la campaña (fase teaser/expectativa, lanzamiento oficial, sostenimiento, cierre)?", respuesta: "", respondida: false },
      { numero: 13, pregunta: "¿Cuáles son las fechas de inicio, hitos clave y duración total de la campaña?", respuesta: "", respondida: false },
      { numero: 14, pregunta: "¿Cuál es la fecha límite para la presentación de la propuesta integral y cotización de SIG Purple?", respuesta: "", respondida: false }
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

/**
 * Retorna la plantilla de brief especializada según el tipo de actividad seleccionado.
 */
export function getBriefTemplateForActivity(tipoProyecto?: string): BriefSeccionItem[] {
  const norm = normalizeActivityType(tipoProyecto);
  return BRIEF_TEMPLATES_BY_ACTIVITY[norm] || BRIEF_TEMPLATE_ACTIVACION;
}

// Plantilla oficial base retrocompatible (alias a Activación)
export const OFFICIAL_PURPLE_BRIEF_TEMPLATE: BriefSeccionItem[] = BRIEF_TEMPLATE_ACTIVACION;

/**
 * Migra las respuestas existentes de un brief hacia una nueva plantilla especializada al cambiar de actividad,
 * preservando todas las respuestas manuales mediante matching semántico.
 */
export function migrateBriefSectionsToNewTemplate(
  currentSections: BriefSeccionItem[] | undefined,
  targetTipoProyecto: string,
  brief: Partial<SmartBriefData>
): BriefSeccionItem[] {
  const targetTemplate = getBriefTemplateForActivity(targetTipoProyecto);
  const existingMapByText = new Map<string, string>();

  if (currentSections) {
    for (const sec of currentSections) {
      for (const q of sec.preguntas) {
        if (q.respuesta && q.respuesta.trim()) {
          const normKey = q.pregunta.toLowerCase().replace(/[^a-z0-9áéíóúñ]/gi, ' ').replace(/\s+/g, ' ').trim();
          existingMapByText.set(normKey, q.respuesta.trim());
        }
      }
    }
  }

  const findPrevAnswer = (regex: RegExp): string => {
    if (!currentSections) return '';
    for (const sec of currentSections) {
      for (const q of sec.preguntas) {
        if (regex.test(q.pregunta) && q.respuesta && q.respuesta.trim()) {
          return q.respuesta.trim();
        }
      }
    }
    return '';
  };

  const pMonto = brief.presupuestoEstimado?.monto 
    ? `${brief.presupuestoEstimado.moneda || 'PEN'} ${brief.presupuestoEstimado.monto} ${brief.presupuestoEstimado.observacion ? `(${brief.presupuestoEstimado.observacion})` : ''}`.trim() 
    : '';
  const pFechas = brief.fechasTentativas?.inicio 
    ? `${brief.fechasTentativas.inicio} ${brief.fechasTentativas.fin ? `al ${brief.fechasTentativas.fin}` : ''} ${brief.fechasTentativas.diasClave?.length ? `(Días clave: ${brief.fechasTentativas.diasClave.join(', ')})` : ''}`.trim() 
    : '';
  const pLoc = [brief.locaciones?.ciudad, ...(brief.locaciones?.lugares || [])].filter(Boolean).join(' - ');

  const semanticAnswers: Record<string, string> = {
    objetivo: findPrevAnswer(/objetivo|motivo y objetivo|qu[eé] busca/i) || brief.objetivoPrincipal || '',
    target: findPrevAnswer(/target|p[uú]blico|asistente|destinatari|colaborador/i) || brief.publicoObjetivo || '',
    presupuesto: findPrevAnswer(/presupuesto|monto|rango|costo unitario/i) || pMonto,
    fechas: findPrevAnswer(/fecha\(s\)|periodo|cu[aá]ndo/i) || pFechas,
    horario: findPrevAnswer(/horario/i) || (brief.restricciones?.find(r => /horari|noche|madrugada|montaje|desmontaje/i.test(r)) || ''),
    locacion: findPrevAnswer(/punto|locaci[oó]n|d[oó]nde se instalar[aá]|localidad|distrito|recinto/i) || pLoc,
    permisos: findPrevAnswer(/permiso|autoriz/i) || (brief.produccion?.permisosYSeguridad?.join(', ') || ''),
    mecanica: findPrevAnswer(/mec[aá]nica|din[aá]mica|experiencia|interact/i) || '',
    concepto: findPrevAnswer(/concepto|tem[aá]tica|big idea|storytelling|dress code/i) || brief.mensajeClaveOConcepto || '',
    diseno: findPrevAnswer(/dise[nñ]o.*adaptaci[oó]n|key visual/i) || (brief.tipoServicio?.includes('CREATIVITY') ? 'SIG Purple diseñará Key Visual y adaptaciones' : ''),
    staff: findPrevAnswer(/staff|personal|promotor|anfitrion|impulsad|animador/i) || (brief.produccion?.staffRequerido || []).join(', '),
    uniformes: findPrevAnswer(/uniform|indumentaria|polo|gorro|chaleco/i) || '',
    premiosMerch: findPrevAnswer(/premio|sampling|incentivo|souvenir/i) || '',
    elementosFisicos: findPrevAnswer(/element.*f[ií]sico|stand|m[oó]dulo|isla|t[oó]tem|counter|backing|letras\s*3d/i) || (brief.produccion?.escenografiaYMontaje || []).join(', '),
    logistica: findPrevAnswer(/almac[eé]n|transporte|log[ií]stica|flete/i) || '',
    restricciones: findPrevAnswer(/sctr|seguridad|restricci[oó]n|normativa/i) || (brief.restricciones || []).join('; '),
    fechaLimite: findPrevAnswer(/fecha l[ií]mite|inauguraci[oó]n|entrega.*lote/i) || brief.fechaLimitePropuesta || '',
    articulos: findPrevAnswer(/art[ií]culo.*promocional|qu[eé] art[ií]culo|tomatodo|polos/i) || '',
    cantidades: findPrevAnswer(/cantidad.*exacta|escala.*requerida|unidades/i) || '',
    medidas: findPrevAnswer(/medida.*dimensi[oó]n|alto.*ancho|m2/i) || '',
    materiales: findPrevAnswer(/material.*emplear|calidad y material|mdf|acero|algod[oó]n/i) || '',
    pantallas: findPrevAnswer(/pantalla.*led|ecran/i) || (brief.produccion?.audiovisualYTecnica || []).find(a => /ecran|pantalla|led/i.test(a)) || '',
    sonido: findPrevAnswer(/sonido.*iluminaci[oó]n|line array|micr[oó]fono/i) || '',
    catering: findPrevAnswer(/catering|almuerzo|cena|buffet|bocadito/i) || '',
    mobiliario: findPrevAnswer(/mobiliari.*lounge|mesas altas|toldo/i) || '',
    registroAudiovisual: findPrevAnswer(/registro audiovisual|fotograf|video reel|streaming/i) || ''
  };

  return targetTemplate.map(sec => ({
    numeroRomano: sec.numeroRomano,
    titulo: sec.titulo,
    preguntas: sec.preguntas.map(q => {
      const normText = q.pregunta.toLowerCase().replace(/[^a-z0-9áéíóúñ]/gi, ' ').replace(/\s+/g, ' ').trim();
      const directMatch = existingMapByText.get(normText);
      if (directMatch && directMatch.trim()) {
        return { ...q, respuesta: directMatch.trim(), respondida: true };
      }

      let matchedVal = '';
      const pText = q.pregunta.toLowerCase();

      if (/objetivo.*(activaci[oó]n|campa[nñ]a)|motivo y objetivo.*evento|qu[eé] elemento f[ií]sico|ocasi[oó]n o campa[nñ]a/i.test(pText)) {
        matchedVal = semanticAnswers.objetivo;
      } else if (/target|p[uú]blico.*objetivo|asistentes esperan recibir|a qu[eé] p[uú]blico.*dirigido|buyer persona/i.test(pText)) {
        matchedVal = semanticAnswers.target;
      } else if (/presupuesto total|costo unitario objetivo/i.test(pText)) {
        matchedVal = semanticAnswers.presupuesto;
      } else if (/en qu[eé] fecha|cu[aá]ndo/i.test(pText)) {
        matchedVal = semanticAnswers.fechas;
      } else if (/horario.*atenci[oó]n|cronograma horario|horarios se debe realizar el montaje/i.test(pText)) {
        matchedVal = semanticAnswers.horario;
      } else if (/puntos espec[ií]ficos|d[oó]nde se instalar[aá]|locaci[oó]n definida/i.test(pText)) {
        matchedVal = semanticAnswers.locacion;
      } else if (/permiso municipal|autorizaci[oó]n del centro comercial/i.test(pText)) {
        matchedVal = semanticAnswers.permisos;
      } else if (/mec[aá]nica o din[aá]mica interactiva/i.test(pText)) {
        matchedVal = semanticAnswers.mecanica;
      } else if (/concepto creativo rector|concepto, tem[aá]tica o dress code|concepto rector, big idea/i.test(pText)) {
        matchedVal = semanticAnswers.concepto;
      } else if (/dise[nñ]o 3d\/2d.*key visual|dise[nñ]o de key visual/i.test(pText)) {
        matchedVal = semanticAnswers.diseno;
      } else if (/staff operativo|qu[eé] personal/i.test(pText)) {
        matchedVal = semanticAnswers.staff;
      } else if (/confecci[oó]n y producci[oó]n de uniformes/i.test(pText)) {
        matchedVal = semanticAnswers.uniformes;
      } else if (/incentivos o premios inmediatos/i.test(pText)) {
        matchedVal = semanticAnswers.premiosMerch;
      } else if (/elementos f[ií]sicos de visibilidad/i.test(pText)) {
        matchedVal = semanticAnswers.elementosFisicos;
      } else if (/almac[eé]n temporal, transporte y log[ií]stica/i.test(pText)) {
        matchedVal = semanticAnswers.logistica;
      } else if (/restricciones operativas|restricciones del local|exigencias de seguridad.*sctr/i.test(pText)) {
        matchedVal = semanticAnswers.restricciones;
      } else if (/fecha l[ií]mite/i.test(pText)) {
        matchedVal = semanticAnswers.fechaLimite;
      } else if (/art[ií]culo\(s\) promocional\(es\) espec[ií]fico\(s\)/i.test(pText)) {
        matchedVal = semanticAnswers.articulos;
      } else if (/cantidades exactas o escalas/i.test(pText)) {
        matchedVal = semanticAnswers.cantidades;
      } else if (/medidas o dimensiones requeridas/i.test(pText)) {
        matchedVal = semanticAnswers.medidas;
      } else if (/materiales se deben emplear|nivel de calidad y materiales/i.test(pText)) {
        matchedVal = semanticAnswers.materiales;
      } else if (/pantallas led gigantes/i.test(pText)) {
        matchedVal = semanticAnswers.pantallas;
      } else if (/requerimientos de sonido e iluminaci[oó]n/i.test(pText)) {
        matchedVal = semanticAnswers.sonido;
      } else if (/formato de catering/i.test(pText)) {
        matchedVal = semanticAnswers.catering;
      } else if (/mobiliario se debe considerar.*lounge/i.test(pText)) {
        matchedVal = semanticAnswers.mobiliario;
      } else if (/registro audiovisual profesional/i.test(pText)) {
        matchedVal = semanticAnswers.registroAudiovisual;
      }

      const cleanVal = (matchedVal || '').trim();
      const isValid = cleanVal && cleanVal !== 'Por definir' && cleanVal !== 'PEN Por definir' && cleanVal !== 'No especificado' && cleanVal !== '-';

      return {
        ...q,
        respuesta: isValid ? cleanVal : '',
        respondida: Boolean(isValid)
      };
    })
  }));
}

export interface SmartBriefData {
  clienteId?: string;
  clienteNombre?: string;
  marcaOProducto?: string;
  contactoNombre?: string;
  contactoCargo?: string;
  contactoEmail?: string;
  contactoTelefono?: string;
  nombreTentativoProyecto?: string;
  tipoServicio?: string;
  tipoProyecto?: string;
  tipoProyectoManual?: boolean;
  subTipoActividad?: string;
  projectManager?: string;
  requiereIdeaCreativa?: boolean;
  objetivoPrincipal?: string;
  publicoObjetivo?: string;
  mensajeClaveOConcepto?: string;
  fechasTentativas?: {
    inicio?: string;
    fin?: string;
    duracionJornada?: string;
    diasClave?: string[];
  };
  locaciones?: {
    ciudad?: string;
    lugares?: string[];
    esExterior?: boolean;
  };
  referenciasMencionadas?: string[];
  presupuestoEstimado?: {
    monto?: number | string;
    moneda?: 'PEN' | 'USD';
    esFlexible?: boolean;
    observacion?: string;
  };
  produccion?: {
    escenografiaYMontaje?: string[];
    audiovisualYTecnica?: string[];
    staffRequerido?: string[];
    permisosYSeguridad?: string[];
  };
  requerimientosCuantificados?: RequerimientoBriefItem[];
  vaciosCriticos?: VacioCriticoItem[];
  mensajeSeguimientoCliente?: string;
  handoffAreas?: HandoffAreasBrief;
  fuentesIngresadas?: FuenteBriefItem[];
  kpisOMetricas?: string[];
  restricciones?: string[];
  fechaLimitePropuesta?: string;
  completitudPorcentaje?: number;
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

export interface DeliverableResult {
  tipo: string;
  titulo: string;
  resumenEjecutivo: string;
  propuestaCreativa?: {
    bigIdea: string;
    racionalEstrategico: string;
    mecanicas: { titulo: string; descripcion: string; experienciaUsuario: string }[];
    sugerenciasVisualesYStorytelling: string[];
    canalesOAcciones: string[];
  };
  desgloseProduccion?: {
    escenografiaYBranding: { item: string; especificacion: string; cantidadAprox?: string }[];
    equipamientoTecnico: { categoria: string; descripcion: string }[];
    requerimientoStaff: { rol: string; cantidad: number; funciones: string }[];
    cronogramaProduccion: { fase: string; duracionEstimada: string; entregable: string }[];
    matrizRiesgosYPermisos: { riesgoOPermiso: string; planMitigacion: string }[];
    proveedoresSugeridosCategorias: string[];
  };
  proximosPasosInmediatos: string[];
  requiereIdeaCreativa?: boolean;
  categoriasCotizacion?: QuoteCategoryPayload[];
}

export type AudioSourceMode = 'call_and_mic' | 'mic_only';

interface SmartMeetingContextType {
  isActive: boolean;
  isMinimized: boolean;
  meetingId: string | null;
  meetingTitle: string;
  isRecording: boolean;
  audioMode: AudioSourceMode;
  secondsElapsed: number;
  brief: SmartBriefData;
  questions: LiveQuestion[];
  transcript: string;
  interimText: string;
  isAiProcessing: boolean;
  deliverable: DeliverableResult | null;
  createdProject: any | null;
  createdQuote: any | null;
  isGeneratingDeliverable: boolean;
  isCreatingProject: boolean;
  deliverableType: 'INTEGRAL' | 'CREATIVO' | 'PRODUCCION';
  initialMeetLink?: string;
  initialAttendees: string[];
  isGeneratingCreativeIdea: boolean;
  isImportingSource: boolean;

  // Acciones
  startMeeting: (options?: { title?: string; meetLink?: string; attendees?: string[] }) => Promise<void>;
  loadExistingMeeting: (meetingId: string) => Promise<void>;
  toggleRecording: (mode?: AudioSourceMode) => Promise<void>;
  setAudioMode: (mode: AudioSourceMode) => void;
  minimize: () => void;
  maximize: () => void;
  closeMeeting: () => void;
  triggerAiAnalysis: () => Promise<void>;
  sendTranscriptChunk: (text: string) => Promise<void>;
  importBriefSource: (input: { text?: string; file?: File; sourceLabel?: string; replaceTranscript?: boolean }) => Promise<boolean>;
  createBriefFromSource: (input: { text?: string; file?: File; titulo?: string; clienteId?: string; sourceLabel?: string }) => Promise<boolean>;
  handleDismissQuestion: (questionId: string) => void;
  handleFinishMeeting: (requiereIdeaCreativa?: boolean) => Promise<void>;
  handleCreateProject: (customCategories?: QuoteCategoryPayload[], customBrief?: Partial<SmartBriefData>) => Promise<{ project: any; quote: any } | null>;
  updateBriefManual: (updatedBrief: Partial<SmartBriefData>) => void;
  generateCreativeIdea: () => Promise<CreativeProposalDetailed | null>;
  setCreatedQuote: React.Dispatch<React.SetStateAction<any | null>>;
  setBrief: React.Dispatch<React.SetStateAction<SmartBriefData>>;
  setMeetingTitle: (title: string) => void;
  setDeliverableType: (type: 'INTEGRAL' | 'CREATIVO' | 'PRODUCCION') => void;
}

const SmartMeetingContext = createContext<SmartMeetingContextType | undefined>(undefined);

export const SmartMeetingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token, refreshData, currentUser } = useGlobalContext();

  const [isActive, setIsActive] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [meetingTitle, setMeetingTitle] = useState('Reunión de Briefing & Estrategia');
  const [isRecording, setIsRecording] = useState(false);
  const [audioMode, setAudioMode] = useState<AudioSourceMode>('call_and_mic');
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  const [transcript, setTranscript] = useState<string>('');
  const [interimText, setInterimText] = useState<string>('');
  const [brief, setBrief] = useState<SmartBriefData>({
    tipoServicio: 'PURPLE STRATEGY & CREATIVITY',
    tipoProyecto: 'Activación',
    completitudPorcentaje: 0
  });
  const [questions, setQuestions] = useState<LiveQuestion[]>([]);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isGeneratingCreativeIdea, setIsGeneratingCreativeIdea] = useState(false);
  const [isImportingSource, setIsImportingSource] = useState(false);
  const [deliverable, setDeliverable] = useState<DeliverableResult | null>(null);
  const [createdProject, setCreatedProject] = useState<any>(null);
  const [createdQuote, setCreatedQuote] = useState<any>(null);
  const [isGeneratingDeliverable, setIsGeneratingDeliverable] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [deliverableType, setDeliverableType] = useState<'INTEGRAL' | 'CREATIVO' | 'PRODUCCION'>('INTEGRAL');
  const [initialMeetLink, setInitialMeetLink] = useState<string | undefined>();
  const [initialAttendees, setInitialAttendees] = useState<string[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeStreamsRef = useRef<MediaStream[]>([]);
  const meetingIdRef = useRef<string | null>(meetingId);
  const isRecordingLoopRef = useRef<boolean>(false);
  const cycleTimeoutRef = useRef<any>(null);

  useEffect(() => {
    meetingIdRef.current = meetingId;
  }, [meetingId]);

  const getHeaders = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }, [token]);

  // Manejo de Cronómetro
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setSecondsElapsed(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  // Conectar WebSocket
  const connectWebSocket = (mId: string) => {
    try {
      const base = getBaseServerUrl();
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let wsUrl = '';
      if (base.startsWith('http://')) {
        wsUrl = base.replace('http://', 'ws://') + '/ws/meeting';
      } else if (base.startsWith('https://')) {
        wsUrl = base.replace('https://', 'wss://') + '/ws/meeting';
      } else {
        wsUrl = `${wsProto}//${window.location.host}/ws/meeting`;
      }

      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log('🎙️ [SmartMeetingContext] WebSocket conectado:', mId);
        ws.send(JSON.stringify({ type: 'join', meetingId: mId }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'room_state' || data.type === 'brief_updated') {
            if (data.brief) {
              setBrief(prev => {
                const isGenericName = !prev.nombreTentativoProyecto || /^Reuni[oó]n de Briefing|^Nuevo Proyecto/i.test(prev.nombreTentativoProyecto);
                const keepManualClient = Boolean(prev.clienteId);
                return {
                  ...prev,
                  ...data.brief,
                  clienteId: prev.clienteId || data.brief.clienteId,
                  clienteNombre: keepManualClient ? prev.clienteNombre : (data.brief.clienteNombre || prev.clienteNombre),
                  contactoNombre: keepManualClient ? prev.contactoNombre : (data.brief.contactoNombre || prev.contactoNombre),
                  contactoCargo: keepManualClient ? prev.contactoCargo : (data.brief.contactoCargo || prev.contactoCargo),
                  contactoEmail: keepManualClient ? prev.contactoEmail : (data.brief.contactoEmail || prev.contactoEmail),
                  contactoTelefono: keepManualClient ? prev.contactoTelefono : (data.brief.contactoTelefono || prev.contactoTelefono),
                  tipoServicio: data.brief.tipoServicio || prev.tipoServicio,
                  tipoProyecto: prev.tipoProyectoManual ? (prev.tipoProyecto || data.brief.tipoProyecto) : (data.brief.tipoProyecto || prev.tipoProyecto),
                  nombreTentativoProyecto: isGenericName ? (data.brief.nombreTentativoProyecto || prev.nombreTentativoProyecto) : prev.nombreTentativoProyecto,
                  propuestaCreativaDetallada: prev.propuestaCreativaDetallada || data.brief.propuestaCreativaDetallada
                };
              });
            }
            if (data.questions) setQuestions(data.questions);
            if (data.transcript && !transcript) setTranscript(data.transcript);
          } else if (data.type === 'creative_idea_generated') {
            if (data.propuestaCreativa) {
              setBrief(prev => ({
                ...prev,
                propuestaCreativaDetallada: data.propuestaCreativa,
                mensajeClaveOConcepto: data.propuestaCreativa.bigIdea || prev.mensajeClaveOConcepto
              }));
              setIsGeneratingCreativeIdea(false);
              toast.success('¡Propuesta creativa desarrollada con éxito!');
            }
          } else if (data.type === 'generating_creative_idea') {
            setIsGeneratingCreativeIdea(Boolean(data.status));
          } else if (data.type === 'transcript_appended') {
            setTranscript(data.fullTranscript || ((prev: string) => prev + data.chunk));
          } else if (data.type === 'questions_updated') {
            setQuestions(data.questions);
          } else if (data.type === 'ai_processing_status') {
            setIsAiProcessing(Boolean(data.isProcessing));
          } else if (data.type === 'meeting_finished') {
            setDeliverable(data.deliverable);
          } else if (data.type === 'project_created') {
            setCreatedProject(data.project);
            toast.success('¡Proyecto creado en SIG Purple exitosamente!');
            refreshData();
          }
        } catch (e) {
          console.error('Error parseando mensaje WS:', e);
        }
      };

      ws.onerror = (e) => {
        console.warn('WebSocket error, se usará fallback REST:', e);
      };
    } catch (err) {
      console.warn('Error inicializando WS:', err);
    }
  };

  // Iniciar Sesión de Reunión
  const startMeeting = async (options?: { title?: string; meetLink?: string; attendees?: string[] }) => {
    const title = options?.title || `Reunión de Briefing - ${new Date().toLocaleDateString('es-PE')}`;
    setMeetingTitle(title);
    setInitialMeetLink(options?.meetLink);
    setInitialAttendees(options?.attendees || []);
    setIsActive(true);
    setIsMinimized(false);
    setDeliverable(null);
    setCreatedProject(null);
    setCreatedQuote(null);
    setQuestions([]);
    setBrief({
      tipoServicio: 'PURPLE STRATEGY & CREATIVITY',
      tipoProyecto: 'Activación',
      completitudPorcentaje: 0
    });
    setTranscript('');
    setSecondsElapsed(0);

    try {
      const res = await fetch(`${API_URL}/reuniones-ai`, {
        method: 'POST',
        headers: getHeaders,
        body: JSON.stringify({
          titulo: title,
          tipoServicio: 'PURPLE STRATEGY & CREATIVITY',
          tipoProyecto: 'Activación'
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMeetingId(data.id);
        connectWebSocket(data.id);
      } else {
        const fallbackId = 'mtg_' + Date.now();
        setMeetingId(fallbackId);
        connectWebSocket(fallbackId);
      }
    } catch (err) {
      console.warn('Error creando sesión en backend, usando fallback:', err);
      const fallbackId = 'mtg_' + Date.now();
      setMeetingId(fallbackId);
      connectWebSocket(fallbackId);
    }
  };

  // Cargar una reunión existente de la base de datos
  const loadExistingMeeting = async (mId: string) => {
    try {
      const res = await fetch(`${API_URL}/reuniones-ai/${mId}`, { headers: getHeaders });
      if (res.ok) {
        const data = await res.json();
        setMeetingId(data.id);
        meetingIdRef.current = data.id;
        setMeetingTitle(data.titulo || 'Reunión de Briefing');
        setTranscript(data.transcripcion || '');
        setDeliverable(null);
        setCreatedProject(null);
        setCreatedQuote(null);
        setQuestions([]);
        setBrief({
          tipoServicio: data.tipoServicio || 'PURPLE STRATEGY & CREATIVITY',
          tipoProyecto: data.tipoProyecto || 'Activación',
          completitudPorcentaje: 0
        });
        if (data.briefJson) {
          try {
            setBrief(typeof data.briefJson === 'string' ? JSON.parse(data.briefJson) : data.briefJson);
          } catch (e) {}
        }
        if (data.preguntasJson) {
          try {
            setQuestions(typeof data.preguntasJson === 'string' ? JSON.parse(data.preguntasJson) : data.preguntasJson);
          } catch (e) {}
        }
        if (data.entregableJson) {
          try {
            setDeliverable(typeof data.entregableJson === 'string' ? JSON.parse(data.entregableJson) : data.entregableJson);
          } catch (e) {}
        }
        setIsActive(true);
        setIsMinimized(false);
        connectWebSocket(data.id);
        toast.success(`Brief cargado: ${data.titulo}`);
      }
    } catch (e) {
      console.error('Error cargando reunión existente:', e);
      toast.error('No se pudo abrir el brief guardado.');
    }
  };

  // Detener todos los audios y grabaciones activos
  const stopAllMedia = () => {
    isRecordingLoopRef.current = false;
    if (cycleTimeoutRef.current) {
      clearTimeout(cycleTimeoutRef.current);
      cycleTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) {}
    }
    activeStreamsRef.current.forEach(stream => {
      try {
        stream.getTracks().forEach(track => track.stop());
      } catch (e) {}
    });
    activeStreamsRef.current = [];
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch (e) {}
    }
    setIsRecording(false);
  };

  // Grabación continua en ciclos completos de 6 segundos (cada ciclo es un WebM independiente con headers válidos)
  const startDualAudioRecording = (destinationStream: MediaStream) => {
    isRecordingLoopRef.current = true;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    // Medidor de amplitud RMS para evitar enviar silencios y frenar alucinaciones STT
    let analyser: AnalyserNode | null = null;
    let timeData: Uint8Array | null = null;
    try {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        const src = audioContextRef.current.createMediaStreamSource(destinationStream);
        analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        timeData = new Uint8Array(analyser.frequencyBinCount);
      }
    } catch {}

    const runCycle = () => {
      if (!isRecordingLoopRef.current) return;
      try {
        const recorder = new MediaRecorder(destinationStream, { mimeType });
        mediaRecorderRef.current = recorder;
        const chunks: Blob[] = [];
        let maxEnergy = 0;

        const meterInterval = analyser && timeData ? setInterval(() => {
          if (!analyser || !timeData) return;
          analyser.getByteTimeDomainData(timeData);
          let peak = 0;
          for (let i = 0; i < timeData.length; i++) {
            const dev = Math.abs(timeData[i] - 128) / 128;
            if (dev > peak) peak = dev;
          }
          if (peak > maxEnergy) maxEnergy = peak;
        }, 120) : null;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        recorder.onstop = async () => {
          if (meterInterval) clearInterval(meterInterval);
          const currentMeetingId = meetingIdRef.current;
          // Gate de silencio: solo transcribir si superó umbral de voz o no hubo medidor
          const hasVoice = !analyser || maxEnergy >= 0.012;
          if (hasVoice && chunks.length > 0 && currentMeetingId) {
            const blob = new Blob(chunks, { type: mimeType });
            if (blob.size > 2000) {
              const reader = new FileReader();
              reader.readAsDataURL(blob);
              reader.onloadend = async () => {
                const base64Data = (reader.result as string)?.split(',')[1];
                if (base64Data && isRecordingLoopRef.current) {
                  try {
                    const res = await fetch(`${API_URL}/reuniones-ai/${currentMeetingId}/audio-chunk`, {
                      method: 'POST',
                      headers: getHeaders,
                      body: JSON.stringify({ audioBase64: base64Data, mimeType })
                    });
                    if (res.ok) {
                      const data = await res.json();
                      if (data?.text && data.text.trim().length > 0) {
                        const cleanText = data.text.trim();
                        if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
                          setTranscript(prev => (prev ? prev + ' ' + cleanText : cleanText));
                        }
                      }
                    } else {
                      console.warn('Error en audio-chunk HTTP:', res.status);
                    }
                  } catch (err) {
                    console.warn('Error enviando chunk de audio a transcribir:', err);
                  }
                }
              };
            }
          }

          if (isRecordingLoopRef.current) {
            runCycle();
          }
        };

        recorder.start();

        // Ventana de 7s por bloque para frases más coherentes sin cortar palabras
        cycleTimeoutRef.current = setTimeout(() => {
          if (recorder.state === 'recording') {
            try { recorder.stop(); } catch (e) {}
          }
        }, 7000);

      } catch (err) {
        console.error('Error en ciclo de grabación de audio:', err);
      }
    };

    runCycle();
  };

  // Alternar Grabación con soporte de Audio de Llamada + Micrófono
  const toggleRecording = async (targetMode?: any) => {
    if (isRecording) {
      stopAllMedia();
      toast.success('Escucha pausada');
      return;
    }

    // Asegurar que si targetMode es un evento onClick de React, no se sobreescriba el modo
    const mode: AudioSourceMode = (typeof targetMode === 'string' && (targetMode === 'call_and_mic' || targetMode === 'mic_only'))
      ? targetMode
      : audioMode;

    if (mode === 'call_and_mic') {
      try {
        toast('Selecciona la pestaña de tu llamada (Meet / Zoom) y marca "Compartir audio"', {
          icon: '🎧',
          duration: 7000
        });

        // 1. Audio interno de la pestaña de la videollamada / sistema
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });

        // Detener inmediatamente la pista de video para no consumir CPU ni ancho de banda
        displayStream.getVideoTracks().forEach(t => t.stop());

        const audioTracks = displayStream.getAudioTracks();
        const hasCallAudio = audioTracks.length > 0;
        if (!hasCallAudio) {
          toast.error('⚠️ Atención: No marcaste "Compartir audio" en la ventana de Chrome. Solo se escuchará tu micrófono.', { duration: 7000 });
        }

        // 2. Audio de mi propio micrófono
        let micStream: MediaStream | null = null;
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true }
          });
        } catch (e) {
          console.warn('No se pudo acceder al micrófono personal:', e);
          toast.error('No se pudo acceder a tu micrófono local.');
        }

        // 3. Mezclador Web Audio API (unifica la voz de la llamada y tu propia voz)
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const destination = audioCtx.createMediaStreamDestination();

        if (hasCallAudio) {
          const sysSource = audioCtx.createMediaStreamSource(displayStream);
          sysSource.connect(destination);
          activeStreamsRef.current.push(displayStream);
        }

        if (micStream && micStream.getAudioTracks().length > 0) {
          const micSource = audioCtx.createMediaStreamSource(micStream);
          micSource.connect(destination);
          activeStreamsRef.current.push(micStream);
        }

        // 4. Iniciar bucle de grabación y transcripción con Gemini
        startDualAudioRecording(destination.stream);
        setIsRecording(true);

        toast.success(
          hasCallAudio 
            ? 'Escuchando llamada interna y tu micrófono simultáneamente 🎧🎙️' 
            : 'Escuchando tu micrófono 🎙️',
          { duration: 5000 }
        );

        // Si el usuario deja de compartir la pestaña en la barra de Chrome
        if (audioTracks[0]) {
          audioTracks[0].addEventListener('ended', () => {
            toast('Pestaña de videollamada desvinculada');
            stopAllMedia();
          });
        }

      } catch (err: any) {
        if (err.name !== 'NotAllowedError') {
          console.error('Error capturando audio de videollamada:', err);
          toast.error('Error al capturar audio de llamada: ' + err.message);
        }
        return;
      }
    } else {
      // Modo Micrófono Tradicional
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        toast.error('Tu navegador no soporta reconocimiento de voz nativo.');
        return;
      }

      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'es-PE';

        recognition.onstart = () => {
          setIsRecording(true);
          toast.success('Escuchando micrófono en segundo plano...', { icon: '🎙️' });
        };

        recognition.onresult = (event: any) => {
          let currentInterim = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const res = event.results[i];
            const textChunk = res[0].transcript;
            if (res.isFinal) {
              sendTranscriptChunk(textChunk);
              setInterimText('');
            } else {
              currentInterim += textChunk;
            }
          }
          setInterimText(currentInterim);
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'not-allowed') {
            toast.error('Permiso de micrófono denegado.');
            setIsRecording(false);
          }
        };

        recognition.onend = () => {
          if (isRecording && recognitionRef.current) {
            try { recognition.start(); } catch (e) {}
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (err: any) {
        toast.error('No se pudo acceder al micrófono: ' + err.message);
      }
    }
  };

  // Enviar chunk de transcripción
  const sendTranscriptChunk = async (text: string) => {
    if (!text.trim() || !meetingId) return;

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'transcript_chunk',
        meetingId,
        text: text.trim()
      }));
    } else {
      try {
        await fetch(`${API_URL}/reuniones-ai/${meetingId}/chunk`, {
          method: 'POST',
          headers: getHeaders,
          body: JSON.stringify({ text: text.trim() })
        });
      } catch (e) {}
      setTranscript(prev => (prev ? prev + ' ' + text.trim() : text.trim()));
    }
  };

  // Forzar análisis IA (vía REST garantizado para recibir respuesta actualizada incluso sin WS)
  const triggerAiAnalysis = async () => {
    if (!meetingId) return;
    setIsAiProcessing(true);
    try {
      const res = await fetch(`${API_URL}/reuniones-ai/${meetingId}/analizar`, {
        method: 'POST',
        headers: getHeaders
      });
      if (res.ok) {
        const data = await res.json();
        if (data.brief) {
          setBrief(prev => ({
            ...prev,
            ...data.brief,
            clienteId: prev.clienteId || data.brief.clienteId,
            tipoProyecto: prev.tipoProyectoManual ? (prev.tipoProyecto || data.brief.tipoProyecto) : (data.brief.tipoProyecto || prev.tipoProyecto)
          }));
        }
        if (data.questions) setQuestions(data.questions);
        if (data.transcript) setTranscript(data.transcript);
        toast.success('Brief re-analizado con IA (contexto completo)', { icon: '✨' });
      }
    } catch (e: any) {
      toast.error('Error al analizar el brief: ' + (e?.message || 'Error de red'));
    } finally {
      setIsAiProcessing(false);
    }
  };

  // Importar fuente multimodal (Texto/Correo/WhatsApp o Archivo PDF/Imagen/Word/Audio) a la sesión activa
  const importBriefSource = async (input: {
    text?: string;
    file?: File;
    sourceLabel?: string;
    replaceTranscript?: boolean;
  }): Promise<boolean> => {
    if (!meetingId) return false;
    setIsImportingSource(true);
    setIsAiProcessing(true);
    try {
      let res: Response;
      if (input.file) {
        const fd = new FormData();
        fd.append('file', input.file);
        if (input.text) fd.append('text', input.text);
        if (input.sourceLabel) fd.append('sourceLabel', input.sourceLabel);
        if (input.replaceTranscript) fd.append('replaceTranscript', 'true');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        res = await fetch(`${API_URL}/reuniones-ai/${meetingId}/import-source`, {
          method: 'POST',
          headers,
          body: fd
        });
      } else {
        res = await fetch(`${API_URL}/reuniones-ai/${meetingId}/import-source`, {
          method: 'POST',
          headers: getHeaders,
          body: JSON.stringify({
            text: input.text,
            sourceLabel: input.sourceLabel || 'Correo / WhatsApp / Notas',
            replaceTranscript: Boolean(input.replaceTranscript)
          })
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al procesar la fuente');
      }

      const data = await res.json();
      if (data.transcript) setTranscript(data.transcript);
      if (data.questions) setQuestions(data.questions);
      if (data.brief) {
        setBrief(prev => ({
          ...prev,
          ...data.brief,
          clienteId: prev.clienteId || data.brief.clienteId,
          tipoProyecto: prev.tipoProyectoManual ? (prev.tipoProyecto || data.brief.tipoProyecto) : (data.brief.tipoProyecto || prev.tipoProyecto)
        }));
      }
      toast.success(`Fuente "${data.sourceLabel || 'documento'}" analizada e integrada al Brief`, { icon: '📄' });
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo procesar la fuente importada');
      return false;
    } finally {
      setIsImportingSource(false);
      setIsAiProcessing(false);
    }
  };

  // Crear un nuevo Brief directamente desde Correo, WhatsApp, PDF, Imagen, Word o Audio
  const createBriefFromSource = async (input: {
    text?: string;
    file?: File;
    titulo?: string;
    clienteId?: string;
    sourceLabel?: string;
  }): Promise<boolean> => {
    setIsImportingSource(true);
    setIsAiProcessing(true);
    try {
      let res: Response;
      if (input.file) {
        const fd = new FormData();
        fd.append('file', input.file);
        if (input.text) fd.append('text', input.text);
        if (input.titulo) fd.append('titulo', input.titulo);
        if (input.clienteId) fd.append('clienteId', input.clienteId);
        if (input.sourceLabel) fd.append('sourceLabel', input.sourceLabel);
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        res = await fetch(`${API_URL}/reuniones-ai/from-source`, {
          method: 'POST',
          headers,
          body: fd
        });
      } else {
        res = await fetch(`${API_URL}/reuniones-ai/from-source`, {
          method: 'POST',
          headers: getHeaders,
          body: JSON.stringify({
            text: input.text,
            titulo: input.titulo,
            clienteId: input.clienteId,
            sourceLabel: input.sourceLabel || 'Correo / WhatsApp / Notas'
          })
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al generar el brief desde la fuente');
      }

      const data = await res.json();
      if (data.meeting) {
        setMeetingId(data.meeting.id);
        meetingIdRef.current = data.meeting.id;
        setMeetingTitle(data.brief?.nombreTentativoProyecto || data.meeting.titulo || 'Brief Generado con IA');
        setDeliverable(null);
        setCreatedProject(null);
        setCreatedQuote(null);
        setSecondsElapsed(0);
        setTranscript(data.transcript || data.meeting.transcripcion || '');
        if (data.brief) setBrief(data.brief);
        if (data.questions) setQuestions(data.questions);
        setIsActive(true);
        setIsMinimized(false);
        connectWebSocket(data.meeting.id);
        toast.success('¡Brief generado automáticamente desde fuente importada!', { icon: '✨' });
        return true;
      }
      return false;
    } catch (err: any) {
      toast.error(err?.message || 'Error al crear brief desde fuente');
      return false;
    } finally {
      setIsImportingSource(false);
      setIsAiProcessing(false);
    }
  };

  // Descartar pregunta formulada
  const handleDismissQuestion = (questionId: string) => {
    setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, respondida: true } : q));
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'dismiss_question',
        meetingId,
        questionId
      }));
    }
  };

  // Finalizar Reunión y Generar Cotización
  const handleFinishMeeting = async (requiereIdeaOverride?: boolean) => {
    if (!meetingId) return;
    setIsGeneratingDeliverable(true);
    try {
      if (isRecording) stopAllMedia();

      const reqIdea = requiereIdeaOverride !== undefined 
        ? requiereIdeaOverride 
        : (brief.requiereIdeaCreativa !== false);

      const targetDeliverableType = reqIdea ? 'INTEGRAL' : 'PRODUCCION';

      const res = await fetch(`${API_URL}/reuniones-ai/${meetingId}/finish`, {
        method: 'POST',
        headers: getHeaders,
        body: JSON.stringify({ 
          tipoEntregable: targetDeliverableType,
          requiereIdeaCreativa: reqIdea
        })
      });

      if (!res.ok) throw new Error('Error al generar entregable y cotización');

      const data = await res.json();
      setDeliverable(data.deliverable);
      setIsMinimized(false);
      toast.success('¡Entregables y desglose de cotización generados con éxito!', { icon: '✨' });
    } catch (err: any) {
      toast.error('Error generando entregables: ' + err.message);
    } finally {
      setIsGeneratingDeliverable(false);
    }
  };

  // Crear Proyecto y Cotización Oficial al terminar el brief
  const handleCreateProject = async (
    customCategories?: QuoteCategoryPayload[],
    customBrief?: Partial<SmartBriefData>
  ) => {
    if (!meetingId) return null;
    setIsCreatingProject(true);
    try {
      const briefToSave = customBrief ? { ...brief, ...customBrief } : brief;
      const categoriesToSave = customCategories || deliverable?.categoriasCotizacion;

      const res = await fetch(`${API_URL}/reuniones-ai/${meetingId}/convert-project`, {
        method: 'POST',
        headers: getHeaders,
        body: JSON.stringify({
          usuarioNombre: currentUser?.nombre || 'Eric Higa',
          customCategories: categoriesToSave,
          customBrief: briefToSave
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al crear proyecto y cotización');
      }

      const data = await res.json();
      setCreatedProject(data.project);
      if (data.quote) {
        setCreatedQuote(data.quote);
      }
      toast.success(`¡Proyecto "${data.project.nombre}" y Cotización oficial creados!`, {
        icon: '🎉',
        duration: 4000
      });
      await refreshData();
      return { project: data.project, quote: data.quote };
    } catch (err: any) {
      toast.error('Error al crear proyecto y cotización: ' + err.message);
      return null;
    } finally {
      setIsCreatingProject(false);
    }
  };

  // Minimizar y Maximizar
  const minimize = () => {
    setIsMinimized(true);
    toast('Smart Brief continúa en segundo plano 🎙️', {
      icon: '📌',
      duration: 3000
    });
  };

  const maximize = () => {
    setIsMinimized(false);
  };

  // Actualización manual del brief con sincronización inmediata a WebSocket
  const updateBriefManual = useCallback((updatedBrief: Partial<SmartBriefData>) => {
    setBrief(prev => {
      let nextSections = updatedBrief.seccionesBrief !== undefined ? updatedBrief.seccionesBrief : prev.seccionesBrief;

      // Si cambió el tipo de proyecto y no se pasaron secciones explícitas, migrar plantilla reactivamente
      if (updatedBrief.tipoProyecto && updatedBrief.tipoProyecto !== prev.tipoProyecto && updatedBrief.seccionesBrief === undefined) {
        nextSections = migrateBriefSectionsToNewTemplate(prev.seccionesBrief, updatedBrief.tipoProyecto, { ...prev, ...updatedBrief });
      }

      const next = { ...prev, ...updatedBrief, seccionesBrief: nextSections };
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && meetingId) {
        socketRef.current.send(JSON.stringify({
          type: 'update_brief_manual',
          payload: {
            meetingId,
            brief: next
          }
        }));
      }
      return next;
    });
  }, [meetingId]);

  // Generar propuesta creativa profunda con IA
  const generateCreativeIdea = async (): Promise<CreativeProposalDetailed | null> => {
    if (!meetingId) {
      toast.error('No hay una sesión de reunión activa');
      return null;
    }
    setIsGeneratingCreativeIdea(true);
    try {
      const res = await fetch(`${API_URL}/reuniones-ai/${meetingId}/generate-creative-idea`, {
        method: 'POST',
        headers: getHeaders
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al generar la propuesta creativa');
      }

      const data = await res.json();
      if (data.propuestaCreativa) {
        setBrief(prev => ({
          ...prev,
          propuestaCreativaDetallada: data.propuestaCreativa,
          mensajeClaveOConcepto: data.propuestaCreativa.bigIdea || prev.mensajeClaveOConcepto
        }));
        toast.success('¡Propuesta creativa desarrollada con éxito!');
        return data.propuestaCreativa;
      }
    } catch (err: any) {
      console.error('Error generando idea creativa:', err);
      toast.error('No se pudo generar la propuesta creativa: ' + err.message);
    } finally {
      setIsGeneratingCreativeIdea(false);
    }
    return null;
  };

  // Cerrar Reunión
  const closeMeeting = () => {
    if (isRecording) {
      if (!window.confirm('¿Seguro que deseas cerrar la sesión? La grabación se detendrá.')) {
        return;
      }
      stopAllMedia();
    }
    if (socketRef.current) socketRef.current.close();
    setIsActive(false);
    setIsMinimized(false);
  };

  return (
    <SmartMeetingContext.Provider
      value={{
        isActive,
        isMinimized,
        meetingId,
        meetingTitle,
        isRecording,
        audioMode,
        secondsElapsed,
        brief,
        questions,
        transcript,
        interimText,
        isAiProcessing,
        deliverable,
        createdProject,
        createdQuote,
        setCreatedQuote,
        isGeneratingDeliverable,
        isCreatingProject,
        isGeneratingCreativeIdea,
        isImportingSource,
        deliverableType,
        initialMeetLink,
        initialAttendees,
        startMeeting,
        loadExistingMeeting,
        toggleRecording,
        setAudioMode,
        minimize,
        maximize,
        closeMeeting,
        triggerAiAnalysis,
        sendTranscriptChunk,
        importBriefSource,
        createBriefFromSource,
        handleDismissQuestion,
        handleFinishMeeting,
        handleCreateProject,
        updateBriefManual,
        generateCreativeIdea,
        setBrief,
        setMeetingTitle,
        setDeliverableType
      }}
    >
      {children}
    </SmartMeetingContext.Provider>
  );
};

export const useSmartMeeting = () => {
  const context = useContext(SmartMeetingContext);
  if (!context) {
    throw new Error('useSmartMeeting debe ser usado dentro de un SmartMeetingProvider');
  }
  return context;
};
