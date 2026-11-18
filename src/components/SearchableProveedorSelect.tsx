import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ChevronDown, Check, Building2, AlertCircle, Edit3 } from 'lucide-react';
import type { Proveedor } from '../types/models';

export interface SearchableProveedorSelectProps {
  proveedores: Proveedor[];
  value: string;
  onChange: (proveedorId: string, proveedor?: Proveedor | null, customText?: string) => void;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
  compact?: boolean;
  allowCustomText?: boolean;
  customTextValue?: string;
}

export const SearchableProveedorSelect: React.FC<SearchableProveedorSelectProps> = ({
  proveedores,
  value,
  onChange,
  disabled = false,
  placeholder = '-- Buscar o seleccionar proveedor --',
  required = false,
  compact = false,
  allowCustomText = false,
  customTextValue = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Position calculation (open top if near bottom edge of screen)
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 280 && rect.top > 260) {
        setDropdownPosition('top');
      } else {
        setDropdownPosition('bottom');
      }
    }
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Match provider by ID or by exact business/commercial name
  const selectedProveedor = useMemo(() => {
    if (!value && !customTextValue) return null;
    return (
      proveedores.find(p => p.id === value) ||
      proveedores.find(p => value && (
        (p.razonSocial && p.razonSocial.toLowerCase() === value.toLowerCase()) ||
        (p.nombre && p.nombre.toLowerCase() === value.toLowerCase())
      )) ||
      proveedores.find(p => customTextValue && (
        (p.razonSocial && p.razonSocial.toLowerCase() === customTextValue.toLowerCase()) ||
        (p.nombre && p.nombre.toLowerCase() === customTextValue.toLowerCase())
      )) ||
      null
    );
  }, [proveedores, value, customTextValue]);

  const displayLabel = useMemo(() => {
    if (selectedProveedor) return selectedProveedor.razonSocial || selectedProveedor.nombre;
    if (customTextValue) return customTextValue;
    if (value && !proveedores.some(p => p.id === value)) return value;
    return null;
  }, [selectedProveedor, customTextValue, value, proveedores]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearch('');
    }
  }, [isOpen]);

  // Filtered providers based on search query
  const filteredProveedores = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return proveedores;

    return proveedores.filter(p => {
      const razon = (p.razonSocial || '').toLowerCase();
      const nombre = (p.nombre || '').toLowerCase();
      const ruc = (p.ruc || '').toLowerCase();
      const categoria = (p.categoria || '').toLowerCase();
      return razon.includes(q) || nombre.includes(q) || ruc.includes(q) || categoria.includes(q);
    });
  }, [proveedores, search]);

  const handleSelect = (id: string) => {
    const prov = proveedores.find(p => p.id === id) || null;
    onChange(id, prov, prov?.razonSocial || prov?.nombre || '');
    setIsOpen(false);
    setSearch('');
  };

  const handleCustomTextSelect = (text: string) => {
    onChange('', null, text);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('', null, '');
    setSearch('');
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Hidden input to support standard form required validation */}
      {required && (
        <input
          type="text"
          value={value || displayLabel || ''}
          required={required}
          onChange={() => {}}
          style={{ opacity: 0, position: 'absolute', pointerEvents: 'none', height: 0, width: 0 }}
          tabIndex={-1}
        />
      )}

      {/* Trigger Box */}
      <div
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        className="form-control"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
          backgroundColor: disabled ? 'var(--bg-secondary, #f1f5f9)' : '#ffffff',
          borderColor: isOpen ? 'var(--accent-primary, #662D91)' : 'var(--border-color, #e2e8f0)',
          boxShadow: isOpen ? '0 0 0 3px rgba(102, 45, 145, 0.15)' : 'none',
          padding: compact ? '3px 8px' : '8px 12px',
          minHeight: compact ? '30px' : '42px',
          borderRadius: compact ? '6px' : '8px',
          fontSize: compact ? '11.5px' : '13px',
          transition: 'all 0.15s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '5px' : '8px', overflow: 'hidden', flex: 1 }}>
          <Building2 size={compact ? 13 : 16} style={{ color: (selectedProveedor || displayLabel) ? 'var(--accent-primary, #662D91)' : 'var(--text-muted, #94a3b8)', flexShrink: 0 }} />
          {displayLabel ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary, #0f172a)', fontSize: compact ? '11.5px' : '13.5px' }}>
                {displayLabel}
              </span>
              {selectedProveedor && selectedProveedor.ruc && selectedProveedor.ruc !== '-' && !compact && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', background: 'rgba(0,0,0,0.04)', padding: '2px 6px', borderRadius: '4px' }}>
                  RUC: {selectedProveedor.ruc}
                </span>
              )}
              {!selectedProveedor && displayLabel && (
                <span style={{ fontSize: '9.5px', color: '#6d28d9', background: '#ede9fe', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>
                  Texto
                </span>
              )}
            </div>
          ) : (
            <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: compact ? '11.5px' : '13px' }}>{placeholder}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '3px' : '6px', flexShrink: 0 }}>
          {(selectedProveedor || displayLabel) && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted, #94a3b8)',
                padding: '2px',
                display: 'flex',
                borderRadius: '50%'
              }}
              title="Quitar proveedor"
            >
              <X size={compact ? 12 : 14} />
            </button>
          )}
          <ChevronDown
            size={compact ? 13 : 16}
            style={{
              color: 'var(--text-muted, #94a3b8)',
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease'
            }}
          />
        </div>
      </div>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            ...(dropdownPosition === 'top'
              ? { bottom: 'calc(100% + 4px)' }
              : { top: 'calc(100% + 4px)' }),
            left: 0,
            minWidth: compact ? '290px' : '100%',
            maxWidth: '450px',
            zIndex: 99999,
            backgroundColor: '#ffffff',
            border: '1px solid var(--border-color, #e2e8f0)',
            borderRadius: '10px',
            boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Search Header */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={14} style={{ color: 'var(--text-muted, #94a3b8)' }} />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filteredProveedores.length > 0) {
                    handleSelect(filteredProveedores[0].id);
                  } else if (allowCustomText && search.trim()) {
                    handleCustomTextSelect(search.trim());
                  }
                }
              }}
              placeholder="Buscar por razón social, nombre o RUC..."
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '12.5px',
                color: 'var(--text-primary, #0f172a)'
              }}
              onClick={e => e.stopPropagation()}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #94a3b8)', padding: '2px' }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Opción de texto libre cuando allowCustomText está activo */}
          {allowCustomText && search.trim().length > 0 && (
            <div
              onClick={() => handleCustomTextSelect(search.trim())}
              style={{
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                borderBottom: '1px dashed #e2e8f0',
                backgroundColor: '#f5f3ff',
                color: '#6d28d9',
                fontSize: '11.5px',
                fontWeight: 600
              }}
            >
              <Edit3 size={13} />
              <span>Usar como texto libre: "<strong>{search.trim()}</strong>"</span>
            </div>
          )}

          {/* List Options */}
          <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
            {filteredProveedores.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted, #64748b)', fontSize: '12.5px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={18} />
                <span>No se encontraron proveedores que coincidan</span>
                {allowCustomText && search.trim() && (
                  <button
                    type="button"
                    onClick={() => handleCustomTextSelect(search.trim())}
                    style={{
                      marginTop: '4px',
                      fontSize: '11.5px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid #c4b5fd',
                      background: '#ede9fe',
                      color: '#6d28d9',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Asignar "{search.trim()}"
                  </button>
                )}
              </div>
            ) : (
              filteredProveedores.map(prov => {
                const isSelected = prov.id === value || (selectedProveedor?.id === prov.id);
                return (
                  <div
                    key={prov.id}
                    onClick={() => handleSelect(prov.id)}
                    style={{
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f8fafc',
                      backgroundColor: isSelected ? 'rgba(102, 45, 145, 0.08)' : 'transparent',
                      transition: 'background-color 0.1s ease'
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: isSelected ? 700 : 500, fontSize: '12.5px', color: isSelected ? 'var(--accent-primary, #662D91)' : 'var(--text-primary, #0f172a)' }}>
                          {prov.razonSocial || prov.nombre}
                        </span>
                        {prov.tipoDocumento && (
                          <span style={{ fontSize: '9.5px', background: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5', padding: '1px 5px', borderRadius: '3px' }}>
                            {prov.tipoDocumento}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>
                        {prov.ruc && <span>RUC: {prov.ruc}</span>}
                        {prov.nombre && prov.nombre !== prov.razonSocial && <span>• {prov.nombre}</span>}
                        {prov.categoria && <span>• {prov.categoria}</span>}
                      </div>
                    </div>

                    {isSelected && (
                      <Check size={15} style={{ color: 'var(--accent-primary, #662D91)', flexShrink: 0, marginLeft: '8px' }} />
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
