import React, { useEffect, useState } from 'react';
import type { QuoteHistory } from '../types/quote';
import { API_URL } from '../context/GlobalContext';

interface QuoteHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  quoteId: string;
}

export const QuoteHistoryModal: React.FC<QuoteHistoryModalProps> = ({ isOpen, onClose, quoteId }) => {
  const [history, setHistory] = useState<QuoteHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && quoteId) {
      const fetchHistory = async () => {
        setIsLoading(true);
        try {
          const res = await fetch(`${API_URL}/quotes/${quoteId}/history`);
          if (res.ok) {
            const data = await res.json();
            setHistory(data);
          }
        } catch (error) {
          console.error("Failed to load history", error);
        } finally {
          setIsLoading(false);
        }
      };
      fetchHistory();
    }
  }, [isOpen, quoteId]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 1000
    }}>
      <div className="glass-panel" style={{ width: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-xl)' }}>Historial de la Cotización</h2>
          <button type="button" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {isLoading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Cargando historial...</p>
          ) : history.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No hay eventos registrados en el historial.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {history.map((event) => (
                <div key={event.id} style={{
                  padding: '16px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  borderLeft: '4px solid var(--accent-primary)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{event.userName}</strong>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {new Date(event.createdAt).toLocaleString('es-PE')}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--accent-primary)', marginBottom: '4px' }}>
                    {event.action}
                  </div>
                  {event.details && (
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      {event.details}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
