import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { 
  X, 
  Send, 
  Mail, 
  Users, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2
} from 'lucide-react';
import type { Orden, Proveedor, Proyecto } from '../types/models';
import { API_URL } from '../utils/apiUrl';
import toast from 'react-hot-toast';

interface SendOrdenesEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  ordenes: Orden[];
  proveedores: Proveedor[];
  clientes?: any[];
  proyectos: Proyecto[];
  onSuccess?: () => void;
}

export const SendOrdenesEmailModal: React.FC<SendOrdenesEmailModalProps> = ({
  isOpen,
  onClose,
  ordenes,
  proveedores,
  proyectos,
  onSuccess
}) => {
  const [mode, setMode] = useState<'individual' | 'consolidated'>('individual');
  const [recipientOverrides, setRecipientOverrides] = useState<Record<string, string>>({});
  const [destinationEmail, setDestinationEmail] = useState('');
  const [ccEmails, setCcEmails] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendingStatus, setSendingStatus] = useState('');

  const currentUserEmail = React.useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      return (u.email || '').trim();
    } catch {
      return '';
    }
  }, []);

  // Proveedores, clientes y proyectos diccionarios
  const proveedorMap = React.useMemo(() => {
    return (proveedores || []).reduce((acc, p) => ({ ...acc, [p.id]: p }), {} as Record<string, Proveedor>);
  }, [proveedores]);


  const proyectoMap = React.useMemo(() => {
    return (proyectos || []).reduce((acc, p) => ({ ...acc, [p.id]: p }), {} as Record<string, Proyecto>);
  }, [proyectos]);

  // Inicializar destinatarios y textos predeterminados
  useEffect(() => {
    if (!isOpen || ordenes.length === 0) return;

    const initialRecipients: Record<string, string> = {};
    ordenes.forEach(o => {
      const prov = proveedorMap[o.proveedorId];
      initialRecipients[o.id] = (prov?.correo || (prov as any)?.email || '').trim();
    });
    setRecipientOverrides(initialRecipients);

    if (ordenes.length === 1) {
      const singleOrder = ordenes[0];
      const proy = proyectoMap[singleOrder.proyectoId];
      const tipo = singleOrder.tipoOrden || 'Compra';
      setSubject(`Orden de ${tipo} N° ${singleOrder.id} - ${proy?.nombre || 'Purple BTL'}`);
      setDestinationEmail(initialRecipients[singleOrder.id] || '');
    } else {
      setSubject(`Órdenes de Compra y Servicio (${ordenes.length}) - Purple BTL`);
      setDestinationEmail('');
    }

    setMessage(
      'Estimado proveedor / equipo,\n\nAdjuntamos la(s) Orden(es) de Compra y Servicio correspondiente(s) en formato PDF oficial.\nAgradeceremos confirmar la recepción de este correo y coordinar las entregas según los términos pactados.\n\nSaludos cordiales,\nEquipo de Administración y Operaciones - Purple BTL'
    );
    setCcEmails('');
    setIsSending(false);
    setSendingStatus('');
  }, [isOpen, ordenes, proveedorMap, proyectoMap]);

  if (!isOpen || ordenes.length === 0) return null;

  const totalMonto = ordenes.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const formatSoles = (amount: number) => `S/ ${Number(amount || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleUpdateRecipient = (ordenId: string, email: string) => {
    setRecipientOverrides(prev => ({
      ...prev,
      [ordenId]: email
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending) return;

    if (mode === 'consolidated') {
      if (!destinationEmail.trim()) {
        toast.error('Por favor ingresa el correo de destino para el envío consolidado.');
        return;
      }
    } else {
      // Individual mode: validar que todas tengan correo
      const missing = ordenes.filter(o => !recipientOverrides[o.id]?.trim());
      if (missing.length > 0) {
        const provMissing = proveedorMap[missing[0].proveedorId]?.razonSocial || 'Proveedor';
        toast.error(`La orden ${missing[0].id} (${provMissing}) no tiene correo de destino. Por favor ingrésalo en la lista antes de enviar.`, { duration: 6000 });
        return;
      }
    }

    setIsSending(true);
    setSendingStatus('Generando PDFs oficiales y enviando correos...');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/ordenes/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          ordenIds: ordenes.map(o => o.id),
          mode,
          destinationEmail: destinationEmail.trim(),
          ccEmails: ccEmails.trim(),
          subject: subject.trim(),
          message: message.trim(),
          recipientOverrides
        })
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || `Error ${res.status}: No se pudo procesar el envío de correos`);
      }

      if (mode === 'consolidated') {
        toast.success(`¡Correo enviado con éxito a ${destinationEmail} con ${ordenes.length} PDF(s) adjuntos!`, { duration: 5000 });
      } else {
        const sentCount = data?.count || 0;
        const failedOrders = data?.failedOrders || [];
        if (failedOrders.length > 0 && sentCount === 0) {
          const detail = failedOrders[0]?.error || 'Error al conectar con el servidor SMTP';
          toast.error(`No se pudo enviar el correo: ${detail}`, { duration: 7000 });
          return;
        } else if (failedOrders.length > 0) {
          toast.success(`Se enviaron ${sentCount} correo(s), pero ${failedOrders.length} tuvieron inconvenientes.`, { duration: 6000 });
        } else {
          toast.success(`¡${sentCount} orden(es) enviada(s) por correo con sus PDFs adjuntos!`, { duration: 5000 });
        }
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Error enviando órdenes por correo:', err);
      toast.error(err.message || 'No se pudieron enviar los correos. Verifica la configuración SMTP o la conexión.', { duration: 6000 });
    } finally {
      setIsSending(false);
      setSendingStatus('');
    }
  };

  return ReactDOM.createPortal(
    <div className="modal-overlay" style={{ zIndex: 1200 }}>
      <div 
        className="modal-content animate-fade-in" 
        style={{ 
          maxWidth: '740px', 
          width: '100%', 
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box'
        }}
      >
        {/* MODAL HEADER */}
        <div className="modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ 
              width: '38px', 
              height: '38px', 
              borderRadius: '10px', 
              background: 'rgba(124, 58, 237, 0.1)', 
              color: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Mail size={20} />
            </div>
            <div>
              <h3 className="modal-title" style={{ margin: 0, fontSize: '1.15rem' }}>
                Enviar Órdenes por Correo
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                Se generarán y adjuntarán los PDFs oficiales de {ordenes.length} orden{ordenes.length > 1 ? 'es' : ''} (Total: <strong style={{ color: '#059669' }}>{formatSoles(totalMonto)}</strong>)
              </p>
            </div>
          </div>
          <button 
            type="button" 
            className="btn-icon" 
            onClick={onClose} 
            disabled={isSending}
            title="Cerrar modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* MODAL BODY */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
          <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px', flex: 1, overflowY: 'auto' }}>
            
            {/* SELECTOR DE MODO (TABS) */}
            <div>
              <label className="unified-filter-label" style={{ marginBottom: '8px', display: 'block' }}>
                Modalidad de Envío
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setMode('individual')}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: mode === 'individual' ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
                    background: mode === 'individual' ? 'rgba(124, 58, 237, 0.05)' : '#ffffff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: mode === 'individual' ? 'var(--accent-primary)' : 'var(--text-primary)', fontSize: '13px' }}>
                    <Users size={16} />
                    <span>A cada proveedor (Individual)</span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Cada proveedor recibe su orden específica en PDF directamente a su correo comercial.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('consolidated')}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: mode === 'consolidated' ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
                    background: mode === 'consolidated' ? 'rgba(124, 58, 237, 0.05)' : '#ffffff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: mode === 'consolidated' ? 'var(--accent-primary)' : 'var(--text-primary)', fontSize: '13px' }}>
                    <Mail size={16} />
                    <span>Todas a un correo (Consolidado)</span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Envía un solo correo con los {ordenes.length} PDFs adjuntos a un destinatario específico (ej. Finanzas o Gerencia).
                  </span>
                </button>
              </div>
            </div>

            {/* CAMPOS DEPENDIENTES DEL MODO */}
            {mode === 'consolidated' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="unified-filter-label" style={{ marginBottom: '6px', display: 'block' }}>
                    Destinatario Principal (Para:) *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="ej: finanzas@purplebtl.com, gerencia@purplebtl.com"
                    value={destinationEmail}
                    onChange={e => setDestinationEmail(e.target.value)}
                    className="unified-select"
                    style={{ width: '100%', height: '40px' }}
                  />
                </div>

                <div className="form-group">
                  <label className="unified-filter-label" style={{ marginBottom: '6px', display: 'block' }}>
                    Con Copia (CC opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="ej: operaciones@purplebtl.com"
                    value={ccEmails}
                    onChange={e => setCcEmails(e.target.value)}
                    className="unified-select"
                    style={{ width: '100%', height: '40px' }}
                  />
                </div>

                <div className="form-group">
                  <label className="unified-filter-label" style={{ marginBottom: '6px', display: 'block' }}>
                    Asunto del Correo
                  </label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="unified-select"
                    style={{ width: '100%', height: '40px' }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="unified-filter-label" style={{ margin: 0 }}>
                    Destinatarios por Orden ({ordenes.length})
                  </label>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Puedes verificar o cambiar el correo antes de enviar
                  </span>
                </div>

                <div style={{ 
                  maxHeight: '220px', 
                  overflowY: 'auto', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '10px',
                  background: '#fafafa',
                  padding: '8px'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {ordenes.map(orden => {
                      const prov = proveedorMap[orden.proveedorId];
                      const proy = proyectoMap[orden.proyectoId];
                      const currentEmail = recipientOverrides[orden.id] || '';
                      const hasEmail = Boolean(currentEmail.trim());

                      return (
                        <div 
                          key={orden.id}
                          style={{
                            background: '#ffffff',
                            border: hasEmail ? '1px solid #e2e8f0' : '1px solid #fecaca',
                            borderRadius: '8px',
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                            flexWrap: 'wrap'
                          }}
                        >
                          <div style={{ minWidth: '180px', flex: '1 1 200px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ 
                                fontWeight: 700, 
                                color: 'var(--accent-primary)', 
                                fontSize: '13px', 
                                fontFamily: 'monospace' 
                              }}>
                                {orden.id}
                              </span>
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                backgroundColor: orden.tipoOrden === 'Servicio' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                color: orden.tipoOrden === 'Servicio' ? '#2563eb' : '#059669',
                              }}>
                                {orden.tipoOrden || 'Compra'}
                              </span>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {prov?.razonSocial || 'Proveedor'}
                              </span>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Proy: {proy?.nombre || '-'} • Monto: <strong style={{ color: '#059669' }}>{formatSoles(orden.total)}</strong>
                            </div>
                          </div>

                          <div style={{ flex: '1 1 240px', minWidth: '220px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <input
                                type="email"
                                required
                                placeholder="correo@proveedor.com"
                                value={currentEmail}
                                onChange={e => handleUpdateRecipient(orden.id, e.target.value)}
                                style={{
                                  flex: 1,
                                  height: '34px',
                                  padding: '0 10px',
                                  fontSize: '12px',
                                  borderRadius: '6px',
                                  border: hasEmail ? '1px solid #cbd5e1' : '1px solid #ef4444',
                                  background: hasEmail ? '#ffffff' : '#fef2f2',
                                  outline: 'none'
                                }}
                              />
                              <span 
                                title={`PDF: Orden_${orden.tipoOrden || 'Compra'}_${orden.id}.pdf`}
                                style={{
                                  fontSize: '11px',
                                  background: 'rgba(102, 45, 145, 0.08)',
                                  color: 'var(--accent-primary)',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  whiteSpace: 'nowrap',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <FileText size={12} /> PDF
                              </span>
                            </div>
                            {!hasEmail && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '3px' }}>
                                <span style={{ fontSize: '10px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <AlertTriangle size={11} /> Ingresa un correo de destino
                                </span>
                                {currentUserEmail && (
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateRecipient(orden.id, currentUserEmail)}
                                    style={{
                                      fontSize: '10px',
                                      background: 'none',
                                      border: 'none',
                                      color: 'var(--accent-primary)',
                                      cursor: 'pointer',
                                      textDecoration: 'underline',
                                      padding: 0,
                                      fontWeight: 600
                                    }}
                                  >
                                    Usar mi correo
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '4px' }}>
                  <label className="unified-filter-label" style={{ marginBottom: '6px', display: 'block' }}>
                    Con Copia (CC opcional para todos los envíos)
                  </label>
                  <input
                    type="text"
                    placeholder="ej: contabilidad@purplebtl.com, operaciones@purplebtl.com"
                    value={ccEmails}
                    onChange={e => setCcEmails(e.target.value)}
                    className="unified-select"
                    style={{ width: '100%', height: '40px' }}
                  />
                </div>
              </div>
            )}

            {/* MENSAJE ADICIONAL */}
            <div className="form-group">
              <label className="unified-filter-label" style={{ marginBottom: '6px', display: 'block' }}>
                Mensaje personalizado en el cuerpo del correo
              </label>
              <textarea
                rows={4}
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="unified-select"
                style={{ 
                  width: '100%', 
                  padding: '10px 12px', 
                  fontSize: '13px', 
                  height: 'auto', 
                  lineHeight: '1.5',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* RESUMEN DE ADJUNTOS */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.04) 0%, rgba(16, 185, 129, 0.04) 100%)',
              border: '1px solid rgba(124, 58, 237, 0.15)',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} style={{ color: '#059669' }} />
                <span>
                  Cada correo incluirá como archivo adjunto el <strong>PDF oficial con diseño de Purple BTL</strong> generado al instante.
                </span>
              </div>
              <span style={{ fontWeight: 700, color: 'var(--accent-primary)', whiteSpace: 'nowrap', marginLeft: '12px' }}>
                {ordenes.length} archivo(s) PDF
              </span>
            </div>

            {/* ESTADO DE ENVÍO */}
            {isSending && (
              <div style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                padding: '12px 16px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: '#1e40af',
                fontSize: '13px'
              }}>
                <Loader2 size={18} className="animate-spin" />
                <span>{sendingStatus}</span>
              </div>
            )}

          </div>

          {/* MODAL FOOTER */}
          <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={onClose}
              disabled={isSending}
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="btn-primary"
              disabled={isSending}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: '180px',
                justifyContent: 'center'
              }}
            >
              {isSending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <Send size={16} />
                  <span>
                    {mode === 'consolidated' 
                      ? `Enviar Correo (${ordenes.length} PDFs)` 
                      : `Enviar ${ordenes.length} Correo(s)`}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>,
    document.body
  );
};
