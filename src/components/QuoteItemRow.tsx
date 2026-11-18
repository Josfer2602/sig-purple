import React, { useState } from 'react';
import type { QuoteItem } from '../types/quote';
import { QuoteSubItemTable } from './QuoteSubItemTable';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

interface QuoteItemRowProps {
  item: QuoteItem;
  index: number;
  currency?: 'PEN' | 'USD';
  onUpdateItem: (id: string, field: string, value: any) => void;
  onUpdateSubItem: (itemId: string, subId: string, field: any, value?: any) => void;
  onMoveItem: (id: string, direction: 'up' | 'down') => void;
  onDeleteItem: (id: string) => void;
  onAddSubItem: (itemId: string) => void;
  onDeleteSubItem: (itemId: string, subId: string) => void;
}

export const QuoteItemRow: React.FC<QuoteItemRowProps> = ({ item, index, currency = 'PEN', onUpdateItem, onUpdateSubItem, onMoveItem, onDeleteItem, onAddSubItem, onDeleteSubItem }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [item?.details]);

  if (!item) return null;

  const formatCurrency = (amount: number) => {
    const symbol = currency === 'USD' ? '$' : 'S/';
    return `${symbol} ${(amount || 0).toLocaleString('es-PE', { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  const handleDetailsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newDetails = e.target.value.split('\n');
    onUpdateItem(item.id, 'details', newDetails);
  };

  const calculateTotalProvider = () => {
    return (item.subItems || []).reduce((acc, sub) => acc + ((sub?.unitCost || 0) * (sub?.quantity || 1) * (sub?.dates || 1)), 0);
  };

  const totalProvider = calculateTotalProvider();
  
  // Calculate internal multiplier amount
  const internalMultiplierAmount = totalProvider * ((item.internalMultiplierPercent ?? 10) / 100);
  
  // Calculate financial expense based on totalProvider only
  const financialExpense = totalProvider * ((item.financialExpensePercent ?? 10) / 100);
  
  const rawCalculatedClientCost = totalProvider + internalMultiplierAmount + financialExpense;
  const finalClientCost = Math.round(rawCalculatedClientCost);
  const qtyDates = (item.quantity || 1) * (item.dates || 1);
  const clientUnitCost = qtyDates > 0 ? (finalClientCost / qtyDates) : 0;

  return (
    <>
      <tr className="expandable-row" onClick={() => setIsExpanded(!isExpanded)}>
        <td className="td-custom text-center" style={{ color: 'var(--text-muted)' }}>{index + 1}</td>
        <td className="td-custom text-center">
          <input 
            type="number" 
            value={item.quantity} 
            onChange={(e) => onUpdateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
            onClick={(e) => e.stopPropagation()}
            style={{ width: '68px', minWidth: '65px', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border-color)', color: 'inherit', borderRadius: '4px', padding: '4px 6px', textAlign: 'center' }}
          />
        </td>
        <td className="td-custom text-center">
          <input 
            type="number" 
            value={item.dates} 
            onChange={(e) => onUpdateItem(item.id, 'dates', parseInt(e.target.value) || 0)}
            onClick={(e) => e.stopPropagation()}
            style={{ width: '58px', minWidth: '55px', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border-color)', color: 'inherit', borderRadius: '4px', padding: '4px 6px', textAlign: 'center' }}
          />
        </td>
        <td className="td-custom">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <div style={{ marginTop: '6px', cursor: 'pointer', color: 'var(--accent-primary)' }} onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}>
               {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <input 
                  type="text" 
                  value={item.name} 
                  onChange={(e) => onUpdateItem(item.id, 'name', e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontWeight: 700, color: 'var(--text-primary)', flex: 1, background: 'transparent', border: '1px solid transparent', padding: '4px', borderRadius: '4px' }}
                  placeholder="Título del ítem..."
                />
                {item.sourceQuoteDate && (
                  <span 
                    title={`Ítem importado de cotización fecha: ${item.sourceQuoteDate}${item.sourceProjectName ? ` (${item.sourceProjectName})` : ''}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      backgroundColor: '#eff6ff',
                      color: '#1d4ed8',
                      border: '1px solid #bfdbfe',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    📅 Cotizado: {item.sourceQuoteDate}
                  </span>
                )}
              </div>
              <textarea 
                ref={textareaRef}
                value={(item.details || []).join('\n')} 
                onChange={handleDetailsChange}
                onClick={(e) => e.stopPropagation()}
                style={{ width: '100%', minHeight: '40px', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '4px', padding: '8px', fontSize: 'var(--text-sm)', resize: 'none', overflow: 'hidden' }}
                placeholder="Detalles (una viñeta por línea)..."
              />
            </div>
          </div>
        </td>
        <td className="td-custom text-right text-red">{formatCurrency(totalProvider / (item.quantity * item.dates || 1))}</td>
        <td className="td-custom text-right font-bold text-red">{formatCurrency(totalProvider)}</td>
        <td className="td-custom text-center">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <input 
              type="number" 
              value={item.internalMultiplierPercent} 
              onChange={(e) => {
                e.stopPropagation();
                onUpdateItem(item.id, 'internalMultiplierPercent', parseFloat(e.target.value) || 0);
              }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: '60px', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border-color)', color: 'inherit', borderRadius: '4px', padding: '4px', textAlign: 'center' }}
            />
            <span style={{ marginLeft: '4px' }}>%</span>
          </div>
        </td>
        <td className="td-custom text-right text-cyan">{formatCurrency(internalMultiplierAmount)}</td>
        <td className="td-custom text-right text-cyan">{formatCurrency(financialExpense)}</td>
        <td className="td-custom text-right text-purple">{formatCurrency(clientUnitCost)}</td>
        <td className="td-custom text-right font-bold text-purple">{formatCurrency(finalClientCost)}</td>
        <td className="td-custom text-center" style={{ verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
          <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', justifyContent: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onMoveItem(item.id, 'up'); }} title="Subir Ítem">▲</button>
            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onMoveItem(item.id, 'down'); }} title="Bajar Ítem">▼</button>
            <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={(e) => { e.stopPropagation(); onDeleteItem(item.id); }} title="Eliminar Ítem">
              <Trash2 size={16} />
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className="expanded-content-row">
          <td colSpan={12}>
            <QuoteSubItemTable 
              subItems={item.subItems} 
              currency={currency}
              onUpdateSubItem={(subId, field, value) => onUpdateSubItem(item.id, subId, field, value)}
              onAddSubItem={() => onAddSubItem(item.id)}
              onDeleteSubItem={(subId) => onDeleteSubItem(item.id, subId)}
            />
          </td>
        </tr>
      )}
    </>
  );
};
