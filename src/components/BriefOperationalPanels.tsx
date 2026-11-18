import React, { useRef, useState } from 'react';
import {
  FileUp, MessageSquarePlus, RefreshCw, Sparkles, Plus, Trash2,
  MapPin, Calendar, DollarSign, AlertTriangle, Copy, Check,
  Users, Palette, Wrench, Calculator, Send, CheckCircle2, Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  SmartBriefData,
  BriefSeccionItem,
  LiveQuestion,
  RequerimientoBriefItem
} from '../context/SmartMeetingContext';
import { buildWhatsAppFollowupText } from '../utils/briefExport';

const REQ_CATEGORIES: { value: RequerimientoBriefItem['categoria']; label: string; color: string; bg: string }[] = [
  { value: 'PRODUCCION', label: 'Producción', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.1)' },
  { value: 'AUDIOVISUAL', label: 'Audiovisual', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.1)' },
  { value: 'STAFF', label: 'Staff / Talento', color: '#059669', bg: 'rgba(5, 150, 105, 0.1)' },
  { value: 'MERCHANDISING', label: 'Merch / Impresos', color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)' },
  { value: 'CATERING', label: 'Catering', color: '#db2777', bg: 'rgba(219, 39, 119, 0.1)' },
  { value: 'LOGISTICA', label: 'Logística / Permisos', color: '#475569', bg: 'rgba(71, 85, 105, 0.1)' },
  { value: 'DISENO', label: 'Diseño / 3D', color: '#0891b2', bg: 'rgba(8, 145, 178, 0.1)' }
];

interface BriefIntakeBarProps {
  transcriptLength: number;
  fuentesCount: number;
  isAiProcessing: boolean;
  isImportingSource: boolean;
  onTriggerAnalyze: () => Promise<void> | void;
  onImportSource: (input: { text?: string; file?: File; sourceLabel?: string; replaceTranscript?: boolean }) => Promise<boolean>;
}

