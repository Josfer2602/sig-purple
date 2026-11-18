import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
  X, Sparkles, Wrench, Search, Copy, Check, Calendar,
  Maximize2, RefreshCw, Lightbulb, MapPin, PlusCircle, AlertTriangle
} from 'lucide-react';
import { API_URL } from '../utils/apiUrl';
import { useGlobalContext } from '../context/GlobalContext';
import { useSmartMeeting } from '../context/SmartMeetingContext';
import { convertBriefRequirementsToQuoteCategories, buildWhatsAppFollowupText } from '../utils/briefExport';
import toast from 'react-hot-toast';

interface SmartBriefDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  clientId?: string;
  onImportItems?: (categories: any[], mode: 'add' | 'replace') => void;
}

export const SmartBriefDrawer: React.FC<SmartBriefDrawerProps> = ({
  isOpen,
  onClose,
  projectId,
  clientId,
  onImportItems
}) => {
  const { token } = useGlobalContext();
  const { loadExistingMeeting } = useSmartMeeting();

  const [meetings, setMeetings] = useState<any[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [reanalyzing, setReanalyzing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'produccion' | 'creativo' | 'transcripcion' | 'general'>('produccion');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const fetchMeetings = async (preserveId?: string) => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/reuniones-ai`, { headers });
      if (res.ok) {
        const data = await res.json();
        setMeetings(data);
        if (preserveId) return;

        if (projectId) {
          const matchProject = data.find((m: any) => m.proyectoId === projectId);
          if (matchProject) {
            setSelectedMeetingId(matchProject.id);
            return;
          }
        }
        if (clientId) {
          const normClient = clientId.toLowerCase().trim();
          const matchClient = data.find((m: any) => {
            if (m.clienteId === clientId) return true;
            try {
              const b = m.briefJson ? JSON.parse(m.briefJson) : null;
              return b?.clienteNombre && b.clienteNombre.toLowerCase().includes(normClient);
            } catch {
              return false;
            }
          });
          if (matchClient) {
            setSelectedMeetingId(matchClient.id);
            return;
          }
        }
        if (data.length > 0 && !selectedMeetingId) {
          setSelectedMeetingId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error cargando briefs:', err);
    } finally {
      setLoading(false);
    }
  };

  // Cargar reuniones disponibles
  useEffect(() => {
    if (!isOpen) return;
    fetchMeetings();
  }, [isOpen, projectId, clientId, token]);

  const activeMeeting = useMemo(() => {
    return meetings.find(m => m.id === selectedMeetingId) || null;
  }, [meetings, selectedMeetingId]);

  const parsedBrief = useMemo(() => {
    if (!activeMeeting?.briefJson) return null;
    try {
      return typeof activeMeeting.briefJson === 'string' 
        ? JSON.parse(activeMeeting.briefJson) 
        : activeMeeting.briefJson;
    } catch {
      return null;
    }
  }, [activeMeeting]);

  const parsedDeliverable = useMemo(() => {
    if (!activeMeeting?.entregableJson) return null;
    try {
      return typeof activeMeeting.entregableJson === 'string'
        ? JSON.parse(activeMeeting.entregableJson)
        : activeMeeting.entregableJson;
    } catch {
      return null;
    }
  }, [activeMeeting]);

  const handleCopy = (text: string, sectionKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    toast.success('Copiado al portapapeles');
    setTimeout(() => setCopiedSection(null), 2000);
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99998,
        display: 'flex',
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '540px',
          maxWidth: '92vw',
          height: '100%',
          backgroundColor: '#ffffff',
          boxShadow: '-10px 0 35px -5px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1.5px solid rgba(139, 92, 246, 0.3)',
          overflow: 'hidden',
          animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER DEL DRAWER */}
        <div
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(99, 102, 241, 0.05) 100%)',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 3px 10px rgba(139, 92, 246, 0.3)'
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: '#1e1b4b' }}>
                Smart Brief para Cotización
              </h3>
              <span style={{ fontSize: '11px', color: '#6d28d9', fontWeight: 600 }}>
                Consulta requerimientos del cliente en tiempo real
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {activeMeeting && (
              <>
                <button
                  onClick={async () => {
                    setReanalyzing(true);
                    try {
                      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                      if (token) headers['Authorization'] = `Bearer ${token}`;
                      const r = await fetch(`${API_URL}/reuniones-ai/${activeMeeting.id}/analizar`, { method: 'POST', headers });
                      if (r.ok) {
                        await fetchMeetings(activeMeeting.id);
                        toast.success('Brief actualizado con motor IA 2.0');
                      }
                    } finally {
                      setReanalyzing(false);
                    }
                  }}
                  disabled={reanalyzing}
                  title="Re-analizar este brief con IA 2.0 para extraer ítems cuantificados y respuestas"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#475569',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: reanalyzing ? 'wait' : 'pointer'
                  }}
                >
                  <RefreshCw size={12} className={reanalyzing ? 'animate-spin' : ''} />
                  <span>{reanalyzing ? '...' : 'Re-analizar'}</span>
                </button>
                <button
                  onClick={() => {
                    loadExistingMeeting(activeMeeting.id);
                    onClose();
                  }}
                  title="Abrir reunión completa en el asistente"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    color: '#7c3aed',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <Maximize2 size={13} />
                  <span>Abrir</span>
                </button>
              </>
            )}

            <button
              onClick={onClose}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: '1px solid #e2e8f0',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748b'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* SELECTOR DE BRIEF */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
            Sesión de Brief Vinculada:
          </label>
          <select
            value={selectedMeetingId}
            onChange={(e) => setSelectedMeetingId(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              color: '#1e293b',
              outline: 'none'
            }}
          >
            {meetings.map((m) => {
              const comp = m.briefJson ? (JSON.parse(m.briefJson).completitudPorcentaje || 0) : 0;
              const date = new Date(m.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
              return (
                <option key={m.id} value={m.id}>
                  [{date}] {m.titulo} ({comp}% completado)
                </option>
              );
            })}
          </select>
        </div>

        {/* PESTAÑAS DEL DRAWER */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #e2e8f0',
            background: '#ffffff',
            padding: '0 12px'
          }}
        >
          {[
            { id: 'produccion', label: '🏗️ Producción', icon: Wrench },
            { id: 'creativo', label: '💡 Concepto & Big Idea', icon: Lightbulb },
            { id: 'transcripcion', label: '🎙️ Transcripción', icon: Search },
            { id: 'general', label: '📋 Datos & Fechas', icon: Calendar }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                flex: 1,
                padding: '11px 4px',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2.5px solid #8b5cf6' : '2.5px solid transparent',
                background: 'transparent',
                color: activeTab === tab.id ? '#7c3aed' : '#64748b',
                fontWeight: activeTab === tab.id ? 700 : 500,
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* CONTENIDO DEL DRAWER */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
              <p style={{ margin: 0, fontSize: '13px' }}>Cargando datos del Brief...</p>
            </div>
          ) : !activeMeeting ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              No hay briefs registrados aún.
            </div>
          ) : (
            <>
              {/* TAB 1: PRODUCCIÓN */}
              {activeTab === 'produccion' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                  {/* INVENTARIO CUANTIFICADO DE BRIEF 2.0 */}
                  {parsedBrief?.requerimientosCuantificados && parsedBrief.requerimientosCuantificados.length > 0 && (
                    <div style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(139, 92, 246, 0.06) 100%)', border: '1.5px solid rgba(16, 185, 129, 0.35)', borderRadius: '10px', padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: '13px', color: '#065f46' }}>
                          📦 Inventario Cuantificado ({parsedBrief.requerimientosCuantificados.length} ítems)
                        </span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {onImportItems && (
                            <button
                              type="button"
                              onClick={() => {
                                const cats = convertBriefRequirementsToQuoteCategories(
                                  parsedBrief.requerimientosCuantificados,
                                  parsedBrief.locaciones?.ciudad
                                );
                                onImportItems(cats, 'add');
                                toast.success(`${parsedBrief.requerimientosCuantificados.length} ítems agregados al cotizador`);
                                onClose();
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '5px 10px',
                                borderRadius: '7px',
                                border: 'none',
                                background: '#059669',
                                color: '#ffffff',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer'
                              }}
                            >
                              <PlusCircle size={12} />
                              <span>Pasar a Cotización</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {parsedBrief.requerimientosCuantificados.map((it: any, i: number) => (
                          <div key={it.id || i} style={{ fontSize: '12px', background: '#fff', padding: '8px 10px', borderRadius: '7px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                              <strong style={{ color: '#0f172a' }}>
                                {it.cantidad}x {it.item}
                              </strong>
                              <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: '#f1f5f9', color: '#475569' }}>
                                {it.categoria}
                              </span>
                            </div>
                            <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                              {it.especificaciones}{it.jornadaOHorario ? ` · Horario: ${it.jornadaOHorario}` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Escenografía y Montaje */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>
                        🎨 Escenografía, Estructuras & Montaje
                      </span>
                      <button
                        onClick={() => handleCopy((parsedBrief?.produccion?.escenografiaYMontaje || []).join('\n'), 'escenografia')}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 600 }}
                      >
                        {copiedSection === 'escenografia' ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                        <span>Copiar</span>
                      </button>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: '#475569', lineHeight: '1.6' }}>
                      {(parsedBrief?.produccion?.escenografiaYMontaje || ['Por definir en reunión']).map((item: string, i: number) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Audiovisual y Técnica */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>
                        🔊 Audiovisual & Técnica (Sonido, Luces, Pantallas)
                      </span>
                      <button
                        onClick={() => handleCopy((parsedBrief?.produccion?.audiovisualYTecnica || []).join('\n'), 'av')}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 600 }}
                      >
                        {copiedSection === 'av' ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                        <span>Copiar</span>
                      </button>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: '#475569', lineHeight: '1.6' }}>
                      {(parsedBrief?.produccion?.audiovisualYTecnica || ['Por definir en reunión']).map((item: string, i: number) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Staff Requerido */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>
                        👥 Staff y Personal Operativo Requerido
                      </span>
                      <button
                        onClick={() => handleCopy((parsedBrief?.produccion?.staffRequerido || []).join('\n'), 'staff')}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 600 }}
                      >
                        {copiedSection === 'staff' ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                        <span>Copiar</span>
                      </button>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: '#475569', lineHeight: '1.6' }}>
                      {(parsedBrief?.produccion?.staffRequerido || ['Por definir en reunión']).map((item: string, i: number) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Desglose de Producción de Entregables si existe */}
                  {parsedDeliverable?.desgloseProduccion && (
                    <div style={{ background: 'rgba(139, 92, 246, 0.05)', border: '1.5px solid rgba(139, 92, 246, 0.25)', borderRadius: '10px', padding: '14px' }}>
                      <span style={{ fontWeight: 800, fontSize: '13px', color: '#6d28d9', display: 'block', marginBottom: '8px' }}>
                        📋 Lista de Ítems Recomendados para Cotizar (IA)
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {parsedDeliverable.desgloseProduccion.escenografiaYBranding?.map((it: any, i: number) => (
                          <div key={i} style={{ fontSize: '12px', background: '#fff', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            <strong style={{ color: '#1e293b' }}>{it.item}</strong> {it.cantidadAprox && <span style={{ color: '#7c3aed', fontWeight: 600 }}>({it.cantidadAprox})</span>}
                            <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>{it.especificacion}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Permisos y Restricciones */}
                  <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '10px', padding: '14px' }}>
                    <span style={{ fontWeight: 700, fontSize: '12.5px', color: '#9f1239', display: 'block', marginBottom: '6px' }}>
                      ⚠️ Permisos, SCTR y Restricciones de Locación
                    </span>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#be123c', lineHeight: '1.5' }}>
                      {(parsedBrief?.produccion?.permisosYSeguridad || ['Por definir']).map((item: string, i: number) => (
                        <li key={i}>{item}</li>
                      ))}
                      {(parsedBrief?.restricciones || []).map((item: string, i: number) => (
                        <li key={`r-${i}`}>Restricción: {item}</li>
                      ))}
                    </ul>
                  </div>

                </div>
              )}

              {/* TAB 2: CREATIVO & ENTREGABLE */}
              {activeTab === 'creativo' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  {parsedDeliverable?.propuestaCreativa?.bigIdea && (
                    <div style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(99, 102, 241, 0.05) 100%)', border: '1.5px solid rgba(139, 92, 246, 0.3)', borderRadius: '10px', padding: '14px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase' }}>
                        Big Idea
                      </span>
                      <h4 style={{ margin: '4px 0 6px 0', fontSize: '15px', fontWeight: 800, color: '#1e1b4b' }}>
                        "{parsedDeliverable.propuestaCreativa.bigIdea}"
                      </h4>
                      <p style={{ margin: 0, fontSize: '12.5px', color: '#475569', lineHeight: '1.5' }}>
                        {parsedDeliverable.propuestaCreativa.racionalEstrategico}
                      </p>
                    </div>
                  )}

                  {/* Mecánicas */}
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b', display: 'block', marginBottom: '10px' }}>
                      Experiencia de Usuario & Mecánicas
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {(parsedDeliverable?.propuestaCreativa?.mecanicas || []).map((mec: any, i: number) => (
                        <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', background: '#f8fafc' }}>
                          <strong style={{ fontSize: '12.5px', color: '#6d28d9' }}>{i + 1}. {mec.titulo}</strong>
                          <p style={{ margin: '4px 0', fontSize: '12px', color: '#334155' }}>{mec.descripcion}</p>
                          {mec.experienciaUsuario && (
                            <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', display: 'block' }}>
                              Impacto: {mec.experienciaUsuario}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Resumen Ejecutivo */}
                  {parsedDeliverable?.resumenEjecutivo && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                      <span style={{ fontWeight: 700, fontSize: '12px', color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                        Resumen Ejecutivo
                      </span>
                      <p style={{ margin: 0, fontSize: '12.5px', color: '#334155', lineHeight: '1.5' }}>
                        {parsedDeliverable.resumenEjecutivo}
                      </p>
                    </div>
                  )}

                </div>
              )}

              {/* TAB 3: TRANSCRIPCIÓN CON BUSCADOR */}
              {activeTab === 'transcripcion' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                    <input
                      type="text"
                      placeholder="Buscar en lo que se conversó (ej. bastidor, medidas, precio)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px 8px 32px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '14px',
                      fontSize: '12px',
                      lineHeight: '1.6',
                      color: '#334155',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '480px',
                      overflowY: 'auto'
                    }}
                  >
                    {activeMeeting.transcripcion ? (
                      searchQuery ? (
                        activeMeeting.transcripcion
                          .split('\n')
                          .filter((line: string) => line.toLowerCase().includes(searchQuery.toLowerCase()))
                          .map((line: string, i: number) => (
                            <div key={i} style={{ marginBottom: '8px', background: '#fef08a', padding: '4px 6px', borderRadius: '4px' }}>
                              {line}
                            </div>
                          ))
                      ) : (
                        activeMeeting.transcripcion
                      )
                    ) : (
                      <span style={{ color: '#94a3b8' }}>No hay transcripción disponible para esta reunión.</span>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: DATOS GENERALES & CUESTIONARIO */}
              {activeTab === 'general' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {parsedBrief?.resumenEjecutivo && (
                    <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '12px' }}>
                      <span style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 700 }}>Resumen Ejecutivo:</span>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#1e293b', lineHeight: '1.45' }}>
                        {parsedBrief.resumenEjecutivo}
                      </p>
                    </div>
                  )}

                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Objetivo Principal:</span>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                      {parsedBrief?.objetivoPrincipal || 'Por definir'}
                    </p>
                  </div>

                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Público Objetivo & Concepto:</span>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#1e293b' }}>
                      {parsedBrief?.publicoObjetivo || 'Por definir'}
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px' }}>
                      <span style={{ fontSize: '11px', color: '#166534', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={11} /> Locación REAL:
                      </span>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', fontWeight: 700, color: '#064e3b' }}>
                        {[parsedBrief?.locaciones?.ciudad, ...(parsedBrief?.locaciones?.lugares || [])].filter(Boolean).join(' - ') || 'Por definir'}
                      </p>
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Presupuesto Estimado:</span>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', fontWeight: 700, color: '#059669' }}>
                        {parsedBrief?.presupuestoEstimado?.monto 
                          ? `${parsedBrief.presupuestoEstimado.moneda || 'PEN'} ${parsedBrief.presupuestoEstimado.monto}` 
                          : 'Por cotizar / flexible'}
                      </p>
                    </div>
                  </div>

                  {/* Vacíos Críticos & WhatsApp */}
                  {(parsedBrief?.vaciosCriticos?.length > 0 || parsedBrief?.mensajeSeguimientoCliente) && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#92400e', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <AlertTriangle size={12} /> Pendientes por Confirmar
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(buildWhatsAppFollowupText(parsedBrief), 'whatsapp')}
                          style={{ border: 'none', background: '#059669', color: '#fff', fontSize: '10.5px', fontWeight: 700, padding: '3px 8px', borderRadius: '5px', cursor: 'pointer' }}
                        >
                          {copiedSection === 'whatsapp' ? '¡Copiado!' : 'Copiar WhatsApp'}
                        </button>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11.5px', color: '#78350f' }}>
                        {(parsedBrief.vaciosCriticos || []).map((v: any, idx: number) => (
                          <li key={idx}>{v.punto}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Preguntas Respondidas del Brief Adaptativo */}
                  {parsedBrief?.seccionesBrief && parsedBrief.seccionesBrief.length > 0 && (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#ffffff' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#5b21b6', display: 'block', marginBottom: '8px' }}>
                        Respuestas del Brief ({parsedBrief.tipoProyecto || 'Activación'}):
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {parsedBrief.seccionesBrief.flatMap((s: any) => s.preguntas || []).filter((q: any) => q.respondida && q.respuesta).map((q: any) => (
                          <div key={q.numero} style={{ fontSize: '11.5px', borderBottom: '1px dashed #f1f5f9', paddingBottom: '6px' }}>
                            <div style={{ fontWeight: 700, color: '#334155' }}>{q.numero}. {q.pregunta}</div>
                            <div style={{ color: '#0f172a', marginTop: '2px' }}>{q.respuesta}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

