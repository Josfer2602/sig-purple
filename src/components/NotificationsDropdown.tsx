import React, { useState, useEffect, useRef } from 'react';
import { Bell, FileText, Receipt, CreditCard, ShoppingCart } from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';

interface NotificationsDropdownProps {
  setActiveModule: (module: string) => void;
}

export const NotificationsDropdown: React.FC<NotificationsDropdownProps> = ({ setActiveModule }) => {
  const { quotes, gastosProduccion, pagos, ordenes, currentUserRole } = useGlobalContext();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute pending items based on role
  const pendingQuotes = quotes.filter(q => {
    if (currentUserRole === 'Cuentas') return q.status === 'Revisión Cuentas' || q.status === 'Por Revisar - Cuentas';
    if (currentUserRole === 'Directorio' || currentUserRole === 'Admin') return q.status === 'Revisión Directorio' || q.status === 'Por Revisar - Directorio';
    if (currentUserRole === 'Producción') return q.status === 'Rechazado';
    return false;
  });

  const pendingGastos = (currentUserRole === 'Directorio' || currentUserRole === 'Admin')
    ? gastosProduccion.filter(g => g.estadoGasto === 'Generado') 
    : [];

  const pendingPagos = (currentUserRole === 'Directorio' || currentUserRole === 'Admin')
    ? pagos.filter(p => p.estado === 'Pendiente')
    : (currentUserRole === 'Contabilidad' ? pagos.filter(p => p.estado === 'Autorizado') : []);

  const pendingOrdenes = currentUserRole === 'Producción'
    ? ordenes.filter(o => o.estadoEntrega === 'Pendiente' || o.estadoEntrega === 'En Proceso')
    : [];

  const totalNotifications = pendingQuotes.length + pendingGastos.length + pendingPagos.length + pendingOrdenes.length;

  const handleNavigate = (module: string) => {
    setActiveModule(module);
    setIsOpen(false);
  };

  return (
    <div className="notifications-wrapper" ref={dropdownRef} style={{ position: 'relative' }}>
      <button 
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center' }}
        onClick={() => setIsOpen(!isOpen)}
        title="Notificaciones"
      >
        <Bell size={20} color="var(--text-muted)" />
        {totalNotifications > 0 && (
          <span style={{
            position: 'absolute',
            top: '-6px',
            right: '-6px',
            backgroundColor: 'var(--danger)',
            color: 'white',
            borderRadius: '50%',
            padding: '2px 6px',
            fontSize: '10px',
            fontWeight: 'bold',
            minWidth: '16px',
            textAlign: 'center'
          }}>
            {totalNotifications > 99 ? '99+' : totalNotifications}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '40px',
          right: '-10px',
          width: '320px',
          maxHeight: '400px',
          backgroundColor: 'var(--bg-panel)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
          border: '1px solid var(--border-color)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-secondary)' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Notificaciones</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{totalNotifications} pendientes</span>
          </div>

          <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
            {totalNotifications === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Bell size={32} style={{ opacity: 0.2, margin: '0 auto 12px auto' }} />
                <p style={{ margin: 0 }}>¡Todo al día!</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>No tienes tareas pendientes.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                
                {pendingQuotes.length > 0 && (
                  <div 
                    onClick={() => handleNavigate('cotizaciones')}
                    style={{ padding: '12px 16px', display: 'flex', gap: '12px', alignItems: 'flex-start', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }}
                    className="notification-item"
                  >
                    <div style={{ backgroundColor: 'rgba(102, 45, 145, 0.1)', padding: '8px', borderRadius: '50%', color: 'var(--accent-primary)' }}>
                      <FileText size={18} />
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Cotizaciones Pendientes</h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Tienes {pendingQuotes.length} cotizacio{pendingQuotes.length === 1 ? 'n' : 'nes'} {currentUserRole === 'Producción' ? 'rechazada(s)' : 'por revisar'}.
                      </p>
                    </div>
                  </div>
                )}

                {pendingGastos.length > 0 && (
                  <div 
                    onClick={() => handleNavigate('gastos')}
                    style={{ padding: '12px 16px', display: 'flex', gap: '12px', alignItems: 'flex-start', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }}
                    className="notification-item"
                  >
                    <div style={{ backgroundColor: 'rgba(234, 179, 8, 0.1)', padding: '8px', borderRadius: '50%', color: 'var(--warning)' }}>
                      <Receipt size={18} />
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Gastos de Producción</h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Tienes {pendingGastos.length} gasto{pendingGastos.length === 1 ? '' : 's'} pendiente{pendingGastos.length === 1 ? '' : 's'} de pago.
                      </p>
                    </div>
                  </div>
                )}

                {pendingPagos.length > 0 && (
                  <div 
                    onClick={() => handleNavigate('pagos')}
                    style={{ padding: '12px 16px', display: 'flex', gap: '12px', alignItems: 'flex-start', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }}
                    className="notification-item"
                  >
                    <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '8px', borderRadius: '50%', color: 'var(--success)' }}>
                      <CreditCard size={18} />
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Pagos a Proveedores</h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {currentUserRole === 'Contabilidad' 
                          ? `Tienes ${pendingPagos.length} pago(s) autorizado(s) listo(s) para desembolso.`
                          : `Hay ${pendingPagos.length} pago(s) pendiente(s) de autorizar.`
                        }
                      </p>
                    </div>
                  </div>
                )}

                {pendingOrdenes.length > 0 && (
                  <div 
                    onClick={() => handleNavigate('ordenes')}
                    style={{ padding: '12px 16px', display: 'flex', gap: '12px', alignItems: 'flex-start', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }}
                    className="notification-item"
                  >
                    <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '8px', borderRadius: '50%', color: 'var(--info)' }}>
                      <ShoppingCart size={18} />
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Órdenes de Compra</h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Tienes {pendingOrdenes.length} orden{pendingOrdenes.length === 1 ? '' : 'es'} pendiente{pendingOrdenes.length === 1 ? '' : 's'} de entrega.
                      </p>
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
          {totalNotifications > 0 && (
            <style>
              {`
                .notification-item:hover {
                  background-color: var(--bg-secondary) !important;
                }
              `}
            </style>
          )}
        </div>
      )}
    </div>
  );
};
