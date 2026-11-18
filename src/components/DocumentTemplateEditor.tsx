import React, { useState } from 'react';
import { 
  Palette, 
  Code, 
  Sparkles, 
  Eye, 
  Printer, 
  Plus, 
  Trash2, 
  FileText, 
  Building2, 
  Save, 
  Loader2
} from 'lucide-react';
import { 
  replaceDocumentVariables, 
  buildHeaderHtmlFromVisual, 
  buildFooterHtmlFromVisual,
  DEFAULT_ORDEN_VISUAL_CONFIG,
  DEFAULT_PAGO_VISUAL_CONFIG,
  SAMPLE_ORDEN_PREVIEW,
  SAMPLE_PAGO_PREVIEW,
  type VisualTemplateConfig 
} from '../utils/documentTemplateHelper';
import toast from 'react-hot-toast';

interface Props {
  ordenHeaderHtml: string;
  setOrdenHeaderHtml: (val: string) => void;
  ordenFooterHtml: string;
  setOrdenFooterHtml: (val: string) => void;
  pagoHeaderHtml: string;
  setPagoHeaderHtml: (val: string) => void;
  pagoFooterHtml: string;
  setPagoFooterHtml: (val: string) => void;
  ordenVisual: VisualTemplateConfig;
  setOrdenVisual: React.Dispatch<React.SetStateAction<VisualTemplateConfig>>;
  pagoVisual: VisualTemplateConfig;
  setPagoVisual: React.Dispatch<React.SetStateAction<VisualTemplateConfig>>;
  onSave: () => Promise<void>;
  isSaving?: boolean;
}

type DocType = 'orden' | 'pago';
type EditMode = 'visual' | 'code' | 'presets';

const COLOR_PALETTES = [
  { name: 'Púrpura SIG', color: '#7c3aed' },
  { name: 'Azul Real', color: '#2563eb' },
  { name: 'Verde Esmeralda', color: '#059669' },
  { name: 'Rojo Carmesí', color: '#dc2626' },
  { name: 'Pizarra / Grafito', color: '#334155' },
  { name: 'Negro Elegante', color: '#111827' }
];

const AVAILABLE_VARIABLES = [
  { tag: '{{TITULO_DOCUMENTO}}', desc: 'Nombre del doc. (ej. ORDEN DE COMPRA)' },
  { tag: '{{NUMERO_DOCUMENTO}}', desc: 'ID o Código del documento (ej. OC-2026-001)' },
  { tag: '{{FECHA_DOCUMENTO}}', desc: 'Fecha de emisión o registro' },
  { tag: '{{TITULO_ORDEN}}', desc: 'Concepto / Título a qué refiere el documento' },
  { tag: '{{PROVEEDOR_NOMBRE}}', desc: 'Razón Social o Nombre del Proveedor' },
  { tag: '{{PROVEEDOR_RUC}}', desc: 'RUC del Proveedor' },
  { tag: '{{PROYECTO_NOMBRE}}', desc: 'Nombre del Proyecto Vinculado' },
  { tag: '{{CLIENTE_NOMBRE}}', desc: 'Empresa Cliente' },
  { tag: '{{CONDICIONES_PAGO}}', desc: 'Condición pactada (ej. 50/50, Contado)' },
  { tag: '{{TOTAL}}', desc: 'Monto total formateado (ej. S/ 4,500.00)' }
];

