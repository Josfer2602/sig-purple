import React, { useState } from 'react';
import type { QuoteCategory, QuoteItem } from '../types/quote';
import { QuoteSubItemTable } from './QuoteSubItemTable';
import { computeQuoteItemFinancials, parseSpecialSourceItemIds, wouldCreateSpecialCycle } from '../utils/quoteMathHelper';
import { ChevronDown, ChevronRight, Trash2, Zap, Search } from 'lucide-react';

interface QuoteItemRowProps {
  item: QuoteItem;
  index: number;
  currency?: 'PEN' | 'USD';
  allCategories?: QuoteCategory[];
  providerCostMap?: Map<string, number>;
  onUpdateItem: (id: string, fieldOrPatch: string | Partial<QuoteItem>, value?: any) => void;
  onUpdateSubItem: (itemId: string, subId: string, field: any, value?: any) => void;
  onMoveItem: (id: string, direction: 'up' | 'down') => void;
  onDeleteItem: (id: string) => void;
  onAddSubItem: (itemId: string) => void;
  onDeleteSubItem: (itemId: string, subId: string) => void;
}

export const QuoteItemRow: React.FC<QuoteItemRowProps> = ({
  item,
  index,
  currency = 'PEN',
  allCategories = [],
  providerCostMap,
  onUpdateItem,
  onUpdateSubItem,
  onMoveItem,
  onDeleteItem,
  onAddSubItem,
  onDeleteSubItem
}) => {
  const initialRefs = parseSpecialSourceItemIds(item?.specialSourceItemIds);
  const [isExpanded, setIsExpanded] = useState<boolean>(() => Boolean(item?.isSpecial && initialRefs.length === 0));
  const [sourceFilter, setSourceFilter] = useState('');
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

  const {
    totalProvider,
    unitProviderCost,
    internalMultiplierAmount,
    financialExpense,
    totalClient: finalClientCost,
    unitClientCost: clientUnitCost
  } = computeQuoteItemFinancials(item, providerCostMap);

  const selectedSourceIds = parseSpecialSourceItemIds(item.specialSourceItemIds);
  const eligibleCandidates = (allCategories || []).flatMap((cat) =>
    (cat?.items || [])
      .filter((cand) => cand && cand.id !== item.id && !wouldCreateSpecialCycle(allCategories, item.id, cand.id))
      .map((cand, cIdx) => ({
        categoryName: cat.name || 'Sin Categoría',
        item: cand,
        localNum: cIdx + 1,
        providerTotal: providerCostMap?.get(cand.id) ?? computeQuoteItemFinancials(cand, providerCostMap).totalProvider
      }))
  );
  const selectedSumBase = eligibleCandidates
    .filter((c) => selectedSourceIds.includes(c.item.id))
    .reduce((acc, c) => acc + c.providerTotal, 0);

  const filteredCandidates = sourceFilter.trim()
    ? eligibleCandidates.filter((c) =>
        `${c.categoryName} ${c.item.name}`.toLowerCase().includes(sourceFilter.trim().toLowerCase())
      )
    : eligibleCandidates;

  const handleToggleSourceItem = (sourceId: string) => {
    const exists = selectedSourceIds.includes(sourceId);
    const nextIds = exists
      ? selectedSourceIds.filter((id) => id !== sourceId)
      : [...selectedSourceIds, sourceId];
    onUpdateItem(item.id, 'specialSourceItemIds', nextIds);
  };

  const applySpecialPreset = (presetName: string) => {
    onUpdateItem(item.id, {
      name: presetName,
      isSpecial: true,
      details: item.details?.length ? item.details : [`Derechos / Servicio ${presetName}`]
    });
  };

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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  value={item.name} 
                  onChange={(e) => onUpdateItem(item.id, 'name', e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontWeight: 700, color: 'var(--text-primary)', flex: 1, minWidth: '140px', background: 'transparent', border: '1px solid transparent', padding: '4px', borderRadius: '4px' }}
                  placeholder="Título del ítem..."
                />
                {item.isSpecial && (
                  <span
                    title={`Ítem Especial: ${item.specialRatePercent ?? 10}% sobre ${selectedSourceIds.length} ítem(s)`}
                    onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      backgroundColor: '#eef2ff',
                      color: '#4338ca',
                      border: '1px solid #c7d2fe',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer'
                    }}
                  >
                    <Zap size={11} /> Especial {item.specialRatePercent ?? 10}% ({selectedSourceIds.length} ítems)
                  </span>
                )}
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
        <td className="td-custom text-right text-red" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(unitProviderCost)}</td>
        <td className="td-custom text-right font-bold text-red" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(totalProvider)}</td>
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
              style={{ width: '56px', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border-color)', color: 'inherit', borderRadius: '4px', padding: '4px', textAlign: 'center' }}
            />
            <span style={{ marginLeft: '3px', fontSize: '0.8rem' }}>%</span>
          </div>
        </td>
        <td className="td-custom text-right text-cyan" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(internalMultiplierAmount)}</td>
        <td className="td-custom text-right text-cyan">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
              <input
                type="number"
                value={item.financialExpensePercent ?? 0}
                onChange={(e) => onUpdateItem(item.id, 'financialExpensePercent', parseFloat(e.target.value) || 0)}
                style={{ width: '48px', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px', padding: '2px 4px', textAlign: 'center', fontSize: '0.78rem' }}
                title="% Gasto Financiero"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>%</span>
            </div>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.84rem' }}>{formatCurrency(financialExpense)}</span>
          </div>
        </td>
        <td className="td-custom text-right text-purple" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(clientUnitCost)}</td>
        <td className="td-custom text-right font-bold text-purple" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(finalClientCost)}</td>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} onClick={(e) => e.stopPropagation()}>
              {/* Modo Ítem Especial (APDAYC, UNIMPRO, etc.) */}
              <div
                style={{
                  backgroundColor: item.isSpecial ? '#f5f7ff' : 'rgba(99, 102, 241, 0.03)',
                  border: item.isSpecial ? '1px solid #c7d2fe' : '1px dashed var(--border-color)',
                  borderRadius: '8px',
                  padding: item.isSpecial ? '14px 16px' : '8px 14px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.85rem', color: item.isSpecial ? '#3730a3' : 'var(--text-secondary)' }}>
                      <Zap size={15} style={{ color: '#4f46e5' }} />
                      {item.isSpecial ? 'Cálculo de Ítem Especial (% sobre Costo Proveedores)' : '¿Servicio porcentual sobre otros ítems (ej. APDAYC, UNIMPRO)?'}
                    </span>
                    {item.isSpecial && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {['APDAYC', 'UNIMPRO', 'Derechos / Gestión'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => applySpecialPreset(preset)}
                            style={{
                              fontSize: '0.74rem',
                              fontWeight: 600,
                              padding: '3px 9px',
                              borderRadius: '999px',
                              border: item.name === preset ? '1px solid #4f46e5' : '1px solid #cbd5e1',
                              backgroundColor: item.name === preset ? '#4f46e5' : '#ffffff',
                              color: item.name === preset ? '#ffffff' : '#334155',
                              cursor: 'pointer'
                            }}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      const willBeSpecial = !item.isSpecial;
                      onUpdateItem(item.id, {
                        isSpecial: willBeSpecial,
                        specialRatePercent: item.specialRatePercent ?? 10,
                        specialSourceItemIds: selectedSourceIds,
                        internalMultiplierPercent: willBeSpecial ? 0 : (item.internalMultiplierPercent || 10),
                        financialExpensePercent: willBeSpecial ? 0 : (item.financialExpensePercent || 10)
                      });
                    }}
                    style={{ fontSize: '0.76rem', padding: '4px 10px' }}
                  >
                    {item.isSpecial ? 'Convertir a ítem estándar' : 'Activar modo Ítem Especial (%)'}
                  </button>
                </div>

                {item.isSpecial && (
                  <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'minmax(240px, 310px) 1fr', gap: '14px', alignItems: 'start' }}>
                    {/* Panel izquierdo: % tasa + fórmula en vivo */}
                    <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Porcentaje sobre suma (%)
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={item.specialRatePercent ?? 10}
                          onChange={(e) => onUpdateItem(item.id, 'specialRatePercent', parseFloat(e.target.value) || 0)}
                          style={{ width: '90px', padding: '6px 8px', fontSize: '0.95rem', fontWeight: 700, border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right' }}
                        />
                        <span style={{ fontWeight: 700, color: '#334155' }}>%</span>
                        <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
                          {[5, 10, 100].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => onUpdateItem(item.id, 'specialRatePercent', pct)}
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                padding: '3px 7px',
                                borderRadius: '4px',
                                border: '1px solid #cbd5e1',
                                backgroundColor: Number(item.specialRatePercent ?? 10) === pct ? '#4f46e5' : '#f8fafc',
                                color: Number(item.specialRatePercent ?? 10) === pct ? '#ffffff' : '#475569',
                                cursor: 'pointer'
                              }}
                            >
                              {pct}%
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px', fontVariantNumeric: 'tabular-nums' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                          <span>Base sumada ({selectedSourceIds.length} ítems):</span>
                          <span style={{ fontWeight: 600 }}>{formatCurrency(selectedSumBase)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4338ca', fontWeight: 700, fontSize: '0.88rem' }}>
                          <span>Monto a cobrar ({item.specialRatePercent ?? 10}% de la base):</span>
                          <span>{formatCurrency(totalProvider)}</span>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: '#6b7280', fontStyle: 'italic', marginTop: '2px' }}>
                          * Se cobra únicamente el {item.specialRatePercent ?? 10}% resultante (no la base + %).
                        </span>
                      </div>
                    </div>

                    {/* Panel derecho: Selector de ítems base */}
                    <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                          Ítems a sumar (Costo Total Proveedores)
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {eligibleCandidates.length > 5 && (
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                              <Search size={13} style={{ position: 'absolute', left: '7px', color: '#94a3b8' }} />
                              <input
                                type="text"
                                value={sourceFilter}
                                onChange={(e) => setSourceFilter(e.target.value)}
                                placeholder="Buscar ítem..."
                                style={{ padding: '3px 8px 3px 24px', fontSize: '0.75rem', border: '1px solid #cbd5e1', borderRadius: '4px', width: '140px' }}
                              />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => onUpdateItem(item.id, 'specialSourceItemIds', eligibleCandidates.map((c) => c.item.id))}
                            style={{ fontSize: '0.72rem', padding: '2px 7px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#f8fafc', cursor: 'pointer', color: '#334155' }}
                          >
                            Todos
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateItem(item.id, 'specialSourceItemIds', [])}
                            style={{ fontSize: '0.72rem', padding: '2px 7px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#f8fafc', cursor: 'pointer', color: '#64748b' }}
                          >
                            Limpiar
                          </button>
                        </div>
                      </div>

                      {eligibleCandidates.length === 0 ? (
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', padding: '10px 4px' }}>
                          Agrega otros ítems a esta cotización para seleccionarlos como base de cálculo.
                        </div>
                      ) : (
                        <div style={{ maxHeight: '185px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '2px' }}>
                          {filteredCandidates.map((cand) => {
                            const checked = selectedSourceIds.includes(cand.item.id);
                            return (
                              <label
                                key={cand.item.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '10px',
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  border: checked ? '1px solid #818cf8' : '1px solid #f1f5f9',
                                  backgroundColor: checked ? '#eef2ff' : '#f8fafc',
                                  cursor: 'pointer',
                                  fontSize: '0.82rem'
                                }}
                              >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => handleToggleSourceItem(cand.item.id)}
                                    style={{ accentColor: '#4f46e5', width: '15px', height: '15px', flexShrink: 0 }}
                                  />
                                  <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', backgroundColor: '#e2e8f0', color: '#475569', whiteSpace: 'nowrap' }}>
                                    {cand.categoryName}
                                  </span>
                                  <span style={{ fontWeight: checked ? 600 : 500, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {cand.item.name || 'Ítem sin nombre'}
                                  </span>
                                </span>
                                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#b91c1c', whiteSpace: 'nowrap' }}>
                                  {formatCurrency(cand.providerTotal)}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <QuoteSubItemTable 
                subItems={item.subItems} 
                currency={currency}
                isSpecialLocked={Boolean(item.isSpecial)}
                specialRatePercent={item.specialRatePercent ?? 10}
                onUpdateSubItem={(subId, field, value) => onUpdateSubItem(item.id, subId, field, value)}
                onAddSubItem={() => onAddSubItem(item.id)}
                onDeleteSubItem={(subId) => onDeleteSubItem(item.id, subId)}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
};
