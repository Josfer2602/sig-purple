import React, { useState, useEffect } from 'react';
import { useGlobalContext, API_URL } from '../context/GlobalContext';
import { Settings, Image as ImageIcon, Code, Plus, X, Save, Mail, Send, Loader2, FileSpreadsheet, Download } from 'lucide-react';
import { DocumentTemplateEditor } from '../components/DocumentTemplateEditor';
import { buildHeaderHtmlFromVisual, buildFooterHtmlFromVisual, DEFAULT_ORDEN_VISUAL_CONFIG, DEFAULT_PAGO_VISUAL_CONFIG } from '../utils/documentTemplateHelper';
import { exportFullDatabaseToExcel, exportClientesToExcel, exportProyectosToExcel, exportCotizacionesToExcel, exportProveedoresToExcel, exportOrdenesToExcel, exportPagosToExcel, exportFacturasToExcel, exportGastosToExcel } from '../utils/excelExport';
import { DEFAULT_CONDICIONES_PAGO_ORDEN, parsePorcentajeAdelanto } from '../utils/ordenPaymentHelper';
import type { ListasDinamicas } from '../types/models';
import toast from 'react-hot-toast';

type TabType = 'documentos' | 'listas' | 'backups' | 'correos';
type ListKey = keyof Omit<ListasDinamicas, 'plantillasVisualConfig'>;