export const DocumentTemplateEditor: React.FC<Props> = ({
  ordenHeaderHtml,
  setOrdenHeaderHtml,
  ordenFooterHtml,
  setOrdenFooterHtml,
  pagoHeaderHtml,
  setPagoHeaderHtml,
  pagoFooterHtml,
  setPagoFooterHtml,
  ordenVisual,
  setOrdenVisual,
  pagoVisual,
  setPagoVisual,
  onSave,
  isSaving = false
}) => {
  const [docType, setDocType] = useState<DocType>('orden');
  const [editMode, setEditMode] = useState<EditMode>('visual');
  const [codeSection, setCodeSection] = useState<'header' | 'footer'>('header');
  const [zoomLevel, setZoomLevel] = useState<'fit' | '100%'>('fit');

  const activeVisual = docType === 'orden' ? ordenVisual : pagoVisual;

  // Actualizar un campo visual y AUTO-SINCRONIZAR con el HTML correspondiente
  const updateVisualField = (field: keyof VisualTemplateConfig, value: any) => {
    if (docType === 'orden') {
      const next = { ...ordenVisual, [field]: value };
      setOrdenVisual(next);
      setOrdenHeaderHtml(buildHeaderHtmlFromVisual(next));
      setOrdenFooterHtml(buildFooterHtmlFromVisual(next));
    } else {
      const next = { ...pagoVisual, [field]: value };
      setPagoVisual(next);
      setPagoHeaderHtml(buildHeaderHtmlFromVisual(next));
      setPagoFooterHtml(buildFooterHtmlFromVisual(next));
    }
  };

  // HTML actual según el documento seleccionado
  const currentHeaderHtml = docType === 'orden' ? ordenHeaderHtml : pagoHeaderHtml;
  const currentFooterHtml = docType === 'orden' ? ordenFooterHtml : pagoFooterHtml;

  const setCurrentHeaderHtml = (val: string) => {
    if (docType === 'orden') setOrdenHeaderHtml(val);
    else setPagoHeaderHtml(val);
  };

  const setCurrentFooterHtml = (val: string) => {
    if (docType === 'orden') setOrdenFooterHtml(val);
    else setPagoFooterHtml(val);
  };

  // Cargar Presets Predefinidos
  const handleLoadPreset = (presetName: 'purple' | 'corporativo' | 'minimal') => {
    let newCfg: VisualTemplateConfig;
    if (presetName === 'purple') {
      newCfg = docType === 'orden' ? { ...DEFAULT_ORDEN_VISUAL_CONFIG } : { ...DEFAULT_PAGO_VISUAL_CONFIG };
    } else if (presetName === 'corporativo') {
      newCfg = {
        ...(docType === 'orden' ? DEFAULT_ORDEN_VISUAL_CONFIG : DEFAULT_PAGO_VISUAL_CONFIG),
        accentColor: '#1e3a8a',
        terminos: [
          'La emisión de comprobantes de pago debe remitirse con el XML y PDF válidos ante SUNAT.',
          'La recepción física del material o servicio requerirá la suscripción de la guía o acta de conformidad.',
          'Toda retención o detracción será deducida conforme a la normativa tributaria vigente.'
        ],
        mostrarFirmas: true,
        cargoIzquierda: 'Gerencia de Finanzas y Control de Gestión',
        cargoDerecha: 'Representante Legal del Proveedor'
      };
    } else {
      // Minimal
      newCfg = {
        ...(docType === 'orden' ? DEFAULT_ORDEN_VISUAL_CONFIG : DEFAULT_PAGO_VISUAL_CONFIG),
        accentColor: '#0f172a',
        terminos: [
          'Facturación electrónica con orden adjunta.',
          'Pagos programados sujetos a conformidad de entrega.'
        ],
        mostrarFirmas: false
      };
    }

    if (docType === 'orden') {
      setOrdenVisual(newCfg);
      setOrdenHeaderHtml(buildHeaderHtmlFromVisual(newCfg));
      setOrdenFooterHtml(buildFooterHtmlFromVisual(newCfg));
    } else {
      setPagoVisual(newCfg);
      setPagoHeaderHtml(buildHeaderHtmlFromVisual(newCfg));
      setPagoFooterHtml(buildFooterHtmlFromVisual(newCfg));
    }
    toast.success(`Plantilla "${presetName.toUpperCase()}" cargada y aplicada.`);
  };

  // Insertar variable en el textarea de código
  const handleInsertVariable = (tag: string) => {
    if (codeSection === 'header') {
      setCurrentHeaderHtml(currentHeaderHtml + ' ' + tag);
    } else {
      setCurrentFooterHtml(currentFooterHtml + ' ' + tag);
    }
    toast.success(`Variable ${tag} añadida al editor.`);
  };

  // Agregar término al asistente visual
  const handleAddTermino = () => {
    updateVisualField('terminos', [...activeVisual.terminos, 'Nueva cláusula o instrucción de facturación/pago...']);
  };

  // Modificar término
  const handleUpdateTermino = (idx: number, text: string) => {
    const copy = [...activeVisual.terminos];
    copy[idx] = text;
    updateVisualField('terminos', copy);
  };

  // Eliminar término
  const handleRemoveTermino = (idx: number) => {
    updateVisualField('terminos', activeVisual.terminos.filter((_, i) => i !== idx));
  };

  // Variables para la vista previa en vivo
  const sampleData = docType === 'orden' ? SAMPLE_ORDEN_PREVIEW : SAMPLE_PAGO_PREVIEW;
  const safeTotalNum = Number((sampleData as any).total ?? (sampleData as any).monto) || 0;
  
  const previewVars = {
    tituloDocumento: sampleData.documentTitle,
    numeroDocumento: sampleData.documentNumber,
    fechaDocumento: sampleData.documentDate,
    titulo: sampleData.concepto,
    proveedorNombre: sampleData.proveedor.razonSocial,
    proveedorRuc: sampleData.proveedor.ruc,
    clienteNombre: sampleData.cliente.empresa,
    proyectoNombre: sampleData.cliente.proyecto,
    condicionesPago: sampleData.cliente.condiciones,
    total: `S/ ${safeTotalNum.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    moneda: 'PEN'
  };

  const renderedPreviewHeader = replaceDocumentVariables(currentHeaderHtml, previewVars);
  const renderedPreviewFooter = replaceDocumentVariables(currentFooterHtml, previewVars);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* BARRA SUPERIOR DE SELECTOR DE DOCUMENTO Y ACCIONES */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
        
        {/* Selector de Tipo de Documento */}
        <div style={{ display: 'flex', gap: '8px', background: 'rgba(255, 255, 255, 0.04)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setDocType('orden')}
            style={{
              background: docType === 'orden' ? 'var(--accent-primary)' : 'transparent',
              color: docType === 'orden' ? '#fff' : 'var(--text-secondary)',
              borderColor: 'transparent',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <FileText size={16} />
            <span>Orden de Compra / Servicio</span>
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setDocType('pago')}
            style={{
              background: docType === 'pago' ? 'var(--accent-primary)' : 'transparent',
              color: docType === 'pago' ? '#fff' : 'var(--text-secondary)',
              borderColor: 'transparent',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Building2 size={16} />
            <span>Pago a Proveedor</span>
          </button>
        </div>

        {/* Modo de Edición */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '6px', background: 'rgba(255, 255, 255, 0.03)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <button
              type="button"
              className="btn-icon"
              onClick={() => setEditMode('visual')}
              title="Modo Diseñador Visual / Asistente"
              style={{
                background: editMode === 'visual' ? 'rgba(124, 58, 237, 0.2)' : 'transparent',
                color: editMode === 'visual' ? '#a78bfa' : 'var(--text-muted)',
                padding: '6px 12px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                width: 'auto',
                borderRadius: '6px'
              }}
            >
              <Palette size={14} />
              <span>Diseñador Visual</span>
            </button>

            <button
              type="button"
              className="btn-icon"
              onClick={() => setEditMode('code')}
              title="Modo Código HTML Directo"
              style={{
                background: editMode === 'code' ? 'rgba(124, 58, 237, 0.2)' : 'transparent',
                color: editMode === 'code' ? '#a78bfa' : 'var(--text-muted)',
                padding: '6px 12px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                width: 'auto',
                borderRadius: '6px'
              }}
            >
              <Code size={14} />
              <span>Código HTML</span>
            </button>

            <button
              type="button"
              className="btn-icon"
              onClick={() => setEditMode('presets')}
              title="Plantillas y Estilos Prediseñados"
              style={{
                background: editMode === 'presets' ? 'rgba(124, 58, 237, 0.2)' : 'transparent',
                color: editMode === 'presets' ? '#a78bfa' : 'var(--text-muted)',
                padding: '6px 12px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                width: 'auto',
                borderRadius: '6px'
              }}
            >
              <Sparkles size={14} />
              <span>Plantillas</span>
            </button>
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={onSave}
            disabled={isSaving}
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '9px 20px', 
              backgroundColor: 'var(--success)', 
              borderColor: 'var(--success)', 
              fontWeight: 600,
              cursor: isSaving ? 'wait' : 'pointer'
            }}
          >
            {isSaving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>Guardar Plantillas</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* ÁREA DE TRABAJO: PANEL DE EDICIÓN (IZQUIERDA) Y VISTA PREVIA A4 (DERECHA) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: '24px', alignItems: 'start' }}>
        
        {/* PANEL IZQUIERDO: CONTROLES DE EDICIÓN */}
        <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '820px', overflowY: 'auto' }}>
          
          {/* MODO 1: ASISTENTE VISUAL */}
          {editMode === 'visual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '15px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Palette size={18} color="var(--accent-primary)" />
                  Diseñador Visual ({docType === 'orden' ? 'Orden de Compra' : 'Pago a Proveedor'})
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                  Los cambios se sincronizan en tiempo real con el documento. Al terminar haz clic en <strong>Guardar Plantillas</strong>.
                </p>
              </div>

              {/* 1. Logotipo y Color */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h4 style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  1. Logotipo y Color Institucional
                </h4>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11px' }}>URL del Logotipo:</label>
                  <input
                    type="text"
                    className="form-control"
                    value={activeVisual.logoUrl}
                    onChange={e => updateVisualField('logoUrl', e.target.value)}
                    placeholder="https://..."
                    style={{ fontSize: '12px' }}
                  />
                  {activeVisual.logoUrl && (
                    <div style={{ marginTop: '8px', padding: '6px 12px', background: '#fff', borderRadius: '6px', display: 'inline-block' }}>
                      <img src={activeVisual.logoUrl} alt="Vista previa logo" style={{ maxHeight: '35px', maxWidth: '140px', objectFit: 'contain' }} />
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11px' }}>Color de Acento del Documento:</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '4px' }}>
                    {COLOR_PALETTES.map(p => (
                      <button
                        key={p.color}
                        type="button"
                        onClick={() => updateVisualField('accentColor', p.color)}
                        title={p.name}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: p.color,
                          border: activeVisual.accentColor === p.color ? '3px solid white' : '2px solid transparent',
                          boxShadow: activeVisual.accentColor === p.color ? '0 0 0 2px ' + p.color : 'none',
                          cursor: 'pointer'
                        }}
                      />
                    ))}
                    <input
                      type="color"
                      value={activeVisual.accentColor}
                      onChange={e => updateVisualField('accentColor', e.target.value)}
                      style={{ width: '32px', height: '32px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'transparent' }}
                      title="Elegir color personalizado"
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {activeVisual.accentColor}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Datos de la Empresa Emisora */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  2. Datos de la Empresa Emisora (Encabezado)
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11px' }}>Razón Social:</label>
                    <input
                      type="text"
                      className="form-control"
                      value={activeVisual.empresaNombre}
                      onChange={e => updateVisualField('empresaNombre', e.target.value)}
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11px' }}>RUC:</label>
                    <input
                      type="text"
                      className="form-control"
                      value={activeVisual.empresaRuc}
                      onChange={e => updateVisualField('empresaRuc', e.target.value)}
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11px' }}>Dirección:</label>
                  <input
                    type="text"
                    className="form-control"
                    value={activeVisual.empresaDireccion}
                    onChange={e => updateVisualField('empresaDireccion', e.target.value)}
                    style={{ fontSize: '12px' }}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11px' }}>Contacto / Correo / Teléfono:</label>
                  <input
                    type="text"
                    className="form-control"
                    value={activeVisual.empresaContacto}
                    onChange={e => updateVisualField('empresaContacto', e.target.value)}
                    style={{ fontSize: '12px' }}
                  />
                </div>
              </div>

              {/* 3. Términos y Condiciones Predeterminados */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    3. Términos y Condiciones Predeterminados
                  </h4>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleAddTermino}
                    style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Plus size={12} /> Añadir Cláusula
                  </button>
                </div>

                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                  Aparecen impresos en la parte inferior de cada {docType === 'orden' ? 'orden generada' : 'comprobante de pago'}:
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {activeVisual.terminos.map((term, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: '16px' }}>{i + 1}.</span>
                      <input
                        type="text"
                        className="form-control"
                        value={term}
                        onChange={e => handleUpdateTermino(i, e.target.value)}
                        style={{ fontSize: '12px', flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => handleRemoveTermino(i)}
                        title="Eliminar cláusula"
                        style={{ color: 'var(--danger)', padding: '4px' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. Bloque de Firmas y Conformidades */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    4. Bloque de Firmas y Sellos
                  </h4>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={activeVisual.mostrarFirmas}
                      onChange={e => updateVisualField('mostrarFirmas', e.target.checked)}
                    />
                    <span>Incluir Bloque de Firmas</span>
                  </label>
                </div>

                {activeVisual.mostrarFirmas && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ background: 'rgba(0,0,0,0.1)', padding: '10px', borderRadius: '6px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Firma Izquierda (Empresa):</label>
                      <input
                        type="text"
                        className="form-control"
                        value={activeVisual.firmaIzquierda}
                        onChange={e => updateVisualField('firmaIzquierda', e.target.value)}
                        style={{ fontSize: '12px', marginBottom: '6px' }}
                      />
                      <input
                        type="text"
                        className="form-control"
                        value={activeVisual.cargoIzquierda}
                        onChange={e => updateVisualField('cargoIzquierda', e.target.value)}
                        placeholder="Cargo o Área"
                        style={{ fontSize: '11px' }}
                      />
                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.1)', padding: '10px', borderRadius: '6px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Firma Derecha (Proveedor):</label>
                      <input
                        type="text"
                        className="form-control"
                        value={activeVisual.firmaDerecha}
                        onChange={e => updateVisualField('firmaDerecha', e.target.value)}
                        style={{ fontSize: '12px', marginBottom: '6px' }}
                      />
                      <input
                        type="text"
                        className="form-control"
                        value={activeVisual.cargoDerecha}
                        onChange={e => updateVisualField('cargoDerecha', e.target.value)}
                        placeholder="Cargo o Proveedor"
                        style={{ fontSize: '11px' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Botón Guardar Directo */}
              <button
                type="button"
                className="btn-primary"
                onClick={onSave}
                disabled={isSaving}
                style={{ padding: '12px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: 'var(--success)', borderColor: 'var(--success)', fontWeight: 600 }}
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                <span>Guardar Modificaciones en Base de Datos</span>
              </button>
            </div>
          )}

          {/* MODO 2: EDITOR DE CÓDIGO HTML DIRECTO */}
          {editMode === 'code' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '15px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Code size={18} color="var(--accent-primary)" />
                  Editor de Código HTML Directo
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                  Edita las etiquetas, estilos CSS en línea o la maquetación exacta del encabezado y pie de página.
                </p>
              </div>

              {/* Selector de Sección de Código */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCodeSection('header')}
                  style={{
                    background: codeSection === 'header' ? 'rgba(124, 58, 237, 0.2)' : 'transparent',
                    color: codeSection === 'header' ? '#a78bfa' : 'var(--text-secondary)',
                    borderColor: codeSection === 'header' ? 'var(--accent-primary)' : 'var(--border-color)',
                    fontSize: '12px',
                    padding: '6px 14px'
                  }}
                >
                  Encabezado (Header HTML)
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCodeSection('footer')}
                  style={{
                    background: codeSection === 'footer' ? 'rgba(124, 58, 237, 0.2)' : 'transparent',
                    color: codeSection === 'footer' ? '#a78bfa' : 'var(--text-secondary)',
                    borderColor: codeSection === 'footer' ? 'var(--accent-primary)' : 'var(--border-color)',
                    fontSize: '12px',
                    padding: '6px 14px'
                  }}
                >
                  Pie de Página y Términos (Footer HTML)
                </button>
              </div>

              {/* Chips de Variables Dinámicas */}
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' }}>
                  Variables Disponibles (Clic para insertar en el código):
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {AVAILABLE_VARIABLES.map(v => (
                    <button
                      key={v.tag}
                      type="button"
                      onClick={() => handleInsertVariable(v.tag)}
                      title={v.desc}
                      style={{
                        background: 'rgba(124, 58, 237, 0.1)',
                        border: '1px solid rgba(124, 58, 237, 0.3)',
                        color: '#c4b5fd',
                        borderRadius: '4px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        cursor: 'pointer'
                      }}
                    >
                      + {v.tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea HTML */}
              <div className="form-group" style={{ margin: 0 }}>
                <textarea
                  className="form-control"
                  rows={17}
                  value={codeSection === 'header' ? currentHeaderHtml : currentFooterHtml}
                  onChange={e => codeSection === 'header' ? setCurrentHeaderHtml(e.target.value) : setCurrentFooterHtml(e.target.value)}
                  placeholder="Escribe el código HTML con estilos CSS en línea..."
                  style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: '12px', lineHeight: '1.45', whiteSpace: 'pre', background: '#090d16', color: '#e2e8f0' }}
                />
              </div>

              <button
                type="button"
                className="btn-primary"
                onClick={onSave}
                disabled={isSaving}
                style={{ padding: '12px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: 'var(--success)', borderColor: 'var(--success)', fontWeight: 600 }}
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                <span>Guardar Cambios de Código HTML</span>
              </button>
            </div>
          )}

          {/* MODO 3: PRESETS / PLANTILLAS PREDISEÑADAS */}
          {editMode === 'presets' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '15px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={18} color="var(--accent-primary)" />
                  Plantillas Prediseñadas
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                  Selecciona un estilo predeterminado para renovar visualmente el formato de tus {docType === 'orden' ? 'órdenes' : 'pagos'}:
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ border: '1.5px solid #7c3aed', background: 'rgba(124, 58, 237, 0.05)', borderRadius: '10px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--text-primary)', fontSize: '14px' }}>
                      🟣 Plantilla Oficial SIG Purple (Recomendada)
                    </h4>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                      Color institucional púrpura, recuadro de términos de facturación y bloque de firmas dobles para administración y proveedor.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleLoadPreset('purple')}
                    style={{ fontSize: '12px', padding: '8px 14px' }}
                  >
                    Cargar Esta
                  </button>
                </div>

                <div style={{ border: '1px solid var(--border-color)', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '10px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--text-primary)', fontSize: '14px' }}>
                      🔵 Plantilla Corporativa Ejecutiva
                    </h4>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                      Acento azul marino, términos formales de retenciones/detracciones y sellos de conformidad de servicio.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleLoadPreset('corporativo')}
                    style={{ fontSize: '12px', padding: '8px 14px' }}
                  >
                    Cargar Esta
                  </button>
                </div>

                <div style={{ border: '1px solid var(--border-color)', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '10px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--text-primary)', fontSize: '14px' }}>
                      ⚪ Plantilla Minimalista Limpia
                    </h4>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                      Diseño ligero en escala de grises, ideal para impresiones rápidas sin bloques pesados de firmas.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleLoadPreset('minimal')}
                    style={{ fontSize: '12px', padding: '8px 14px' }}
                  >
                    Cargar Esta
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* PANEL DERECHO: VISTA PREVIA A4 EN VIVO */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Eye size={16} color="var(--accent-primary)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Vista Previa 1:1 en Hoja A4 ({docType === 'orden' ? 'Orden de Compra' : 'Pago a Proveedor'})
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setZoomLevel(prev => prev === 'fit' ? '100%' : 'fit')}
                style={{ fontSize: '11px', padding: '4px 10px' }}
              >
                Zoom: {zoomLevel === 'fit' ? 'Ajustar' : '100%'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => window.print()}
                style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Printer size={13} /> Probar Impresión
              </button>
            </div>
          </div>

          {/* CONTENEDOR DE HOJA A4 */}
          <div style={{
            background: '#334155',
            padding: '24px',
            borderRadius: '12px',
            overflowY: 'auto',
            maxHeight: '820px',
            display: 'flex',
            justifyContent: 'center'
          }}>
            <div style={{
              background: '#ffffff',
              color: '#1e293b',
              width: '100%',
              maxWidth: zoomLevel === 'fit' ? '100%' : '794px',
              minHeight: '1123px',
              padding: '36px',
              boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
              fontFamily: 'Arial, Helvetica, sans-serif',
              fontSize: '12px',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box'
            }}>
              
              {/* 1. ENCABEZADO RENDERIZADO */}
              {renderedPreviewHeader ? (
                <div dangerouslySetInnerHTML={{ __html: renderedPreviewHeader }} />
              ) : (
                <div style={{ padding: '16px', background: '#f1f5f9', border: '1px dashed #cbd5e1', textAlign: 'center', color: '#94a3b8', marginBottom: '20px' }}>
                  [Encabezado no configurado]
                </div>
              )}

              {/* 2. BANNER DE CONCEPTO / REFIERE A */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: `5px solid ${activeVisual.accentColor || '#7c3aed'}`, padding: '10px 16px', borderRadius: '6px', marginBottom: '18px' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                  Concepto / Refiere a:
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                  {sampleData.concepto}
                </span>
              </div>

              {/* 3. PARRILLA DE PROVEEDOR Y CLIENTE */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px' }}>
                <div style={{ background: '#f9fafb', padding: '12px 14px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                  <h4 style={{ margin: '0 0 6px', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Proveedor</h4>
                  <p style={{ margin: '2px 0', fontWeight: 'bold', fontSize: '12px', color: '#111827' }}>{sampleData.proveedor.razonSocial}</p>
                  <p style={{ margin: '2px 0', fontSize: '11px', color: '#4b5563' }}>RUC: {sampleData.proveedor.ruc}</p>
                  <p style={{ margin: '2px 0', fontSize: '11px', color: '#4b5563' }}>{sampleData.proveedor.direccion}</p>
                  <p style={{ margin: '2px 0', fontSize: '11px', color: '#4b5563' }}>{sampleData.proveedor.correo}</p>
                </div>

                <div style={{ background: '#f9fafb', padding: '12px 14px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                  <h4 style={{ margin: '0 0 6px', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cliente / Proyecto</h4>
                  <p style={{ margin: '2px 0', fontWeight: 'bold', fontSize: '12px', color: '#111827' }}>{sampleData.cliente.empresa}</p>
                  <p style={{ margin: '2px 0', fontSize: '11px', color: '#4b5563' }}>Proyecto: <strong>{sampleData.cliente.proyecto}</strong></p>
                  <p style={{ margin: '2px 0', fontSize: '11px', color: '#4b5563' }}>Condiciones: {sampleData.cliente.condiciones}</p>
                </div>
              </div>

              {/* 4. INFORMACIÓN BANCARIA */}
              <div style={{ background: '#f9fafb', padding: '10px 14px', borderRadius: '6px', border: '1px solid #e5e7eb', marginBottom: '18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' }}>Condiciones de Pago</h4>
                  <p style={{ margin: '2px 0', fontSize: '11px', color: '#1f2937' }}>{sampleData.cliente.condiciones}</p>
                </div>
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' }}>Información Bancaria</h4>
                  <p style={{ margin: '1px 0', fontSize: '11px', color: '#1f2937' }}><strong>Banco:</strong> {sampleData.proveedor.banco}</p>
                  <p style={{ margin: '1px 0', fontSize: '11px', color: '#1f2937' }}><strong>Cuenta:</strong> {sampleData.proveedor.cuenta}</p>
                  <p style={{ margin: '1px 0', fontSize: '11px', color: '#1f2937' }}><strong>CCI:</strong> {sampleData.proveedor.cci}</p>
                </div>
              </div>

              {/* 5. TABLA O DESGLOSE ESPECÍFICO SEGÚN TIPO */}
              {docType === 'orden' ? (
                <>
                  {/* TABLA DE ÍTEMS DE ORDEN */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '18px', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ background: activeVisual.accentColor || '#7c3aed', color: 'white' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Descripción</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: '50px' }}>Cant.</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: '85px' }}>P. Unit.</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: '95px' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SAMPLE_ORDEN_PREVIEW.items.map((it, idx) => (
                        <tr key={idx} style={{ background: idx % 2 === 0 ? '#f9fafb' : '#ffffff' }}>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>{it.descripcion}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>{it.cant}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>S/ {it.unit.toFixed(2)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>S/ {it.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* TOTALES DE LA ORDEN */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                    <div style={{ width: '250px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#6b7280' }}>Subtotal:</span>
                        <span>S/ {SAMPLE_ORDEN_PREVIEW.subtotal.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#6b7280' }}>IGV (18%):</span>
                        <span>S/ {SAMPLE_ORDEN_PREVIEW.igv.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px', borderTop: `2px solid ${activeVisual.accentColor || '#7c3aed'}`, paddingTop: '6px', marginTop: '3px' }}>
                        <span>TOTAL:</span>
                        <span style={{ color: activeVisual.accentColor || '#7c3aed' }}>S/ {SAMPLE_ORDEN_PREVIEW.total.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '10px', marginTop: '2px' }}>
                        <span>Adelanto (50%): S/ {SAMPLE_ORDEN_PREVIEW.adelanto.toFixed(2)}</span>
                        <span>Saldo: S/ {SAMPLE_ORDEN_PREVIEW.saldo.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* DESGLOSE DEL PAGO A PROVEEDOR */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '12px', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Detalle del Pago Programado
                    </h4>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '14px' }}>
                      <div>
                        <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', display: 'block' }}>N° Comprobante:</span>
                        <strong style={{ fontSize: '12px', color: '#1e293b' }}>{SAMPLE_PAGO_PREVIEW.numeroComprobante}</strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', display: 'block' }}>Tipo de Pago:</span>
                        <strong style={{ fontSize: '12px', color: '#1e293b' }}>{SAMPLE_PAGO_PREVIEW.tipoPago}</strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', display: 'block' }}>Orden Vinculada:</span>
                        <strong style={{ fontSize: '12px', color: activeVisual.accentColor || '#7c3aed' }}>{SAMPLE_PAGO_PREVIEW.ordenId}</strong>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: '#475569' }}>Monto sin IGV: S/ {SAMPLE_PAGO_PREVIEW.montoSinIgv.toFixed(2)} | IGV: S/ {SAMPLE_PAGO_PREVIEW.igv.toFixed(2)}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', marginRight: '8px' }}>MONTO A ABONAR:</span>
                        <span style={{ fontSize: '16px', fontWeight: 'bold', color: activeVisual.accentColor || '#7c3aed' }}>
                          S/ {SAMPLE_PAGO_PREVIEW.monto.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 6. PIE DE PÁGINA RENDERIZADO */}
              <div style={{ marginTop: 'auto' }}>
                {renderedPreviewFooter ? (
                  <div dangerouslySetInnerHTML={{ __html: renderedPreviewFooter }} />
                ) : (
                  <div style={{ padding: '12px', background: '#f8fafc', border: '1px dashed #cbd5e1', textAlign: 'center', color: '#94a3b8' }}>
                    [Pie de página no configurado]
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
