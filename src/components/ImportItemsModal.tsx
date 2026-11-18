import React, { useState, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { 
  X, Search, CheckSquare, 
  Edit3, Eye, Trash2, Plus, Check, Package, 
  Building2 
} from 'lucide-react';
import type { Quote, QuoteItem, QuoteCategory, QuoteSubItem } from '../types/quote';
import { ensureImprevistoInSubItems } from '../types/quote';
import { useGlobalContext } from '../context/GlobalContext';
import { API_URL } from '../utils/apiUrl';

let globalCatalogItemsCache: any[] | null = null;

export interface ImportedItemPayload {
  item: QuoteItem;
  categoryName: string;
  sourceQuoteDate?: string;
  sourceProjectName?: string;
}

export interface ImportTargetOption {
  mode: 'origin' | 'existing' | 'new';
  targetCategoryId?: string;
  newCategoryName?: string;
}

interface ImportItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotes: Quote[];
  currentQuoteId: string;
  currentCategories: QuoteCategory[];
  currentCurrency?: 'PEN' | 'USD';
  onImportItems: (items: ImportedItemPayload[], targetOption: ImportTargetOption) => void;
}

// Flat item representation across all quotes for global instant search
interface FlattenedItem {
  uniqueKey: string;
  originalItemId: string;
  item: QuoteItem;
  categoryName: string;
  quoteId: string;
  quoteTitle: string;
  quoteDate: string;
  clientName: string;
  projectName: string;
  isTemplate: boolean;
  searchCorpus: string;
  totalCost: number;
}

// Item staged for import (can be customized/edited independently)
export interface StagedItem {
  stagedId: string;
  originalItemId: string;
  item: QuoteItem;
  categoryName: string;
  sourceQuoteTitle: string;
  sourceQuoteDate?: string;
  sourceClient: string;
  sourceProject: string;
}

