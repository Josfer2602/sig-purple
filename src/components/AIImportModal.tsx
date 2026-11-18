import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { X, Upload, Sparkles, FileText, ChevronDown, ChevronRight, Check, RefreshCw, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useGlobalContext, API_URL } from '../context/GlobalContext';

interface AISubItem {
  name: string;
  description: string;
  quantity: number;
  dates: number;
  unitCost: number;
}

interface AIItem {
  name: string;
  quantity: number;
  dates: number;
  details: string[];
  subItems: AISubItem[];
  selected?: boolean;
}

interface AICategory {
  name: string;
  items: AIItem[];
  expanded?: boolean;
}

interface AIParseResult {
  categories: AICategory[];
  notes: string;
}

interface AIImportModalProps {
  onClose: () => void;
  onApply: (categories: AICategory[], mode: 'add' | 'replace') => void;
}

export const AIImportModal: React.FC<AIImportModalProps> = ({ onClose, onApply }) => {
  const { token } = useGlobalContext();
  const [step, setStep] = useState<'input' | 'loading' | 'preview'>('input');
  const [text, setText] = useState('');
  const [result, setResult] = useState<AIParseResult | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [importMode, setImportMode] = useState<'add' | 'replace'>('add');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.txt') && file.type !== 'text/plain') {
      toast.error('Solo se admiten archivos .txt');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setText(ev.target?.result as string || '');
      toast.success(`Archivo "${file.name}" cargado`);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleAnalyze = async () => {
    if (text.trim().length < 10) {
      setError('El texto es muy corto. Agrega más detalle sobre la cotización.');
      return;
    }
    setError('');
    setStep('loading');

    try {
      const res = await fetch(`${API_URL}/quotes/parse-text-ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ text })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error del servidor');

      // Mark all categories as expanded and all items as selected by default
      const initExpanded = new Set<number>(data.categories.map((_: any, i: number) => i));
      const initSelected = new Set<string>();
      data.categories.forEach((cat: AICategory, ci: number) => {
        cat.items.forEach((_: AIItem, ii: number) => {
          initSelected.add(`${ci}-${ii}`);
        });
      });

      setResult(data);
      setExpandedCategories(initExpanded);
      setSelectedItems(initSelected);
      setStep('preview');
    } catch (err: any) {
      setError(err.message || 'Error al conectar con la IA');
      setStep('input');
    }
  };

  const toggleCategory = (ci: number) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(ci) ? next.delete(ci) : next.add(ci);
      return next;
    });
  };

  const toggleItem = (key: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleCategory_items = (ci: number) => {
    if (!result) return;
    const catKeys = result.categories[ci].items.map((_, ii) => `${ci}-${ii}`);
    const allSelected = catKeys.every(k => selectedItems.has(k));
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (allSelected) catKeys.forEach(k => next.delete(k));
      else catKeys.forEach(k => next.add(k));
      return next;
    });
  };

  const handleApply = () => {
    if (!result) return;
    const filteredCategories: AICategory[] = result.categories
      .map((cat, ci) => ({
        ...cat,
        items: cat.items.filter((_, ii) => selectedItems.has(`${ci}-${ii}`))
      }))
      .filter(cat => cat.items.length > 0);

    if (filteredCategories.length === 0) {
      toast.error('Selecciona al menos un ítem para importar.');
      return;
    }
    onApply(filteredCategories, importMode);
    onClose();
  };

  const totalSelectedItems = selectedItems.size;

  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 99999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(4px)',
      padding: '24px 16px',
      overflowY: 'auto'
    }} onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '720px',
        maxHeight: 'min(90vh, 740px)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        overflow: 'hidden',
        margin: 'auto'
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '16px 22px',
          borderBottom: '1px solid #edf2f7',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'linear-gradient(135deg, rgba(102,45,145,0.08), rgba(102,45,145,0.02))',
          flexShrink: 0
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #662D91, #9b59b6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Sparkles size={18} color="white" />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1a202c' }}>
              Importar con IA
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#718096' }}>
              {step === 'input' && 'Pega un briefing, correo o notas y Gemini lo estructurará automáticamente'}
              {step === 'loading' && 'Analizando texto con Gemini...'}
              {step === 'preview' && `Se detectaron ${result?.categories.length} categorías • ${result?.categories.reduce((a, c) => a + c.items.length, 0)} ítems`}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#718096',
            padding: '6px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }} title="Cerrar">
            <X size={20} />
          </button>
        </div>

        {/* Steps indicator */}
        <div style={{ padding: '10px 22px', borderBottom: '1px solid #edf2f7', display: 'flex', gap: '4px', background: '#f8fafc', flexShrink: 0 }}>
          {(['input', 'loading', 'preview'] as const).map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{
                width: '22px', height: '22px', borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700,
                background: step === s ? '#662D91' : (
                  (step === 'preview' && s === 'input') || (step === 'preview' && s === 'loading') ||
                  (step === 'loading' && s === 'input') ? 'var(--success)' : 'var(--bg-secondary)'
                ),
                color: step === s ? 'white' : (
                  (step === 'preview' && s !== 'preview') ||
                  (step === 'loading' && s === 'input') ? 'white' : 'var(--text-muted)'
                ),
                transition: 'all 0.3s'
              }}>
                {((step === 'preview' && s !== 'preview') || (step === 'loading' && s === 'input'))
                  ? <Check size={12} /> : i + 1}
              </div>
              <span style={{ fontSize: '0.75rem', color: step === s ? 'var(--accent-primary)' : 'var(--text-muted)', fontWeight: step === s ? 600 : 400 }}>
                {s === 'input' ? 'Texto' : s === 'loading' ? 'Analizando' : 'Vista Previa'}
              </span>
              {i < 2 && <div style={{ width: '24px', height: '1px', background: 'var(--border-color)', margin: '0 4px' }} />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* ── INPUT STEP ── */}
          {step === 'input' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 500
                  }}
                >
                  <Upload size={16} /> Subir archivo .txt
                </button>
                <input ref={fileInputRef} type="file" accept=".txt,text/plain" style={{ display: 'none' }} onChange={handleFileUpload} />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>o pega el texto directamente:</span>
              </div>

              <textarea
                value={text}
                onChange={e => { setText(e.target.value); setError(''); }}
                placeholder={`Ejemplo:\n\nActivación BTL para lanzamiento de producto. Se necesita:\n\n- Stand modular de 3x3m con iluminación LED (2 unidades)\n- Promotoras uniformadas (4 personas, 2 días)\n- Transporte y logística Lima-Callao\n- Impresión de material gráfico: banners, folletos\n- Sonido y pantalla LED\n\nFecha del evento: 15 de agosto\nPresupuesto estimado: S/ 25,000`}
                style={{
                  width: '100%', minHeight: '150px', height: '180px', maxHeight: '240px', resize: 'vertical',
                  padding: '12px 14px', borderRadius: '10px', fontSize: '0.875rem',
                  background: '#f8fafc', border: `1px solid ${error ? 'var(--danger, #ef4444)' : '#cbd5e1'}`,
                  color: '#1e293b', lineHeight: 1.6, fontFamily: 'inherit',
                  outline: 'none', transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={e => { if (!error) e.target.style.borderColor = '#662D91'; }}
                onBlur={e => { if (!error) e.target.style.borderColor = '#cbd5e1'; }}
              />

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontSize: '0.85rem' }}>
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <div style={{
                padding: '10px 14px', borderRadius: '8px',
                background: 'rgba(102,45,145,0.06)', border: '1px solid rgba(102,45,145,0.18)',
                fontSize: '0.8rem', color: '#4b5563', lineHeight: 1.5
              }}>
                💡 <strong>Tip:</strong> Cuanto más detallado sea el texto (cantidades, materiales, tiempos, proveedores), mejor será la estructura generada.
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {text.length} caracteres
                </span>
                <button
                  onClick={handleAnalyze}
                  disabled={text.trim().length < 10}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 24px', borderRadius: '10px', cursor: text.trim().length < 10 ? 'not-allowed' : 'pointer',
                    background: text.trim().length < 10 ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #662D91, #9b59b6)',
                    border: 'none', color: text.trim().length < 10 ? 'var(--text-muted)' : 'white',
                    fontSize: '0.9rem', fontWeight: 600, transition: 'all 0.2s'
                  }}
                >
                  <Sparkles size={16} /> Analizar con IA
                </button>
              </div>
            </div>
          )}

          {/* ── LOADING STEP ── */}
          {step === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '40px 0' }}>
              <div style={{
                width: '72px', height: '72px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #662D91, #9b59b6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'spin 2s linear infinite',
                boxShadow: '0 0 32px rgba(102,45,145,0.4)'
              }}>
                <Sparkles size={32} color="white" />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Gemini está analizando tu texto...
                </p>
                <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Identificando categorías, ítems y sub-ítems
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: '#662D91',
                    animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`
                  }} />
                ))}
              </div>
              <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-8px); opacity: 1; } }
              `}</style>
            </div>
          )}

          {/* ── PREVIEW STEP ── */}
          {step === 'preview' && result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Notes from AI */}
              {result.notes && (
                <div style={{
                  padding: '12px 14px', borderRadius: '8px',
                  background: 'rgba(102,45,145,0.08)', border: '1px solid rgba(102,45,145,0.2)',
                  fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5,
                  display: 'flex', gap: '8px', alignItems: 'flex-start'
                }}>
                  <Sparkles size={14} style={{ flexShrink: 0, marginTop: '2px', color: '#9b59b6' }} />
                  <span><strong>Gemini detectó:</strong> {result.notes}</span>
                </div>
              )}

              {/* Import mode selector */}
              <div style={{
                padding: '14px', borderRadius: '10px',
                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)'
              }}>
                <p style={{ margin: '0 0 10px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  ¿Cómo deseas importar?
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {([['add', '➕ Agregar al final', 'Se añaden las nuevas categorías e ítems a los existentes'],
                     ['replace', '🔄 Reemplazar todo', 'Se eliminan las categorías e ítems actuales']] as const).map(([mode, label, desc]) => (
                    <button
                      key={mode}
                      onClick={() => setImportMode(mode)}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                        border: `2px solid ${importMode === mode ? '#662D91' : 'var(--border-color)'}`,
                        background: importMode === mode ? 'rgba(102,45,145,0.1)' : 'var(--bg-panel)',
                        textAlign: 'left', transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: importMode === mode ? '#662D91' : 'var(--text-primary)' }}>{label}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Categories tree */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Selecciona qué importar ({totalSelectedItems} ítems seleccionados):
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => {
                      const all = new Set<string>();
                      result.categories.forEach((cat, ci) => cat.items.forEach((_, ii) => all.add(`${ci}-${ii}`)));
                      setSelectedItems(all);
                    }} style={{ fontSize: '0.75rem', color: '#662D91', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                      Todos
                    </button>
                    <button onClick={() => setSelectedItems(new Set())}
                      style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                      Ninguno
                    </button>
                  </div>
                </div>

                {result.categories.map((cat, ci) => {
                  const isExpanded = expandedCategories.has(ci);
                  const catKeys = cat.items.map((_, ii) => `${ci}-${ii}`);
                  const allCatSelected = catKeys.every(k => selectedItems.has(k));
                  const someCatSelected = catKeys.some(k => selectedItems.has(k));

                  return (
                    <div key={ci} style={{
                      borderRadius: '10px', border: '1px solid var(--border-color)',
                      overflow: 'hidden', background: 'var(--bg-panel)'
                    }}>
                      {/* Category header */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 14px', cursor: 'pointer',
                        background: 'linear-gradient(135deg, rgba(102,45,145,0.12), rgba(102,45,145,0.05))',
                        borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none'
                      }}>
                        <input
                          type="checkbox"
                          checked={allCatSelected}
                          ref={el => { if (el) el.indeterminate = !allCatSelected && someCatSelected; }}
                          onChange={() => toggleCategory_items(ci)}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#662D91' }}
                        />
                        <div style={{ flex: 1 }} onClick={() => toggleCategory(ci)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isExpanded ? <ChevronDown size={16} color="#662D91" /> : <ChevronRight size={16} color="#662D91" />}
                            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{cat.name}</span>
                            <span style={{
                              fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px',
                              background: 'rgba(102,45,145,0.15)', color: '#662D91', fontWeight: 600
                            }}>
                              {cat.items.length} ítem{cat.items.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Items */}
                      {isExpanded && (
                        <div style={{ padding: '8px' }}>
                          {cat.items.map((item, ii) => {
                            const key = `${ci}-${ii}`;
                            const isSelected = selectedItems.has(key);
                            return (
                              <div key={ii} style={{
                                padding: '10px 12px', borderRadius: '8px', marginBottom: '6px',
                                background: isSelected ? 'rgba(102,45,145,0.06)' : 'var(--bg-secondary)',
                                border: `1px solid ${isSelected ? 'rgba(102,45,145,0.25)' : 'transparent'}`,
                                transition: 'all 0.2s', cursor: 'pointer'
                              }} onClick={() => toggleItem(key)}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleItem(key)}
                                    onClick={e => e.stopPropagation()}
                                    style={{ width: '15px', height: '15px', marginTop: '2px', accentColor: '#662D91', cursor: 'pointer', flexShrink: 0 }}
                                  />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{item.name}</span>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        x{item.quantity} · {item.dates} día{item.dates !== 1 ? 's' : ''}
                                      </span>
                                    </div>
                                    {item.details && item.details.length > 0 && (
                                      <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {item.details.map((d, di) => (
                                          <span key={di} style={{
                                            fontSize: '0.72rem', padding: '1px 7px', borderRadius: '10px',
                                            background: 'var(--bg-panel)', border: '1px solid var(--border-color)',
                                            color: 'var(--text-muted)'
                                          }}>{d}</span>
                                        ))}
                                      </div>
                                    )}
                                    {item.subItems && item.subItems.length > 0 && (
                                      <div style={{ marginTop: '6px', paddingLeft: '8px', borderLeft: '2px solid rgba(102,45,145,0.2)' }}>
                                        {item.subItems.map((sub, si) => (
                                          <div key={si} style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '2px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <FileText size={11} style={{ flexShrink: 0 }} />
                                            <span style={{ fontWeight: 500 }}>{sub.name}</span>
                                            {sub.description && <span style={{ opacity: 0.7 }}>— {sub.description}</span>}
                                            {sub.unitCost > 0 && (
                                              <span style={{ marginLeft: 'auto', color: '#662D91', fontWeight: 600, flexShrink: 0 }}>
                                                S/ {sub.unitCost.toLocaleString()}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Re-analyze option */}
              <button
                onClick={() => setStep('input')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'none', border: '1px solid var(--border-color)',
                  borderRadius: '8px', padding: '8px 14px', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: '0.82rem', alignSelf: 'flex-start'
                }}
              >
                <RefreshCw size={14} /> Volver a analizar
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'loading' && (
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex', justifyContent: 'flex-end', gap: '10px',
            background: 'var(--bg-secondary)'
          }}>
            <button onClick={onClose} style={{
              padding: '9px 20px', borderRadius: '8px', cursor: 'pointer',
              background: 'none', border: '1px solid var(--border-color)',
              color: 'var(--text-primary)', fontSize: '0.875rem'
            }}>
              Cancelar
            </button>
            {step === 'preview' && (
              <button
                onClick={handleApply}
                disabled={totalSelectedItems === 0}
                style={{
                  padding: '9px 24px', borderRadius: '8px', cursor: totalSelectedItems === 0 ? 'not-allowed' : 'pointer',
                  background: totalSelectedItems === 0 ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #662D91, #9b59b6)',
                  border: 'none', color: totalSelectedItems === 0 ? 'var(--text-muted)' : 'white',
                  fontSize: '0.875rem', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                <Check size={16} />
                {importMode === 'replace' ? 'Reemplazar cotización' : `Agregar ${totalSelectedItems} ítem${totalSelectedItems !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