export const ConfiguracionView: React.FC = () => {
  const { 
    appConfig, 
    listas, 
    updateConfig, 
    token,
    clientes = [],
    proyectos = [],
    quotes = [],
    proveedores = [],
    ordenes = [],
    pagos = [],
    facturasCliente = [],
    gastosProduccion = []
  } = useGlobalContext();
  const [activeTab, setActiveTab] = useState<TabType>('documentos');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  
  // Local state for documents
  const [ordenHeaderHtml, setOrdenHeaderHtml] = useState(appConfig?.ordenHeaderHtml || '');
  const [ordenFooterHtml, setOrdenFooterHtml] = useState(appConfig?.ordenFooterHtml || '');
  const [pagoHeaderHtml, setPagoHeaderHtml] = useState(appConfig?.pagoHeaderHtml || '');
  const [pagoFooterHtml, setPagoFooterHtml] = useState(appConfig?.pagoFooterHtml || '');
  const [notificacionPagosEmails, setNotificacionPagosEmails] = useState(appConfig?.notificacionPagosEmails || '');
  const [notificacionPagosSubject, setNotificacionPagosSubject] = useState(appConfig?.notificacionPagosSubject || '');
  const [notificacionPagosTemplate, setNotificacionPagosTemplate] = useState(appConfig?.notificacionPagosTemplate || '');
  const [habilitarNotificacionPagos, setHabilitarNotificacionPagos] = useState<boolean>(appConfig?.habilitarNotificacionPagos ?? false);
  const [notificarProveedorPago, setNotificarProveedorPago] = useState<boolean>(appConfig?.notificarProveedorPago ?? false);

  // Local state for lists
  const defaultListas: ListasDinamicas = {
    tipoServicio: [],
    tipoProyecto: [],
    estadoProyecto: [],
    estadoCotizacion: [],
    estadoOrdenEntrega: [],
    estadoOrdenPago: [],
    estadoPagoProveedor: [],
    categoriasProveedor: [],
    subcategoriasProveedor: [],
    tagsProveedor: [],
    condicionesPagoOrden: DEFAULT_CONDICIONES_PAGO_ORDEN
  };

  const [localListas, setLocalListas] = useState<ListasDinamicas>(() => {
    if (!listas) return defaultListas;
    return {
      ...defaultListas,
      ...listas,
      condicionesPagoOrden: (listas.condicionesPagoOrden && listas.condicionesPagoOrden.length > 0)
        ? listas.condicionesPagoOrden
        : DEFAULT_CONDICIONES_PAGO_ORDEN
    };
  });
  const [selectedList, setSelectedList] = useState<ListKey>('condicionesPagoOrden');
  const [newItemText, setNewItemText] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const [ordenVisual, setOrdenVisual] = useState(DEFAULT_ORDEN_VISUAL_CONFIG);
  const [pagoVisual, setPagoVisual] = useState(DEFAULT_PAGO_VISUAL_CONFIG);

  useEffect(() => {
    if (appConfig) {
      setOrdenHeaderHtml(appConfig.ordenHeaderHtml || buildHeaderHtmlFromVisual(DEFAULT_ORDEN_VISUAL_CONFIG));
      setOrdenFooterHtml(appConfig.ordenFooterHtml || buildFooterHtmlFromVisual(DEFAULT_ORDEN_VISUAL_CONFIG));
      setPagoHeaderHtml(appConfig.pagoHeaderHtml || buildHeaderHtmlFromVisual(DEFAULT_PAGO_VISUAL_CONFIG));
      setPagoFooterHtml(appConfig.pagoFooterHtml || buildFooterHtmlFromVisual(DEFAULT_PAGO_VISUAL_CONFIG));
      setNotificacionPagosEmails(appConfig.notificacionPagosEmails || '');
      setNotificacionPagosSubject(appConfig.notificacionPagosSubject || '');
      setNotificacionPagosTemplate(appConfig.notificacionPagosTemplate || '');
      setHabilitarNotificacionPagos(appConfig.habilitarNotificacionPagos ?? false);
      setNotificarProveedorPago(appConfig.notificarProveedorPago ?? false);
    }
    if (listas) {
      setLocalListas({
        ...defaultListas,
        ...listas,
        condicionesPagoOrden: (listas.condicionesPagoOrden && listas.condicionesPagoOrden.length > 0)
          ? listas.condicionesPagoOrden
          : DEFAULT_CONDICIONES_PAGO_ORDEN
      });
      if (listas.plantillasVisualConfig) {
        if (listas.plantillasVisualConfig.ordenVisual) {
          setOrdenVisual(listas.plantillasVisualConfig.ordenVisual);
        }
        if (listas.plantillasVisualConfig.pagoVisual) {
          setPagoVisual(listas.plantillasVisualConfig.pagoVisual);
        }
      }
    } else {
      setLocalListas(defaultListas);
    }
  }, [appConfig, listas]);

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      const updatedListas = {
        ...localListas,
        plantillasVisualConfig: {
          ordenVisual,
          pagoVisual
        }
      };
      setLocalListas(updatedListas);

      await updateConfig({
        headerHtml: ordenHeaderHtml, // Fallbacks
        footerHtml: ordenFooterHtml, // Fallbacks
        ordenHeaderHtml,
        ordenFooterHtml,
        pagoHeaderHtml,
        pagoFooterHtml,
        notificacionPagosEmails,
        notificacionPagosSubject,
        notificacionPagosTemplate,
        habilitarNotificacionPagos,
        notificarProveedorPago,
        listasDinamicas: JSON.stringify(updatedListas)
      });
      toast.success('¡Plantillas y configuración guardadas correctamente!');
    } catch (err: any) {
      console.error('Error al guardar configuración:', err);
      toast.error('Error al guardar: ' + (err?.message || 'Error de conexión'));
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleTestEmail = async () => {
    const targetEmail = notificacionPagosEmails.split(',')[0]?.trim();
    if (!targetEmail) {
      toast.error('Por favor ingresa al menos un correo destinatario.');
      return;
    }
    setIsTestingEmail(true);
    try {
      const res = await fetch(`${API_URL}/email/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ to: targetEmail })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al conectar con SMTP');
      }
      toast.success(data.message || 'Correo de prueba enviado exitosamente.');
    } catch (err: any) {
      console.error(err);
      toast.error('Error SMTP: ' + err.message, { duration: 6000 });
    } finally {
      setIsTestingEmail(false);
    }
  };

  const handleAddListItem = (e?: React.FormEvent, customValue?: string) => {
    if (e) e.preventDefault();
    const valueToAdd = (customValue || newItemText).trim();
    if (!valueToAdd || !localListas) return;
    
    const currentList = localListas[selectedList] || [];
    if (currentList.includes(valueToAdd)) {
      toast.error('Esta opción ya existe en la lista.');
      return;
    }

    setLocalListas({
      ...localListas,
      [selectedList]: [...(localListas[selectedList] || []), valueToAdd]
    });
    setNewItemText('');
    toast.success(`Opción "${valueToAdd}" agregada`);
  };

  const handleRemoveListItem = (itemToRemove: string) => {
    if (!localListas) return;
    setLocalListas({
      ...localListas,
      [selectedList]: (localListas[selectedList] || []).filter(item => item !== itemToRemove)
    });
  };

  const listLabels: Record<ListKey, string> = {
    condicionesPagoOrden: '💳 Condiciones de Pago (Órdenes)',
    tipoServicio: 'Tipos de Servicio',
    tipoProyecto: 'Tipos de Proyecto',
    estadoProyecto: 'Estados de Proyecto',
    estadoCotizacion: 'Estados de Cotización',
    estadoOrdenEntrega: 'Estados de Orden (Entrega)',
    estadoOrdenPago: 'Estados de Orden (Pago)',
    estadoPagoProveedor: 'Estados de Pago a Proveedor',
    categoriasProveedor: 'Categorías de Proveedores',
    subcategoriasProveedor: 'Subcategorías de Proveedores',
    tagsProveedor: 'Tags / Etiquetas de Proveedores'
  };

  return (
    <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="view-header actions-only" style={{ justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn-primary" onClick={handleSaveConfig} disabled={isSavingConfig} style={{ background: 'var(--success)', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isSavingConfig ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          <span>{isSavingConfig ? 'Guardando...' : 'Guardar Cambios'}</span>
        </button>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <button 
          className={`btn-secondary ${activeTab === 'documentos' ? 'active-tab' : ''}`}
          onClick={() => setActiveTab('documentos')}
          style={{ 
            background: activeTab === 'documentos' ? 'var(--accent-primary)' : 'transparent',
            borderColor: activeTab === 'documentos' ? 'var(--accent-primary)' : 'var(--border-color)',
            color: activeTab === 'documentos' ? 'white' : 'var(--text-primary)'
          }}
        >
          <ImageIcon size={18} /> Formatos de Impresión
        </button>
        <button 
          className={`btn-secondary ${activeTab === 'listas' ? 'active-tab' : ''}`}
          onClick={() => setActiveTab('listas')}
          style={{ 
            background: activeTab === 'listas' ? 'var(--accent-primary)' : 'transparent',
            borderColor: activeTab === 'listas' ? 'var(--accent-primary)' : 'var(--border-color)',
            color: activeTab === 'listas' ? 'white' : 'var(--text-primary)'
          }}
        >
          <Code size={18} /> Listas Desplegables
        </button>
        <button 
          className={`btn-secondary ${activeTab === 'backups' ? 'active-tab' : ''}`}
          onClick={() => setActiveTab('backups')}
          style={{ 
            background: activeTab === 'backups' ? 'var(--accent-primary)' : 'transparent',
            borderColor: activeTab === 'backups' ? 'var(--accent-primary)' : 'var(--border-color)',
            color: activeTab === 'backups' ? 'white' : 'var(--text-primary)'
          }}
        >
          <Save size={18} /> Copias de Seguridad
        </button>
        <button 
          className={`btn-secondary ${activeTab === 'correos' ? 'active-tab' : ''}`}
          onClick={() => setActiveTab('correos')}
          style={{ 
            background: activeTab === 'correos' ? 'var(--accent-primary)' : 'transparent',
            borderColor: activeTab === 'correos' ? 'var(--accent-primary)' : 'var(--border-color)',
            color: activeTab === 'correos' ? 'white' : 'var(--text-primary)'
          }}
        >
          <Settings size={18} /> Notificaciones por Correo
        </button>
      </div>

      <div className="glass-panel" style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        {activeTab === 'documentos' && (
          <DocumentTemplateEditor
            ordenHeaderHtml={ordenHeaderHtml}
            setOrdenHeaderHtml={setOrdenHeaderHtml}
            ordenFooterHtml={ordenFooterHtml}
            setOrdenFooterHtml={setOrdenFooterHtml}
            pagoHeaderHtml={pagoHeaderHtml}
            setPagoHeaderHtml={setPagoHeaderHtml}
            pagoFooterHtml={pagoFooterHtml}
            setPagoFooterHtml={setPagoFooterHtml}
            ordenVisual={ordenVisual}
            setOrdenVisual={setOrdenVisual}
            pagoVisual={pagoVisual}
            setPagoVisual={setPagoVisual}
            onSave={handleSaveConfig}
            isSaving={isSavingConfig}
          />
        )}

        {activeTab === 'listas' && localListas && (
          <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '32px', height: '100%' }}>
            
            {/* Sidebar for List Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderRight: '1px solid var(--border-color)', paddingRight: '16px' }}>
              {(Object.keys(listLabels) as Array<ListKey>).map(key => (
                <button
                  key={key}
                  className={`btn-secondary ${selectedList === key ? 'active-list' : ''}`}
                  onClick={() => setSelectedList(key)}
                  style={{ 
                    justifyContent: 'flex-start',
                    background: selectedList === key ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                    borderColor: selectedList === key ? 'var(--accent-primary)' : 'transparent',
                    color: selectedList === key ? 'var(--accent-primary)' : 'var(--text-primary)'
                  }}
                >
                  {listLabels[key]}
                </button>
              ))}
            </div>

            {/* List Editor */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ margin: 0, color: 'var(--accent-primary)', fontSize: '1.25rem' }}>{listLabels[selectedList]}</h3>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Total: {((localListas[selectedList] as string[]) || []).length} opciones
                </span>
              </div>

              {selectedList === 'condicionesPagoOrden' && (
                <div style={{ 
                  background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.06) 0%, rgba(59, 130, 246, 0.06) 100%)', 
                  border: '1px solid rgba(124, 58, 237, 0.25)', 
                  borderRadius: '12px', 
                  padding: '16px 20px', 
                  marginBottom: '20px' 
                }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>💡 Motor de Cálculo de Porcentajes de Pago</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Puedes crear cualquier porcentaje o condición para las Órdenes de Compra (ej. <strong>40/60</strong>, <strong>20/80</strong>, <strong>70/30</strong>, <strong>100% Adelanto</strong> o <strong>Crédito a 30 días</strong>). 
                    El sistema detecta automáticamente la fracción de adelanto y saldo, calculando los montos exactos en la orden y en el módulo de pagos a proveedores.
                  </p>
                  
                  {/* Preset Quick Buttons */}
                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Atajos rápidos:</span>
                    {[
                      '40% Adelanto / 60% Contra Entrega',
                      '20% Adelanto / 80% Contra Entrega',
                      '25% Adelanto / 75% Contra Entrega',
                      '70% Adelanto / 30% Contra Entrega',
                      '15% Adelanto / 85% Contra Entrega',
                      '10% Adelanto / 90% Contra Entrega'
                    ].map(preset => {
                      const exists = (localListas.condicionesPagoOrden || []).includes(preset);
                      return (
                        <button
                          key={preset}
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleAddListItem(undefined, preset)}
                          disabled={exists}
                          style={{
                            fontSize: '11px',
                            padding: '3px 10px',
                            height: 'auto',
                            opacity: exists ? 0.45 : 1,
                            cursor: exists ? 'default' : 'pointer'
                          }}
                          title={exists ? 'Ya está en la lista' : `Agregar ${preset}`}
                        >
                          + {preset.split('/')[0].trim()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              
              <form onSubmit={handleAddListItem} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder={selectedList === 'condicionesPagoOrden' ? "Ej: 40% Adelanto / 60% Contra Entrega o 40/60" : "Agregar nueva opción..."} 
                    value={newItemText}
                    onChange={e => setNewItemText(e.target.value)}
                    style={{ minWidth: '320px', flex: '1', maxWidth: '500px' }}
                  />
                  <button type="submit" className="btn-primary" disabled={!newItemText.trim()}>
                    <Plus size={18} /> Agregar a la Lista
                  </button>
                </div>
                {selectedList === 'condicionesPagoOrden' && newItemText.trim() && (
                  <div style={{ fontSize: '12px', color: 'var(--accent-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>✨ Detección automática:</span>
                    <span className="badge badge-info" style={{ padding: '2px 8px', fontSize: '11px' }}>
                      Adelanto: {(parsePorcentajeAdelanto(newItemText) * 100).toFixed(0)}% | Saldo: {(100 - parsePorcentajeAdelanto(newItemText) * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {((localListas[selectedList] as string[]) || []).length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No hay opciones en esta lista.</p>
                ) : (
                  ((localListas[selectedList] as string[]) || []).map((item: string, idx: number) => {
                    const isCondicion = selectedList === 'condicionesPagoOrden';
                    const pctAdelanto = isCondicion ? parsePorcentajeAdelanto(item) : 0;
                    const pctSaldo = Math.max(0, 1 - pctAdelanto);

                    return (
                      <div 
                        key={idx} 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          padding: '12px 16px',
                          background: 'rgba(0,0,0,0.02)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item}</span>
                          {isCondicion && (
                            <span 
                              className="badge" 
                              style={{ 
                                fontSize: '11px', 
                                padding: '2px 8px',
                                background: pctAdelanto === 1 ? 'rgba(16, 185, 129, 0.15)' : pctAdelanto === 0 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(124, 58, 237, 0.12)',
                                color: pctAdelanto === 1 ? '#059669' : pctAdelanto === 0 ? '#2563eb' : 'var(--accent-primary)',
                                fontWeight: 600
                              }}
                            >
                              {pctAdelanto === 1 ? '100% Contado' : pctAdelanto === 0 ? '100% Contra Entrega / Crédito' : `${(pctAdelanto * 100).toFixed(0)}% Adelanto / ${(pctSaldo * 100).toFixed(0)}% Saldo`}
                            </span>
                          )}
                        </div>
                        <button 
                          className="btn-icon" 
                          onClick={() => handleRemoveListItem(item)}
                          style={{ color: '#ef4444' }}
                          title={`Eliminar "${item}"`}
                        >
                          <X size={18} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'backups' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '900px', margin: '0 auto', padding: '10px 0 40px' }}>
            
            {/* PANEL 1: EXPORTACIÓN COMPLETA A EXCEL */}
            <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '28px', borderRadius: '16px', border: '1.5px solid #10b981' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{ background: '#10b981', color: '#fff', borderRadius: '8px', padding: '8px', display: 'flex' }}>
                  <FileSpreadsheet size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '18px' }}>
                    Exportación de Bases de Datos en Excel (.xlsx)
                  </h3>
                  <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                    Descarga libros con formato estructurado, auto-ajuste de columnas y análisis inteligente de duplicados.
                  </p>
                </div>
              </div>

              <div style={{ marginTop: '20px', padding: '16px 20px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px' }}>
                    Libro Consolidado Multi-Hoja (Base Completa)
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px' }}>
                    Incluye 8 hojas: Clientes, Proyectos, Cotizaciones (con duplicados), Proveedores, Órdenes, Pagos, Facturas y Gastos.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => exportFullDatabaseToExcel({ clientes, proyectos, quotes, proveedores, ordenes, pagos, facturasCliente, gastosProduccion })}
                  style={{ backgroundColor: '#10b981', borderColor: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontWeight: 600 }}
                >
                  <Download size={18} />
                  <span>Descargar Base Completa (.xlsx)</span>
                </button>
              </div>

              <div style={{ marginTop: '24px' }}>
                <h4 style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Descargas Individuales por Tabla:
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                  
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => exportClientesToExcel(clientes, proyectos)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', fontSize: '13px' }}
                  >
                    <span>🏢 Clientes ({clientes.length})</span>
                    <Download size={14} style={{ color: '#10b981' }} />
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => exportProyectosToExcel(proyectos, clientes, quotes)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', fontSize: '13px' }}
                  >
                    <span>📁 Proyectos ({proyectos.length})</span>
                    <Download size={14} style={{ color: '#10b981' }} />
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => exportCotizacionesToExcel(quotes, proyectos, clientes)}
                    title="Incluye columnas con detección de cotizaciones duplicadas"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', fontSize: '13px', borderLeft: '3px solid #f59e0b' }}
                  >
                    <span>📑 Cotizaciones ({quotes.length})</span>
                    <Download size={14} style={{ color: '#f59e0b' }} />
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => exportProveedoresToExcel(proveedores)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', fontSize: '13px' }}
                  >
                    <span>🚚 Proveedores ({proveedores.length})</span>
                    <Download size={14} style={{ color: '#10b981' }} />
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => exportOrdenesToExcel(ordenes, proveedores, proyectos, clientes)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', fontSize: '13px' }}
                  >
                    <span>📋 Órdenes ({ordenes.length})</span>
                    <Download size={14} style={{ color: '#10b981' }} />
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => exportPagosToExcel(pagos, proveedores, proyectos, ordenes)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', fontSize: '13px' }}
                  >
                    <span>💳 Pagos Proveedor ({pagos.length})</span>
                    <Download size={14} style={{ color: '#10b981' }} />
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => exportFacturasToExcel(facturasCliente, proyectos, clientes)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', fontSize: '13px' }}
                  >
                    <span>🧾 Facturas ({facturasCliente.length})</span>
                    <Download size={14} style={{ color: '#10b981' }} />
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => exportGastosToExcel(gastosProduccion, proyectos, clientes)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', fontSize: '13px' }}
                  >
                    <span>📉 Gastos ({gastosProduccion.length})</span>
                    <Download size={14} style={{ color: '#10b981' }} />
                  </button>

                </div>
              </div>
            </div>

            {/* PANEL 2: COPIAS DE SEGURIDAD EN GOOGLE DRIVE */}
            <div style={{ background: 'rgba(56, 189, 248, 0.05)', padding: '28px', borderRadius: '16px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                Copias de Seguridad Automáticas en Google Drive
              </h3>
              <p style={{ color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto 20px', fontSize: '13px', lineHeight: '1.6' }}>
                El sistema realiza una copia de seguridad automática de toda la base de datos de manera diaria (a las 02:00 AM) y la envía a la carpeta de Google Drive configurada.
              </p>
              <button 
                className="btn-secondary" 
                disabled={isBackingUp}
                onClick={async () => {
                  setIsBackingUp(true);
                  try {
                    const res = await fetch(`${API_URL}/backup`, { method: 'POST' });
                    const data = await res.json();
                    if (res.ok && data.success) {
                      toast.success(`Backup generado y subido correctamente a Google Drive.\nEnlace: ${data.link}`);
                      window.open(data.link, '_blank');
                    } else {
                      toast.error(`Error al generar backup: ${data.error || 'Desconocido'}`);
                    }
                  } catch (e) {
                    toast.error('Error de red al intentar generar el backup.');
                  } finally {
                    setIsBackingUp(false);
                  }
                }}
                style={{ padding: '10px 24px', fontSize: '14px' }}
              >
                {isBackingUp ? 'Generando Backup en Drive...' : 'Forzar Backup a Google Drive Ahora'}
              </button>
            </div>

          </div>
        )}

        {activeTab === 'correos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <h2 style={{ color: 'var(--text-primary)' }}>Configuración de Notificaciones por Correo</h2>
            <p style={{ color: 'var(--text-muted)' }}>
              Configura las direcciones de correo electrónico, asunto y plantilla del cuerpo del correo que se enviarán automáticamente cuando se registre un pago.
            </p>

            <div className="glass-panel" style={{ padding: '24px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Master Toggle */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '18px 20px',
                background: habilitarNotificacionPagos ? 'rgba(16, 185, 129, 0.08)' : 'rgba(0, 0, 0, 0.02)',
                border: `1.5px solid ${habilitarNotificacionPagos ? '#10b981' : 'var(--border-color)'}`,
                borderRadius: '12px',
                transition: 'all 0.25s ease'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: habilitarNotificacionPagos ? '#10b981' : 'var(--bg-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: habilitarNotificacionPagos ? '#fff' : 'var(--text-muted)'
                  }}>
                    <Mail size={22} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Envío automático de correo al registrar pago a proveedor
                      </span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: habilitarNotificacionPagos ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.15)',
                        color: habilitarNotificacionPagos ? '#059669' : '#64748b',
                        textTransform: 'uppercase'
                      }}>
                        {habilitarNotificacionPagos ? 'Habilitado' : 'Desactivado'}
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                      Al registrarse un nuevo pago, el sistema adjuntará en segundo plano el PDF de la Orden (OC/OS), el PDF del Formato de Pago y la Factura adjunta.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setHabilitarNotificacionPagos(prev => !prev)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                    border: habilitarNotificacionPagos ? '1px solid #10b981' : '1px solid var(--border-color)',
                    background: habilitarNotificacionPagos ? '#10b981' : 'var(--bg-panel)',
                    color: habilitarNotificacionPagos ? '#fff' : 'var(--text-primary)'
                  }}
                >
                  {habilitarNotificacionPagos ? '✅ Activado' : '⚪ Desactivado'}
                </button>
              </div>

              {/* Opción secundaria: Copia al Proveedor */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'rgba(0,0,0,0.015)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px'
              }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    ¿Incluir también al correo del proveedor en la notificación?
                  </span>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                    Si está marcado, se añadirá el correo registrado del proveedor (proveedor.correo) además de las direcciones fijas indicadas abajo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setNotificarProveedorPago(prev => !prev)}
                  disabled={!habilitarNotificacionPagos}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: habilitarNotificacionPagos ? 'pointer' : 'not-allowed',
                    opacity: habilitarNotificacionPagos ? 1 : 0.5,
                    border: notificarProveedorPago && habilitarNotificacionPagos ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                    background: notificarProveedorPago && habilitarNotificacionPagos ? 'var(--accent-primary)' : 'var(--bg-panel)',
                    color: notificarProveedorPago && habilitarNotificacionPagos ? '#fff' : 'var(--text-secondary)'
                  }}
                >
                  {notificarProveedorPago ? 'Sí, notificar proveedor' : 'No (Solo correos internos)'}
                </button>
              </div>

              <div className="form-group">
                <label>Correos para Recepción de Pagos y Órdenes</label>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Ingresa las direcciones de correo separadas por comas. (Ej. contabilidad@empresa.com, tesoreria@empresa.com)
                </p>
                <input 
                  type="text" 
                  className="form-control" 
                  value={notificacionPagosEmails} 
                  onChange={e => setNotificacionPagosEmails(e.target.value)}
                  placeholder="ejemplo@correo.com, otro@correo.com"
                />
              </div>

              <div className="form-group">
                <label>Asunto del Correo</label>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Puedes usar variables como: <code>{'{{PAGO_ID}}'}</code>, <code>{'{{ORDEN_ID}}'}</code>, <code>{'{{TITULO_PAGO}}'}</code>, <code>{'{{PROVEEDOR_NOMBRE}}'}</code>, <code>{'{{PROYECTO_NOMBRE}}'}</code>, <code>{'{{TITULO_ORDEN}}'}</code>
                </p>
                <input 
                  type="text" 
                  className="form-control" 
                  value={notificacionPagosSubject} 
                  onChange={e => setNotificacionPagosSubject(e.target.value)}
                  placeholder="Ej: Pago a proveedor {{PAGO_ID}} {{PROYECTO_NOMBRE}} {{PROVEEDOR_NOMBRE}} {{TITULO_PAGO}}"
                />
              </div>

              <div className="form-group">
                <label>Plantilla del Cuerpo del Correo (HTML permitido)</label>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Variables disponibles: <code>{'{{PAGO_ID}}'}</code>, <code>{'{{ORDEN_ID}}'}</code>, <code>{'{{TITULO_PAGO}}'}</code>, <code>{'{{TITULO_ORDEN}}'}</code>, <code>{'{{PAGO_ESTADO}}'}</code>, <code>{'{{PAGO_MONTO}}'}</code>, <code>{'{{PROVEEDOR_NOMBRE}}'}</code>, <code>{'{{PROVEEDOR_RUC}}'}</code>, <code>{'{{FECHA_PAGO}}'}</code>, <code>{'{{BANCO}}'}</code>, <code>{'{{CUENTA_NUMERO}}'}</code>, <code>{'{{CUENTA_CCI}}'}</code>, <code>{'{{TIPO_CUENTA}}'}</code>, <code>{'{{CLIENTE_NOMBRE}}'}</code>, <code>{'{{PROYECTO_NOMBRE}}'}</code>
                </p>
                <textarea 
                  className="form-control" 
                  rows={10} 
                  value={notificacionPagosTemplate} 
                  onChange={e => setNotificacionPagosTemplate(e.target.value)}
                  placeholder="Escribe la plantilla del cuerpo en formato HTML..."
                  style={{ fontFamily: 'monospace', fontSize: '13px' }}
                />
              </div>

              {/* Botón de Prueba */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                background: 'rgba(0, 0, 0, 0.02)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                marginTop: '8px'
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                    Diagnóstico y Prueba de Conexión
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                    Envía un correo de prueba inmediato para validar si las credenciales de correo (SMTP) están aceptadas por Gmail.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleTestEmail}
                  disabled={isTestingEmail}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
                >
                  {isTestingEmail ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {isTestingEmail ? 'Verificando SMTP...' : 'Probar Envío de Correo'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
