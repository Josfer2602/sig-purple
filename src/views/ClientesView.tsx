import React, { useState, useRef } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import { Plus, Edit2, Search, Trash2, X, ChevronDown, ChevronRight, ChevronLeft, User, Briefcase, Mail, Phone, Users, FileSpreadsheet } from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';
import { ClientModal } from '../components/ClientModal';
import { SkeletonTable } from '../components/SkeletonTable';
import type { Cliente } from '../types/models';
import { exportClientesToExcel } from '../utils/excelExport';

export const ClientesView: React.FC = () => {
  const { clientes, proyectos, currentUserRole, deleteCliente, isLoading } = useGlobalContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Cliente | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

  const isMobile = useIsMobile(768);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const handleScrollTable = (direction: 'left' | 'right') => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({
        left: direction === 'left' ? -350 : 350,
        behavior: 'smooth'
      });
    }
  };

  const filteredClientes = (clientes || []).filter(c => {
    if (!c) return false;
    const term = (searchTerm || '').toLowerCase();
    if (c.estado === 'Archivado') return false;
    if (!term) return true;

    const matchBasic = 
      String(c.empresa || '').toLowerCase().includes(term) || 
      String(c.contacto || '').toLowerCase().includes(term) ||
      String(c.cargo || '').toLowerCase().includes(term) ||
      String(c.email || '').toLowerCase().includes(term) ||
      String(c.telefono || '').toLowerCase().includes(term);

    const matchSubContacts = Array.isArray(c.contactos) && c.contactos.some(ct => 
      String(ct.nombre || '').toLowerCase().includes(term) ||
      String(ct.cargo || '').toLowerCase().includes(term) ||
      String(ct.email || '').toLowerCase().includes(term) ||
      String(ct.telefono || '').toLowerCase().includes(term)
    );

    return matchBasic || matchSubContacts;
  });

  const totalPages = Math.ceil(filteredClientes.length / pageSize) || 1;
  const paginatedClientes = filteredClientes.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleOpenModal = (client?: Cliente) => {
    setEditingClient(client || null);
    setIsModalOpen(true);
  };

  const getPrincipalCargo = (cliente: Cliente) => {
    if (cliente.cargo) return cliente.cargo;
    const principal = cliente.contactos?.find(c => c.esPrincipal);
    if (principal?.cargo) return principal.cargo;
    if (cliente.contactos && cliente.contactos[0]?.cargo) return cliente.contactos[0].cargo;
    return '-';
  };

  return (
    <div className="animate-fade-in">
      {/* UNIFIED TOOLBAR: QUICK SEARCH ON LEFT, ACTIONS ON RIGHT */}
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 360px', maxWidth: '520px' }}>
          <div className="unified-search-wrapper" style={{ flex: 1 }}>
            <Search size={16} className="unified-search-icon" />
            <input 
              type="text" 
              placeholder="Buscar por empresa, contacto, cargo, email o teléfono..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="unified-search-input" 
            />
          </div>
          {searchTerm && (
            <button className="btn-clear-filters" onClick={() => setSearchTerm('')} title="Limpiar búsqueda" style={{ marginTop: 0 }}>
              <X size={14} />
              Limpiar
            </button>
          )}
        </div>

        <div className="view-actions">
          <button 
            type="button" 
            className="btn-excel" 
            onClick={() => exportClientesToExcel(clientes, proyectos)}
            title="Descargar base completa de clientes en Excel (.xlsx)"
          >
            <FileSpreadsheet size={16} />
            <span>Exportar Excel</span>
          </button>
          <button className="btn-primary" onClick={() => handleOpenModal()}>
            <Plus size={18} />
            Añadir Cliente
          </button>
        </div>
      </div>

      {/* TABLA DE CLIENTES — ESTRUCTURA UNIFICADA */}
      <div className="desktop-table-container glass-panel table-container" style={{ marginBottom: '56px', padding: 0, overflow: 'hidden' }}>
        {/* ENCABEZADO CON CONTADOR Y CONTROLES DE DESPLAZAMIENTO */}
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
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.05rem', fontWeight: 700 }}>
              Directorio de Clientes
            </h3>
            <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '3px 10px' }}>
              {filteredClientes.length} {filteredClientes.length === 1 ? 'cliente' : 'clientes'}
            </span>
            {filteredClientes.length !== clientes.length && (
              <span style={{ fontSize: '0.82rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                (Filtros activos)
              </span>
            )}
          </div>

          {/* Controles de desplazamiento horizontal de columnas */}
          {!isMobile && (
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
        </div>

        {/* CONTENEDOR SCROLL CON CABECERA PEGAJOSA */}
        <div 
          ref={tableContainerRef}
          className="custom-table-scroll" 
          style={{ 
            width: '100%',
            overflowX: 'auto',
            overflowY: 'auto',
            maxHeight: 'calc(100vh - 280px)',
            minHeight: '400px',
            position: 'relative'
          }}
        >
        {isLoading ? (
          <SkeletonTable columns={9} rows={5} />
        ) : (
          <table 
            className="data-table" 
            style={{ 
              width: '100%', 
              minWidth: '1280px',
              tableLayout: 'fixed',
              borderCollapse: 'separate',
              borderSpacing: 0
            }}
          >
            <colgroup>
              <col style={{ width: '45px' }} />
              <col style={{ width: '250px' }} />
              <col style={{ width: '220px' }} />
              <col style={{ width: '180px' }} />
              <col style={{ width: '220px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '110px' }} />
            </colgroup>
            <thead style={{ position: 'sticky', top: 0, zIndex: 12, backgroundColor: '#f8fafc' }}>
              <tr>
                <th className="header-custom text-center sticky-col-left" style={{ width: '45px', left: 0, position: 'sticky', top: 0, zIndex: 16, backgroundColor: '#f8fafc' }}></th>
                <th className="header-custom text-left sticky-col-left" style={{ width: '250px', left: '45px', position: 'sticky', top: 0, zIndex: 16, backgroundColor: '#f8fafc' }}>EMPRESA</th>
                <th className="header-custom text-left" style={{ width: '220px' }}>CONTACTO PRINCIPAL</th>
                <th className="header-custom text-left" style={{ width: '180px' }}>CARGO</th>
                <th className="header-custom text-left" style={{ width: '220px' }}>EMAIL</th>
                <th className="header-custom text-left" style={{ width: '150px' }}>TELÉFONO</th>
                <th className="header-custom text-center" style={{ width: '140px' }}>TOTAL CONTACTOS</th>
                <th className="header-custom text-center" style={{ width: '120px' }}>ESTADO</th>
                <th className="header-custom text-center sticky-col-right" style={{ width: '110px', right: 0, position: 'sticky', top: 0, zIndex: 16, backgroundColor: '#f8fafc', whiteSpace: 'nowrap' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {paginatedClientes.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                    <Users size={36} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>No se encontraron clientes que coincidan con la búsqueda.</p>
                    {searchTerm && (
                      <button type="button" className="btn-secondary" onClick={() => setSearchTerm('')} style={{ margin: '12px auto 0', fontSize: '12px' }}>
                        Restablecer Filtros
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedClientes.map(cliente => {
                const totalContacts = Array.isArray(cliente.contactos) && cliente.contactos.length > 0 
                  ? cliente.contactos.length 
                  : (cliente.contacto ? 1 : 0);
                const isExpanded = expandedClientId === cliente.id;

                return (
                  <React.Fragment key={cliente.id}>
                    <tr 
                      onClick={() => setExpandedClientId(isExpanded ? null : cliente.id)}
                      style={{ cursor: totalContacts > 1 ? 'pointer' : 'default' }}
                      className="hover-bg-subtle"
                    >
                      <td className="td-custom text-center sticky-col-left" style={{ left: 0, padding: '8px' }}>
                        {totalContacts > 1 && (
                          <button 
                            type="button" 
                            className="btn-icon" 
                            style={{ padding: '2px', background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedClientId(isExpanded ? null : cliente.id);
                            }}
                            title={isExpanded ? 'Ocultar contactos' : 'Ver todos los contactos'}
                          >
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        )}
                      </td>
                      <td className="td-custom sticky-col-left" style={{ left: '45px', fontWeight: 600 }}>
                        <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{cliente.empresa}</span>
                      </td>
                      <td className="td-custom">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <User size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                          <span style={{ fontWeight: 500 }}>{cliente.contacto || '-'}</span>
                        </div>
                      </td>
                      <td className="td-custom">
                        <span style={{ 
                          fontWeight: 500, 
                          color: getPrincipalCargo(cliente) !== '-' ? 'var(--text-primary)' : 'var(--text-muted)' 
                        }}>
                          {getPrincipalCargo(cliente)}
                        </span>
                      </td>
                      <td className="td-custom">{cliente.email || '-'}</td>
                      <td className="td-custom">{cliente.telefono || '-'}</td>
                      <td className="td-custom" style={{ textAlign: 'center' }}>
                        {totalContacts > 1 ? (
                          <span 
                            className="badge badge-info" 
                            style={{ cursor: 'pointer', padding: '3px 8px', fontSize: '0.76rem' }}
                            title="Haz clic para ver la lista completa de contactos"
                          >
                            {totalContacts} contactos
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>1 contacto</span>
                        )}
                      </td>
                      <td className="td-custom text-center">
                        <span className={`badge ${cliente.estado === 'Activo' ? 'badge-success' : 'badge-danger'}`}>
                          {cliente.estado}
                        </span>
                      </td>
                      <td className="td-custom text-center sticky-col-right" style={{ verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
                          <button 
                            className="btn-icon" 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenModal(cliente);
                            }} 
                            title="Editar Cliente y Contactos"
                          >
                            <Edit2 size={16} />
                          </button>
                          {(currentUserRole === 'Admin' || currentUserRole === 'Directorio') && (
                            <button 
                              className="btn-icon" 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`¿Está seguro de eliminar al cliente ${cliente.empresa}?`)) {
                                  deleteCliente(cliente.id);
                                }
                              }} 
                              title="Eliminar Cliente"
                              style={{ color: 'var(--danger-color, #ef4444)' }}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* EXPANDED ROW: LIST OF ALL CONTACTS */}
                    {isExpanded && totalContacts > 1 && (
                      <tr>
                        <td colSpan={9} style={{ padding: '0', backgroundColor: 'rgba(102, 45, 145, 0.03)', borderBottom: '1px solid var(--border-color)' }}>
                          <div style={{ padding: '16px 24px 16px 48px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Users size={16} style={{ color: 'var(--accent-primary)' }} />
                                <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                                  Contactos registrados de {cliente.empresa} ({totalContacts})
                                </strong>
                              </div>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                                onClick={() => handleOpenModal(cliente)}
                              >
                                Administrar Contactos
                              </button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                              {(cliente.contactos || []).map((ct, ci) => (
                                <div 
                                  key={ct.id || ci}
                                  style={{
                                    border: ct.esPrincipal ? '1.5px solid rgba(102, 45, 145, 0.35)' : '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    padding: '12px',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px'
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <User size={14} style={{ color: 'var(--accent-primary)' }} />
                                      <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{ct.nombre}</strong>
                                    </div>
                                    {ct.esPrincipal && (
                                      <span className="badge badge-primary" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                                        Principal
                                      </span>
                                    )}
                                  </div>

                                  {ct.cargo && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                      <Briefcase size={12} style={{ color: 'var(--text-muted)' }} />
                                      <span>{ct.cargo}</span>
                                    </div>
                                  )}

                                  {ct.email && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                      <Mail size={12} />
                                      <span>{ct.email}</span>
                                    </div>
                                  )}

                                  {ct.telefono && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                      <Phone size={12} />
                                      <span>{ct.telefono}</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
        )}
        </div>
      </div>

      {/* BARRA DE PAGINACIÓN */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '12px 16px', 
        background: 'var(--bg-panel)', 
        borderRadius: '10px', 
        border: '1px solid var(--border-color)', 
        marginBottom: '32px',
        flexWrap: 'wrap', 
        gap: '12px' 
      }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Mostrando {filteredClientes.length === 0 ? 0 : Math.min((currentPage - 1) * pageSize + 1, filteredClientes.length)} - {Math.min(currentPage * pageSize, filteredClientes.length)} de <strong>{filteredClientes.length}</strong> clientes
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Filas por página:</span>
            <select 
              value={pageSize} 
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="unified-select"
              style={{ padding: '3px 8px', fontSize: '0.8rem', width: 'auto' }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={99999}>Todos ({filteredClientes.length})</option>
            </select>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
              >
                Anterior
              </button>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0 6px' }}>
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      </div>


      {/* Mobile Adaptive Cards View */}
      <div className="mobile-cards-container">
        {isLoading ? (
          <SkeletonTable columns={1} rows={4} />
        ) : filteredClientes.length === 0 ? (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
            <Users size={32} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>No se encontraron clientes que coincidan con la búsqueda.</p>
            {searchTerm && (
              <button type="button" className="btn-secondary" onClick={() => setSearchTerm('')} style={{ margin: '12px auto 0', fontSize: '12px' }}>
                Restablecer Filtros
              </button>
            )}
          </div>
        ) : (
          filteredClientes.map(cliente => {
            const totalContacts = Array.isArray(cliente.contactos) && cliente.contactos.length > 0 
              ? cliente.contactos.length 
              : (cliente.contacto ? 1 : 0);
            const isExpanded = expandedClientId === cliente.id;

            return (
              <div key={cliente.id} className="mobile-data-card">
                <div className="mobile-data-card-header">
                  <div style={{ minWidth: 0 }}>
                    <div className="mobile-data-card-title">{cliente.empresa}</div>
                    <div className="mobile-data-card-subtitle">
                      <User size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                      <span>{cliente.contacto || 'Sin contacto principal'}</span>
                      {getPrincipalCargo(cliente) !== '-' && (
                        <span>• {getPrincipalCargo(cliente)}</span>
                      )}
                    </div>
                  </div>
                  <span className={`badge ${cliente.estado === 'Activo' ? 'badge-success' : 'badge-danger'}`} style={{ flexShrink: 0 }}>
                    {cliente.estado}
                  </span>
                </div>

                <div className="mobile-card-grid-meta">
                  <div className="mobile-card-meta-col">
                    <span className="mobile-card-meta-label">Teléfono</span>
                    <span className="mobile-card-meta-val">{cliente.telefono || '-'}</span>
                  </div>
                  <div className="mobile-card-meta-col">
                    <span className="mobile-card-meta-label">Email</span>
                    <span className="mobile-card-meta-val" title={cliente.email || ''}>{cliente.email || '-'}</span>
                  </div>
                  <div className="mobile-card-meta-col">
                    <span className="mobile-card-meta-label">Total Contactos</span>
                    <span className="mobile-card-meta-val">{totalContacts}</span>
                  </div>
                  <div className="mobile-card-meta-col">
                    <span className="mobile-card-meta-label">Cargo</span>
                    <span className="mobile-card-meta-val">{getPrincipalCargo(cliente)}</span>
                  </div>
                </div>

                <div className="mobile-card-actions-row">
                  {cliente.telefono && (
                    <a href={`tel:${cliente.telefono}`} className="mobile-action-pill" title="Llamar">
                      <Phone size={13} />
                      <span>Llamar</span>
                    </a>
                  )}
                  {cliente.email && (
                    <a href={`mailto:${cliente.email}`} className="mobile-action-pill" title="Enviar correo">
                      <Mail size={13} />
                      <span>Correo</span>
                    </a>
                  )}
                  <button 
                    type="button" 
                    className="mobile-action-pill" 
                    onClick={() => handleOpenModal(cliente)}
                    title="Editar Cliente"
                  >
                    <Edit2 size={13} />
                    <span>Editar</span>
                  </button>
                  {totalContacts > 1 && (
                    <button 
                      type="button" 
                      className="mobile-action-pill"
                      onClick={() => setExpandedClientId(isExpanded ? null : cliente.id)}
                      style={{ background: isExpanded ? 'rgba(124, 58, 237, 0.12)' : undefined, color: isExpanded ? 'var(--accent-primary)' : undefined }}
                    >
                      <Users size={13} />
                      <span>{totalContacts} contactos</span>
                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                  )}
                  {(currentUserRole === 'Admin' || currentUserRole === 'Directorio') && (
                    <button 
                      type="button"
                      className="mobile-action-pill danger" 
                      onClick={() => {
                        if (window.confirm(`¿Está seguro de eliminar al cliente ${cliente.empresa}?`)) {
                          deleteCliente(cliente.id);
                        }
                      }}
                      title="Eliminar Cliente"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {/* Sub-contacts accordion */}
                {isExpanded && Array.isArray(cliente.contactos) && cliente.contactos.length > 0 && (
                  <div className="mobile-card-expanded-box">
                    <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Contactos del Cliente:
                    </span>
                    {cliente.contactos.map((ct, idx) => (
                      <div key={ct.id || idx} style={{ borderBottom: idx < cliente.contactos!.length - 1 ? '1px dashed #e2e8f0' : 'none', paddingBottom: '6px' }}>
                        <div style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--text-primary)' }}>
                          {ct.nombre} {ct.cargo && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({ct.cargo})</span>}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {ct.telefono && (
                            <a href={`tel:${ct.telefono}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
                              📞 {ct.telefono}
                            </a>
                          )}
                          {ct.email && (
                            <a href={`mailto:${ct.email}`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                              ✉️ {ct.email}
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {isModalOpen && (
        <ClientModal 
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          client={editingClient}
        />
      )}
    </div>
  );
};
