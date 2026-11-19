import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Trash2, Eye, Edit, Search, ChevronDown, ChevronRight, ChevronLeft, Receipt, X, List, FolderTree, Building2, Briefcase, FileSpreadsheet } from 'lucide-react';
import { useGlobalContext, BASE_URL } from '../context/GlobalContext';
import { CreateGastoProduccionModal } from '../components/CreateGastoProduccionModal';
import { ReembolsoGastosModal } from '../components/ReembolsoGastosModal';
import { ImportGastosProduccionModal } from '../components/ImportGastosProduccionModal';
import type { GastoProduccion } from '../types/models';
import { SkeletonTable } from '../components/SkeletonTable';
import { useIsMobile } from '../hooks/useIsMobile';
import { exportGastosToExcel } from '../utils/excelExport';

export const GastosProduccionView: React.FC = () => {
  const { gastosProduccion, clientes, proyectos, deleteGastoProduccion, currentUserRole, updateGastoProduccion, isLoading } = useGlobalContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [gastoToEdit, setGastoToEdit] = useState<GastoProduccion | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [expandedGastos, setExpandedGastos] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'pendientes' | 'devueltos' | 'todos'>('pendientes');
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat');
  const isMobile = useIsMobile(768);
  const [mobileDisplayMode, setMobileDisplayMode] = useState<'cards' | 'table'>('cards');

  // Table Scroll & Pagination States
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const handleScrollTable = (direction: 'left' | 'right') => {
    if (tableContainerRef.current) {
      const scrollAmount = 350;
      tableContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab, viewMode]);

  // Multimodal Reimbursement States
  const [selectedGastoIds, setSelectedGastoIds] = useState<string[]>([]);
  const [isReembolsoModalOpen, setIsReembolsoModalOpen] = useState(false);

  const canManageReembolso = currentUserRole === 'Directorio' || currentUserRole === 'Admin';

  const toggleGasto = (gastoId: string) => {
    setExpandedGastos(prev => ({ ...prev, [gastoId]: !prev[gastoId] }));
  };

  const toggleSelectGasto = (id: string) => {
    setSelectedGastoIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const clienteDict = useMemo(() => (clientes || []).reduce((acc, c) => ({ ...acc, [c.id]: c.empresa || 'Sin Empresa' }), {} as Record<string, string>), [clientes]);
  const proyectoDict = useMemo(() => (proyectos || []).reduce((acc, p) => ({ ...acc, [p.id]: p.nombre || 'Sin Nombre' }), {} as Record<string, string>), [proyectos]);

  const getClienteName = (id?: string) => (id && clienteDict[id]) ? String(clienteDict[id]) : 'Desconocido';
  const getProyectoName = (id?: string) => (id && proyectoDict[id]) ? String(proyectoDict[id]) : 'Desconocido';

  const filteredGastos = (gastosProduccion || []).filter(g => {
    if (!g || !g.id) return false;
    const searchLower = (searchTerm || '').toLowerCase();
    const clienteName = getClienteName(g.clienteId || (g as any).cliente?.id).toLowerCase();
    const proyectoName = getProyectoName(g.proyectoId || (g as any).proyecto?.id).toLowerCase();
    const idLower = String(g.id || '').toLowerCase();
    const resp = String(g.areaResponsable || '').toLowerCase();
    
    if (searchLower && 
        !clienteName.includes(searchLower) &&
        !proyectoName.includes(searchLower) &&
        !idLower.includes(searchLower) &&
        !resp.includes(searchLower)) return false;
        
    const isDevuelto = g.estadoGasto === 'Devuelto' || g.estadoGasto === 'Reembolsado' || g.estadoGasto === 'Pagado';
    if (activeTab === 'pendientes' && isDevuelto) return false;
    if (activeTab === 'devueltos' && !isDevuelto) return false;
    
    return true;
  });

  const selectedGastosList = useMemo(() => {
    return (gastosProduccion || []).filter(g => g && g.id && selectedGastoIds.includes(g.id));
  }, [gastosProduccion, selectedGastoIds]);

  const groupedGastos = useMemo(() => {
    const grouped: Record<string, Record<string, GastoProduccion[]>> = {};
    filteredGastos.forEach(g => {
      if (!g || !g.id) return;
      const cId = g.clienteId || (g as any).cliente?.id || 'sin-cliente';
      const pId = g.proyectoId || (g as any).proyecto?.id || 'sin-proyecto';
      if (!grouped[cId]) grouped[cId] = {};
      if (!grouped[cId][pId]) grouped[cId][pId] = [];
      grouped[cId][pId].push(g);
    });
    return grouped;
  }, [filteredGastos]);

  const visibleTotalSum = useMemo(() => {
    return filteredGastos.reduce((acc, g) => acc + Number(g?.total || 0), 0);
  }, [filteredGastos]);

  const totalPages = Math.ceil(filteredGastos.length / pageSize) || 1;
  const paginatedGastos = useMemo(() => {
    if (viewMode === 'grouped') return filteredGastos;
    const start = (currentPage - 1) * pageSize;
    return filteredGastos.slice(start, start + pageSize);
  }, [filteredGastos, currentPage, pageSize, viewMode]);

  const toggleClient = (clientId: string) => {
    setExpandedClients(prev => ({ ...prev, [clientId]: prev[clientId] === false ? true : false }));
  };

  const toggleProject = (projectId: string) => {
    setExpandedProjects(prev => ({ ...prev, [projectId]: prev[projectId] === false ? true : false }));
  };

  const handleDocumentClick = (url?: string) => {
    if (!url) return;
    const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    window.open(fullUrl, '_blank');
  };

  const getBadgeClass = (estado: string) => {
    if (estado === 'Devuelto' || estado === 'Reembolsado' || estado === 'Pagado') return 'badge-success';
    return 'badge-warning';
  };


  const renderGastoItemRow = (gasto: GastoProduccion, isFlat: boolean = false) => {

                            if (!gasto || !gasto.id) return null;
                            const isGastoExpanded = expandedGastos[gasto.id] === true;
                            const isDevuelto = gasto.estadoGasto === 'Devuelto' || gasto.estadoGasto === 'Reembolsado' || gasto.estadoGasto === 'Pagado';

                            return (
                            <React.Fragment key={gasto.id}>
                              <tr 
                                className="expandable-row" 
                                style={{ cursor: 'pointer', backgroundColor: isGastoExpanded ? 'rgba(0,0,0,0.01)' : 'transparent' }}
                                onClick={() => toggleGasto(gasto.id)}
                              >
                                {canManageReembolso && (
                                  <td className="td-custom" style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: 'inherit', textAlign: 'center', width: '45px' }} onClick={(e) => e.stopPropagation()}>
                                    {!isDevuelto ? (
                                      <input 
                                        type="checkbox" 
                                        checked={selectedGastoIds.includes(gasto.id)} 
                                        onChange={() => toggleSelectGasto(gasto.id)}
                                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                      />
                                    ) : (
                                      <span style={{ color: 'var(--success)', fontSize: '12px' }}>✓</span>
                                    )}
                                  </td>
                                )}
                                <td className="td-custom" style={{ position: 'sticky', left: canManageReembolso ? '45px' : 0, zIndex: 10, backgroundColor: 'inherit', fontWeight: 600, color: 'var(--accent-primary)', paddingLeft: '16px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {isGastoExpanded ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
                                    <Receipt size={16} />
                                    {String(gasto.id || '').substring(0,8)}...
                                  </div>
                                </td>
                                {isFlat && (
                                  <>
                                    <td className="td-custom" style={{ verticalAlign: 'middle' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Building2 size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                                        <span style={{ fontWeight: 600 }}>{getClienteName(gasto.clienteId || (gasto as any).cliente?.id)}</span>
                                      </div>
                                    </td>
                                    <td className="td-custom" style={{ verticalAlign: 'middle' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Briefcase size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                        <span>{getProyectoName(gasto.proyectoId || (gasto as any).proyecto?.id)}</span>
                                      </div>
                                    </td>
                                  </>
                                )}
                                <td className="td-custom">
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ fontWeight: 'bold' }}>{gasto.tipoComprobante || 'Boleta'}</span>
                                      {gasto.esGastoAdicional && (
                                        <span 
                                          style={{ 
                                            backgroundColor: '#fef3c7', 
                                            color: '#b45309', 
                                            border: '1px solid #f59e0b', 
                                            fontSize: '10px', 
                                            padding: '1px 6px', 
                                            borderRadius: '8px', 
                                            fontWeight: 700
                                          }}
                                          title={gasto.motivoAdicional ? `Gasto Adicional: ${gasto.motivoAdicional}` : 'Gasto Adicional / Fuera de presupuesto'}
                                        >
                                          ⚡ Adicional
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                                      {gasto.numeroComprobante || '-'}
                                      {gasto.motivoAdicional && <span style={{ marginLeft: '4px', fontStyle: 'italic', color: '#b45309' }}>• {gasto.motivoAdicional}</span>}
                                    </div>
                                  </div>
                                </td>
                                <td className="td-custom">{gasto.fechaEmision || '-'}</td>
                                <td className="td-custom" style={{ fontWeight: 500 }}>{gasto.areaResponsable || '-'}</td>
                                <td className="td-custom">
                                  {canManageReembolso ? (
                                    <select
                                      value={isDevuelto ? 'Devuelto' : 'Pendiente'}
                                      onChange={async (e) => {
                                        e.stopPropagation();
                                        await updateGastoProduccion(gasto.id, { ...gasto, estadoGasto: e.target.value } as any);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className={`badge ${getBadgeClass(gasto.estadoGasto || 'Pendiente')}`}
                                      style={{ background: 'transparent', border: '1px solid var(--border-color)', outline: 'none', cursor: 'pointer', fontWeight: 600 }}
                                    >
                                      <option value="Pendiente" style={{ color: 'black' }}>Pendiente</option>
                                      <option value="Devuelto" style={{ color: 'black' }}>Devuelto</option>
                                    </select>
                                  ) : (
                                    <span className={`badge ${getBadgeClass(gasto.estadoGasto || 'Pendiente')}`}>
                                      {isDevuelto ? 'Devuelto' : 'Pendiente'}
                                    </span>
                                  )}
                                </td>
                                <td className="td-custom font-bold text-emerald font-tabular">S/ {Number(gasto.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="td-custom sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 10, backgroundColor: 'inherit', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                    <button className="btn-icon" onClick={(e) => {
                                      e.stopPropagation();
                                      setGastoToEdit(gasto);
                                      setIsModalOpen(true);
                                    }} title="Editar" style={{ color: 'var(--accent-primary)' }}>
                                      <Edit size={16} />
                                    </button>
                                    {gasto.comprobanteUrl && (
                                      <button className="btn-icon" onClick={(e) => {
                                        e.stopPropagation();
                                        handleDocumentClick(gasto.comprobanteUrl);
                                      }} title="Ver Comprobante de Gasto (Boleta/Factura)" style={{ color: 'var(--text-primary)' }}>
                                        <Eye size={16} />
                                      </button>
                                    )}
                                    {gasto.comprobanteDevolucionUrl && (
                                      <button className="btn-icon" onClick={(e) => {
                                        e.stopPropagation();
                                        handleDocumentClick(gasto.comprobanteDevolucionUrl);
                                      }} title="Ver Voucher de Devolución / Depósito" style={{ color: 'var(--success)' }}>
                                        <span style={{ fontSize: '15px' }}>🏦</span>
                                      </button>
                                    )}
                                    <button className="btn-icon" onClick={(e) => {
                                      e.stopPropagation();
                                      if(window.confirm('¿Borrar este gasto permanentemente?')) deleteGastoProduccion(gasto.id);
                                    }} title="Eliminar" style={{ color: 'var(--danger)' }}>
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {isGastoExpanded && (
                                <tr style={{ backgroundColor: '#fafafa' }}>
                                  <td colSpan={canManageReembolso ? (isFlat ? 10 : 8) : (isFlat ? 9 : 7)} style={{ padding: '16px 16px 16px 72px' }}>
                                    <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-secondary)' }}>ÍTEMS AFECTADOS</div>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                      <thead>
                                        <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                                          <th style={{ padding: '8px', textAlign: 'left', color: 'var(--text-muted)' }}>ÍTEM COTIZADO</th>
                                          <th style={{ padding: '8px', textAlign: 'center', color: 'var(--text-muted)' }}>% DEL COSTO</th>
                                          <th style={{ padding: '8px', textAlign: 'right', color: 'var(--text-muted)' }}>MONTO ASIGNADO</th>
                                        </tr>
                                      </thead>
                                       <tbody>
                                         {gasto.items && gasto.items.length > 0 ? gasto.items.map((it: any) => {
                                           const parts = String(it.name || '').split(' — ');
                                           const itemName = parts[0] || it.name || '-';
                                           const itemDetail = it.customDescription || (parts.length > 1 ? parts.slice(1).join(' — ') : null);

                                           return (
                                             <tr key={it.id || it.name} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                               <td style={{ padding: '8px', color: 'var(--text-primary)' }}>
                                                 <div style={{ fontWeight: 500 }}>{itemName}</div>
                                                 {itemDetail && (
                                                   <div style={{ marginTop: '3px' }}>
                                                     <span style={{ fontSize: '11px', background: 'rgba(102, 45, 145, 0.08)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, display: 'inline-block' }}>
                                                       📝 {itemDetail}
                                                     </span>
                                                   </div>
                                                 )}
                                               </td>
                                               <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-secondary)' }}>{it.costPercentage || 0}%</td>
                                               <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: 'var(--accent-primary)' }}>S/ {Number(it.monto || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                             </tr>
                                           );
                                         }) : (
                                           <tr><td colSpan={3} style={{ padding: '8px', textAlign: 'center', color: 'var(--text-muted)' }}>No hay ítems registrados</td></tr>
                                         )}
                                       </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                            );
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '80px' }}>
      {/* UNIFIED MASTER TOOLBAR: TABS ON LEFT, ACTIONS ON RIGHT */}
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '14px' }}>
        {/* UNIFIED TABS */}
        <div className="unified-tabs" style={{ marginBottom: 0, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            className={`unified-tab ${activeTab === 'pendientes' ? 'active' : ''}`}
            onClick={() => setActiveTab('pendientes')}
          >
            Pendientes
            {(gastosProduccion || []).filter(g => g && g.estadoGasto !== 'Devuelto' && g.estadoGasto !== 'Reembolsado' && g.estadoGasto !== 'Pagado').length > 0 && (
              <span className="unified-tab-badge badge-warning">
                {(gastosProduccion || []).filter(g => g && g.estadoGasto !== 'Devuelto' && g.estadoGasto !== 'Reembolsado' && g.estadoGasto !== 'Pagado').length}
              </span>
            )}
          </button>
          <button 
            className={`unified-tab ${activeTab === 'devueltos' ? 'active' : ''}`}
            onClick={() => setActiveTab('devueltos')}
          >
            Devueltos
            {(gastosProduccion || []).filter(g => g && (g.estadoGasto === 'Devuelto' || g.estadoGasto === 'Reembolsado' || g.estadoGasto === 'Pagado')).length > 0 && (
              <span className="unified-tab-badge badge-success">
                {(gastosProduccion || []).filter(g => g && (g.estadoGasto === 'Devuelto' || g.estadoGasto === 'Reembolsado' || g.estadoGasto === 'Pagado')).length}
              </span>
            )}
          </button>
          <button 
            className={`unified-tab ${activeTab === 'todos' ? 'active' : ''}`}
            onClick={() => setActiveTab('todos')}
          >
            Todos los Gastos
            <span className="unified-tab-badge">{(gastosProduccion || []).filter(g => g && g.id).length}</span>
          </button>
        </div>

        {/* VIEW ACTIONS */}
        <div className="view-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={() => setIsImportModalOpen(true)}
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px', 
              background: '#ecfdf5', 
              border: '1.5px solid #10b981', 
              color: '#065f46', 
              fontWeight: 700 
            }}
            title="Descargar plantilla Excel y cargar gastos con cálculo automático de IGV"
          >
            <FileSpreadsheet size={16} color="#059669" />
            <span>📥 Plantilla / Cargar Excel</span>
          </button>
          <button 
            type="button" 
            className="btn-excel" 
            onClick={() => exportGastosToExcel(gastosProduccion, proyectos, clientes)}
            title="Descargar base completa de gastos en Excel (.xlsx)"
          >
            <FileSpreadsheet size={16} />
            <span>Exportar Excel</span>
          </button>
          <button className="btn-primary" onClick={() => {
            setGastoToEdit(null);
            setIsModalOpen(true);
          }}>
            <Plus size={18} />
            Nuevo Gasto
          </button>
        </div>
      </div>

      {/* MULTIMODAL ACTION BAR */}
      {canManageReembolso && selectedGastoIds.length > 0 && (
        <div className="glass-panel" style={{ padding: '14px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(102, 45, 145, 0.08)', border: '1.5px solid var(--accent-primary)', borderRadius: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontWeight: 'bold', color: 'var(--accent-primary)', fontSize: '15px' }}>
              ✓ {selectedGastoIds.length} gasto(s) seleccionados
            </span>
            <span style={{ fontWeight: 'bold', color: 'var(--success)', fontSize: '16px' }}>
              Total a Devolver: S/ {selectedGastosList.reduce((acc, g) => acc + Number(g?.total || 0), 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-secondary" onClick={() => setSelectedGastoIds([])} style={{ fontSize: '13px' }}>
              Limpiar Selección
            </button>
            <button className="btn-primary" onClick={() => setIsReembolsoModalOpen(true)} style={{ fontSize: '13px', backgroundColor: 'var(--success)', borderColor: 'var(--success)' }}>
              💳 Realizar Devolución en Lote
            </button>
          </div>
        </div>
      )}

      {/* UNIFIED SEARCH & FILTER PANEL */}
      <div className="unified-filter-panel">
        <div className="unified-filter-group search-group">
          <label className="unified-filter-label">Búsqueda Rápida</label>
          <div className="unified-search-wrapper">
            <Search size={16} className="unified-search-icon" />
            <input 
              type="text" 
              placeholder="Buscar por ID, Cliente, Proyecto o Responsable..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="unified-search-input" 
            />
          </div>
        </div>
        {searchTerm && (
          <button className="btn-clear-filters" onClick={() => setSearchTerm('')} title="Limpiar búsqueda">
            <X size={14} />
            Limpiar
          </button>
        )}
      </div>

      <div className="glass-panel table-container" style={{ marginBottom: '56px' }}>
        {/* ENCABEZADO CON CONTADOR, SUMATORIA Y SELECTOR DE VISTA */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-color)',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '3px 10px' }}>
              {filteredGastos.length} {filteredGastos.length === 1 ? 'gasto' : 'gastos'}
            </span>
            {filteredGastos.length > 0 && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Total acumulado: <strong style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>S/ {visibleTotalSum.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* SELECTOR MODO MOBILE: TARJETAS VS TABLA */}
            {isMobile && (
              <div className="mobile-view-switcher">
                <button 
                  type="button"
                  className={`mobile-view-switcher-btn ${mobileDisplayMode === 'cards' ? 'active' : ''}`}
                  onClick={() => setMobileDisplayMode('cards')}
                  title="Ver gastos como tarjetas"
                >
                  📱 Tarjetas
                </button>
                <button 
                  type="button"
                  className={`mobile-view-switcher-btn ${mobileDisplayMode === 'table' ? 'active' : ''}`}
                  onClick={() => setMobileDisplayMode('table')}
                  title="Ver gastos como tabla completa"
                >
                  📋 Tabla
                </button>
              </div>
            )}

            {/* BOTONES DESPLAZAMIENTO HORIZONTAL */}
            {(!isMobile || mobileDisplayMode === 'table') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Desplazar:</span>
                <button
                  type="button"
                  onClick={() => handleScrollTable('left')}
                  className="btn-secondary"
                  style={{ padding: '4px 8px', height: '28px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                  title="Desplazar tabla a la izquierda"
                >
                  <ChevronLeft size={14} /> Izq
                </button>
                <button
                  type="button"
                  onClick={() => handleScrollTable('right')}
                  className="btn-secondary"
                  style={{ padding: '4px 8px', height: '28px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                  title="Desplazar tabla a la derecha"
                >
                  Der <ChevronRight size={14} />
                </button>
              </div>
            )}

            {(!isMobile || mobileDisplayMode === 'table') && (
              <div style={{ display: 'inline-flex', backgroundColor: 'var(--bg-subtle, rgba(0,0,0,0.04))', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setViewMode('flat')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: viewMode === 'flat' ? 700 : 500,
                    backgroundColor: viewMode === 'flat' ? 'var(--accent-primary)' : 'transparent',
                    color: viewMode === 'flat' ? '#ffffff' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title="Vista plana directa (todos los gastos en una sola grilla)"
                >
                  <List size={14} />
                  <span>Vista Plana</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grouped')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: viewMode === 'grouped' ? 700 : 500,
                    backgroundColor: viewMode === 'grouped' ? 'var(--accent-primary)' : 'transparent',
                    color: viewMode === 'grouped' ? '#ffffff' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title="Vista agrupada por cliente y proyecto"
                >
                  <FolderTree size={14} />
                  <span>Agrupada por Cliente</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div 
          ref={tableContainerRef} 
          className="custom-table-scroll" 
          style={{ 
            maxHeight: 'calc(100vh - 280px)', 
            minHeight: '400px', 
            overflowX: 'auto', 
            overflowY: 'auto', 
            position: 'relative' 
          }}
        >
          {isLoading ? (
            <SkeletonTable columns={viewMode === 'flat' ? 9 : 8} rows={6} message="Cargando gastos de producción..." />
          ) : (isMobile && mobileDisplayMode === 'cards') ? (
            <div className="mobile-cards-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px', marginBottom: '20px' }}>
              {paginatedGastos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                  <Receipt size={32} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>No se encontraron gastos de producción.</p>
                </div>
              ) : (
                paginatedGastos.map(g => {
                  const projectName = getProjectName(g.proyectoId);
                  const clientName = getClienteName(g.proyectoId);
                  const isPEN = !g.moneda || g.moneda === 'PEN';
                  const symbol = isPEN ? 'S/' : '$';

                  return (
                    <div key={g.id} className="mobile-data-card">
                      <div className="mobile-data-card-header">
                        <div style={{ minWidth: 0 }}>
                          <div className="mobile-data-card-title font-mono" style={{ color: 'var(--accent-primary)', fontSize: '13px' }}>
                            {g.id}
                          </div>
                          <div className="mobile-data-card-subtitle">
                            <span>📅 {g.fecha || '-'}</span>
                            {g.categoria && <span>• 🏷️ {g.categoria}</span>}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', flexShrink: 0 }}>
                          <span style={{ fontWeight: 800, fontSize: '15px', color: '#059669' }}>
                            {symbol} {Number(g.monto || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className={`badge ${g.estadoReembolso === 'Devuelto' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '10px' }}>
                            {g.estadoReembolso || 'Pendiente'}
                          </span>
                        </div>
                      </div>

                      <div style={{ margin: '4px 0' }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.3 }}>
                          {g.descripcion || 'Sin descripción'}
                        </div>
                      </div>

                      <div className="mobile-card-grid-meta">
                        <div className="mobile-card-meta-col">
                          <span className="mobile-card-meta-label">Proveedor / Pagado a</span>
                          <span className="mobile-card-meta-val" title={g.proveedor || ''}>🏪 {g.proveedor || '-'}</span>
                        </div>
                        <div className="mobile-card-meta-col">
                          <span className="mobile-card-meta-label">Proyecto</span>
                          <span className="mobile-card-meta-val" title={projectName}>📁 {projectName}</span>
                        </div>
                      </div>

                      <div className="mobile-card-actions-row">
                        <button 
                          type="button" 
                          className="mobile-action-pill primary" 
                          onClick={() => { setGastoToEdit(g); setIsModalOpen(true); }}
                          title="Editar Gasto"
                        >
                          <Edit size={13} />
                          <span>Editar</span>
                        </button>
                        {g.comprobanteUrl && (
                          <button 
                            type="button" 
                            className="mobile-action-pill" 
                            onClick={() => {
                              const fullUrl = g.comprobanteUrl.startsWith('http') ? g.comprobanteUrl : `${BASE_URL}${g.comprobanteUrl}`;
                              window.open(fullUrl, '_blank');
                            }}
                            title="Ver Comprobante"
                            style={{ color: '#06b6d4' }}
                          >
                            <Receipt size={13} />
                            <span>Comprobante</span>
                          </button>
                        )}
                        <button 
                          type="button" 
                          className="mobile-action-pill danger" 
                          onClick={() => {
                            if (window.confirm('¿Eliminar este gasto de producción permanentemente?')) {
                              deleteGastoProduccion(g.id);
                            }
                          }}
                          title="Eliminar Gasto"
                        >
                          <Trash2 size={13} />
                          <span>Borrar</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <table className="data-table" style={{ width: '100%', minWidth: viewMode === 'flat' ? (canManageReembolso ? '1490px' : '1440px') : (canManageReembolso ? '1220px' : '1180px'), tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
              {viewMode === 'flat' ? (
              <colgroup>
                {canManageReembolso && <col style={{ width: '45px' }} />}
                <col style={{ width: '140px' }} />
                <col style={{ width: '200px' }} />
                <col style={{ width: '200px' }} />
                <col style={{ width: '200px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '180px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '130px' }} />
              </colgroup>
            ) : (
              <colgroup>
                {canManageReembolso && <col style={{ width: '45px' }} />}
                <col style={{ width: '150px' }} />
                <col style={{ width: '220px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '190px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '130px' }} />
              </colgroup>
            )}
            <thead style={{ position: 'sticky', top: 0, zIndex: 12, backgroundColor: '#f8fafc' }}>
              {viewMode === 'flat' ? (
                <tr>
                  {canManageReembolso && <th className="header-custom" style={{ position: 'sticky', left: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '45px', textAlign: 'center' }}>SEL</th>}
                  <th className="header-custom" style={{ position: 'sticky', left: canManageReembolso ? '45px' : 0, zIndex: 16, backgroundColor: '#f8fafc', width: '140px' }}>ID GASTO</th>
                  <th className="header-custom">CLIENTE</th>
                  <th className="header-custom">PROYECTO</th>
                  <th className="header-custom">TIPO COMPROBANTE</th>
                  <th className="header-custom">FECHA</th>
                  <th className="header-custom">A QUIÉN SE DEVUELVE</th>
                  <th className="header-custom">ESTADO</th>
                  <th className="header-custom">TOTAL</th>
                  <th className="header-custom sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 16, backgroundColor: '#f8fafc', textAlign: 'center', width: '130px' }}>ACCIONES</th>
                </tr>
              ) : (
                <tr>
                  {canManageReembolso && <th className="header-custom" style={{ position: 'sticky', left: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '45px', textAlign: 'center' }}>SEL</th>}
                  <th className="header-custom" style={{ position: 'sticky', left: canManageReembolso ? '45px' : 0, zIndex: 16, backgroundColor: '#f8fafc', width: '150px' }}>ID GASTO</th>
                  <th className="header-custom">TIPO COMPROBANTE</th>
                  <th className="header-custom">FECHA</th>
                  <th className="header-custom">A QUIÉN SE DEVUELVE</th>
                  <th className="header-custom">ESTADO</th>
                  <th className="header-custom">TOTAL</th>
                  <th className="header-custom sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 16, backgroundColor: '#f8fafc', textAlign: 'center', width: '130px' }}>ACCIONES</th>
                </tr>
              )}
            </thead>
            <tbody>
              {filteredGastos.length === 0 ? (
                <tr>
                  <td colSpan={canManageReembolso ? (viewMode === 'flat' ? 10 : 8) : (viewMode === 'flat' ? 9 : 7)} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                    <Receipt size={36} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>No se encontraron gastos que coincidan con la búsqueda o filtro.</p>
                    {searchTerm && (
                      <button type="button" className="btn-secondary" onClick={() => setSearchTerm('')} style={{ margin: '12px auto 0', fontSize: '12px' }}>
                        Restablecer Filtros
                      </button>
                    )}
                  </td>
                </tr>
              ) : viewMode === 'flat' ? (
                paginatedGastos.map(gasto => renderGastoItemRow(gasto, true))
              ) : (
                Object.keys(groupedGastos).map(clienteId => {
                  const clientProjects = groupedGastos[clienteId];
                  const isClientExpanded = expandedClients[clienteId] === true;

                  return (
                    <React.Fragment key={clienteId}>
                      <tr 
                        style={{ backgroundColor: 'rgba(102, 45, 145, 0.08)', cursor: 'pointer' }}
                        onClick={() => toggleClient(clienteId)}
                      >
                        <td colSpan={canManageReembolso ? 8 : 7} style={{ padding: '12px 16px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isClientExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            🏢 CLIENTE: {(getClienteName(clienteId) || 'Desconocido').toUpperCase()}
                          </div>
                        </td>
                      </tr>
                      
                      {isClientExpanded && Object.keys(clientProjects).map(proyectoId => {
                        const projectGastos = clientProjects[proyectoId] || [];
                        const isProjectExpanded = expandedProjects[proyectoId] === true;

                        return (
                          <React.Fragment key={proyectoId}>
                            <tr 
                              style={{ backgroundColor: 'rgba(0, 0, 0, 0.03)', cursor: 'pointer' }}
                              onClick={() => toggleProject(proyectoId)}
                            >
                              <td colSpan={canManageReembolso ? 8 : 7} style={{ padding: '8px 16px 8px 32px', fontWeight: 'bold', fontSize: '13px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {isProjectExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                  📁 Proyecto: {getProyectoName(proyectoId) || 'Desconocido'}
                                </div>
                              </td>
                            </tr>
                            
                            {isProjectExpanded && projectGastos.map(gasto => renderGastoItemRow(gasto, false))}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
          )}
        </div>

        {/* PAGINATION CONTROLS */}
        {viewMode === 'flat' && !isLoading && filteredGastos.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            borderTop: '1px solid var(--border-color)',
            backgroundColor: '#fafafa',
            flexWrap: 'wrap',
            gap: '12px',
            borderRadius: '0 0 12px 12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, filteredGastos.length)} de {filteredGastos.length} gastos
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Por página:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="form-control"
                  style={{ width: '75px', padding: '3px 8px', fontSize: '0.82rem', height: '28px' }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                style={{ padding: '4px 12px', fontSize: '0.82rem', height: '28px', opacity: currentPage <= 1 ? 0.5 : 1, cursor: currentPage <= 1 ? 'not-allowed' : 'pointer' }}
              >
                Anterior
              </button>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '0 4px' }}>
                Página {currentPage} de {totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                style={{ padding: '4px 12px', fontSize: '0.82rem', height: '28px', opacity: currentPage >= totalPages ? 0.5 : 1, cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer' }}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      <CreateGastoProduccionModal 
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setGastoToEdit(null);
        }}
        gastoToEdit={gastoToEdit}
      />

      <ReembolsoGastosModal
        isOpen={isReembolsoModalOpen}
        onClose={() => setIsReembolsoModalOpen(false)}
        selectedGastos={selectedGastosList}
        onSuccess={() => setSelectedGastoIds([])}
      />

      <ImportGastosProduccionModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
    </div>
  );
};