export const ImportItemsModal: React.FC<ImportItemsModalProps> = ({
  isOpen,
  onClose,
  quotes,
  currentQuoteId,
  currentCategories = [],
  currentCurrency = 'PEN',
  onImportItems
}) => {
  const { clientes, proyectos } = useGlobalContext();

  // Active top tab: 'search' (global item search), 'selected' (staging tray), 'browse' (explore by quote)
  const [activeTab, setActiveTab] = useState<'search' | 'selected' | 'browse'>('search');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'TEMPLATES' | 'CLIENTS'>('ALL');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('TODAS');
  const [resultsLimit, setResultsLimit] = useState(60);

  // Staged items (selected items with potential custom edits)
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);

  // Item currently open in the detail/edit view
  const [editingStagedItem, setEditingStagedItem] = useState<StagedItem | null>(null);

  // Destination configuration
  const [targetMode, setTargetMode] = useState<'origin' | 'existing' | 'new'>('origin');
  const [targetCategoryId, setTargetCategoryId] = useState<string>(
    currentCategories.length > 0 ? currentCategories[0].id : ''
  );
  const [newCategoryName, setNewCategoryName] = useState<string>('');

  // Catálogo histórico y predeterminado de ítems
  const [catalogItems, setCatalogItems] = useState<any[]>(() => globalCatalogItemsCache || []);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

  useEffect(() => {
    if (isOpen && (!globalCatalogItemsCache || globalCatalogItemsCache.length === 0)) {
      setIsLoadingCatalog(true);
      const token = localStorage.getItem('token');
      fetch(`${API_URL}/quotes/catalog-items`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          if (Array.isArray(data)) {
            globalCatalogItemsCache = data;
            setCatalogItems(data);
          }
        })
        .catch(err => console.error('Error al cargar catálogo de ítems:', err))
        .finally(() => setIsLoadingCatalog(false));
    }
  }, [isOpen]);

  // Reset local search/staged states when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setCategoryFilter('TODAS');
      setSourceFilter('ALL');
      setSelectedClientId('');
      setResultsLimit(60);
      setActiveTab('search');
      setStagedItems([]);
      setEditingStagedItem(null);
      setTargetMode('origin');
      if (currentCategories.length > 0) {
        setTargetCategoryId(currentCategories[0].id);
      }
    }
  }, [isOpen, currentCategories]);

  // Helper functions to resolve client and project names
  const getClientName = (projectId?: string, quoteClient?: string) => {
    if (quoteClient) {
      const found = clientes.find(c => c.id === quoteClient);
      if (found) return found.empresa;
      return quoteClient;
    }
    if (!projectId) return '-';
    const proyecto = proyectos.find(p => p.id === projectId);
    if (!proyecto) return '-';
    const cliente = clientes.find(c => c.id === proyecto.clienteId);
    return cliente ? cliente.empresa : '-';
  };

  const getProjectName = (projectId?: string) => {
    if (!projectId) return 'Sin Proyecto';
    const p = proyectos.find(proj => proj.id === projectId);
    return p ? p.nombre : 'Sin Proyecto';
  };

  const currencySymbol = currentCurrency === 'USD' ? '$' : 'S/';

  // 1. Memoized flat list of ALL items across all quotes (excluding current quote)
  const allFlattenedItems = useMemo<FlattenedItem[]>(() => {
    if (!isOpen || !quotes) return [];
    const list: FlattenedItem[] = [];

    quotes.forEach(q => {
      if (q.id === currentQuoteId) return;
      const clientName = getClientName(q.projectId, q.client);
      const projectName = getProjectName(q.projectId);
      const targetProj = q.projectId ? proyectos.find(p => p.id === q.projectId) : null;
      let rawDate = q.date || targetProj?.fechaRegistro || targetProj?.fechaAprobacion || '';
      if (rawDate && rawDate.includes('T')) rawDate = rawDate.split('T')[0];
      let quoteDate = '';
      if (rawDate) {
        if (rawDate.includes('-')) {
          const parts = rawDate.split('-');
          if (parts.length === 3 && parts[0].length === 4) {
            quoteDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
          } else {
            quoteDate = rawDate;
          }
        } else {
          quoteDate = rawDate;
        }
      }

      const quoteTitle = q.isTemplate
        ? `Plantilla: ${q.templateName || 'Plantilla'}`
        : `[${projectName}] V${q.version} - ${q.requirement || 'Cotización'}`;

      (q.categories || []).forEach(cat => {
        const catName = (cat.name || 'GENERAL').trim();
        (cat.items || []).forEach(it => {
          if (!it || !it.name) return;
          const detailsArray = Array.isArray(it.details) ? it.details : [];
          const detailsText = detailsArray.map(d => typeof d === 'string' ? d : (d as any)?.text || '').join(' ');
          const subItemsText = (it.subItems || []).map(s => `${s.name || ''} ${s.description || ''} ${s.providerName || ''}`).join(' ');
          
          const searchCorpus = `${it.name} ${catName} ${clientName} ${projectName} ${quoteTitle} ${quoteDate} ${detailsText} ${subItemsText}`.toLowerCase();

          const totalCost = (it.subItems || []).reduce(
            (acc, sub) => acc + (Number(sub.unitCost || 0) * Number(sub.quantity || 1) * Number(sub.dates || 1)),
            0
          );

          list.push({
            uniqueKey: `${q.id}__${cat.id}__${it.id}`,
            originalItemId: it.id,
            item: it,
            categoryName: catName,
            quoteId: q.id,
            quoteTitle,
            quoteDate,
            clientName,
            projectName,
            isTemplate: Boolean(q.isTemplate),
            searchCorpus,
            totalCost
          });
        });
      });
    });

    // 2. Incorporar todos los ítems del Catálogo de Cotizaciones
    (catalogItems || []).forEach((c, idx) => {
      const catName = (c.categoryName || 'GENERAL').trim();
      const totalCost = (c.subItems || []).reduce(
        (acc: number, sub: any) => acc + (Number(sub.unitCost || 0) * Number(sub.quantity || 1) * Number(sub.dates || 1)),
        0
      );
      const quoteTitle = `Catálogo: ${c.sourceRequirement || catName}`;
      const detailsArray = Array.isArray(c.details) ? c.details : [];
      const detailsText = detailsArray.map((d: any) => typeof d === 'string' ? d : d?.text || '').join(' ');
      const subItemsText = (c.subItems || []).map((s: any) => `${s.name || ''} ${s.description || ''} ${s.providerName || ''}`).join(' ');
      const searchCorpus = `${c.name} ${catName} ${c.sourceClient || ''} ${quoteTitle} ${detailsText} ${subItemsText}`.toLowerCase();

      list.push({
        uniqueKey: `catalog__${c.catalogId || idx}`,
        originalItemId: `cat_item_${c.catalogId || idx}`,
        item: {
          id: `cat_item_${c.catalogId || idx}`,
          name: c.name,
          quantity: Number(c.quantity) || 1,
          dates: Number(c.dates) || 1,
          details: c.details || [],
          internalMultiplierPercent: Number(c.internalMultiplierPercent) || 15,
          financialExpensePercent: Number(c.financialExpensePercent) || 10,
          providerContact: c.providerContact || '',
          productionTime: c.productionTime || '',
          subItems: (c.subItems || []).map((s: any, sIdx: number) => ({
            id: s.id || `sub_cat_${idx}_${sIdx}`,
            name: s.name || '',
            description: s.description || '',
            quantity: Number(s.quantity) || 1,
            dates: Number(s.dates) || 1,
            unitCost: Number(s.unitCost) || 0,
            providerName: s.providerName || '',
            providerId: s.providerId || null
          }))
        },
        categoryName: catName,
        quoteId: `cat_quote_${c.catalogId || idx}`,
        quoteTitle,
        quoteDate: c.sourceDate || '',
        clientName: c.sourceClient || 'Catálogo Purple',
        projectName: c.sourceRequirement || 'Catálogo de Ítems',
        isTemplate: true,
        searchCorpus,
        totalCost
      });
    });

    return list;
  }, [isOpen, quotes, currentQuoteId, clientes, proyectos, catalogItems]);

  // Extract unique category names for filter dropdown
  const uniqueCategoryNames = useMemo(() => {
    const set = new Set<string>();
    allFlattenedItems.forEach(i => {
      if (i.categoryName) set.add(i.categoryName.toUpperCase());
    });
    return Array.from(set).sort();
  }, [allFlattenedItems]);

  // 2. Filter items according to search query and filters
  const filteredItems = useMemo(() => {
    let result = allFlattenedItems;

    // Filter by source
    if (sourceFilter === 'TEMPLATES') {
      result = result.filter(i => i.isTemplate);
    } else if (sourceFilter === 'CLIENTS') {
      result = result.filter(i => !i.isTemplate);
    }

    // Filter by client if specified
    if (selectedClientId) {
      result = result.filter(i => {
        const q = quotes.find(quote => quote.id === i.quoteId);
        if (!q) return false;
        const p = proyectos.find(proj => proj.id === q.projectId);
        const cId = p ? p.clienteId : q.client;
        return cId === selectedClientId;
      });
    }

    // Filter by category
    if (categoryFilter !== 'TODAS') {
      result = result.filter(i => i.categoryName.toUpperCase() === categoryFilter.toUpperCase());
    }

    // Text search (sub-millisecond multi-word match)
    const term = searchQuery.trim().toLowerCase();
    if (term) {
      const words = term.split(/\s+/).filter(Boolean);
      result = result.filter(i => words.every(w => i.searchCorpus.includes(w)));
    }

    return result;
  }, [allFlattenedItems, sourceFilter, selectedClientId, categoryFilter, searchQuery, quotes, proyectos]);

  // Slice results for fast rendering
  const visibleItems = useMemo(() => {
    return filteredItems.slice(0, resultsLimit);
  }, [filteredItems, resultsLimit]);

  // Check if an item from search is currently in stagedItems
  const isItemStaged = (flatItem: FlattenedItem): boolean => {
    return stagedItems.some(s => s.originalItemId === flatItem.originalItemId && s.sourceQuoteTitle === flatItem.quoteTitle);
  };

  // Toggle item in staged items
  const toggleStagedItem = (flatItem: FlattenedItem) => {
    setStagedItems(prev => {
      const existingIndex = prev.findIndex(
        s => s.originalItemId === flatItem.originalItemId && s.sourceQuoteTitle === flatItem.quoteTitle
      );
      if (existingIndex >= 0) {
        return prev.filter((_, idx) => idx !== existingIndex);
      } else {
        const newStaged: StagedItem = {
          stagedId: `staged-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          originalItemId: flatItem.originalItemId,
          item: JSON.parse(JSON.stringify(flatItem.item)),
          categoryName: flatItem.categoryName,
          sourceQuoteTitle: flatItem.quoteTitle,
          sourceQuoteDate: flatItem.quoteDate,
          sourceClient: flatItem.clientName,
          sourceProject: flatItem.projectName
        };
        return [...prev, newStaged];
      }
    });
  };

  // Select all visible items
  const handleSelectAllVisible = () => {
    setStagedItems(prev => {
      const existingKeys = new Set(prev.map(s => `${s.originalItemId}__${s.sourceQuoteTitle}`));
      const allSelected = visibleItems.every(v => existingKeys.has(`${v.originalItemId}__${v.quoteTitle}`));

      if (allSelected) {
        const visibleKeysToRemove = new Set(visibleItems.map(v => `${v.originalItemId}__${v.quoteTitle}`));
        return prev.filter(s => !visibleKeysToRemove.has(`${s.originalItemId}__${s.sourceQuoteTitle}`));
      } else {
        const toAdd: StagedItem[] = [];
        visibleItems.forEach(v => {
          if (!existingKeys.has(`${v.originalItemId}__${v.quoteTitle}`)) {
            toAdd.push({
              stagedId: `staged-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
              originalItemId: v.originalItemId,
              item: JSON.parse(JSON.stringify(v.item)),
              categoryName: v.categoryName,
              sourceQuoteTitle: v.quoteTitle,
              sourceQuoteDate: v.quoteDate,
              sourceClient: v.clientName,
              sourceProject: v.projectName
            });
          }
        });
        return [...prev, ...toAdd];
      }
    });
  };

  // Open item in detail/edit view
  const openItemDetail = (flatOrStaged: FlattenedItem | StagedItem) => {
    if ('stagedId' in flatOrStaged) {
      // It's already a staged item
      setEditingStagedItem(JSON.parse(JSON.stringify(flatOrStaged)));
    } else {
      // It's a flat item from search. Check if already staged to open the staged version with existing edits
      const existing = stagedItems.find(
        s => s.originalItemId === flatOrStaged.originalItemId && s.sourceQuoteTitle === flatOrStaged.quoteTitle
      );
      if (existing) {
        setEditingStagedItem(JSON.parse(JSON.stringify(existing)));
      } else {
        // Create a temporary staged copy for viewing/editing
        setEditingStagedItem({
          stagedId: `staged-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          originalItemId: flatOrStaged.originalItemId,
          item: JSON.parse(JSON.stringify(flatOrStaged.item)),
          categoryName: flatOrStaged.categoryName,
          sourceQuoteTitle: flatOrStaged.quoteTitle,
          sourceQuoteDate: flatOrStaged.quoteDate,
          sourceClient: flatOrStaged.clientName,
          sourceProject: flatOrStaged.projectName
        });
      }
    }
  };

  // Save changes from Item Detail Editor
  const handleSaveEditedItem = (updatedStaged: StagedItem) => {
    setStagedItems(prev => {
      const idx = prev.findIndex(
        s => s.originalItemId === updatedStaged.originalItemId && s.sourceQuoteTitle === updatedStaged.sourceQuoteTitle
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updatedStaged;
        return copy;
      } else {
        return [...prev, updatedStaged];
      }
    });
    setEditingStagedItem(null);
  };

  // Remove single staged item
  const removeStagedItem = (stagedId: string) => {
    setStagedItems(prev => prev.filter(s => s.stagedId !== stagedId));
  };

  // Handle final import
  const handleConfirmImport = () => {
    if (stagedItems.length === 0) return;
    if (targetMode === 'existing' && !targetCategoryId) return;
    if (targetMode === 'new' && !newCategoryName.trim()) return;

    const payload: ImportedItemPayload[] = stagedItems.map(s => ({
      item: JSON.parse(JSON.stringify(s.item)),
      categoryName: s.categoryName,
      sourceQuoteDate: s.sourceQuoteDate,
      sourceProjectName: s.sourceProject
    }));

    onImportItems(payload, {
      mode: targetMode,
      targetCategoryId: targetMode === 'existing' ? targetCategoryId : undefined,
      newCategoryName: targetMode === 'new' ? newCategoryName.trim() : undefined
    });

    onClose();
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 99999,
        padding: '16px',
        overflowY: 'auto'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !editingStagedItem) onClose();
      }}
    >
      <div
        style={{
          width: '1060px',
          maxWidth: '98vw',
          height: 'min(92vh, 840px)',
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          margin: 'auto',
          color: '#1e293b'
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '14px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(to right, #faf5ff, #ffffff)',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(102, 45, 145, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary)'
              }}
            >
              <Package size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                Buscador e Importador de Ítems
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                Busca directamente por ítem, inspecciona y edita el detalle completo antes de incorporarlo.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* TAB SELECTOR */}
            <div
              style={{
                display: 'flex',
                background: '#f1f5f9',
                padding: '3px',
                borderRadius: '10px',
                gap: '2px'
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTab('search')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: activeTab === 'search' ? '#ffffff' : 'transparent',
                  color: activeTab === 'search' ? 'var(--accent-primary)' : '#64748b',
                  boxShadow: activeTab === 'search' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
                }}
              >
                <Search size={14} />
                Buscar Ítems
                <span
                  style={{
                    fontSize: '0.7rem',
                    background: activeTab === 'search' ? 'rgba(102, 45, 145, 0.1)' : '#e2e8f0',
                    color: activeTab === 'search' ? 'var(--accent-primary)' : '#64748b',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    fontWeight: 700
                  }}
                >
                  {filteredItems.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('selected')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: activeTab === 'selected' ? '#ffffff' : 'transparent',
                  color: activeTab === 'selected' ? 'var(--accent-primary)' : '#64748b',
                  boxShadow: activeTab === 'selected' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
                }}
              >
                <CheckSquare size={14} />
                Seleccionados
                <span
                  style={{
                    fontSize: '0.7rem',
                    background: stagedItems.length > 0 ? 'var(--accent-primary)' : '#e2e8f0',
                    color: stagedItems.length > 0 ? '#ffffff' : '#64748b',
                    padding: '1px 7px',
                    borderRadius: '10px',
                    fontWeight: 700
                  }}
                >
                  {stagedItems.length}
                </span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="btn-icon"
              style={{
                padding: '6px',
                borderRadius: '8px',
                color: '#64748b',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* TAB 1: GLOBAL ITEM SEARCH */}
        {activeTab === 'search' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* SEARCH CONTROLS BAR */}
            <div
              style={{
                padding: '14px 24px',
                borderBottom: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              {/* PRIMARY SEARCH BAR */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                  <Search
                    size={18}
                    color="var(--accent-primary)"
                    style={{ position: 'absolute', left: '12px' }}
                  />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Escribe el nombre del ítem, descripción o costo (ej. Tótem, Pantalla, Backing, Catering)..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setResultsLimit(60);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 36px 10px 40px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.92rem',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      background: '#ffffff'
                    }}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent-primary)')}
                    onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#94a3b8'
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* SELECT ALL VISIBLE BUTTON */}
                <button
                  type="button"
                  onClick={handleSelectAllVisible}
                  style={{
                    padding: '9px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <CheckSquare size={15} />
                  Marcar Visibles ({visibleItems.length})
                </button>
              </div>

              {/* FILTER PILLS */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Source Filter */}
                <div style={{ display: 'flex', background: '#e2e8f0', padding: '2px', borderRadius: '8px', gap: '2px' }}>
                  <button
                    type="button"
                    onClick={() => setSourceFilter('ALL')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: sourceFilter === 'ALL' ? '#ffffff' : 'transparent',
                      color: sourceFilter === 'ALL' ? '#0f172a' : '#64748b'
                    }}
                  >
                    Todos ({allFlattenedItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceFilter('TEMPLATES')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: sourceFilter === 'TEMPLATES' ? '#ffffff' : 'transparent',
                      color: sourceFilter === 'TEMPLATES' ? '#0f172a' : '#64748b'
                    }}
                  >
                    📋 Plantillas y Catálogo
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceFilter('CLIENTS')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: sourceFilter === 'CLIENTS' ? '#ffffff' : 'transparent',
                      color: sourceFilter === 'CLIENTS' ? '#0f172a' : '#64748b'
                    }}
                  >
                    🏢 Cotizaciones de Clientes
                  </button>
                </div>

                {/* Category Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Categoría:</span>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.78rem',
                      background: '#ffffff',
                      color: '#334155'
                    }}
                  >
                    <option value="TODAS">Todas las Categorías</option>
                    {uniqueCategoryNames.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Client Dropdown */}
                {sourceFilter !== 'TEMPLATES' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Cliente:</span>
                    <select
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.78rem',
                        background: '#ffffff',
                        color: '#334155'
                      }}
                    >
                      <option value="">Todos los Clientes</option>
                      {clientes.map(c => (
                        <option key={c.id} value={c.id}>{c.empresa}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Badge de ítems de catálogo disponibles */}
                {isLoadingCatalog ? (
                  <span style={{ fontSize: '0.75rem', color: '#8b5cf6', marginLeft: 'auto' }}>
                    Cargando catálogo de ítems...
                  </span>
                ) : catalogItems.length > 0 ? (
                  <span style={{ fontSize: '0.75rem', color: '#6d28d9', background: 'rgba(109, 40, 217, 0.08)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, marginLeft: 'auto' }}>
                    ✨ {catalogItems.length.toLocaleString('es-PE')} ítems de catálogo listos
                  </span>
                ) : null}
              </div>
            </div>

            {/* RESULTS LIST */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                background: '#f8fafc'
              }}
            >
              {visibleItems.length === 0 ? (
                <div
                  style={{
                    padding: '48px 24px',
                    textAlign: 'center',
                    color: '#64748b',
                    background: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    margin: 'auto 0'
                  }}
                >
                  <Search size={36} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
                  <h4 style={{ margin: '0 0 6px', color: '#1e293b' }}>No se encontraron ítems</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>
                    Prueba con otra palabra clave en el buscador o cambia los filtros de categoría y cliente.
                  </p>
                </div>
              ) : (
                visibleItems.map(flatItem => {
                  const selected = isItemStaged(flatItem);
                  const firstDetail = Array.isArray(flatItem.item.details) && flatItem.item.details.length > 0
                    ? typeof flatItem.item.details[0] === 'string'
                      ? flatItem.item.details[0]
                      : (flatItem.item.details[0] as any)?.text || ''
                    : '';

                  return (
                    <div
                      key={flatItem.uniqueKey}
                      style={{
                        background: selected ? 'rgba(102, 45, 145, 0.03)' : '#ffffff',
                        border: selected ? '1.5px solid var(--accent-primary)' : '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {/* SELECTION CHECKBOX */}
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleStagedItem(flatItem)}
                        style={{
                          width: '18px',
                          height: '18px',
                          accentColor: 'var(--accent-primary)',
                          cursor: 'pointer'
                        }}
                      />

                      {/* ITEM CONTENT */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>
                            {flatItem.item.name}
                          </span>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              background: '#f1f5f9',
                              color: 'var(--accent-primary)',
                              fontWeight: 700,
                              textTransform: 'uppercase'
                            }}
                          >
                            {flatItem.categoryName}
                          </span>
                          {flatItem.isTemplate && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                background: 'rgba(16, 185, 129, 0.1)',
                                color: '#059669',
                                fontWeight: 700
                              }}
                            >
                              📋 Plantilla
                            </span>
                          )}
                        </div>

                        {/* ORIGIN METADATA */}
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <Building2 size={12} color="#94a3b8" />
                          <span>{flatItem.clientName}</span>
                          <span>•</span>
                          <span>{flatItem.quoteTitle}</span>
                          {flatItem.quoteDate && (
                            <>
                              <span>•</span>
                              <span style={{ color: '#0284c7', fontWeight: 600 }}>
                                📅 {flatItem.quoteDate}
                              </span>
                            </>
                          )}
                        </div>

                        {/* DETAILS SNIPPET */}
                        {firstDetail && (
                          <div
                            style={{
                              fontSize: '0.77rem',
                              color: '#475569',
                              marginTop: '4px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            • {firstDetail}
                          </div>
                        )}
                      </div>

                      {/* STATS & COSTS */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            {(flatItem.item.subItems || []).length} sub-ítem{(flatItem.item.subItems || []).length !== 1 ? 's' : ''}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#059669' }}>
                            {currencySymbol} {flatItem.totalCost.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>

                        {/* ACTION BUTTON: VER DETALLE / EDITAR */}
                        <button
                          type="button"
                          onClick={() => openItemDetail(flatItem)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: 'var(--accent-primary)',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}
                          title="Ver detalle completo y editar campos antes de importar"
                        >
                          <Eye size={14} />
                          Ver Detalle / Editar
                        </button>
                      </div>
                    </div>
                  );
                })
              )}

              {/* LOAD MORE BUTTON IF TRUNCATED */}
              {filteredItems.length > resultsLimit && (
                <button
                  type="button"
                  onClick={() => setResultsLimit(prev => prev + 60)}
                  style={{
                    padding: '10px',
                    margin: '8px auto',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: 'var(--accent-primary)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cargar más resultados ({resultsLimit} de {filteredItems.length})
                </button>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: SELECTED / STAGED ITEMS (REVIEW & EDIT) */}
        {activeTab === 'selected' && (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              background: '#f8fafc'
            }}
          >
            {stagedItems.length === 0 ? (
              <div
                style={{
                  padding: '60px 24px',
                  textAlign: 'center',
                  color: '#64748b',
                  background: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  margin: 'auto 0'
                }}
              >
                <Package size={40} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
                <h4 style={{ margin: '0 0 6px', color: '#1e293b' }}>No tienes ítems seleccionados aún</h4>
                <p style={{ margin: '0 0 16px', fontSize: '0.85rem' }}>
                  Regresa a la pestaña "Buscar Ítems", busca los ítems que necesitas y márcalos con su casilla.
                </p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setActiveTab('search')}
                  style={{ padding: '8px 20px', fontSize: '0.85rem', margin: '0 auto' }}
                >
                  Ir a Buscar Ítems
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                      Ítems Listos para Importar ({stagedItems.length})
                    </h4>
                    <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                      Puedes abrir cualquier ítem para editar su descripción, cantidades y costos directos antes de incorporarlo.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStagedItems([])}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--danger)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Trash2 size={14} /> Vaciar selección
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {stagedItems.map((staged, idx) => {
                    const totalCost = (staged.item.subItems || []).reduce(
                      (acc, sub) => acc + (Number(sub.unitCost || 0) * Number(sub.quantity || 1) * Number(sub.dates || 1)),
                      0
                    );

                    return (
                      <div
                        key={staged.stagedId}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          padding: '14px 18px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '16px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}
                      >
                        <span
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: 'rgba(102, 45, 145, 0.1)',
                            color: 'var(--accent-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700
                          }}
                        >
                          {idx + 1}
                        </span>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>
                              {staged.item.name}
                            </span>
                            <span
                              style={{
                                fontSize: '0.7rem',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                background: '#f1f5f9',
                                color: 'var(--accent-primary)',
                                fontWeight: 700
                              }}
                            >
                              {staged.categoryName}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '3px' }}>
                            Origen: {staged.sourceClient} • {staged.sourceQuoteTitle} {staged.sourceQuoteDate && `• 📅 ${staged.sourceQuoteDate}`}
                          </div>

                          <div style={{ fontSize: '0.75rem', color: '#334155', marginTop: '4px', display: 'flex', gap: '12px' }}>
                            <span>Cant: <strong>{staged.item.quantity || 1}</strong></span>
                            <span>Días: <strong>{staged.item.dates || 1}</strong></span>
                            <span>Sub-ítems: <strong>{(staged.item.subItems || []).length}</strong></span>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Costo Directo</div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#059669' }}>
                            {currencySymbol} {totalCost.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => openItemDetail(staged)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '8px',
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              color: 'var(--accent-primary)',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Edit3 size={14} /> Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => removeStagedItem(staged.stagedId)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid #fee2e2',
                              background: '#fff1f2',
                              color: 'var(--danger)',
                              cursor: 'pointer'
                            }}
                            title="Quitar de la selección"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP: DESTINATION CATEGORY SELECTOR (VISIBLE AT BOTTOM OF BOTH TABS) */}
        <div
          style={{
            padding: '12px 24px',
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                📁 Destino de los ítems:
              </span>

              {/* Mode: Origin Category */}
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="importTargetMode"
                  checked={targetMode === 'origin'}
                  onChange={() => setTargetMode('origin')}
                  style={{ accentColor: 'var(--accent-primary)' }}
                />
                Categorías de origen
              </label>

              {/* Mode: Existing Category */}
              {currentCategories.length > 0 && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="importTargetMode"
                    checked={targetMode === 'existing'}
                    onChange={() => setTargetMode('existing')}
                    style={{ accentColor: 'var(--accent-primary)' }}
                  />
                  En categoría existente:
                  <select
                    value={targetCategoryId}
                    onChange={(e) => {
                      setTargetCategoryId(e.target.value);
                      setTargetMode('existing');
                    }}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.78rem',
                      background: '#ffffff',
                      color: '#334155'
                    }}
                  >
                    {currentCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              )}

              {/* Mode: New Category */}
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="importTargetMode"
                  checked={targetMode === 'new'}
                  onChange={() => setTargetMode('new')}
                  style={{ accentColor: 'var(--accent-primary)' }}
                />
                En nueva categoría:
                <input
                  type="text"
                  placeholder="Ej: PRODUCCIÓN"
                  value={newCategoryName}
                  onChange={(e) => {
                    setNewCategoryName(e.target.value);
                    setTargetMode('new');
                  }}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.78rem',
                    width: '140px'
                  }}
                />
              </label>
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                fontSize: '0.88rem',
                fontWeight: 700,
                color: stagedItems.length > 0 ? 'var(--accent-primary)' : '#94a3b8'
              }}
            >
              {stagedItems.length} ítem{stagedItems.length !== 1 ? 's' : ''} seleccionado{stagedItems.length !== 1 ? 's' : ''}
            </span>

            {activeTab === 'search' && stagedItems.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('selected')}
                style={{
                  border: 'none',
                  background: 'rgba(102, 45, 145, 0.1)',
                  color: 'var(--accent-primary)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Ver lista de seleccionados →
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              style={{ padding: '8px 20px', fontSize: '0.85rem', borderRadius: '8px' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleConfirmImport}
              disabled={
                stagedItems.length === 0 ||
                (targetMode === 'existing' && (!targetCategoryId || currentCategories.length === 0)) ||
                (targetMode === 'new' && !newCategoryName.trim())
              }
              style={{
                padding: '8px 24px',
                fontSize: '0.88rem',
                borderRadius: '8px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: stagedItems.length === 0 ? 0.6 : 1
              }}
            >
              <Check size={16} />
              Importar {stagedItems.length} Ítem{stagedItems.length !== 1 ? 's' : ''} a la Cotización
            </button>
          </div>
        </div>
      </div>

      {/* DETAIL & EDIT MODAL OVERLAY */}
      {editingStagedItem && (
        <ItemDetailEditorModal
          stagedItem={editingStagedItem}
          currencySymbol={currencySymbol}
          onClose={() => setEditingStagedItem(null)}
          onSave={handleSaveEditedItem}
        />
      )}
    </div>,
    document.body
  );
};

// ==========================================
// SUB-COMPONENT: FULL ITEM DETAIL & EDITOR
// ==========================================
interface ItemDetailEditorModalProps {
  stagedItem: StagedItem;
  currencySymbol: string;
  onClose: () => void;
  onSave: (item: StagedItem) => void;
}

const ItemDetailEditorModal: React.FC<ItemDetailEditorModalProps> = ({
  stagedItem,
  currencySymbol,
  onClose,
  onSave
}) => {
  const [editedItem, setEditedItem] = useState<QuoteItem>(() => ({
    ...stagedItem.item,
    quantity: Number(stagedItem.item.quantity || 1),
    dates: Number(stagedItem.item.dates || 1),
    internalMultiplierPercent: Number(stagedItem.item.internalMultiplierPercent ?? 10),
    financialExpensePercent: Number(stagedItem.item.financialExpensePercent ?? 10),
    details: Array.isArray(stagedItem.item.details) ? [...stagedItem.item.details] : [],
    subItems: (stagedItem.item.subItems || []).map(si => ({ ...si }))
  }));

  const [descriptionText, setDescriptionText] = useState<string>(() => {
    if (!stagedItem.item.details) return '';
    return Array.isArray(stagedItem.item.details)
      ? stagedItem.item.details.map(d => typeof d === 'string' ? d : (d as any)?.text || '').join('\n')
      : String(stagedItem.item.details);
  });

  const [categoryName, setCategoryName] = useState(stagedItem.categoryName);

  // Calculate live direct cost
  const totalDirectCost = useMemo(() => {
    return (editedItem.subItems || []).reduce(
      (acc, s) => acc + (Number(s.unitCost || 0) * Number(s.quantity || 1) * Number(s.dates || 1)),
      0
    );
  }, [editedItem.subItems]);

  // Calculate estimated sale price with multiplier
  const multiplier = 1 + (Number(editedItem.internalMultiplierPercent || 0) / 100);
  const finMultiplier = 1 + (Number(editedItem.financialExpensePercent || 0) / 100);
  const estimatedSalePrice = totalDirectCost * multiplier * finMultiplier;

  const handleAddSubItem = () => {
    const newSub: QuoteSubItem = {
      id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: '',
      description: '',
      quantity: 1,
      dates: 1,
      unitCost: 0,
      providerName: ''
    };
    setEditedItem(prev => ({
      ...prev,
      subItems: [...(prev.subItems || []), newSub]
    }));
  };

  const handleUpdateSubItem = (index: number, field: keyof QuoteSubItem, value: any) => {
    setEditedItem(prev => {
      const copy = [...(prev.subItems || [])];
      copy[index] = { ...copy[index], [field]: value };
      return { ...prev, subItems: copy };
    });
  };

  const handleRemoveSubItem = (index: number) => {
    setEditedItem(prev => {
      const copy = [...(prev.subItems || [])];
      copy.splice(index, 1);
      return { ...prev, subItems: copy };
    });
  };

  const handleSave = () => {
    const detailsLines = descriptionText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    const finalizedItem: QuoteItem = {
      ...editedItem,
      details: detailsLines,
      subItems: ensureImprevistoInSubItems(editedItem.subItems)
    };

    onSave({
      ...stagedItem,
      item: finalizedItem,
      categoryName: categoryName.trim().toUpperCase() || 'GENERAL'
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100000,
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '880px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.45)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#1e293b'
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(to right, #faf5ff, #ffffff)',
            flexShrink: 0
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(102, 45, 145, 0.1)',
                  color: 'var(--accent-primary)',
                  fontWeight: 700
                }}
              >
                {categoryName || 'GENERAL'}
              </span>
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Origen: {stagedItem.sourceClient} • {stagedItem.sourceQuoteTitle}
              </span>
            </div>
            <h3 style={{ margin: '4px 0 0', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
              Detalle y Edición del Ítem
            </h3>
          </div>

          <button
            onClick={onClose}
            className="btn-icon"
            style={{
              padding: '6px',
              borderRadius: '8px',
              color: '#64748b',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* BODY */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
        >
          {/* GENERAL INFO FIELDS */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                Nombre del Ítem
              </label>
              <input
                type="text"
                value={editedItem.name}
                onChange={(e) => setEditedItem(prev => ({ ...prev, name: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  background: '#ffffff'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Categoría
                </label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="Categoría"
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.82rem',
                    background: '#ffffff'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Cantidad
                </label>
                <input
                  type="number"
                  min="1"
                  value={editedItem.quantity}
                  onChange={(e) => setEditedItem(prev => ({ ...prev, quantity: Number(e.target.value) || 1 }))}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.82rem',
                    background: '#ffffff'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Días / Fechas
                </label>
                <input
                  type="number"
                  min="1"
                  value={editedItem.dates}
                  onChange={(e) => setEditedItem(prev => ({ ...prev, dates: Number(e.target.value) || 1 }))}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.82rem',
                    background: '#ffffff'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  % Margen Interno
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={editedItem.internalMultiplierPercent}
                  onChange={(e) => setEditedItem(prev => ({ ...prev, internalMultiplierPercent: Number(e.target.value) || 0 }))}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.82rem',
                    background: '#ffffff'
                  }}
                />
              </div>
            </div>
          </div>

          {/* DESCRIPTION BULLETS */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Descripción / Viñetas del Ítem (Una por línea)
            </label>
            <textarea
              rows={4}
              value={descriptionText}
              onChange={(e) => setDescriptionText(e.target.value)}
              placeholder="Ingresa los detalles técnicos o viñetas descriptivas..."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                fontFamily: 'inherit',
                lineHeight: '1.4'
              }}
            />
          </div>

          {/* SUB-ITEMS / DIRECT COSTS TABLE */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                Costos Directos / Sub-Ítems ({editedItem.subItems?.length || 0})
              </label>
              <button
                type="button"
                onClick={handleAddSubItem}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: 'var(--accent-primary)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Plus size={14} /> Agregar Sub-Ítem
              </button>
            </div>

            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                overflow: 'hidden'
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Nombre Sub-Ítem</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Proveedor</th>
                    <th style={{ padding: '8px 8px', textAlign: 'center', fontWeight: 600, width: '60px' }}>Cant.</th>
                    <th style={{ padding: '8px 8px', textAlign: 'center', fontWeight: 600, width: '60px' }}>Días</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, width: '100px' }}>Costo Unit.</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, width: '100px' }}>Subtotal</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', width: '36px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(editedItem.subItems || []).map((sub, sIdx) => {
                    const subCost = Number(sub.unitCost || 0) * Number(sub.quantity || 1) * Number(sub.dates || 1);
                    return (
                      <tr key={sub.id || sIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="text"
                            value={sub.name}
                            placeholder="Nombre del gasto"
                            onChange={(e) => handleUpdateSubItem(sIdx, 'name', e.target.value)}
                            style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="text"
                            value={sub.providerName || ''}
                            placeholder="Proveedor"
                            onChange={(e) => handleUpdateSubItem(sIdx, 'providerName', e.target.value)}
                            style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <input
                            type="number"
                            min="1"
                            value={sub.quantity ?? 1}
                            onChange={(e) => handleUpdateSubItem(sIdx, 'quantity', Number(e.target.value) || 1)}
                            style={{ width: '50px', padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '0.78rem' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <input
                            type="number"
                            min="1"
                            value={sub.dates ?? 1}
                            onChange={(e) => handleUpdateSubItem(sIdx, 'dates', Number(e.target.value) || 1)}
                            style={{ width: '50px', padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '0.78rem' }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                          <input
                            type="number"
                            step="0.01"
                            value={sub.unitCost ?? 0}
                            onChange={(e) => handleUpdateSubItem(sIdx, 'unitCost', Number(e.target.value) || 0)}
                            style={{ width: '85px', padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'right', fontSize: '0.78rem' }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>
                          {currencySymbol} {subCost.toFixed(2)}
                        </td>
                        <td style={{ padding: '6px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveSubItem(sIdx)}
                            style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                            title="Eliminar sub-ítem"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {(!editedItem.subItems || editedItem.subItems.length === 0) && (
                    <tr>
                      <td colSpan={7} style={{ padding: '16px', textAlign: 'center', color: '#94a3b8' }}>
                        Sin sub-ítems registrados. Haz clic en "+ Agregar Sub-Ítem".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* FOOTER OF EDITOR */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>Costo Directo Total</span>
              <strong style={{ fontSize: '1rem', color: '#059669' }}>
                {currencySymbol} {totalDirectCost.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>
            <div>
              <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>Precio Sugerido Venta</span>
              <strong style={{ fontSize: '1rem', color: 'var(--accent-primary)' }}>
                {currencySymbol} {estimatedSalePrice.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              style={{ padding: '8px 18px', fontSize: '0.82rem', borderRadius: '8px' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              style={{
                padding: '8px 22px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Check size={16} />
              Guardar y Agregar a Selección
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