export const BriefIntakeBar: React.FC<BriefIntakeBarProps> = ({
  transcriptLength,
  fuentesCount,
  isAiProcessing,
  isImportingSource,
  onTriggerAnalyze,
  onImportSource
}) => {
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [sourceLabel, setSourceLabel] = useState('Correo / WhatsApp de Cliente');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onImportSource({ file, sourceLabel: file.name });
    e.target.value = '';
  };

  const handleProcessText = async () => {
    if (pastedText.trim().length < 15) {
      toast.error('Pega al menos unas líneas del correo, chat o brief.');
      return;
    }
    const ok = await onImportSource({
      text: pastedText.trim(),
      sourceLabel: sourceLabel.trim() || 'Texto / WhatsApp',
      replaceTranscript: replaceExisting
    });
    if (ok) {
      setPastedText('');
      setShowPasteBox(false);
    }
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.06) 0%, rgba(16, 185, 129, 0.04) 100%)',
        border: '1px solid rgba(139, 92, 246, 0.22)',
        borderRadius: '12px',
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#5b21b6' }}>
            Fuentes del Brief:
          </span>

          <button
            type="button"
            onClick={() => setShowPasteBox(v => !v)}
            disabled={isImportingSource}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 11px',
              borderRadius: '8px',
              border: '1px solid rgba(139, 92, 246, 0.35)',
              background: showPasteBox ? '#7c3aed' : '#ffffff',
              color: showPasteBox ? '#ffffff' : '#6d28d9',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <MessageSquarePlus size={14} />
            <span>Pegar Correo / WhatsApp / Minuta</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImportingSource}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 11px',
              borderRadius: '8px',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              background: '#ffffff',
              color: '#047857',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: isImportingSource ? 'wait' : 'pointer'
            }}
            title="Soporta PDF, capturas WhatsApp/planos (PNG/JPG), Word (.docx), PPTX, o grabaciones (MP3/M4A/WAV)"
          >
            <FileUp size={14} />
            <span>{isImportingSource ? 'Leyendo archivo...' : 'Subir PDF / Imagen / Word / Audio'}</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.pptx,.txt,.csv,.eml,.mp3,.wav,.m4a,.ogg,.webm"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {fuentesCount > 0 && (
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b' }}>
              {fuentesCount} fuente{fuentesCount > 1 ? 's' : ''}
            </span>
          )}
          <button
            type="button"
            onClick={() => onTriggerAnalyze()}
            disabled={isAiProcessing || transcriptLength < 15}
            title="Re-analizar el contenido completo con Gemini 3.8 Flash sin perder contexto inicial"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: 'none',
              background: isAiProcessing ? '#94a3b8' : 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
              color: '#ffffff',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: isAiProcessing || transcriptLength < 15 ? 'not-allowed' : 'pointer',
              opacity: transcriptLength < 15 ? 0.5 : 1
            }}
          >
            <RefreshCw size={13} className={isAiProcessing ? 'animate-spin' : ''} />
            <span>{isAiProcessing ? 'Analizando...' : 'Re-analizar Todo con IA'}</span>
          </button>
        </div>
      </div>

      {showPasteBox && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              placeholder="Etiqueta de fuente (ej: Correo de Marketing)"
              style={{
                flex: 1,
                minWidth: '200px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '12px'
              }}
            />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: '#475569', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
              />
              <span>Reemplazar texto anterior</span>
            </label>
          </div>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={5}
            placeholder="Pega aquí el correo del cliente, mensajes reenviados de WhatsApp, especificaciones de medidas o apuntes completos de la reunión..."
            style={{
              width: '100%',
              padding: '9px 11px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '12.5px',
              lineHeight: '1.45',
              resize: 'vertical',
              boxSizing: 'border-box'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setShowPasteBox(false)}
              style={{
                padding: '6px 12px',
                borderRadius: '7px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleProcessText}
              disabled={isImportingSource}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '7px',
                border: 'none',
                background: '#7c3aed',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Sparkles size={13} />
              <span>{isImportingSource ? 'Extrayendo datos...' : 'Extraer Brief & Requerimientos'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface BriefQuantifiedMatrixCardProps {
  requerimientos: RequerimientoBriefItem[];
  onChange: (next: RequerimientoBriefItem[]) => void;
  onGoToCotizacion?: () => void;
}

export const BriefQuantifiedMatrixCard: React.FC<BriefQuantifiedMatrixCardProps> = ({
  requerimientos,
  onChange,
  onGoToCotizacion
}) => {
  const handleAddRow = () => {
    const newRow: RequerimientoBriefItem = {
      id: `manual_${Date.now().toString(36)}`,
      categoria: 'PRODUCCION',
      cantidad: 1,
      item: '',
      especificaciones: '',
      jornadaOHorario: '',
      estado: 'POR_CONFIRMAR'
    };
    onChange([...requerimientos, newRow]);
  };

  const handleUpdate = (id: string, patch: Partial<RequerimientoBriefItem>) => {
    onChange(requerimientos.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleDelete = (id: string) => {
    onChange(requerimientos.filter(r => r.id !== id));
  };

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1.5px solid #e2e8f0',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: '#1e1b4b', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calculator size={15} color="#7c3aed" />
            <span>Inventario Cuantificado de Requerimientos ({requerimientos.length})</span>
          </h4>
          <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#64748b' }}>
            Base exacta para Diseño, Producción y Cotizador. Ningún elemento pedido se pierde.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={handleAddRow}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 10px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#334155',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <Plus size={13} />
            <span>Añadir Ítem</span>
          </button>
          {onGoToCotizacion && requerimientos.length > 0 && (
            <button
              type="button"
              onClick={onGoToCotizacion}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                borderRadius: '7px',
                border: 'none',
                background: 'rgba(16, 185, 129, 0.14)',
                color: '#047857',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              <Sparkles size={13} />
              <span>Usar en Cotización</span>
            </button>
          )}
        </div>
      </div>

      {requerimientos.length === 0 ? (
        <div style={{ padding: '18px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', fontSize: '12px', color: '#64748b' }}>
          Aún no hay ítems cuantificados detectados. Sube un brief, pega el correo o presiona <strong>"Re-analizar Todo con IA"</strong>.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'left', fontSize: '10.5px', textTransform: 'uppercase' }}>
                <th style={{ padding: '7px 8px', borderBottom: '1px solid #e2e8f0', width: '125px' }}>Categoría</th>
                <th style={{ padding: '7px 6px', borderBottom: '1px solid #e2e8f0', width: '62px', textAlign: 'center' }}>Cant.</th>
                <th style={{ padding: '7px 8px', borderBottom: '1px solid #e2e8f0', minWidth: '170px' }}>Ítem / Elemento</th>
                <th style={{ padding: '7px 8px', borderBottom: '1px solid #e2e8f0', minWidth: '210px' }}>Especificaciones / Horario</th>
                <th style={{ padding: '7px 6px', borderBottom: '1px solid #e2e8f0', width: '105px' }}>Estado</th>
                <th style={{ padding: '7px 4px', borderBottom: '1px solid #e2e8f0', width: '30px' }} />
              </tr>
            </thead>
            <tbody>
              {requerimientos.map((req) => {
                const catStyle = REQ_CATEGORIES.find(c => c.value === req.categoria) || REQ_CATEGORIES[0];
                return (
                  <tr key={req.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px' }}>
                      <select
                        value={req.categoria}
                        onChange={(e) => handleUpdate(req.id, { categoria: e.target.value as RequerimientoBriefItem['categoria'] })}
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          borderRadius: '6px',
                          border: 'none',
                          background: catStyle.bg,
                          color: catStyle.color,
                          fontWeight: 700,
                          fontSize: '11px'
                        }}
                      >
                        {REQ_CATEGORIES.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '6px' }}>
                      <input
                        type="text"
                        value={String(req.cantidad)}
                        onChange={(e) => handleUpdate(req.id, { cantidad: e.target.value })}
                        style={{
                          width: '54px',
                          textAlign: 'center',
                          fontWeight: 800,
                          padding: '4px',
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px'
                        }}
                      />
                    </td>
                    <td style={{ padding: '6px' }}>
                      <input
                        type="text"
                        value={req.item}
                        onChange={(e) => handleUpdate(req.id, { item: e.target.value })}
                        placeholder="Ej: Anfitriona A1 / Photocall"
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0',
                          fontWeight: 700,
                          fontSize: '12px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </td>
                    <td style={{ padding: '6px' }}>
                      <input
                        type="text"
                        value={req.especificaciones}
                        onChange={(e) => handleUpdate(req.id, { especificaciones: e.target.value })}
                        placeholder="Medidas, material, color..."
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0',
                          fontSize: '11.5px',
                          marginBottom: req.jornadaOHorario !== undefined ? '3px' : 0,
                          boxSizing: 'border-box'
                        }}
                      />
                      {req.jornadaOHorario && (
                        <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                          Horario: <strong>{req.jornadaOHorario}</strong>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleUpdate(req.id, { estado: req.estado === 'CONFIRMADO' ? 'POR_CONFIRMAR' : 'CONFIRMADO' })}
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          borderRadius: '6px',
                          border: 'none',
                          fontSize: '10.5px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          background: req.estado === 'CONFIRMADO' ? '#dcfce7' : '#fef3c7',
                          color: req.estado === 'CONFIRMADO' ? '#166534' : '#92400e'
                        }}
                      >
                        {req.estado === 'CONFIRMADO' ? '✓ Confirmado' : '? Por confirmar'}
                      </button>
                    </td>
                    <td style={{ padding: '6px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleDelete(req.id)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}
                        title="Quitar ítem"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

interface BriefCopilotSidePanelProps {
  brief: SmartBriefData;
  sections: BriefSeccionItem[];
  pendingQuestions: LiveQuestion[];
  onGoToStep2: () => void;
  onUpdateBrief: (patch: Partial<SmartBriefData>) => void;
}

export const BriefCopilotSidePanel: React.FC<BriefCopilotSidePanelProps> = ({
  brief,
  sections,
  pendingQuestions,
  onGoToStep2,
  onUpdateBrief
}) => {
  const [copiedWa, setCopiedWa] = useState(false);
  const [handoffTab, setHandoffTab] = useState<'cuentas' | 'diseno' | 'produccion' | 'cotizacion'>('cuentas');

  const whatsappText = buildWhatsAppFollowupText(brief, pendingQuestions, sections);
  const locReal = [brief.locaciones?.ciudad, ...(brief.locaciones?.lugares || [])].filter(Boolean).join(' — ');
  const handoffList = brief.handoffAreas?.[handoffTab] || [];

  const handleCopyWhatsApp = () => {
    navigator.clipboard.writeText(whatsappText);
    setCopiedWa(true);
    toast.success('Mensaje copiado listo para pegar en WhatsApp / Correo al cliente');
    setTimeout(() => setCopiedWa(false), 2200);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* FICHA CLAVE: SEDE REAL VS REFERENCIAS */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          padding: '16px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={15} />
          <span>Ficha Ejecutiva del Proyecto</span>
        </h4>

        {brief.resumenEjecutivo && (
          <p style={{ margin: 0, fontSize: '12px', color: '#334155', lineHeight: '1.45', background: '#faf5ff', padding: '10px', borderRadius: '8px', borderLeft: '3px solid #8b5cf6' }}>
            {brief.resumenEjecutivo}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: '#f8fafc', borderRadius: '7px', gap: '8px' }}>
            <span style={{ color: '#64748b', fontWeight: 600 }}>Cliente / Marca:</span>
            <strong style={{ color: '#0f172a', textAlign: 'right' }}>
              {brief.clienteNombre || 'Por identificar'}{brief.marcaOProducto ? ` (${brief.marcaOProducto})` : ''}
            </strong>
          </div>

          <div style={{ padding: '7px 10px', background: '#f0fdf4', borderRadius: '7px', border: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 800, color: '#166534' }}>
              <MapPin size={12} />
              <span>Locación REAL de Ejecución</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#064e3b', marginTop: '2px' }}>
              {locReal || 'Por confirmar con el cliente'}
            </div>
            {brief.referenciasMencionadas && brief.referenciasMencionadas.length > 0 && (
              <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '4px', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                <Info size={11} style={{ marginTop: '2px', flexShrink: 0 }} />
                <span>Ref. previa (no es sede): {brief.referenciasMencionadas.join('; ')}</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: '#f8fafc', borderRadius: '7px', gap: '8px' }}>
            <span style={{ color: '#64748b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={12} /> Fechas / Jornada:
            </span>
            <strong style={{ color: '#0f172a', textAlign: 'right' }}>
              {brief.fechasTentativas?.inicio || 'Por definir'}
              {brief.fechasTentativas?.duracionJornada ? ` · ${brief.fechasTentativas.duracionJornada}` : ''}
            </strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: '#f8fafc', borderRadius: '7px', gap: '8px' }}>
            <span style={{ color: '#64748b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <DollarSign size={12} /> Presupuesto:
            </span>
            <strong style={{ color: '#059669' }}>
              {brief.presupuestoEstimado?.monto ? `${brief.presupuestoEstimado.moneda || 'PEN'} ${brief.presupuestoEstimado.monto}` : 'Por cotizar'}
            </strong>
          </div>
        </div>
      </div>

      {/* VACÍOS CRÍTICOS + MENSAJE LISTO PARA WHATSAPP */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #fde68a',
          borderRadius: '14px',
          padding: '16px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={15} color="#d97706" />
            <span>Pendientes para Cotizar ({(brief.vaciosCriticos || []).length})</span>
          </h4>
          {pendingQuestions.length > 0 && (
            <button
              type="button"
              onClick={onGoToStep2}
              style={{ border: 'none', background: 'rgba(139, 92, 246, 0.1)', color: '#6d28d9', fontSize: '10.5px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', cursor: 'pointer' }}
            >
              Ver {pendingQuestions.length} preguntas
            </button>
          )}
        </div>

        {(brief.vaciosCriticos || []).length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {brief.vaciosCriticos!.map((v, i) => (
              <div key={i} style={{ padding: '6px 9px', borderRadius: '7px', background: v.prioridad === 'ALTA' ? '#fef2f2' : '#fffbeb', fontSize: '11.5px', borderLeft: `3px solid ${v.prioridad === 'ALTA' ? '#ef4444' : '#f59e0b'}` }}>
                <strong style={{ color: '#0f172a' }}>{v.punto}</strong>
                {v.impacto && <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '1px' }}>{v.impacto}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#059669', background: '#ecfdf5', padding: '8px 10px', borderRadius: '8px' }}>
            <CheckCircle2 size={14} />
            <span>Sin vacíos críticos pendientes.</span>
          </div>
        )}

        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#047857', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Send size={12} /> Mensaje listo para WhatsApp al Cliente:
            </span>
            <button
              type="button"
              onClick={handleCopyWhatsApp}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: '6px',
                border: 'none',
                background: copiedWa ? '#10b981' : '#059669',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {copiedWa ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedWa ? '¡Copiado!' : 'Copiar WhatsApp'}</span>
            </button>
          </div>
          <textarea
            value={whatsappText}
            onChange={(e) => onUpdateBrief({ mensajeSeguimientoCliente: e.target.value })}
            rows={5}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid #bbf7d0',
              background: '#f0fdf4',
              fontSize: '11.5px',
              color: '#064e3b',
              lineHeight: '1.4',
              resize: 'vertical',
              boxSizing: 'border-box'
            }}
          />
        </div>
      </div>

      {/* HANDOFF POR ÁREA DE LA AGENCIA */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          padding: '14px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.03)'
        }}
      >
        <h4 style={{ margin: '0 0 8px 0', fontSize: '12.5px', fontWeight: 800, color: '#1e293b' }}>
          Handoff Operativo por Área
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginBottom: '10px' }}>
          {[
            { id: 'cuentas', label: 'Cuentas', icon: Users },
            { id: 'diseno', label: 'Diseño', icon: Palette },
            { id: 'produccion', label: 'Prod.', icon: Wrench },
            { id: 'cotizacion', label: 'Cotiz.', icon: Calculator }
          ].map(t => {
            const Icon = t.icon;
            const active = handoffTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setHandoffTab(t.id as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                  padding: '6px 4px',
                  borderRadius: '7px',
                  border: active ? '1.5px solid #7c3aed' : '1px solid #e2e8f0',
                  background: active ? '#f5f3ff' : '#ffffff',
                  color: active ? '#6d28d9' : '#64748b',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Icon size={11} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {handoffList.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11.5px', color: '#334155', lineHeight: '1.5' }}>
            {handoffList.map((act, i) => (
              <li key={i} style={{ marginBottom: '3px' }}>{act}</li>
            ))}
          </ul>
        ) : (
          <div style={{ fontSize: '11.5px', color: '#94a3b8', fontStyle: 'italic' }}>
            Presiona "Re-analizar Todo con IA" para generar acciones por área.
          </div>
        )}
      </div>
    </div>
  );
};

