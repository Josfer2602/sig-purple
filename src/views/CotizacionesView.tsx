import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { CotizacionesList } from '../components/CotizacionesList';
import { CotizacionBuilder } from '../components/CotizacionBuilder';
import { CreateOrdenesMasivasModal } from '../components/CreateOrdenesMasivasModal';
import { SearchableProjectSelect } from '../components/SearchableProjectSelect';
import { useGlobalContext, API_URL } from '../context/GlobalContext';
import type { Quote } from '../types/quote';
import { ensureImprevistoInSubItems } from '../types/quote';
import { cloneCategoriesWithFreshIds } from '../utils/quoteMathHelper';
import { Loader2, FileSpreadsheet, X, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export const CotizacionesView: React.FC = () => {
  const { quotes, addQuote, updateQuote, deleteQuote, proyectos, clientes } = useGlobalContext();
  const [view, setView] = useState<'list' | 'builder'>('list');
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [masivoQuoteId, setMasivoQuoteId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [newQuoteName, setNewQuoteName] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCreatingQuote, setIsCreatingQuote] = useState(false);

  // Excel Import state for new quote modal
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [parsedExcelData, setParsedExcelData] = useState<{ categories: any[]; metadata: any } | null>(null);
  const [excelError, setExcelError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const qid = localStorage.getItem('openQuoteId');
    if (qid) {
      setActiveQuoteId(qid);
      setView('builder');
      localStorage.removeItem('openQuoteId');
    }

    const handleNavigate = (e: any) => {
      if (e.detail && e.detail.module === 'cotizaciones' && e.detail.quoteId) {
        setActiveQuoteId(e.detail.quoteId);
        setView('builder');
      }
    };

    window.addEventListener('navigate', handleNavigate);
    return () => window.removeEventListener('navigate', handleNavigate);
  }, []);

  React.useEffect(() => {
    if (view === 'builder' && activeQuoteId) {
      localStorage.setItem('currentViewingQuoteId', activeQuoteId);
      (window as any).__currentActiveQuoteId = activeQuoteId;
    } else {
      localStorage.removeItem('currentViewingQuoteId');
      (window as any).__currentActiveQuoteId = null;
    }
    return () => {
      localStorage.removeItem('currentViewingQuoteId');
      (window as any).__currentActiveQuoteId = null;
    };
  }, [view, activeQuoteId]);

  const generateId = () => `COT-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  const generateTemplateId = () => `TPL-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

  const handleNew = () => {
    setSelectedProjectId('');
    setNewQuoteName('');
    setExcelFile(null);
    setParsedExcelData(null);
    setExcelError(null);
    setIsModalOpen(true);
  };

  const handleExcelFileSelect = async (file: File) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsm') && !name.endsWith('.xlsx')) {
      toast.error('Solo se admiten archivos Excel (.xlsm o .xlsx)');
      return;
    }

    setExcelFile(file);
    setIsParsingExcel(true);
    setExcelError(null);
    setParsedExcelData(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/quotes/parse-excel`, {
        method: 'POST',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: formData
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al procesar el archivo Excel');
      }

      const data = await res.json();
      if (!data.categories || data.categories.length === 0) {
        throw new Error('No se detectaron categorías ni ítems en las hojas del archivo Excel.');
      }

      setParsedExcelData(data);
      if (data.metadata?.requirement && !newQuoteName) {
        setNewQuoteName(data.metadata.requirement);
      }
      const totalItems = data.categories.reduce((acc: number, c: any) => acc + (c.items?.length || 0), 0);
      toast.success(`Excel procesado: ${data.categories.length} categorías y ${totalItems} ítems detectados`);
    } catch (err: any) {
      console.error('Error parseando Excel:', err);
      setExcelError(err.message || 'Error al leer el archivo Excel');
      setExcelFile(null);
      setParsedExcelData(null);
      toast.error('Error: ' + (err.message || 'No se pudo leer el archivo Excel'));
    } finally {
      setIsParsingExcel(false);
    }
  };

  const handleCreateQuote = async (
    projectId: string, 
    quoteName: string, 
    initialCategories?: any[],
    initialMetadata?: any
  ) => {
    if (isCreatingQuote) return;
    setIsCreatingQuote(true);

    const proyecto = proyectos.find(p => p.id === projectId);
    const cliente = clientes.find(c => c.id === proyecto?.clienteId);

    let categories: any[] = [];
    if (initialCategories && initialCategories.length > 0) {
      categories = initialCategories.map((cat: any) => ({
        id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: cat.name || 'Categoría',
        items: (cat.items || []).map((item: any) => ({
          id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          name: item.name || 'Ítem',
          quantity: Number(item.quantity) || 1,
          dates: Number(item.dates) || 1,
          details: Array.isArray(item.details) ? item.details : [],
          internalMultiplierPercent: Number(item.internalMultiplierPercent) || 10,
          financialExpensePercent: Number(item.financialExpensePercent) || 10,
          providerContact: item.providerContact || '',
          productionTime: item.productionTime || '',
          subItems: ensureImprevistoInSubItems(
            (item.subItems || []).map((sub: any) => ({
              id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              name: sub.name || '',
              description: sub.description || '',
              quantity: Number(sub.quantity) || 1,
              dates: Number(sub.dates) || 1,
              unitCost: Number(sub.unitCost) || 0,
              providerName: sub.providerName || ''
            }))
          )
        }))
      }));
    }

    const finalRequirement = quoteName || initialMetadata?.requirement || proyecto?.nombre || '';

    const newQuote: Quote = {
      id: generateId(),
      projectId,
      version: 1,
      isTemplate: false,
      status: 'En Creación',
      client: cliente?.empresa || '',
      brand: cliente?.empresa || '',
      requirement: finalRequirement,
      date: new Date().toLocaleDateString('es-PE'),
      businessName: cliente?.empresa || 'Purple BTL S.A.C.',
      ruc: '20603757417',
      paymentConditions: '30 días de crédito',
      categories
    };
    try {
      const savedQuote = await addQuote(newQuote);
      toast.success(categories.length > 0 ? 'Cotización creada con estructura importada de Excel' : 'Cotización creada exitosamente');
      setActiveQuoteId(savedQuote.id);
      setIsModalOpen(false);
      setView('builder');
    } catch (e: any) {
      toast.error("Error al crear la cotización: " + (e.message || 'Error inesperado'));
      console.error(e);
    } finally {
      setIsCreatingQuote(false);
    }
  };

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  };

  const ensureFullQuote = async (id: string, fallbackQuote?: Quote): Promise<Quote | null> => {
    if (fallbackQuote && Array.isArray(fallbackQuote.categories) && fallbackQuote.categories.length > 0) {
      return fallbackQuote;
    }
    try {
      const res = await fetch(`${API_URL}/quotes/${id}?latest=false&version=${fallbackQuote?.version || ''}`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const fetched = await res.json();
        if (fetched && fetched.id) {
          return fetched;
        }
      }
    } catch (e) {
      console.warn('No se pudo obtener el detalle completo de la cotización:', e);
    }
    return fallbackQuote || null;
  };

  const handleEdit = (id: string) => {
    const q = quotes.find(item => item.id === id);
    if (q && (q.status === 'Aprobado' || q.status === 'Enviado')) {
      localStorage.removeItem(`quoteDraft_${id}`);
    }
    setActiveQuoteId(id);
    setView('builder');
  };

  const handleDuplicate = async (id: string) => {
    if (isUpdating || isCreatingQuote) return;
    setIsUpdating(true);
    try {
      const candidate = quotes.find(q => q.id === id);
      const sourceQuote = await ensureFullQuote(id, candidate);
      if (!sourceQuote) {
        toast.error('No se encontró la cotización origen');
        return;
      }
      
      const isFromTemplate = Boolean(sourceQuote.isTemplate);
      const projectQuotes = quotes.filter(q => {
        if (q.isTemplate) return false;
        if (sourceQuote.projectId && q.projectId === sourceQuote.projectId) return true;
        if (sourceQuote.client && sourceQuote.requirement && q.client === sourceQuote.client && q.requirement === sourceQuote.requirement) return true;
        return false;
      });
      const maxVersion = Math.max(...projectQuotes.map(q => q.version || 1), 0);

      const duplicatedQuote: Quote = JSON.parse(JSON.stringify(sourceQuote));
      duplicatedQuote.id = generateId();
      duplicatedQuote.version = isFromTemplate ? 1 : maxVersion + 1;
      duplicatedQuote.isTemplate = false;
      duplicatedQuote.status = 'En Creación';
      duplicatedQuote.date = new Date().toLocaleDateString('es-PE');
      duplicatedQuote.categories = cloneCategoriesWithFreshIds(duplicatedQuote.categories || []);
      
      await addQuote(duplicatedQuote);
      toast.success(isFromTemplate ? 'Cotización creada desde plantilla' : `Nueva versión V${duplicatedQuote.version} creada con todos sus ítems`);
    } catch (e: any) {
      toast.error('Error al duplicar: ' + (e.message || 'Error'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleNewVersion = async (id: string) => {
    if (isUpdating || isCreatingQuote) return;
    setIsUpdating(true);
    try {
      const candidate = quotes.find(q => q.id === id);
      const sourceQuote = await ensureFullQuote(id, candidate);
      if (!sourceQuote) {
        toast.error('No se encontró la cotización origen');
        return;
      }
      
      const projectQuotes = quotes.filter(q => {
        if (q.isTemplate) return false;
        if (sourceQuote.projectId && q.projectId === sourceQuote.projectId) return true;
        if (sourceQuote.client && sourceQuote.requirement && q.client === sourceQuote.client && q.requirement === sourceQuote.requirement) return true;
        return false;
      });
      const maxVersion = Math.max(...projectQuotes.map(q => q.version || 1), 0);
      
      const newVersionQuote: Quote = JSON.parse(JSON.stringify(sourceQuote));
      newVersionQuote.id = generateId();
      newVersionQuote.version = maxVersion + 1;
      newVersionQuote.status = 'En Creación';
      newVersionQuote.date = new Date().toLocaleDateString('es-PE');
      newVersionQuote.categories = cloneCategoriesWithFreshIds(newVersionQuote.categories || []);
      
      await addQuote(newVersionQuote);
      toast.success(`Nueva versión V${newVersionQuote.version} creada con todos sus ítems`);
    } catch (e: any) {
      toast.error('Error al crear versión: ' + (e.message || 'Error'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveAsTemplate = async (id: string) => {
    if (isUpdating || isCreatingQuote) return;
    setIsUpdating(true);
    try {
      const candidate = quotes.find(q => q.id === id);
      const sourceQuote = await ensureFullQuote(id, candidate);
      if (!sourceQuote) {
        toast.error('No se encontró la cotización origen');
        return;
      }
      
      const templateQuote: Quote = JSON.parse(JSON.stringify(sourceQuote));
      templateQuote.id = generateTemplateId();
      templateQuote.isTemplate = true;
      templateQuote.templateName = `${sourceQuote.requirement} (Plantilla)`;
      templateQuote.status = 'En Creación';
      templateQuote.date = new Date().toLocaleDateString('es-PE');
      templateQuote.categories = cloneCategoriesWithFreshIds(templateQuote.categories || []);
      
      await addQuote(templateQuote);
      toast.success('Guardado como plantilla');
    } catch (e: any) {
      toast.error('Error al guardar plantilla: ' + (e.message || 'Error'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleBackToList = () => {
    setActiveQuoteId(null);
    setView('list');
  };

  const handleUpdateActiveQuote = async (updatedQuote: Quote) => {
    setIsUpdating(true);
    try {
      await updateQuote(updatedQuote);
      await new Promise(r => setTimeout(r, 1000));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    localStorage.removeItem(`quoteDraft_${id}`);
    const quoteToUpdate = quotes.find(q => q.id === id);
    if (quoteToUpdate) {
      setIsUpdating(true);
      try {
        await updateQuote({ ...quoteToUpdate, status: newStatus });
        await new Promise(r => setTimeout(r, 1000));
      } finally {
        setIsUpdating(false);
      }
    }
  };

  React.useEffect(() => {
    (quotes || []).forEach(q => {
      if (q && (q.status === 'Aprobado' || q.status === 'Enviado')) {
        localStorage.removeItem(`quoteDraft_${q.id}`);
      }
    });
  }, [quotes]);

  const handleDelete = (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar esta cotización? Esta acción no se puede deshacer.')) {
      deleteQuote(id);
    }
  };

  return (
    <>
      {view === 'list' ? (
        <>
          <CotizacionesList 
            quotes={quotes}
            onNew={handleNew}
            onImportExcel={handleNew}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onNewVersion={handleNewVersion}
            onSaveAsTemplate={handleSaveAsTemplate}
            onUpdateStatus={handleUpdateStatus}
            onDelete={handleDelete}
            onGenerateOrders={(id) => setMasivoQuoteId(id)}
          />

          <CreateOrdenesMasivasModal
            isOpen={!!masivoQuoteId}
            onClose={() => setMasivoQuoteId(null)}
            initialQuoteId={masivoQuoteId || undefined}
          />
          {isModalOpen && ReactDOM.createPortal(
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(3px)',
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              zIndex: 1000
            }}>
              <div className="glass-panel" style={{ width: '520px', maxWidth: '92vw', display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h2 style={{ margin: 0, fontSize: 'var(--text-xl)' }}>Nueva Cotización</h2>
                    {parsedExcelData && (
                      <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                        Excel Cargado
                      </span>
                    )}
                  </div>
                  <button 
                    type="button" 
                    disabled={isCreatingQuote || isParsingExcel}
                    style={{ 
                      background: 'transparent', 
                      border: 'none', 
                      color: 'var(--text-secondary)', 
                      cursor: (isCreatingQuote || isParsingExcel) ? 'not-allowed' : 'pointer', 
                      fontSize: '1.2rem',
                      opacity: (isCreatingQuote || isParsingExcel) ? 0.4 : 1
                    }} 
                    onClick={() => !isCreatingQuote && !isParsingExcel && setIsModalOpen(false)}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ padding: '24px', overflow: 'visible', maxHeight: '78vh', overflowY: 'auto' }}>
                  <form id="createQuoteForm" onSubmit={(e) => {
                    e.preventDefault();
                    if (isCreatingQuote || isParsingExcel) return;
                    if (!selectedProjectId) return toast.error('Por favor seleccione un proyecto');
                    handleCreateQuote(selectedProjectId, newQuoteName.trim(), parsedExcelData?.categories, parsedExcelData?.metadata);
                  }} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        1. Asignar a Proyecto *
                      </label>
                      <SearchableProjectSelect
                        proyectos={proyectos}
                        clientes={clientes}
                        value={selectedProjectId}
                        onChange={(pId) => {
                          setSelectedProjectId(pId);
                          if (!newQuoteName) {
                            const p = proyectos.find(item => item.id === pId);
                            if (p) setNewQuoteName(p.nombre);
                          }
                        }}
                        disabled={isCreatingQuote || isParsingExcel}
                        autoFocus={true}
                      />
                      <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        El cliente y la marca se asociarán automáticamente a partir del proyecto seleccionado.
                      </span>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        2. Nombre de la Cotización / Requerimiento
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Ej: Activación BTL, Personal, Estación de Juegos..."
                        value={newQuoteName}
                        onChange={(e) => setNewQuoteName(e.target.value)}
                        disabled={isCreatingQuote || isParsingExcel}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          fontSize: '0.9rem'
                        }}
                      />
                      <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Permite identificar esta cotización claramente cuando un proyecto tiene múltiples cotizaciones.
                      </span>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        <span>3. Importar desde Excel (.xlsm / .xlsx)</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>Opcional</span>
                      </label>

                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        style={{ display: 'none' }} 
                        accept=".xlsm,.xlsx" 
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleExcelFileSelect(f);
                        }} 
                      />

                      {!parsedExcelData && !isParsingExcel && (
                        <div 
                          onClick={() => fileInputRef.current?.click()}
                          onDragOver={(e) => { e.preventDefault(); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const f = e.dataTransfer.files?.[0];
                            if (f) handleExcelFileSelect(f);
                          }}
                          style={{
                            border: '2px dashed var(--border-color)',
                            borderRadius: '12px',
                            padding: '20px 16px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            background: 'rgba(255, 255, 255, 0.02)',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                        >
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            color: '#10b981',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <FileSpreadsheet size={22} />
                          </div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                            Arrastra tu cotización Excel aquí o <span style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>selecciona un archivo</span>
                          </div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', maxWidth: '380px' }}>
                            Se cargarán las categorías, ítems, descripciones, cantidades, márgenes y proveedores del Excel.
                          </div>
                        </div>
                      )}

                      {isParsingExcel && (
                        <div style={{
                          border: '1.5px solid rgba(16, 185, 129, 0.4)',
                          borderRadius: '12px',
                          padding: '24px',
                          textAlign: 'center',
                          background: 'rgba(16, 185, 129, 0.05)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '10px'
                        }}>
                          <Loader2 className="animate-spin" size={28} style={{ color: '#10b981' }} />
                          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            Procesando y analizando archivo Excel...
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Extrayendo ítems comerciales y detalle de proveedores...
                          </div>
                        </div>
                      )}

                      {parsedExcelData && (
                        <div style={{
                          border: '1.5px solid rgba(16, 185, 129, 0.35)',
                          borderRadius: '12px',
                          padding: '16px',
                          background: 'rgba(16, 185, 129, 0.04)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                              <FileSpreadsheet size={20} style={{ color: '#10b981', flexShrink: 0 }} />
                              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '320px' }}>
                                {excelFile?.name || 'Cotización.xlsm'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setExcelFile(null);
                                setParsedExcelData(null);
                                setExcelError(null);
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '4px',
                                borderRadius: '4px'
                              }}
                              title="Quitar archivo Excel y crear cotización vacía"
                            >
                              <X size={16} />
                            </button>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                              {parsedExcelData.categories.length} Categorías
                            </span>
                            <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                              {parsedExcelData.categories.reduce((a, c) => a + (c.items?.length || 0), 0)} Ítems
                            </span>
                            <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                              {parsedExcelData.categories.reduce((a, c) => a + (c.items || []).reduce((sa: number, i: any) => sa + (i.subItems?.length || 0), 0), 0)} Subítems / Costos
                            </span>
                          </div>

                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                            <CheckCircle2 size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                            <span>La matriz de costos se cargará completa en la cotización.</span>
                          </div>
                        </div>
                      )}

                      {excelError && (
                        <div style={{
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          background: 'rgba(239, 68, 68, 0.08)',
                          color: '#ef4444',
                          fontSize: '0.8rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginTop: '8px'
                        }}>
                          <AlertCircle size={16} style={{ flexShrink: 0 }} />
                          <span>{excelError}</span>
                        </div>
                      )}
                    </div>
                  </form>
                </div>
                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    disabled={isCreatingQuote || isParsingExcel}
                    style={{ opacity: (isCreatingQuote || isParsingExcel) ? 0.5 : 1, cursor: (isCreatingQuote || isParsingExcel) ? 'not-allowed' : 'pointer' }}
                    onClick={() => !isCreatingQuote && !isParsingExcel && setIsModalOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    form="createQuoteForm" 
                    className="btn-primary" 
                    disabled={isCreatingQuote || isParsingExcel}
                    style={{ 
                      backgroundColor: parsedExcelData ? '#10b981' : 'var(--accent-primary)', 
                      borderColor: parsedExcelData ? '#10b981' : 'var(--accent-primary)',
                      opacity: (isCreatingQuote || isParsingExcel) ? 0.75 : 1,
                      cursor: (isCreatingQuote || isParsingExcel) ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    {isCreatingQuote ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        <span>Creando cotización...</span>
                      </>
                    ) : parsedExcelData ? (
                      <>
                        <FileSpreadsheet size={16} />
                        <span>Crear e Importar Excel</span>
                      </>
                    ) : (
                      <span>Continuar</span>
                    )}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </>
      ) : (
        (() => {
          const activeQuote = quotes.find(q => q.id === activeQuoteId);
          if (!activeQuote) {
            return (
              <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', maxWidth: '500px', margin: '40px auto' }}>
                <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: '12px', color: 'var(--text-primary)' }}>No se encontró la cotización</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: 'var(--text-sm)' }}>
                  La cotización seleccionada no existe o la sincronización en segundo plano aún no ha terminado.
                </p>
                <button 
                  className="btn-primary" 
                  style={{ background: 'var(--accent-primary)', borderColor: 'var(--accent-primary)', padding: '10px 20px' }}
                  onClick={() => { setView('list'); setActiveQuoteId(null); }}
                >
                  Volver a la Lista de Cotizaciones
                </button>
              </div>
            );
          }
          return (
            <CotizacionBuilder 
              initialQuote={activeQuote}
              allQuotes={quotes}
              onBack={handleBackToList}
              onUpdateGlobal={handleUpdateActiveQuote}
            />
          );
        })()
      )}
      {(isUpdating || isCreatingQuote) && ReactDOM.createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(8px)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          zIndex: 99999
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.98)',
            padding: '36px 44px',
            borderRadius: '24px',
            border: '1.5px solid rgba(102, 45, 145, 0.2)',
            boxShadow: '0 25px 50px -12px rgba(102, 45, 145, 0.3), 0 0 0 1px rgba(102, 45, 145, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '18px',
            maxWidth: '420px',
            width: '90%',
            animation: 'fadeInScale 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, rgba(102, 45, 145, 0.12) 0%, rgba(168, 85, 247, 0.18) 100%)',
              border: '1.5px solid rgba(102, 45, 145, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 16px rgba(102, 45, 145, 0.12)'
            }}>
              <Loader2 className="animate-spin" size={38} style={{ color: '#662D91' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 700, color: '#1e1b4b', letterSpacing: '-0.02em' }}>
                {isCreatingQuote ? 'Creando cotización...' : 'Guardando cambios...'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.5, fontWeight: 500 }}>
                {isCreatingQuote ? 'Registrando cotización oficial en el sistema Purple' : 'Sincronizando información en la base de datos...'}
              </p>
            </div>
            <div style={{
              width: '120px',
              height: '3.5px',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, #662D91, #a855f7, #ec4899)',
              boxShadow: '0 0 10px rgba(168, 85, 247, 0.5)'
            }} />
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
