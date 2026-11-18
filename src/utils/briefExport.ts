import type {
  SmartBriefData,
  BriefSeccionItem,
  LiveQuestion,
  RequerimientoBriefItem,
  QuoteCategoryPayload
} from '../context/SmartMeetingContext';

/**
 * Normaliza el nombre de categoría de actividad.
 */
function formatActivityName(tipo?: string): string {
  return (tipo || 'Activación').trim();
}

/**
 * Construye el mensaje breve y cordial listo para copiar y enviar al cliente por WhatsApp o correo
 * listando únicamente los vacíos reales necesarios para cotizar y programar.
 */
export function buildWhatsAppFollowupText(
  brief: SmartBriefData,
  pendingQuestions: LiveQuestion[] = [],
  sections: BriefSeccionItem[] = []
): string {
  if (brief.mensajeSeguimientoCliente && brief.mensajeSeguimientoCliente.trim().length > 25) {
    return brief.mensajeSeguimientoCliente.trim();
  }

  const contacto = brief.contactoNombre ? brief.contactoNombre.split(' ')[0] : '';
  const proyecto = brief.nombreTentativoProyecto || 'el proyecto';
  const locacion = brief.locaciones?.ciudad || (brief.locaciones?.lugares || []).join(', ');

  const bulletItems: string[] = [];

  for (const v of brief.vaciosCriticos || []) {
    if (v.punto?.trim()) bulletItems.push(v.punto.trim());
  }

  if (bulletItems.length === 0) {
    for (const q of pendingQuestions.filter(x => !x.respondida && x.prioridad === 'ALTA').slice(0, 5)) {
      bulletItems.push(q.pregunta.replace(/[¿?]/g, '').trim());
    }
  }

  if (bulletItems.length === 0) {
    const unanswered = sections
      .flatMap(s => s.preguntas || [])
      .filter(p => !p.respondida || !p.respuesta?.trim())
      .slice(0, 5);
    for (const p of unanswered) {
      bulletItems.push(p.pregunta.replace(/[¿?]/g, '').trim());
    }
  }

  const saludo = contacto ? `Hola ${contacto},` : 'Hola,';
  const cierreLoc = locacion ? ` en ${locacion}` : '';

  if (bulletItems.length === 0) {
    return `${saludo} gracias por el brief de *${proyecto}*${cierreLoc}. Estamos cerrando la cotización y propuesta para enviártela a la brevedad.`;
  }

  const lista = bulletItems.map((it, idx) => `${idx + 1}) ${it}`).join('\n');
  return `${saludo} gracias por la reunión sobre *${proyecto}*${cierreLoc}.\nPara enviarte la cotización exacta y cronograma, ¿me confirmas por favor estos puntos?\n\n${lista}\n\n¡Con eso cerramos los números al toque!`;
}

/**
 * Construye el documento completo en texto plano listo para pegar en Word / Google Docs / Notion.
 */
