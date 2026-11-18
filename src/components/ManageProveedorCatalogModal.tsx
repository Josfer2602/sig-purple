import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { 
  X, Plus, Tag, Layers, FolderTree, Search, Sparkles, 
  Check, AlertCircle, Download, Edit2
} from 'lucide-react';
import { useGlobalContext, API_URL } from '../context/GlobalContext';
import type { ListasDinamicas } from '../types/models';
import toast from 'react-hot-toast';

interface ManageProveedorCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'categorias' | 'subcategorias' | 'tags';
}

export const ManageProveedorCatalogModal: React.FC<ManageProveedorCatalogModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'categorias'
}) => {
  const { appConfig, listas, updateConfig, proveedores, token, reloadProveedores } = useGlobalContext();

  const [activeTab, setActiveTab] = useState<'categorias' | 'subcategorias' | 'tags'>(initialTab);
  const [newItemInput, setNewItemInput] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editItemValue, setEditItemValue] = useState<string>('');

  // Fallback defaults
  const currentListas: ListasDinamicas = useMemo(() => {
    return listas || {
      tipoServicio: [],
      tipoProyecto: [],
      estadoProyecto: [],
      estadoCotizacion: [],
      estadoOrdenEntrega: [],
      estadoOrdenPago: [],
      estadoPagoProveedor: [],
      categoriasProveedor: [],
      subcategoriasProveedor: [],
      tagsProveedor: []
    };
  }, [listas]);

  // Current list array based on active tab
  const activeItems = useMemo(() => {
    if (activeTab === 'categorias') return currentListas.categoriasProveedor || [];
    if (activeTab === 'subcategorias') return currentListas.subcategoriasProveedor || [];
    return currentListas.tagsProveedor || [];
  }, [currentListas, activeTab]);

  // Count usage in existing proveedores
  const usageCountMap = useMemo(() => {
    const map = new Map<string, number>();
    proveedores.forEach(p => {
      if (activeTab === 'categorias') {
        const cats = new Set<string>();
        (p.categorias || []).forEach(c => { if (c) cats.add(c.trim().toLowerCase()); });
        if (p.categoria) cats.add(p.categoria.trim().toLowerCase());
        cats.forEach(c => map.set(c, (map.get(c) || 0) + 1));
      } else if (activeTab === 'subcategorias') {
        (p.subcategorias || []).forEach(s => {
          if (s) {
            const key = s.trim().toLowerCase();
            map.set(key, (map.get(key) || 0) + 1);
          }
        });
      } else {
        (p.tags || []).forEach(t => {
          if (t) {
            const key = t.trim().toLowerCase();
            map.set(key, (map.get(key) || 0) + 1);
          }
        });
      }
    });
    return map;
  }, [proveedores, activeTab]);

  // Unregistered items present in existing proveedores
  const uncatalogedInProveedores = useMemo(() => {
    const set = new Set<string>();
    const registeredSet = new Set(activeItems.map(i => i.trim().toLowerCase()));

    proveedores.forEach(p => {
      if (activeTab === 'categorias') {
        (p.categorias || []).forEach(c => {
          const trimmed = c?.trim();
          if (trimmed && !registeredSet.has(trimmed.toLowerCase())) set.add(trimmed);
        });
        if (p.categoria && !registeredSet.has(p.categoria.trim().toLowerCase())) {
          set.add(p.categoria.trim());
        }
      } else if (activeTab === 'subcategorias') {
        (p.subcategorias || []).forEach(s => {
          const trimmed = s?.trim();
          if (trimmed && !registeredSet.has(trimmed.toLowerCase())) set.add(trimmed);
        });
      } else {
        (p.tags || []).forEach(t => {
          const trimmed = t?.trim();
          if (trimmed && !registeredSet.has(trimmed.toLowerCase())) set.add(trimmed);
        });
      }
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [proveedores, activeTab, activeItems]);

  // Filter items by search
  const displayedItems = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return activeItems;
    return activeItems.filter(item => item.toLowerCase().includes(q));
  }, [activeItems, filterQuery]);

  if (!isOpen) return null;

  // Persist list changes to backend
  const saveUpdatedList = async (key: 'categoriasProveedor' | 'subcategoriasProveedor' | 'tagsProveedor', newList: string[]) => {
    setIsSaving(true);
    try {
      const updatedListas: ListasDinamicas = {
        ...currentListas,
        [key]: newList
      };

      await updateConfig({
        ...appConfig,
        listasDinamicas: JSON.stringify(updatedListas)
      });
      toast.success('Catálogo actualizado correctamente');
    } catch (err: any) {
      toast.error('Error al guardar en el servidor: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsSaving(false);
    }
  };

  const getActiveKey = (): 'categoriasProveedor' | 'subcategoriasProveedor' | 'tagsProveedor' => {
    if (activeTab === 'categorias') return 'categoriasProveedor';
    if (activeTab === 'subcategorias') return 'subcategoriasProveedor';
    return 'tagsProveedor';
  };

  // Add one or multiple (comma-separated) items
  const handleAddItem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = newItemInput.trim();
    if (!raw) return;

    const parts = raw.split(/[,|;]/).map(s => s.trim().replace(/^#/, '')).filter(Boolean);
    if (parts.length === 0) return;

    const key = getActiveKey();
    const currentList = [...(currentListas[key] || [])];
    const addedCount: string[] = [];

    parts.forEach(part => {
      if (!currentList.some(existing => existing.toLowerCase() === part.toLowerCase())) {
        currentList.push(part);
        addedCount.push(part);
      }
    });

    if (addedCount.length === 0) {
      toast.error('El o los elementos ya se encuentran en la lista.');
      return;
    }

    currentList.sort((a, b) => a.localeCompare(b));
    await saveUpdatedList(key, currentList);
    setNewItemInput('');
    toast.success(`Se agregó ${addedCount.length === 1 ? `"${addedCount[0]}"` : `${addedCount.length} opciones`} al catálogo.`);
  };

  // Remove single item
  const handleRemoveItem = async (itemToRemove: string) => {
    const key = getActiveKey();
    const currentList = (currentListas[key] || []).filter(item => item !== itemToRemove);
    await saveUpdatedList(key, currentList);
  };

  const handleStartRename = (item: string) => {
    setEditingItem(item);
    setEditItemValue(item);
  };

  const handleConfirmRename = async (oldItem: string) => {
    const trimmedNew = editItemValue.trim();
    if (!trimmedNew || trimmedNew.toLowerCase() === oldItem.toLowerCase()) {
      setEditingItem(null);
      return;
    }

    setIsSaving(true);
    try {
      const typeKey = activeTab === 'categorias' ? 'categoria' : activeTab === 'subcategorias' ? 'subcategoria' : 'tag';
      const res = await fetch(`${API_URL}/proveedores/bulk-rename`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          type: typeKey,
          oldName: oldItem,
          newName: trimmedNew
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al renombrar');
      }

      const data = await res.json();
      
      // Actualizar la lista en appConfig
      const key = getActiveKey();
      const updatedList = (currentListas[key] || []).map(i => i.toLowerCase() === oldItem.toLowerCase() ? trimmedNew : i);
      await updateConfig({
        ...appConfig,
        listasDinamicas: JSON.stringify({
          ...currentListas,
          [key]: updatedList
        })
      });

      // Recargar proveedores para que se refleje inmediatamente en toda la app
      if (reloadProveedores) {
        await reloadProveedores();
      }

      toast.success(`"${oldItem}" renombrado a "${trimmedNew}". Se actualizaron ${data.updatedCount || 0} proveedor(es) en automático.`);
      setEditingItem(null);
    } catch (err: any) {
      toast.error('Error al renombrar: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Import all uncataloged items from suppliers
  const handleImportAllUncataloged = async () => {
    if (uncatalogedInProveedores.length === 0) return;
    const key = getActiveKey();
    const combined = [...(currentListas[key] || [])];

    uncatalogedInProveedores.forEach(item => {
      if (!combined.some(existing => existing.toLowerCase() === item.toLowerCase())) {
        combined.push(item);
      }
    });

    combined.sort((a, b) => a.localeCompare(b));
    await saveUpdatedList(key, combined);
    toast.success(`Se importaron ${uncatalogedInProveedores.length} opciones desde los proveedores.`);
  };

  // Import a single uncataloged item
  const handleImportSingle = async (item: string) => {
    const key = getActiveKey();
    const currentList = [...(currentListas[key] || [])];
    if (!currentList.some(existing => existing.toLowerCase() === item.toLowerCase())) {
      currentList.push(item);
      currentList.sort((a, b) => a.localeCompare(b));
      await saveUpdatedList(key, currentList);
      toast.success(`"${item}" añadido al catálogo.`);
    }
  };

  // Styling helpers
  const getTabColors = () => {
    if (activeTab === 'categorias') {
      return {
        accent: 'var(--accent-primary)',
        bgLight: 'rgba(138, 43, 226, 0.08)',
        border: 'rgba(138, 43, 226, 0.25)',
        pillBg: 'rgba(138, 43, 226, 0.12)',
        pillColor: 'var(--accent-primary)'
      };
    }
    if (activeTab === 'subcategorias') {
      return {
        accent: '#0284c7',
        bgLight: 'rgba(2, 132, 199, 0.08)',
        border: 'rgba(2, 132, 199, 0.25)',
        pillBg: 'rgba(2, 132, 199, 0.12)',
        pillColor: '#0284c7'
      };
    }
    return {
      accent: '#059669',
      bgLight: 'rgba(16, 185, 129, 0.08)',
      border: 'rgba(16, 185, 129, 0.25)',
      pillBg: 'rgba(16, 185, 129, 0.12)',
      pillColor: '#059669'
    };
  };

  const colors = getTabColors();

  return ReactDOM.createPortal(
    <div className="modal-overlay" style={{ zIndex: 1200 }}>
      <div 
        className="modal-content animate-fade-in" 
        style={{ 
          maxWidth: '720px', 
          width: '95%', 
          maxHeight: '90vh', 
          display: 'flex', 
          flexDirection: 'column', 
          borderRadius: 'var(--radius-lg, 12px)',
          overflow: 'hidden',
          padding: 0
        }}
      >
        {/* Modal Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-panel)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ 
              width: '42px', height: '42px', borderRadius: '10px', 
              background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.15), rgba(75, 0, 130, 0.15))', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)',
              flexShrink: 0
            }}>
              <Tag size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Catálogo de Proveedores
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                Configura las categorías, subcategorías y tags predeterminados del sistema
              </p>
            </div>
          </div>

          <button 
            type="button" 
            onClick={onClose} 
            className="btn-icon" 
            style={{ borderRadius: '50%', padding: '6px' }}
            title="Cerrar modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.02)', padding: '0 20px' }}>
          
          {/* Categorías Tab */}
          <button
            type="button"
            onClick={() => { setActiveTab('categorias'); setFilterQuery(''); }}
            style={{
              padding: '12px 18px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'categorias' ? '3px solid var(--accent-primary)' : '3px solid transparent',
              color: activeTab === 'categorias' ? 'var(--accent-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'categorias' ? 700 : 500,
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <FolderTree size={16} />
            Categorías
            <span style={{ 
              fontSize: '11px', 
              padding: '1px 6px', 
              borderRadius: '10px', 
              background: activeTab === 'categorias' ? 'rgba(138, 43, 226, 0.15)' : 'rgba(0,0,0,0.06)',
              color: activeTab === 'categorias' ? 'var(--accent-primary)' : 'var(--text-muted)' 
            }}>
              {(currentListas.categoriasProveedor || []).length}
            </span>
          </button>

          {/* Subcategorías Tab */}
          <button
            type="button"
            onClick={() => { setActiveTab('subcategorias'); setFilterQuery(''); }}
            style={{
              padding: '12px 18px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'subcategorias' ? '3px solid #0284c7' : '3px solid transparent',
              color: activeTab === 'subcategorias' ? '#0284c7' : 'var(--text-muted)',
              fontWeight: activeTab === 'subcategorias' ? 700 : 500,
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Layers size={16} />
            Subcategorías
            <span style={{ 
              fontSize: '11px', 
              padding: '1px 6px', 
              borderRadius: '10px', 
              background: activeTab === 'subcategorias' ? 'rgba(2, 132, 199, 0.15)' : 'rgba(0,0,0,0.06)',
              color: activeTab === 'subcategorias' ? '#0284c7' : 'var(--text-muted)' 
            }}>
              {(currentListas.subcategoriasProveedor || []).length}
            </span>
          </button>

          {/* Tags Tab */}
          <button
            type="button"
            onClick={() => { setActiveTab('tags'); setFilterQuery(''); }}
            style={{
              padding: '12px 18px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'tags' ? '3px solid #059669' : '3px solid transparent',
              color: activeTab === 'tags' ? '#059669' : 'var(--text-muted)',
              fontWeight: activeTab === 'tags' ? 700 : 500,
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Tag size={16} />
            Tags / Etiquetas
            <span style={{ 
              fontSize: '11px', 
              padding: '1px 6px', 
              borderRadius: '10px', 
              background: activeTab === 'tags' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(0,0,0,0.06)',
              color: activeTab === 'tags' ? '#059669' : 'var(--text-muted)' 
            }}>
              {(currentListas.tagsProveedor || []).length}
            </span>
          </button>

        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          {/* Quick Add Form */}
          <form onSubmit={handleAddItem} style={{ display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                className="form-control"
                placeholder={
                  activeTab === 'categorias'
                    ? 'Ej. Carpintería, Metalmecánica, Iluminación (o separa por comas)...'
                    : activeTab === 'subcategorias'
                    ? 'Ej. Corte Láser, Acrílicos, Soldadura TIG...'
                    : 'Ej. Acreditado, 24/7, Urgente, FabricanteDirecto...'
                }
                value={newItemInput}
                onChange={e => setNewItemInput(e.target.value)}
                style={{ paddingRight: '12px' }}
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={!newItemInput.trim() || isSaving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 18px',
                background: colors.accent,
                borderColor: colors.accent
              }}
            >
              <Plus size={16} />
              <span>Agregar</span>
            </button>
          </form>

          {/* Prompt / Uncataloged Suggestions Banner */}
          {uncatalogedInProveedores.length > 0 && (
            <div style={{
              background: colors.bgLight,
              border: `1px dashed ${colors.border}`,
              borderRadius: 'var(--radius-md, 8px)',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} color={colors.accent} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Opciones encontradas en proveedores no registradas en el catálogo ({uncatalogedInProveedores.length}):
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleImportAllUncataloged}
                  className="btn-secondary"
                  style={{ padding: '3px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', borderColor: colors.border, color: colors.accent }}
                  title="Añadir todas al catálogo predeterminado"
                  disabled={isSaving}
                >
                  <Download size={13} />
                  Importar todas (+{uncatalogedInProveedores.length})
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {uncatalogedInProveedores.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleImportSingle(item)}
                    style={{
                      border: `1px solid ${colors.border}`,
                      background: 'var(--bg-panel)',
                      borderRadius: '14px',
                      padding: '2px 10px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: 'var(--text-primary)'
                    }}
                    title={`Clic para agregar "${item}" al catálogo por defecto`}
                  >
                    <span>+ {item}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search bar inside catalog if more than 6 items */}
          {activeItems.length > 6 && (
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-control"
                placeholder={`Buscar en las ${activeItems.length} opciones...`}
                value={filterQuery}
                onChange={e => setFilterQuery(e.target.value)}
                style={{ paddingLeft: '32px', fontSize: '12px', height: '34px' }}
              />
              {filterQuery && (
                <button
                  type="button"
                  onClick={() => setFilterQuery('')}
                  style={{ position: 'absolute', right: '10px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Items Grid / Chips */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {activeTab === 'categorias' ? 'Categorías Registradas' : activeTab === 'subcategorias' ? 'Subcategorías Registradas' : 'Tags Registrados'} ({displayedItems.length})
              </span>
              {activeItems.length > 0 && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Las opciones se guardan automáticamente
                </span>
              )}
            </div>

            {/* Tip explicativo para renombrar automáticamente */}
            <div style={{ padding: '8px 12px', background: colors.bgLight, border: `1px solid ${colors.border}`, borderRadius: '8px', fontSize: '11px', color: colors.accent, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={14} style={{ flexShrink: 0 }} />
              <span><strong>Para cambiar una categoría en automático en todos los proveedores:</strong> usa el botón del lápiz ✏️ Renombrar. Eliminar (✕) solo quita la sugerencia para nuevos registros.</span>
            </div>

            {displayedItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 16px', background: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius-md, 8px)', border: '1px dashed var(--border-color)' }}>
                <AlertCircle size={28} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.6 }} />
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                  {filterQuery ? 'No se encontraron opciones que coincidan con la búsqueda.' : 'No hay opciones registradas en esta sección todavía.'}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Escribe en el campo superior para añadir la primera opción.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '320px', overflowY: 'auto', padding: '4px 0' }}>
                {displayedItems.map((item, idx) => {
                  const usageCount = usageCountMap.get(item.trim().toLowerCase()) || 0;
                  const isEditing = editingItem === item;

                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 12px',
                        background: colors.pillBg,
                        color: colors.pillColor,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 600,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                      }}
                    >
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="text"
                            value={editItemValue}
                            onChange={e => setEditItemValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleConfirmRename(item);
                              } else if (e.key === 'Escape') {
                                setEditingItem(null);
                              }
                            }}
                            autoFocus
                            style={{
                              fontSize: '12px',
                              padding: '2px 8px',
                              border: `1.5px solid ${colors.accent}`,
                              borderRadius: '12px',
                              outline: 'none',
                              width: '140px',
                              background: '#fff',
                              color: '#1e293b'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleConfirmRename(item)}
                            disabled={isSaving}
                            style={{ border: 'none', background: colors.accent, color: '#fff', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                            title="Confirmar cambio y actualizar proveedores vinculados"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingItem(null)}
                            style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', padding: 0 }}
                            title="Cancelar"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <>
                          <span>{activeTab === 'tags' ? `#${item}` : item}</span>

                          {/* Usage indicator */}
                          {usageCount > 0 && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 500,
                                padding: '1px 5px',
                                borderRadius: '8px',
                                background: 'rgba(0,0,0,0.08)',
                                color: 'inherit',
                                opacity: 0.85
                              }}
                              title={`Usado en ${usageCount} proveedor(es)`}
                            >
                              {usageCount}
                            </span>
                          )}

                          {/* Rename button */}
                          <button
                            type="button"
                            onClick={() => handleStartRename(item)}
                            disabled={isSaving}
                            style={{
                              border: 'none',
                              background: 'none',
                              cursor: 'pointer',
                              color: colors.pillColor,
                              padding: 0,
                              fontSize: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              opacity: 0.7,
                              transition: 'opacity 0.15s'
                            }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
                            title={`Renombrar "${item}" y actualizar en automático todos los proveedores vinculados`}
                          >
                            <Edit2 size={12} />
                          </button>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item)}
                            disabled={isSaving}
                            style={{
                              border: 'none',
                              background: 'none',
                              cursor: 'pointer',
                              color: colors.pillColor,
                              padding: 0,
                              fontSize: '13px',
                              lineHeight: 1,
                              display: 'flex',
                              alignItems: 'center',
                              opacity: 0.7,
                              transition: 'opacity 0.15s'
                            }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
                            title={`Eliminar "${item}" del catálogo por defecto`}
                          >
                            <X size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-panel)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            💡 Estas opciones aparecen automáticamente al crear y filtrar proveedores.
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            style={{ padding: '8px 20px', fontSize: '13px' }}
          >
            Listo / Cerrar
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};
