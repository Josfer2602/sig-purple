import React from 'react';
import type { QuoteSubItem } from '../types/quote';
import { Plus, Trash2, Lock } from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';
import { SearchableProveedorSelect } from './SearchableProveedorSelect';

interface QuoteSubItemTableProps {
  subItems: QuoteSubItem[];
  currency?: 'PEN' | 'USD';
  isSpecialLocked?: boolean;
  specialRatePercent?: number;
  onUpdateSubItem: (id: string, fieldOrData: any, value?: any) => void;
  onAddSubItem: () => void;
  onDeleteSubItem: (id: string) => void;
}

export const QuoteSubItemTable: React.FC<QuoteSubItemTableProps> = ({
  subItems,
  currency = 'PEN',
  isSpecialLocked = false,
  specialRatePercent,
  onUpdateSubItem,
  onAddSubItem,
  onDeleteSubItem
}) => {
  const { proveedores } = useGlobalContext();
  const symbol = currency === 'USD' ? '$' : 'S/';
  const formatCurrency = (amount: number) => {
    return `${symbol} ${(amount || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const total = subItems.reduce((acc, curr) => acc + (curr.unitCost * curr.quantity * curr.dates), 0);

  // Asegurar que cualquier sub-ítem de Imprevistos se sitúe siempre al final de la tabla
  const sortedSubItems = [...subItems].sort((a, b) => {
    const isA = (a.name || '').trim().toLowerCase().includes('imprevisto');
    const isB = (b.name || '').trim().toLowerCase().includes('imprevisto');
    if (isA && !isB) return 1;
    if (!isA && isB) return -1;
    return 0;
  });

  return (
    <div className="sub-table-container animate-fade-in" style={{ overflow: 'visible' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <h4 style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0 }}>
          Detalle de Proveedor ({isSpecialLocked ? 'Proveedor para OC/OS y Costo Calculado' : 'Desglose de Costos Internos'})
        </h4>
        {!isSpecialLocked ? (
          <button
            className="btn-primary"
            onClick={(e) => { e.stopPropagation(); onAddSubItem(); }}
            style={{ fontSize: '12px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0, borderRadius: 'var(--radius-md)' }}
          >
            <Plus size={14} /> Añadir Sub-ítem
          </button>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, color: '#4f46e5', backgroundColor: '#eef2ff', border: '1px solid #c7d2fe', padding: '3px 10px', borderRadius: '999px' }}>
            <Lock size={12} /> Monto calculado automáticamente ({specialRatePercent ?? 10}% sobre ítems)
          </span>
        )}
      </div>
      <table className="sub-table" style={{ overflow: 'visible' }}>
        <thead>
          <tr style={{ backgroundColor: '#662D91' }}>
            <th className="sub-table-th" style={{ backgroundColor: '#662D91', color: '#ffffff', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '10px 14px' }}>Sub ítem / Descripción</th>
            <th className="sub-table-th" style={{ backgroundColor: '#662D91', color: '#ffffff', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '10px 14px', width: '105px', minWidth: '100px', textAlign: 'center' }}>Cant.</th>
            <th className="sub-table-th" style={{ backgroundColor: '#662D91', color: '#ffffff', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '10px 14px', width: '90px', minWidth: '85px', textAlign: 'center' }}>Fechas</th>
            <th className="sub-table-th" style={{ backgroundColor: '#662D91', color: '#ffffff', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '10px 14px', width: '120px' }}>Costo Unit.</th>
            <th className="sub-table-th" style={{ backgroundColor: '#662D91', color: '#ffffff', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '10px 14px', width: '120px' }}>Costo Total</th>
            <th className="sub-table-th" style={{ backgroundColor: '#662D91', color: '#ffffff', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '10px 14px', width: '270px', minWidth: '250px' }}>Proveedor</th>
            <th className="sub-table-th" style={{ backgroundColor: '#662D91', color: '#ffffff', padding: '10px 14px', width: '40px' }}></th>
          </tr>
        </thead>
        <tbody style={{ overflow: 'visible' }}>
          {sortedSubItems.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', padding: '20px 16px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '13px', backgroundColor: '#ffffff' }}>
                No hay sub-ítems registrados. Haz clic en <strong>+ Añadir Sub-ítem</strong> para desglosar los costos con proveedores.
              </td>
            </tr>
          )}
          {sortedSubItems.map(sub => {
            const subTotal = sub.unitCost * sub.quantity * sub.dates;
            const isImprevisto = (sub.name || '').trim().toLowerCase().includes('imprevisto');
            const isNumericLocked = isSpecialLocked;
            return (
              <tr
                key={sub.id}
                className={isImprevisto ? 'row-imprevistos' : undefined}
                style={isImprevisto ? { backgroundColor: '#fef08a' } : undefined}
              >
                <td>
                  <input
                    type="text"
                    value={sub.name}
                    onChange={(e) => onUpdateSubItem(sub.id, 'name', e.target.value)}
                    placeholder="Nombre del sub-ítem"
                    style={isImprevisto ? { fontWeight: 600, color: '#713f12' } : undefined}
                  />
                </td>
                <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                  <input
                    type="number"
                    value={sub.quantity}
                    readOnly={isNumericLocked}
                    title={isNumericLocked ? 'Calculado automáticamente por el Ítem Especial' : undefined}
                    onChange={(e) => !isNumericLocked && onUpdateSubItem(sub.id, 'quantity', parseFloat(e.target.value) || 0)}
                    style={{
                      textAlign: 'center',
                      width: '100%',
                      minWidth: '75px',
                      padding: '4px 6px',
                      boxSizing: 'border-box',
                      ...(isNumericLocked ? { opacity: 0.65, cursor: 'not-allowed', backgroundColor: 'rgba(0,0,0,0.04)' } : {}),
                      ...(isImprevisto ? { fontWeight: 600, color: '#713f12' } : {})
                    }}
                  />
                </td>
                <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                  <input
                    type="number"
                    value={sub.dates}
                    readOnly={isNumericLocked}
                    title={isNumericLocked ? 'Calculado automáticamente por el Ítem Especial' : undefined}
                    onChange={(e) => !isNumericLocked && onUpdateSubItem(sub.id, 'dates', parseFloat(e.target.value) || 0)}
                    style={{
                      textAlign: 'center',
                      width: '100%',
                      minWidth: '60px',
                      padding: '4px 6px',
                      boxSizing: 'border-box',
                      ...(isNumericLocked ? { opacity: 0.65, cursor: 'not-allowed', backgroundColor: 'rgba(0,0,0,0.04)' } : {}),
                      ...(isImprevisto ? { fontWeight: 600, color: '#713f12' } : {})
                    }}
                  />
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ color: isImprevisto ? '#a16207' : 'var(--text-muted)', marginRight: '4px' }}>{symbol}</span>
                    <input
                      type="number"
                      value={sub.unitCost}
                      readOnly={isNumericLocked}
                      title={isNumericLocked ? 'Se actualiza automáticamente según los ítems seleccionados y el %' : undefined}
                      onChange={(e) => !isNumericLocked && onUpdateSubItem(sub.id, 'unitCost', parseFloat(e.target.value) || 0)}
                      step="0.01"
                      style={{
                        ...(isNumericLocked ? { opacity: 0.75, cursor: 'not-allowed', fontWeight: 700, backgroundColor: 'rgba(79, 70, 229, 0.05)' } : {}),
                        ...(isImprevisto ? { fontWeight: 600, color: '#713f12' } : {})
                      }}
                    />
                  </div>
                </td>
                <td style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: isImprevisto ? '#713f12' : undefined }}>{formatCurrency(subTotal)}</td>
                <td style={{ padding: '6px 8px', minWidth: '250px', overflow: 'visible', verticalAlign: 'middle' }}>
                  <SearchableProveedorSelect
                    proveedores={proveedores}
                    value={sub.providerId || ''}
                    customTextValue={sub.providerName || ''}
                    compact={true}
                    allowCustomText={true}
                    placeholder={isImprevisto ? "Opcional (Proveedor)" : "-- Seleccionar proveedor --"}
                    onChange={(_pId, prov, customText) => {
                      if (prov) {
                        onUpdateSubItem(sub.id, {
                          providerName: prov.razonSocial || prov.nombre,
                          providerId: prov.id
                        });
                      } else if (customText !== undefined && customText !== '') {
                        onUpdateSubItem(sub.id, {
                          providerName: customText,
                          providerId: ''
                        });
                      } else {
                        onUpdateSubItem(sub.id, {
                          providerName: '',
                          providerId: ''
                        });
                      }
                    }}
                  />
                </td>
                <td>
                  {!isSpecialLocked && (
                    <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onDeleteSubItem(sub.id); }} style={{ color: 'var(--danger)' }}><Trash2 size={16} /></button>
                  )}
                </td>
              </tr>
            );
          })}
          {/* Fila de Totales */}
          <tr style={{ backgroundColor: 'rgba(0,0,0,0.03)' }}>
            <td colSpan={4} style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)' }}>TOTAL PROVEEDOR (Costo Interno)</td>
            <td colSpan={3} style={{ fontWeight: 700, color: 'var(--success)' }}>{formatCurrency(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