export function buildBriefWordText(
  brief: SmartBriefData,
  sections: BriefSeccionItem[],
  pendingQuestions: LiveQuestion[] = []
): string {
  const actName = formatActivityName(brief.tipoProyecto);
  const reqs = brief.requerimientosCuantificados || [];
  const locReal = [brief.locaciones?.ciudad, ...(brief.locaciones?.lugares || [])].filter(Boolean).join(' — ');

  const lines: string[] = [];
  lines.push(`BRIEF EJECUTIVO PURPLE BTL – ${actName.toUpperCase()}`);
  lines.push(`================================================================`);
  lines.push(`CLIENTE / EMPRESA: ${brief.clienteNombre || 'Por confirmar'}`);
  if (brief.marcaOProducto) lines.push(`MARCA / PRODUCTO: ${brief.marcaOProducto}`);
  lines.push(`PROYECTO: ${brief.nombreTentativoProyecto || 'Por definir'}`);
  lines.push(`ACTIVIDAD / SERVICIO: ${actName} | ${brief.tipoServicio || 'PURPLE STRATEGY & CREATIVITY'}`);
  lines.push(`LOCACIÓN DE EJECUCIÓN: ${locReal || 'Por confirmar'}`);
  if (brief.referenciasMencionadas?.length) {
    lines.push(`REFERENCIAS CITADAS (NO ES SEDE): ${brief.referenciasMencionadas.join('; ')}`);
  }
  lines.push(`FECHAS / HORARIO: ${brief.fechasTentativas?.inicio || 'Por confirmar'}${brief.fechasTentativas?.duracionJornada ? ` (${brief.fechasTentativas.duracionJornada})` : ''}`);
  lines.push(`PRESUPUESTO REF.: ${brief.presupuestoEstimado?.monto ? `${brief.presupuestoEstimado.moneda || 'PEN'} ${brief.presupuestoEstimado.monto}` : 'Por cotizar'}`);
  lines.push(`COMPLETITUD DEL BRIEF: ${brief.completitudPorcentaje || 0}%`);
  lines.push(`FECHA DE EMISIÓN: ${new Date().toLocaleDateString('es-PE')}`);
  lines.push('');

  if (brief.resumenEjecutivo) {
    lines.push(`RESUMEN EJECUTIVO`);
    lines.push(brief.resumenEjecutivo);
    lines.push('');
  }

  if (reqs.length > 0) {
    lines.push(`INVENTARIO DE REQUERIMIENTOS CUANTIFICADOS (${reqs.length} ítems)`);
    lines.push(`----------------------------------------------------------------`);
    reqs.forEach((r, idx) => {
      lines.push(
        `${idx + 1}. [${r.categoria}] ${r.cantidad}x ${r.item} — ${r.especificaciones}${r.jornadaOHorario ? ` | Horario: ${r.jornadaOHorario}` : ''}${r.locacion ? ` | Sede: ${r.locacion}` : ''} [${r.estado}]`
      );
    });
    lines.push('');
  }

  lines.push(`CUESTIONARIO DETALLADO DEL BRIEF (${actName.toUpperCase()})`);
  lines.push(`----------------------------------------------------------------`);
  sections.forEach(sec => {
    lines.push(`\n${sec.numeroRomano}. ${sec.titulo}`);
    sec.preguntas.forEach(q => {
      lines.push(`${q.numero}. ${q.pregunta}`);
      lines.push(`   Respuesta: ${q.respuesta?.trim() ? q.respuesta.trim() : '[Pendiente de confirmación]'}`);
    });
  });

  if (brief.handoffAreas) {
    const { cuentas, diseno, produccion, cotizacion } = brief.handoffAreas;
    if (cuentas?.length || diseno?.length || produccion?.length || cotizacion?.length) {
      lines.push('');
      lines.push(`PRÓXIMOS PASOS POR ÁREA (HANDOFF INTERNO)`);
      lines.push(`----------------------------------------------------------------`);
      if (cuentas?.length) lines.push(`- CUENTAS: ${cuentas.join(' | ')}`);
      if (diseno?.length) lines.push(`- DISEÑO: ${diseno.join(' | ')}`);
      if (produccion?.length) lines.push(`- PRODUCCIÓN: ${produccion.join(' | ')}`);
      if (cotizacion?.length) lines.push(`- COTIZACIÓN: ${cotizacion.join(' | ')}`);
    }
  }

  const whatsapp = buildWhatsAppFollowupText(brief, pendingQuestions, sections);
  if (whatsapp) {
    lines.push('');
    lines.push(`MENSAJE SUGERIDO PARA CLIENTE (WHATSAPP / CORREO)`);
    lines.push(`----------------------------------------------------------------`);
    lines.push(whatsapp);
  }

  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Abre una ventana optimizada lista para Imprimir / Guardar PDF del Brief completo.
 */
export function openPrintableBriefPdf(
  brief: SmartBriefData,
  sections: BriefSeccionItem[],
  pendingQuestions: LiveQuestion[] = []
) {
  const reqs = brief.requerimientosCuantificados || [];
  const locReal = [brief.locaciones?.ciudad, ...(brief.locaciones?.lugares || [])].filter(Boolean).join(' — ') || 'Por confirmar';
  const actName = formatActivityName(brief.tipoProyecto);
  const whatsappMsg = buildWhatsAppFollowupText(brief, pendingQuestions, sections);
  const vacios = brief.vaciosCriticos || [];

  const win = window.open('', '_blank', 'width=1020,height=780');
  if (!win) return;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Brief ${escapeHtml(brief.clienteNombre || '')} - ${escapeHtml(brief.nombreTentativoProyecto || 'SIG Purple')}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 20px;
      background: #ffffff;
      line-height: 1.45;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #7c3aed;
      padding-bottom: 14px;
      margin-bottom: 16px;
    }
    .brand-tag {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #7c3aed;
    }
    h1 { font-size: 20px; margin: 4px 0 4px 0; color: #1e1b4b; }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    .meta-box {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 8px 11px;
      background: #f8fafc;
    }
    .meta-label {
      font-size: 9.5px;
      text-transform: uppercase;
      font-weight: 700;
      color: #64748b;
    }
    .meta-value {
      font-size: 12.5px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 2px;
    }
    .summary-card {
      background: #faf5ff;
      border-left: 4px solid #7c3aed;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 18px;
      font-size: 12.5px;
    }
    h2 {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #6d28d9;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin: 18px 0 10px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11.5px;
      margin-bottom: 14px;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      font-weight: 700;
      color: #334155;
      font-size: 10.5px;
      text-transform: uppercase;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 800;
    }
    .badge-ok { background: #dcfce7; color: #166534; }
    .badge-warn { background: #fef3c7; color: #92400e; }
    .sec-title {
      background: #f5f3ff;
      color: #5b21b6;
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 800;
      margin: 12px 0 8px 0;
    }
    .q-row {
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px dashed #e2e8f0;
      font-size: 11.5px;
      page-break-inside: avoid;
    }
    .q-label { font-weight: 700; color: #1e293b; }
    .q-ans { margin-top: 2px; color: #334155; padding-left: 12px; }
    .q-pending { color: #b45309; font-style: italic; }
    .no-print {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-bottom: 14px;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()" style="background:#7c3aed;color:#fff;border:none;padding:9px 18px;border-radius:8px;font-weight:700;cursor:pointer;">
      Imprimir / Guardar PDF
    </button>
  </div>

  <div class="header">
    <div>
      <div class="brand-tag">Purple BTL S.A.C. · Brief Comercial & Operativo</div>
      <h1>${escapeHtml(brief.nombreTentativoProyecto || 'Proyecto SIG Purple')}</h1>
      <div style="font-size:12px;color:#475569;">
        <strong>Cliente:</strong> ${escapeHtml(brief.clienteNombre || 'Por definir')}
        ${brief.marcaOProducto ? ` · <strong>Marca:</strong> ${escapeHtml(brief.marcaOProducto)}` : ''}
        ${brief.subTipoActividad ? ` · <strong>Formato:</strong> ${escapeHtml(brief.subTipoActividad)}` : ''}
      </div>
    </div>
    <div style="text-align:right;font-size:11.5px;color:#475569;">
      <div><strong>Actividad:</strong> ${escapeHtml(actName)}</div>
      <div><strong>Línea:</strong> ${escapeHtml(brief.tipoServicio || 'PURPLE STRATEGY & CREATIVITY')}</div>
      <div><strong>Completitud:</strong> ${brief.completitudPorcentaje || 0}%</div>
      <div><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-PE')}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-box">
      <div class="meta-label">Locación Real de Ejecución</div>
      <div class="meta-value">${escapeHtml(locReal)}</div>
      ${brief.referenciasMencionadas?.length ? `<div style="font-size:10px;color:#64748b;margin-top:3px;">Ref. previa: ${escapeHtml(brief.referenciasMencionadas.join(', '))}</div>` : ''}
    </div>
    <div class="meta-box">
      <div class="meta-label">Fechas & Duración</div>
      <div class="meta-value">${escapeHtml(brief.fechasTentativas?.inicio || 'Por confirmar')}</div>
      ${brief.fechasTentativas?.duracionJornada ? `<div style="font-size:10.5px;color:#475569;margin-top:2px;">Jornada: ${escapeHtml(brief.fechasTentativas.duracionJornada)}</div>` : ''}
    </div>
    <div class="meta-box">
      <div class="meta-label">Presupuesto & Fecha Límite</div>
      <div class="meta-value">${brief.presupuestoEstimado?.monto ? `${escapeHtml(brief.presupuestoEstimado.moneda || 'PEN')} ${escapeHtml(String(brief.presupuestoEstimado.monto))}` : 'Por definir'}</div>
      ${brief.fechaLimitePropuesta ? `<div style="font-size:10.5px;color:#b45309;margin-top:2px;">Límite propuesta: ${escapeHtml(brief.fechaLimitePropuesta)}</div>` : ''}
    </div>
  </div>

  ${brief.resumenEjecutivo ? `
    <div class="summary-card">
      <strong style="color:#6d28d9;">Resumen Ejecutivo:</strong> ${escapeHtml(brief.resumenEjecutivo)}
    </div>
  ` : ''}

  ${reqs.length > 0 ? `
    <h2>Inventario Cuantificado de Requerimientos (${reqs.length} ítems)</h2>
    <table>
      <thead>
        <tr>
          <th style="width:12%;">Categoría</th>
          <th style="width:8%;">Cant.</th>
          <th style="width:26%;">Ítem / Elemento</th>
          <th>Especificaciones / Medidas / Horario</th>
          <th style="width:14%;">Estado</th>
        </tr>
      </thead>
      <tbody>
        ${reqs.map(r => `
          <tr>
            <td><strong>${escapeHtml(r.categoria)}</strong></td>
            <td style="text-align:center;font-weight:700;">${escapeHtml(String(r.cantidad))}</td>
            <td><strong>${escapeHtml(r.item)}</strong>${r.locacion ? `<div style="font-size:10px;color:#64748b;">${escapeHtml(r.locacion)}</div>` : ''}</td>
            <td>
              ${escapeHtml(r.especificaciones)}
              ${r.jornadaOHorario ? `<div style="font-size:10.5px;color:#475569;"><strong>Horario:</strong> ${escapeHtml(r.jornadaOHorario)}</div>` : ''}
            </td>
            <td>
              <span class="badge ${r.estado === 'CONFIRMADO' ? 'badge-ok' : 'badge-warn'}">${r.estado === 'CONFIRMADO' ? 'Confirmado' : 'Por confirmar'}</span>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : ''}

  ${(vacios.length > 0 || whatsappMsg) ? `
    <h2>Vacíos Críticos & Seguimiento al Cliente</h2>
    ${vacios.length > 0 ? `
      <table>
        <thead><tr><th>Dato Faltante</th><th>Impacto Operativo / Cotización</th><th>Prioridad</th></tr></thead>
        <tbody>
          ${vacios.map(v => `
            <tr>
              <td><strong>${escapeHtml(v.punto)}</strong></td>
              <td>${escapeHtml(v.impacto)}</td>
              <td><span class="badge ${v.prioridad === 'ALTA' ? 'badge-warn' : 'badge-ok'}">${escapeHtml(v.prioridad)}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}
    ${whatsappMsg ? `<div class="summary-card" style="background:#f0fdf4;border-left-color:#10b981;white-space:pre-line;"><strong style="color:#047857;">Borrador WhatsApp / Correo al Cliente:</strong>\n${escapeHtml(whatsappMsg)}</div>` : ''}
  ` : ''}

  <h2>Detalle del Brief Oficial (${escapeHtml(actName)})</h2>
  ${sections.map(sec => `
    <div class="sec-title">${escapeHtml(sec.numeroRomano)}. ${escapeHtml(sec.titulo)}</div>
    ${sec.preguntas.map(q => `
      <div class="q-row">
        <div class="q-label">${q.numero}. ${escapeHtml(q.pregunta)}</div>
        <div class="q-ans ${q.respuesta?.trim() ? '' : 'q-pending'}">${q.respuesta?.trim() ? escapeHtml(q.respuesta) : 'Pendiente de confirmación por el cliente'}</div>
      </div>
    `).join('')}
  `).join('')}

</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

/**
 * Convierte requerimientos cuantificados del Brief en categorías listas para CotizacionBuilder.
 */
export function convertBriefRequirementsToQuoteCategories(
  reqs: RequerimientoBriefItem[],
  ciudadDefault?: string
): QuoteCategoryPayload[] {
  const categoryLabels: Record<RequerimientoBriefItem['categoria'], string> = {
    PRODUCCION: '1. PRODUCCIÓN, ESTRUCTURAS & DECORACIÓN',
    AUDIOVISUAL: '2. AUDIOVISUAL, SONIDO & PANTALLAS',
    STAFF: '3. PERSONAL OPERATIVO, ANIMACIÓN & TALENTO',
    MERCHANDISING: '4. MERCHANDISING & MATERIAL IMPRESO',
    CATERING: '5. CATERING & ALIMENTOS',
    LOGISTICA: '6. LOGÍSTICA, FLETE & PERMISOS',
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

  const grouped = new Map<RequerimientoBriefItem['categoria'], QuoteCategoryPayload['items']>();
  for (const r of reqs) {
    const qty = typeof r.cantidad === 'number'
      ? Math.max(1, r.cantidad)
      : Math.max(1, parseFloat(String(r.cantidad).replace(/[^0-9.]/g, '')) || 1);
    const unitCost = defaultCosts[r.categoria] || 300;
    const details = [
      ` - 01 ${r.item}${typeof r.cantidad === 'string' && isNaN(Number(r.cantidad)) ? ` (${r.cantidad})` : ''}.`,
      ` - Especificaciones: ${r.especificaciones}`,
      ...(r.jornadaOHorario ? [` - Horario / Duración: ${r.jornadaOHorario}`] : []),
      ...((r.locacion || ciudadDefault) ? [` - Punto / Locación: ${r.locacion || ciudadDefault}`] : [])
    ];

    const list = grouped.get(r.categoria) || [];
    list.push({
      name: r.item.toUpperCase(),
      quantity: qty,
      dates: 1,
      details,
      internalMultiplierPercent: 10,
      financialExpensePercent: 10,
      subItems: [
        {
          name: r.item,
          description: r.especificaciones,
          quantity: qty,
          dates: 1,
          unitCost,
          providerName: 'Proveedor por asignar'
        },
        {
          name: 'Imprevistos',
          description: 'Contingencia de producción',
          quantity: 1,
          dates: 1,
          unitCost: Math.max(30, Math.round(unitCost * qty * 0.08)),
          providerName: 'Reserva Purple'
        }
      ]
    });
    grouped.set(r.categoria, list);
  }

  const order: RequerimientoBriefItem['categoria'][] = [
    'PRODUCCION', 'AUDIOVISUAL', 'STAFF', 'MERCHANDISING', 'CATERING', 'LOGISTICA', 'DISENO'
  ];

  const categories: QuoteCategoryPayload[] = [];
  for (const k of order) {
    const items = grouped.get(k);
    if (items && items.length > 0) {
      categories.push({ name: categoryLabels[k], items });
    }
  }
  return categories;
}

