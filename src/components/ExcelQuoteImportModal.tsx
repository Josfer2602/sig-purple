import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Check, Loader2, X } from 'lucide-react';
import { API_URL } from '../context/GlobalContext';
import toast from 'react-hot-toast';

interface ExcelQuoteImportModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onApply: (categories: any[], mode: 'add' | 'replace', metadata?: any) => void;
  hasExistingItems?: boolean;
}

export const ExcelQuoteImportModal: React.FC<ExcelQuoteImportModalProps> = ({
  onClose,
  onApply,
  hasExistingItems = false
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<{ categories: any[]; metadata?: any } | null>(null);
  const [mode, setMode] = useState<'add' | 'replace'>(hasExistingItems ? 'replace' : 'replace');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.xlsm') && !selectedFile.name.endsWith('.xlsx')) {
      toast.error('Por favor selecciona un archivo Excel (.xlsm o .xlsx)');
      return;
    }

    setFile(selectedFile);
    setIsProcessing(true);
    setParsedData(null);

    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch(`${API_URL}/quotes/parse-excel`, {
        method: 'POST',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al procesar el archivo Excel');
      }

      if (!data.categories || data.categories.length === 0) {
        throw new Error('No se encontraron categorías o ítems válidos en las hojas del archivo.');
      }

      setParsedData(data);
      toast.success(`Estructura extraída: ${data.categories.length} categoría(s) encontrada(s)`);
    } catch (err: any) {
      console.error('Error importando Excel:', err);
      toast.error(err.message || 'Error al procesar el archivo Excel');
      setFile(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleApply = () => {
    if (!parsedData || !parsedData.categories) return;
    onApply(parsedData.categories, mode, parsedData.metadata);
    onClose();
  };

  const totalItems = parsedData?.categories?.reduce((acc, cat) => acc + (cat.items?.length || 0), 0) || 0;
  const totalSubItems = parsedData?.categories?.reduce((acc, cat) => 
    acc + (cat.items?.reduce((acc2: number, it: any) => acc2 + (it.subItems?.length || 0), 0) || 0), 0) || 0;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div 
        className="modal-container animate-fade-in" 
        style={{ 
          maxWidth: '680px', 
          width: '95%',
          background: 'var(--bg-panel)',
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          border: '1px solid var(--border-color)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(102, 45, 145, 0.08), transparent)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: '#107c41',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              boxShadow: '0 4px 10px rgba(16, 124, 65, 0.3)'
            }}>
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Importar Cotización desde Excel
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Carga la matriz operativa (categorías, ítems, subítems y costos) desde tu plantilla oficial (.xlsm / .xlsx)
              </p>
            </div>
          </div>
          <button 
            type="button" 
            className="btn-icon" 
            onClick={onClose}
            style={{ borderRadius: '50%', padding: '6px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Dropzone */}
          {!parsedData && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                borderRadius: '12px',
                padding: '40px 24px',
                textAlign: 'center',
                backgroundColor: dragOver ? 'rgba(102, 45, 145, 0.04)' : 'rgba(0,0,0,0.01)',
                cursor: isProcessing ? 'wait' : 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsm,.xlsx"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFile(e.target.files[0]);
                  }
                }}
              />
              {isProcessing ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <Loader2 size={36} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    Procesando y extrayendo estructura del Excel...
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Leyendo Cotización Interna y Detalle Proveedor
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: 'rgba(16, 124, 65, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#107c41'
                  }}>
                    <Upload size={28} />
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>
                      Haz clic para seleccionar
                    </span> o arrastra tu archivo de cotización aquí
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Formatos soportados: .xlsm (con macros) y .xlsx
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Parsed Result Preview */}
          {parsedData && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* File Info Bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(16, 124, 65, 0.08)',
                border: '1px solid rgba(16, 124, 65, 0.2)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileSpreadsheet size={20} color="#107c41" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {file?.name}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {((file?.size || 0) / 1024).toFixed(1)} KB
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { setParsedData(null); setFile(null); }}
                  style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                >
                  Cambiar archivo
                </button>
              </div>

              {/* Extraction Summary Stats */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px'
              }}>
                <div style={{
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                    {parsedData.categories.length}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Categorías</div>
                </div>
                <div style={{
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                    {totalItems}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ítems Principales</div>
                </div>
                <div style={{
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                    {totalSubItems}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Subítems / Costos</div>
                </div>
              </div>

              {/* Categories Preview Accordion / List */}
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Estructura a importar:
                </div>
                <div style={{
                  maxHeight: '180px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-primary)',
                  padding: '8px 12px'
                }}>
                  {parsedData.categories.map((cat, idx) => (
                    <div key={idx} style={{ marginBottom: '10px' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>📁 {cat.name}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>
                          ({cat.items?.length || 0} ítems)
                        </span>
                      </div>
                      <div style={{ paddingLeft: '16px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {cat.items?.map((it: any, iIdx: number) => (
                          <div key={iIdx} style={{ fontSize: '0.8rem', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>• {it.name} <span style={{ color: 'var(--text-muted)' }}>({it.quantity} x {it.dates}d)</span></span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                              {it.subItems?.length || 0} subítems
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mode Selection */}
              {hasExistingItems && (
                <div style={{
                  padding: '14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(0,0,0,0.02)',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    ¿Cómo deseas aplicar esta estructura en la cotización actual?
                  </div>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem' }}>
                      <input 
                        type="radio" 
                        name="importMode" 
                        value="replace" 
                        checked={mode === 'replace'} 
                        onChange={() => setMode('replace')} 
                      />
                      <span><strong>Reemplazar todo</strong> (Sustituye los ítems actuales)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem' }}>
                      <input 
                        type="radio" 
                        name="importMode" 
                        value="add" 
                        checked={mode === 'add'} 
                        onChange={() => setMode('add')} 
                      />
                      <span><strong>Agregar al final</strong> (Suma las categorías del Excel)</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          background: 'var(--bg-panel)'
        }}>
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={onClose}
          >
            Cancelar
          </button>
          <button 
            type="button" 
            className="btn-primary"
            disabled={!parsedData || isProcessing}
            onClick={handleApply}
            style={{
              backgroundColor: '#107c41',
              borderColor: '#107c41',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: (!parsedData || isProcessing) ? 0.6 : 1
            }}
          >
            <Check size={16} />
            Aplicar a Cotización
          </button>
        </div>
      </div>
    </div>
  );
};
