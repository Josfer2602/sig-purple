import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ChevronDown, Check, Building2, Folder, Archive } from 'lucide-react';
import type { Proyecto, Cliente } from '../types/models';

export interface SearchableProjectSelectProps {
  proyectos: Proyecto[];
  clientes: Cliente[];
  value: string;
  onChange: (projectId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  excludeArchivedDefault?: boolean;
  autoFocus?: boolean;
}

export const SearchableProjectSelect: React.FC<SearchableProjectSelectProps> = ({
  proyectos,
  clientes,
  value,
  onChange,
  disabled = false,
  placeholder = 'Buscar proyecto por nombre, cliente o código...',
  excludeArchivedDefault = true,
  autoFocus = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(!excludeArchivedDefault);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Map of client lookup by ID
  const clientMap = useMemo(() => {
    const map = new Map<string, string>();
    clientes.forEach(c => map.set(c.id, c.empresa));
    return map;
  }, [clientes]);

  // Find currently selected project
  const selectedProject = useMemo(() => {
    return proyectos.find(p => p.id === value) || null;
  }, [proyectos, value]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    const q = search.toLowerCase().trim();
    return proyectos.filter(p => {
      const isArchived = p.estado?.toLowerCase() === 'archivado';
      if (!showArchived && isArchived) return false;

      if (!q) return true;

      const clientName = (clientMap.get(p.clienteId) || '').toLowerCase();
      const projName = (p.nombre || '').toLowerCase();
      const projId = (p.id || '').toLowerCase();

      return projName.includes(q) || clientName.includes(q) || projId.includes(q);
    });
  }, [proyectos, search, showArchived, clientMap]);

  const archivedCount = useMemo(() => {
    return proyectos.filter(p => p.estado?.toLowerCase() === 'archivado').length;
  }, [proyectos]);

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const getStatusColor = (estado?: string) => {
    const est = (estado || '').toLowerCase();
    if (est.includes('aprobado') || est.includes('activo')) return { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: 'rgba(16, 185, 129, 0.25)' };
    if (est.includes('ejecución') || est.includes('proceso')) return { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.25)' };
    if (est.includes('cotización') || est.includes('enviada')) return { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.25)' };
    if (est.includes('archivado')) return { bg: 'rgba(100, 116, 139, 0.1)', color: '#64748b', border: 'rgba(100, 116, 139, 0.25)' };
    return { bg: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', border: 'rgba(124, 58, 237, 0.25)' };
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Selected Card or Search Input Trigger */}
      {selectedProject && !isOpen ? (
        <div
          onClick={() => {
            if (!disabled) {
              setIsOpen(true);
              setTimeout(() => inputRef.current?.focus(), 50);
            }
          }}
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1.5px solid var(--accent-primary)',
            backgroundColor: 'rgba(124, 58, 237, 0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            opacity: disabled ? 0.6 : 1
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'rgba(124, 58, 237, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary)',
              flexShrink: 0
            }}>
              <Folder size={18} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {selectedProject.nombre}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <Building2 size={12} />
                  {clientMap.get(selectedProject.clienteId) || 'Sin Cliente'}
                </span>
                <span>•</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{selectedProject.id}</span>
                {selectedProject.estado && (
                  <span style={{
                    fontSize: '0.7rem',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor: getStatusColor(selectedProject.estado).bg,
                    color: getStatusColor(selectedProject.estado).color,
                    border: `1px solid ${getStatusColor(selectedProject.estado).border}`
                  }}>
                    {selectedProject.estado}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                title="Cambiar proyecto"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <X size={16} />
              </button>
            )}
            <ChevronDown size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
        </div>
      ) : (
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          borderRadius: '10px',
          border: isOpen ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-secondary)',
          boxShadow: isOpen ? '0 0 0 3px rgba(124, 58, 237, 0.15)' : 'none',
          transition: 'all 0.2s ease',
          opacity: disabled ? 0.6 : 1
        }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            ref={inputRef}
            type="text"
            disabled={disabled}
            value={search}
            autoFocus={autoFocus || isOpen}
            onChange={e => {
              setSearch(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            style={{
              width: '100%',
              padding: '11px 40px 11px 38px',
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: '0.92rem',
              color: 'var(--text-primary)'
            }}
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: '10px',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={16} />
            </button>
          ) : (
            <ChevronDown size={18} style={{ position: 'absolute', right: '12px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          )}
        </div>
      )}

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            backgroundColor: 'var(--bg-secondary, #ffffff)',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.18), 0 4px 10px rgba(0, 0, 0, 0.08)',
            zIndex: 1100,
            overflow: 'hidden',
            maxHeight: '320px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header info & filter toggle */}
          <div style={{
            padding: '8px 12px',
            backgroundColor: 'rgba(0,0,0,0.02)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.78rem',
            color: 'var(--text-muted)'
          }}>
            <span>
              {filteredProjects.length} {filteredProjects.length === 1 ? 'proyecto encontrado' : 'proyectos encontrados'}
            </span>
            {archivedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowArchived(prev => !prev)}
                style={{
                  background: showArchived ? 'rgba(100, 116, 139, 0.15)' : 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '2px 8px',
                  fontSize: '0.72rem',
                  color: showArchived ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Archive size={12} />
                {showArchived ? 'Ocultar archivados' : `Ver archivados (${archivedCount})`}
              </button>
            )}
          </div>

          {/* List of projects */}
          <div style={{ overflowY: 'auto', maxHeight: '260px' }}>
            {filteredProjects.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                <Folder size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <div>No se encontraron proyectos{search ? ` con "${search}"` : ''}</div>
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    style={{
                      marginTop: '8px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-primary)',
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                      textDecoration: 'underline'
                    }}
                  >
                    Borrar búsqueda
                  </button>
                )}
              </div>
            ) : (
              filteredProjects.map(p => {
                const isSelected = p.id === value;
                const clientName = clientMap.get(p.clienteId) || 'Sin Cliente';
                const statusStyle = getStatusColor(p.estado);

                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelect(p.id)}
                    style={{
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? 'rgba(124, 58, 237, 0.08)' : 'transparent',
                      borderBottom: '1px solid rgba(0,0,0,0.04)',
                      transition: 'background-color 0.15s ease'
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)';
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1, paddingRight: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                          {p.nombre}
                        </span>
                        <span style={{
                          fontSize: '0.72rem',
                          fontFamily: 'monospace',
                          color: 'var(--text-muted)',
                          backgroundColor: 'rgba(0,0,0,0.05)',
                          padding: '1px 5px',
                          borderRadius: '4px'
                        }}>
                          {p.id}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Building2 size={13} style={{ color: 'var(--accent-primary)' }} />
                          <strong style={{ color: 'var(--text-secondary)' }}>{clientName}</strong>
                        </span>
                        {p.estado && (
                          <>
                            <span>•</span>
                            <span style={{
                              fontSize: '0.72rem',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              backgroundColor: statusStyle.bg,
                              color: statusStyle.color,
                              border: `1px solid ${statusStyle.border}`
                            }}>
                              {p.estado}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--accent-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        flexShrink: 0
                      }}>
                        <Check size={14} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
