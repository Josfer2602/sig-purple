import React from 'react';
import { Loader2 } from 'lucide-react';

interface SkeletonTableProps {
  columns?: number;
  rows?: number;
  showHeader?: boolean;
  message?: string;
}

export const SkeletonTable: React.FC<SkeletonTableProps> = ({ 
  columns = 7, 
  rows = 6, 
  showHeader = true,
  message = 'Sincronizando información con la base de datos...'
}) => {
  // Pre-calculated widths for realistic column variance
  const colWidths = ['90px', '220px', '160px', '140px', '110px', '130px', '80px', '120px'];

  return (
    <div className="skeleton-table-wrapper" style={{ width: '100%', minHeight: '320px' }}>
      {/* Top micro-status notification */}
      {message && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 18px',
          background: 'linear-gradient(90deg, rgba(139, 92, 246, 0.06), rgba(217, 70, 239, 0.04))',
          borderBottom: '1px solid rgba(139, 92, 246, 0.12)',
          fontSize: '12px',
          fontWeight: 500,
          color: 'var(--accent-primary, #8b5cf6)'
        }}>
          <Loader2 size={14} className="animate-spin" />
          <span>{message}</span>
        </div>
      )}

      {/* Simulated Table Header */}
      {showHeader && (
        <div style={{ 
          display: 'flex', 
          gap: '16px', 
          padding: '14px 18px', 
          background: '#f8fafc',
          borderBottom: '2px solid var(--border-color, #e2e8f0)',
          alignItems: 'center'
        }}>
          {Array.from({ length: columns }).map((_, cIdx) => (
            <div 
              key={`h-${cIdx}`} 
              className="skeleton-pulse" 
              style={{ 
                width: colWidths[cIdx % colWidths.length] || '120px',
                height: '14px', 
                borderRadius: '6px',
                opacity: 0.8
              }}
            />
          ))}
        </div>
      )}

      {/* Simulated Table Rows */}
      <div style={{ width: '100%' }}>
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div 
            key={`r-${rIdx}`} 
            style={{ 
              display: 'flex', 
              gap: '16px', 
              padding: '14px 18px', 
              borderBottom: '1px solid var(--border-color, #f1f5f9)',
              alignItems: 'center',
              backgroundColor: rIdx % 2 === 1 ? '#fafcff' : '#ffffff'
            }}
          >
            {Array.from({ length: columns }).map((_, cIdx) => {
              // Add slight random-like variation per row for realism
              const flexGrow = cIdx === 1 ? 1.5 : 1;
              const height = cIdx === 0 ? '16px' : (cIdx === columns - 1 ? '22px' : '15px');
              const borderRadius = cIdx === columns - 1 ? '6px' : '4px';

              return (
                <div 
                  key={`c-${rIdx}-${cIdx}`} 
                  className="skeleton-pulse" 
                  style={{ 
                    flex: flexGrow,
                    width: colWidths[cIdx % colWidths.length] || '100px',
                    maxWidth: cIdx === 0 ? '90px' : (cIdx === columns - 1 ? '85px' : '100%'),
                    height, 
                    borderRadius
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export const SkeletonCards: React.FC<{ count?: number; message?: string }> = ({ 
  count = 4,
  message = 'Cargando datos...' 
}) => {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
      {message && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)', fontSize: '12px', fontWeight: 500 }}>
          <Loader2 size={13} className="animate-spin" />
          <span>{message}</span>
        </div>
      )}
      {Array.from({ length: count }).map((_, idx) => (
        <div 
          key={idx} 
          style={{ 
            padding: '16px', 
            borderRadius: '12px', 
            border: '1px solid var(--border-color)', 
            background: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="skeleton-pulse" style={{ width: '100px', height: '18px', borderRadius: '6px' }} />
            <div className="skeleton-pulse" style={{ width: '70px', height: '22px', borderRadius: '12px' }} />
          </div>
          <div className="skeleton-pulse" style={{ width: '80%', height: '14px', borderRadius: '4px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <div className="skeleton-pulse" style={{ width: '90px', height: '16px', borderRadius: '4px' }} />
            <div className="skeleton-pulse" style={{ width: '110px', height: '18px', borderRadius: '6px' }} />
          </div>
        </div>
      ))}
    </div>
  );
};
