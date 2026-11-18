import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Briefcase, FileText, Users, FileSignature, ArrowRight } from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (module: string, itemId: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose, onNavigate }) => {
  const { clientes, proyectos, quotes, ordenes } = useGlobalContext();
  const [searchTerm, setSearchTerm] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setSearchTerm('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  const term = searchTerm.toLowerCase();

  const results = term.length < 2 ? [] : [
    ...clientes.filter(c => c.empresa.toLowerCase().includes(term) || c.contacto.toLowerCase().includes(term)).map(c => ({ type: 'Cliente', id: c.id, title: c.empresa, sub: c.contacto, icon: <Users size={16} /> })),
    ...proyectos.filter(p => p.nombre.toLowerCase().includes(term)).map(p => ({ type: 'Proyecto', id: p.id, title: p.nombre, sub: p.tipoServicio, icon: <Briefcase size={16} /> })),
    ...quotes.filter(q => q.id.toLowerCase().includes(term) || q.requirement.toLowerCase().includes(term)).map(q => ({ type: 'Cotización', id: q.id, title: q.id, sub: q.requirement, icon: <FileText size={16} /> })),
    ...ordenes.filter(o => o.id.toLowerCase().includes(term)).map(o => ({ type: 'Orden', id: o.id, title: o.id, sub: o.proveedorId, icon: <FileSignature size={16} /> }))
  ].slice(0, 8); // Max 8 results

  const getModule = (type: string) => {
    switch (type) {
      case 'Cliente': return 'clientes';
      case 'Proyecto': return 'proyectos';
      case 'Cotización': return 'cotizaciones';
      case 'Orden': return 'ordenes';
      default: return 'dashboard';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ alignItems: 'flex-start', paddingTop: '10vh' }}>
      <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '600px', padding: 0, backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)' }}>
          <Search size={20} color="var(--text-muted)" style={{ marginRight: '12px' }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar clientes, proyectos, cotizaciones..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '1.2rem', outline: 'none' }}
          />
          <button onClick={onClose} className="btn-icon">
            <X size={20} />
          </button>
        </div>
        
        {searchTerm.length >= 2 && (
          <div style={{ padding: '8px 0', maxHeight: '400px', overflowY: 'auto' }}>
            {results.length > 0 ? (
              results.map((res, i) => (
                <div 
                  key={i}
                  className="search-result-item"
                  onClick={() => {
                    onNavigate(getModule(res.type), res.id);
                    onClose();
                  }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', cursor: 'pointer', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(102, 45, 145, 0.1)', color: 'var(--accent-primary)' }}>
                      {res.icon}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{res.title}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{res.type} • {res.sub}</div>
                    </div>
                  </div>
                  <ArrowRight size={16} color="var(--text-muted)" />
                </div>
              ))
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No se encontraron resultados para "{searchTerm}"
              </div>
            )}
          </div>
        )}
        {searchTerm.length < 2 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Escribe al menos 2 caracteres para buscar
          </div>
        )}
      </div>
    </div>
  );
};
