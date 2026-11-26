import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { QuoteCategory, QuoteItem, QuoteSubItem } from '../types/quote';
import { X, Plus, Trash2, Save, Zap, Lock } from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';
import { SearchableProveedorSelect } from './SearchableProveedorSelect';
import {
  computeQuoteItemFinancials,
  parseSpecialSourceItemIds,
  resolveQuoteProviderCosts,
  wouldCreateSpecialCycle
} from '../utils/quoteMathHelper';

interface MobileItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: QuoteItem | null;
  allCategories?: QuoteCategory[];
  currency?: 'PEN' | 'USD';
  onSave: (item: QuoteItem) => void;
}

export const MobileItemFormModal: React.FC<MobileItemFormModalProps> = ({
  isOpen,
  onClose,
  item,
  allCategories = [],
  currency = 'PEN',
  onSave
}) => {
  const { proveedores } = useGlobalContext();
  const symbol = currency === 'USD' ? '$' : 'S/';
  // Local state for editing the item without saving it yet
  const [editedItem, setEditedItem] = useState<QuoteItem>(
    item ? {
      ...item,
      specialSourceItemIds: parseSpecialSourceItemIds(item.specialSourceItemIds),
      details: [...(item.details || [])],
      subItems: [...(item.subItems || [])].map(si => ({...si}))
    } : {} as QuoteItem
  );

  // Unified full description text field
  const [descriptionText, setDescriptionText] = useState<string>(() => {
    if (!item?.details) return '';
    return Array.isArray(item.details) ? item.details.join('\n') : String(item.details);
  });

  if (!isOpen || !item) return null;

  const handleSave = () => {
    const lines = descriptionText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    onSave({
      ...editedItem,
      details: lines.length > 0 ? lines : []
    });
    onClose();
  };

  const handleUpdateField = (field: keyof QuoteItem, value: any) => {
    setEditedItem(prev => ({ ...prev, [field]: value }));
  };

  // Compute live cost preview incorporating editedItem into allCategories
  const previewCategories: QuoteCategory[] = (allCategories || []).map((cat) => ({
    ...cat,
    items: (cat.items || []).map((it) => (it.id === editedItem.id ? editedItem : it))
  }));
  const providerCostMap = resolveQuoteProviderCosts(
    previewCategories.length > 0
      ? previewCategories
      : [{ id: 'tmp', name: 'General', items: [editedItem] }]
  );
  const {
    totalProvider: liveTotalProvider,
    internalMultiplierAmount: liveMarginInternal,
    financialExpense: liveFinancialExpense,
    totalClient: liveFinalClientCost
  } = computeQuoteItemFinancials(editedItem, providerCostMap);

  const selectedSourceIds = parseSpecialSourceItemIds(editedItem.specialSourceItemIds);
  const eligibleCandidates = (allCategories || []).flatMap((cat) =>
    (cat?.items || [])
      .filter((cand) => cand && cand.id !== editedItem.id && !wouldCreateSpecialCycle(allCategories, editedItem.id, cand.id))
      .map((cand) => ({
        categoryName: cat.name || 'General',
        item: cand,
        providerTotal: providerCostMap.get(cand.id) ?? 0
      }))
  );

  const handleToggleSpecialMode = (enabled: boolean) => {
    setEditedItem((prev) => {
      const existingSubs = Array.isArray(prev.subItems) ? prev.subItems : [];
      const hasPrimary = existingSubs.some((s) => !String(s?.name || '').toLowerCase().includes('imprevisto'));
      const nextSubs = enabled && !hasPrimary
        ? [
            {
              id: `sub-sp-${prev.id || Date.now()}`,
              name: prev.name || 'Servicio porcentual',
              description: '',
              quantity: 1,
              dates: 1,
              unitCost: 0,
              providerName: ''
            },
            ...existingSubs
          ]
        : existingSubs;

      return {
        ...prev,
        isSpecial: enabled,
        specialRatePercent: prev.specialRatePercent ?? 10,
        specialSourceItemIds: parseSpecialSourceItemIds(prev.specialSourceItemIds),
        internalMultiplierPercent: enabled ? 0 : (prev.internalMultiplierPercent || 10),
        financialExpensePercent: enabled ? 0 : (prev.financialExpensePercent || 10),
        subItems: nextSubs
      };
    });
  };

  const handleToggleSourceItem = (srcId: string) => {
    const nextIds = selectedSourceIds.includes(srcId)
      ? selectedSourceIds.filter((id) => id !== srcId)
      : [...selectedSourceIds, srcId];
    handleUpdateField('specialSourceItemIds', nextIds);
  };

  const handleAddSubItem = () => {
    const newSub: QuoteSubItem = {
      id: Date.now().toString(),
      name: '',
      description: '',
      quantity: 1,
      dates: 1,
      unitCost: 0,
      providerName: ''
    };
    setEditedItem(prev => {
      const items = [...(prev.subItems || [])];
      const impIdx = items.findIndex(s => (s.name || '').trim().toLowerCase().includes('imprevisto'));
      if (impIdx !== -1) {
        items.splice(impIdx, 0, newSub);
      } else {
        items.push(newSub);
      }
      return { ...prev, subItems: items };
    });
  };

  const handleUpdateSubItem = (index: number, field: keyof QuoteSubItem, value: any) => {
    setEditedItem(prev => {
      const newSubItems = [...prev.subItems];
      newSubItems[index] = { ...newSubItems[index], [field]: value };
      return { ...prev, subItems: newSubItems };
    });
  };

  const handleRemoveSubItem = (index: number) => {
    setEditedItem(prev => {
      const newSubItems = [...prev.subItems];
      newSubItems.splice(index, 1);
      return { ...prev, subItems: newSubItems };
    });
  };

  return createPortal(
    <div className="mobile-overlay mobile-open" style={{ zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--bg-primary)', height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* Header */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-panel)' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>Editar Ítem</h3>
          <button onClick={onClose} style={{ background: 'var(--bg-secondary)', border: 'none', color: 'var(--text-primary)', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} />
          </button>
        </div>

        <style>
          {`
            .mobile-form-modal input.form-control {
              padding: 12px;
              font-size: 1.05rem;
              background-color: var(--bg-secondary);
              border: 1px solid var(--border-color);
              border-radius: 8px;
              transition: all 0.2s;
            }
            .mobile-form-modal input.form-control:focus {
              border-color: var(--accent-primary);
              box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
            }
            .mobile-form-modal label {
              font-size: 0.9rem;
              color: var(--text-secondary);
              margin-bottom: 6px;
              display: block;
              font-weight: 500;
            }
          `}
        </style>

        {/* Form Body - Scrollable */}
        <div className="mobile-form-modal" style={{ flex: 1, overflowY: 'auto', padding: '20px', WebkitOverflowScrolling: 'touch', backgroundColor: 'var(--bg-primary)' }}>
          
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label>Nombre del Ítem / Detalle Principal</label>
            <input 
              type="text" 
              className="form-control" 
              value={editedItem.name || ''} 
              onChange={(e) => handleUpdateField('name', e.target.value)}
              placeholder="Ej. Producción de Video o APDAYC"
            />
          </div>

          {/* Tipo de Ítem: Estándar vs Especial (%) */}
          <div style={{ marginBottom: '20px', padding: '12px', borderRadius: '10px', border: editedItem.isSpecial ? '1px solid #818cf8' : '1px solid var(--border-color)', backgroundColor: editedItem.isSpecial ? '#eef2ff' : 'var(--bg-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.9rem', color: editedItem.isSpecial ? '#3730a3' : 'var(--text-primary)' }}>
                <Zap size={16} style={{ color: '#4f46e5' }} /> Ítem Especial (% sobre ítems)
              </span>
              <button
                type="button"
                className={editedItem.isSpecial ? 'btn-primary' : 'btn-secondary'}
                style={{ minHeight: '38px', padding: '6px 12px', fontSize: '0.82rem' }}
                onClick={() => handleToggleSpecialMode(!editedItem.isSpecial)}
              >
                {editedItem.isSpecial ? 'Activado ✓' : 'Activar'}
              </button>
            </div>

            {editedItem.isSpecial && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {['APDAYC', 'UNIMPRO', 'Derechos / Gestión'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleUpdateField('name', preset)}
                      style={{
                        minHeight: '36px',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        border: editedItem.name === preset ? '1px solid #4f46e5' : '1px solid #cbd5e1',
                        backgroundColor: editedItem.name === preset ? '#4f46e5' : '#ffffff',
                        color: editedItem.name === preset ? '#ffffff' : '#334155',
                        fontSize: '0.8rem',
                        fontWeight: 600
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <div className="form-group">
                  <label>Porcentaje aplicado a la suma (%)</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      className="form-control"
                      value={editedItem.specialRatePercent ?? 10}
                      onChange={(e) => handleUpdateField('specialRatePercent', parseFloat(e.target.value) || 0)}
                      style={{ flex: 1 }}
                    />
                    {[5, 10, 100].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => handleUpdateField('specialRatePercent', pct)}
                        style={{
                          minHeight: '44px',
                          minWidth: '48px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: Number(editedItem.specialRatePercent ?? 10) === pct ? '#4f46e5' : '#ffffff',
                          color: Number(editedItem.specialRatePercent ?? 10) === pct ? '#ffffff' : '#334155',
                          fontWeight: 700
                        }}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ marginBottom: '8px' }}>Ítems incluidos ({selectedSourceIds.length})</label>
                  {eligibleCandidates.length === 0 ? (
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>Agrega otros ítems primero para seleccionarlos.</p>
                  ) : (
                    <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {eligibleCandidates.map((cand) => {
                        const checked = selectedSourceIds.includes(cand.item.id);
                        return (
                          <label
                            key={cand.item.id}
                            style={{
                              minHeight: '44px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              padding: '8px 10px',
                              borderRadius: '8px',
                              border: checked ? '1px solid #6366f1' : '1px solid #cbd5e1',
                              backgroundColor: checked ? '#ffffff' : 'rgba(255,255,255,0.65)',
                              margin: 0
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleToggleSourceItem(cand.item.id)}
                                style={{ width: '18px', height: '18px', accentColor: '#4f46e5', flexShrink: 0 }}
                              />
                              <span style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {cand.item.name}
                              </span>
                            </span>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#b91c1c', whiteSpace: 'nowrap' }}>
                              {symbol} {cand.providerTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group">
              <label>Cantidad</label>
              <input 
                type="number" 
                className="form-control" 
                value={editedItem.quantity} 
                onChange={(e) => handleUpdateField('quantity', Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Fechas / Días</label>
              <input 
                type="number" 
                className="form-control" 
                value={editedItem.dates} 
                onChange={(e) => handleUpdateField('dates', Number(e.target.value))}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div className="form-group">
              <label>% Margen (Multiplicador)</label>
              <input 
                type="number" 
                className="form-control" 
                value={editedItem.internalMultiplierPercent} 
                onChange={(e) => handleUpdateField('internalMultiplierPercent', Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>% Gasto Financiero</label>
              <input 
                type="number" 
                className="form-control" 
                value={editedItem.financialExpensePercent} 
                onChange={(e) => handleUpdateField('financialExpensePercent', Number(e.target.value))}
              />
            </div>
          </div>

          {/* Descripción Completa del Ítem / Especificaciones */}
          <div className="form-group" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
              <label style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                Descripción Completa del Ítem
              </label>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                (Especificaciones y detalles)
              </span>
            </div>
            <textarea 
              className="form-control" 
              rows={4}
              value={descriptionText} 
              onChange={(e) => setDescriptionText(e.target.value)}
              placeholder="Describe aquí todas las características, medidas, materiales o especificaciones del ítem. Puedes usar saltos de línea libremente..."
              style={{
                width: '100%',
                minHeight: '110px',
                padding: '12px',
                fontSize: '0.95rem',
                lineHeight: '1.5',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                resize: 'vertical',
                fontFamily: 'inherit'
              }}
            />
          </div>

          {/* Subítems (Proveedores) */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <label style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem' }}>
                {editedItem.isSpecial ? 'Proveedor Asignado (OC/OS)' : 'Subítems (Proveedores)'}
              </label>
              {!editedItem.isSpecial ? (
                <button className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={handleAddSubItem}>
                  <Plus size={14} /> Añadir
                </button>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: '#4338ca', fontWeight: 600 }}>
                  <Lock size={13} /> Costo calculado automáticamente
                </span>
              )}
            </div>

            {editedItem.subItems.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No hay subítems agregados.</p>}

            {editedItem.subItems.map((sub, idx) => {
              const isImprevisto = (sub.name || '').trim().toLowerCase().includes('imprevisto');
              if (editedItem.isSpecial && isImprevisto) return null;
              return (
              <div key={sub.id} style={{ 
                backgroundColor: isImprevisto ? '#fef9c3' : 'var(--bg-secondary)', 
                border: isImprevisto ? '1px solid #fde047' : '1px solid var(--border-color)', 
                borderLeft: isImprevisto ? '4px solid #eab308' : undefined,
                borderRadius: '8px', 
                padding: '12px', 
                marginBottom: '12px' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontWeight: 'bold', color: isImprevisto ? '#854d0e' : 'var(--accent-primary)' }}>
                    {isImprevisto ? '★ Imprevistos' : (editedItem.isSpecial ? 'Proveedor Servicio Especial' : `Subítem ${idx + 1}`)}
                  </span>
                  {!editedItem.isSpecial && (
                    <button className="btn-icon" style={{ color: 'var(--danger)', padding: 0 }} onClick={() => handleRemoveSubItem(idx)}>
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Nombre / Servicio</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={sub.name} 
                    onChange={(e) => handleUpdateSubItem(idx, 'name', e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group">
                    <label>Cant.</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={editedItem.isSpecial ? 1 : sub.quantity} 
                      readOnly={Boolean(editedItem.isSpecial)}
                      style={editedItem.isSpecial ? { opacity: 0.65, cursor: 'not-allowed' } : undefined}
                      onChange={(e) => !editedItem.isSpecial && handleUpdateSubItem(idx, 'quantity', Number(e.target.value))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Días</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={editedItem.isSpecial ? 1 : sub.dates} 
                      readOnly={Boolean(editedItem.isSpecial)}
                      style={editedItem.isSpecial ? { opacity: 0.65, cursor: 'not-allowed' } : undefined}
                      onChange={(e) => !editedItem.isSpecial && handleUpdateSubItem(idx, 'dates', Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Costo Unitario ({symbol}) {editedItem.isSpecial ? '• Calculado (%)' : ''}</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={editedItem.isSpecial ? liveTotalProvider : sub.unitCost} 
                    readOnly={Boolean(editedItem.isSpecial)}
                    style={editedItem.isSpecial ? { opacity: 0.75, cursor: 'not-allowed', fontWeight: 700, color: '#4338ca' } : undefined}
                    onChange={(e) => !editedItem.isSpecial && handleUpdateSubItem(idx, 'unitCost', Number(e.target.value))}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Proveedor Asignado</span>
                    {isImprevisto && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Opcional</span>}
                  </label>
                  <SearchableProveedorSelect
                    proveedores={proveedores}
                    value={sub.providerId || ''}
                    customTextValue={sub.providerName || ''}
                    placeholder={isImprevisto ? "Opcional (Proveedor)" : "-- Seleccionar proveedor --"}
                    allowCustomText={true}
                    compact={true}
                    onChange={(_pId, prov, customText) => {
                      if (prov) {
                        handleUpdateSubItem(idx, 'providerName', prov.razonSocial || prov.nombre);
                        handleUpdateSubItem(idx, 'providerId' as any, prov.id);
                      } else if (customText !== undefined && customText !== '') {
                        handleUpdateSubItem(idx, 'providerName', customText);
                        handleUpdateSubItem(idx, 'providerId' as any, '');
                      } else {
                        handleUpdateSubItem(idx, 'providerName', '');
                        handleUpdateSubItem(idx, 'providerId' as any, '');
                      }
                    }}
                  />
                </div>
              </div>
              );
            })}
          </div>
          {/* Live Calculations */}
          <div style={{ padding: '16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px', fontVariantNumeric: 'tabular-nums' }}>
            <h4 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)', fontSize: '1rem' }}>Resumen de Costos</h4>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              <span>Costo Prov. (Total):</span>
              <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>
                {symbol} {liveTotalProvider.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              <span>Margen (% Interno + Gasto Fin.):</span>
              <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>
                {symbol} {(liveMarginInternal + liveFinancialExpense).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)', fontSize: '1.1rem', fontWeight: 'bold' }}>
              <span>Total Cliente:</span>
              <span style={{ color: 'var(--success)' }}>
                {symbol} {liveFinalClientCost.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', boxShadow: '0 -4px 12px rgba(0,0,0,0.05)' }}>
          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: '1.1rem', borderRadius: '12px' }} onClick={handleSave}>
            <Save size={20} /> Guardar Cambios
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
