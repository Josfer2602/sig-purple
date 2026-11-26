import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Quote, QuoteItem, QuoteCategory } from '../types/quote';
import { ensureImprevistoInSubItems } from '../types/quote';
import { QuoteItemRow } from './QuoteItemRow';
import { ImportItemsModal, type ImportedItemPayload, type ImportTargetOption } from './ImportItemsModal';
import { AIImportModal } from './AIImportModal';
import { ExcelQuoteImportModal } from './ExcelQuoteImportModal';
import { SmartBriefDrawer } from './SmartBriefDrawer';
import { CreateOrdenesMasivasModal } from './CreateOrdenesMasivasModal';
import { Plus, ArrowLeft, Download, Save, Trash2, Copy, Mail, Sparkles, Folder, Building2, FileSpreadsheet, FileText, ChevronDown, MoreVertical, Package, Zap } from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';
import { EmailModal } from './EmailModal';
import { useIsMobile } from '../hooks/useIsMobile';
import { MobileItemFormModal } from './MobileItemFormModal';
import { SearchableProjectSelect } from './SearchableProjectSelect';
import { buildQuoteClientUrl } from '../utils/clientLinks';
import { API_URL } from '../utils/apiUrl';
import { preserveQuoteNodeIds } from '../utils/liquidacionHelpers';
import { computeQuoteTotals, computeQuoteItemFinancials, recalculateSpecialQuoteItems } from '../utils/quoteMathHelper';
import toast from 'react-hot-toast';

export const PAYMENT_CONDITIONS_OPTIONS = [
  '100% de adelanto.',
  '50% de adelanto y 50% contra entrega ó al finalizar la actividad.',
  '100% contra entrega o al finalizar la actividad.',
  '7 días de crédito.',
  '15 días de crédito.',
  '30 días de crédito.',
  '45 días de crédito.',
  '60 días de crédito.',
  '90 días de crédito.'
];

interface LockOwner {
  userEmail: string;
  userRole?: string;
  lockedAt?: number | string;
  lastHeartbeat?: number | string;
}

const formatLockDuration = (timeVal?: number | string) => {
  if (!timeVal) return '';
  try {
    const timeMs = typeof timeVal === 'number' ? timeVal : new Date(timeVal).getTime();
    const min = Math.floor((Date.now() - timeMs) / 60000);
    if (min <= 0) return 'menos de un minuto';
    if (min === 1) return '1 minuto';
    return `${min} minutos`;
  } catch {
    return '';
  }
};

interface CotizacionBuilderProps {
  initialQuote: Quote;
  allQuotes: Quote[];
  onBack: () => void;
  onUpdateGlobal: (updated: Quote) => Promise<void>;
}

export const CotizacionBuilder: React.FC<CotizacionBuilderProps> = ({ initialQuote, allQuotes, onBack, onUpdateGlobal }) => {
  const { proyectos, clientes, currentUserRole } = useGlobalContext();
  const [quote, setQuote] = useState<Quote>(() => {
    if (!initialQuote) {
      return {
        id: '',
        projectId: '',
        version: 1,
        isTemplate: false,
        status: 'En Creación',
        client: '',
        brand: '',
        requirement: '',
        date: '',
        businessName: '',
        ruc: '',
        paymentConditions: '30 días de crédito.',
        currency: 'PEN',
        exchangeRate: 3.75,
        includeIgv: false,
        categories: []
      };
    }
    const q = JSON.parse(JSON.stringify(initialQuote));
    q.currency = q.currency || 'PEN';
    q.exchangeRate = q.exchangeRate !== undefined ? Number(q.exchangeRate) : 3.75;
    q.includeIgv = Boolean(q.includeIgv);
    q.paymentConditions = q.paymentConditions || '30 días de crédito.';
    q.categories = Array.isArray(q.categories) ? q.categories.filter(Boolean) : [];
    q.categories.forEach((cat: any) => {
      cat.items = Array.isArray(cat.items) ? cat.items.filter(Boolean) : [];
      cat.items.forEach((item: any) => {
        if (!item) return;
        item.subItems = ensureImprevistoInSubItems(Array.isArray(item.subItems) ? item.subItems : []);
        item.details = Array.isArray(item.details) ? item.details : [];
        item.quantity = Number(item.quantity || 1);
        item.dates = Number(item.dates || 1);
      });
    });
    return q;
  });
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isBriefDrawerOpen, setIsBriefDrawerOpen] = useState(false);
  const [isGenerateOrdersModalOpen, setIsGenerateOrdersModalOpen] = useState(false);
  const [isFloatingActionsExpanded, setIsFloatingActionsExpanded] = useState(true);
  const isMobile = useIsMobile();
  const [mobileEditItem, setMobileEditItem] = useState<{ categoryId: string, item: QuoteItem } | null>(null);

  // Soft Locking state
  const [lockOwner, setLockOwner] = useState<LockOwner | null>(null);
  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const [isTakingOver, setIsTakingOver] = useState(false);

  // Cálculos financieros y de rentabilidad
  const calculateTotals = () => computeQuoteTotals(quote);

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

  const totals = calculateTotals();
  const currencySymbol = quote.currency === 'USD' ? '$' : 'S/';
  const exchangeRate = quote.exchangeRate !== undefined ? Number(quote.exchangeRate) : 3.75;
  const igvAmount = totals.finalTotalClient * 0.18;
  const totalWithIgv = totals.finalTotalClient * 1.18;
  const displayedHeaderTotal = quote.includeIgv ? totalWithIgv : totals.finalTotalClient;
  const solesEquivalent = quote.currency === 'USD' ? (totals.finalTotalClient * exchangeRate) : null;

  // Rentabilidad / Mark Up / Mark Down (cálculos oficiales de Purple BTL)
  const marginAmount = totals.finalTotalClient - totals.subTotalProviders;
  const markUpPercent = totals.subTotalProviders > 0 
    ? ((totals.finalTotalClient - totals.subTotalProviders) / totals.subTotalProviders) * 100 
    : 0;
  const markDownPercent = totals.finalTotalClient > 0 
    ? ((totals.finalTotalClient - totals.subTotalProviders) / totals.finalTotalClient) * 100 
    : 0;
  const isIdealMargin = markDownPercent >= 25;

  // Lógica de Workflow y Permisos
  const isWorkflowReadOnly = (() => {
    if (currentUserRole === 'Admin' || currentUserRole === 'Directorio') return false;
    if (quote.isTemplate) return false; // Las plantillas siempre se pueden editar
    const s = (quote.status || '').toLowerCase();

    if (currentUserRole === 'Producción') {
      return !s.includes('creación') && !s.includes('producción') && !s.includes('rechazado');
    }
    if (currentUserRole === 'Cuentas') {
      return s.includes('producción') && !s.includes('creación');
    }
    return false;
  })();

  const isReadOnly = isWorkflowReadOnly || isLockedByOther;

  // Lock acquisition, heartbeat, and probe
  React.useEffect(() => {
    if (!initialQuote?.id || initialQuote.isTemplate) return;

    let isMounted = true;
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    const acquireLock = async () => {
      try {
        const res = await fetch(`${API_URL}/quotes/${initialQuote.id}/lock`, {
          method: 'POST',
          headers
        });
        const data = await res.json();
        if (!isMounted) return;

        if (res.ok && data.locked) {
          if (data.isSelf) {
            setIsLockedByOther(false);
            setLockOwner(null);
          } else {
            setIsLockedByOther(true);
            setLockOwner(data.currentEditor || null);
            toast(() => (
              <span style={{ fontSize: '0.88rem' }}>
                🔒 <b>Modo solo lectura:</b> Esta cotización está siendo editada por{' '}
                <b>{data.currentEditor?.userEmail || 'otro usuario'}</b>.
              </span>
            ), { icon: '⚠️', duration: 5000 });
          }
        }
      } catch (err) {
        console.error('Error acquiring quote lock:', err);
      }
    };

    acquireLock();

    // Periodic heartbeat (if we own lock) or probe (if locked by other)
    const interval = setInterval(async () => {
      if (!isMounted) return;

      if (isLockedByOther) {
        // Probe if the other user has released the lock
        try {
          const res = await fetch(`${API_URL}/quotes/${initialQuote.id}/lock`, {
            method: 'POST',
            headers
          });
          const data = await res.json();
          if (!isMounted) return;
          if (res.ok && data.locked && data.isSelf) {
            setIsLockedByOther(false);
            setLockOwner(null);
            toast.success('El usuario anterior ha liberado la cotización. Ahora tienes el control de edición.');
          }
        } catch (e) {}
        return;
      }

      // Heartbeat every 25 seconds to keep our lock alive
      try {
        const res = await fetch(`${API_URL}/quotes/${initialQuote.id}/lock/heartbeat`, {
          method: 'POST',
          headers
        });
        const data = await res.json();
        if (!isMounted) return;

        if (data.ok === false) {
          setIsLockedByOther(true);
          if (data.currentEditor) setLockOwner(data.currentEditor);
          toast.error(
            `El control de edición fue tomado por ${data.currentEditor?.userEmail || 'otro usuario'}. La cotización ha pasado a modo lectura.`,
            { duration: 8000 }
          );
        }
      } catch (err) {
        console.error('Error in quote lock heartbeat:', err);
      }
    }, 25000);

    const handleBeforeUnload = () => {
      fetch(`${API_URL}/quotes/${initialQuote.id}/lock/release`, {
        method: 'POST',
        headers,
        keepalive: true
      }).catch(() => {});
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      fetch(`${API_URL}/quotes/${initialQuote.id}/lock/release`, {
        method: 'POST',
        headers,
        keepalive: true
      }).catch(() => {});
    };
  }, [initialQuote?.id, initialQuote?.isTemplate, isLockedByOther]);

  const handleTakeover = async () => {
    const editorName = lockOwner?.userEmail || 'otro usuario';
    if (!window.confirm(`¿Estás seguro de tomar el control de edición?\n\nActualmente ${editorName} está editando esta cotización. Si tomas el control, sus cambios posteriores no se guardarán.`)) {
      return;
    }

    setIsTakingOver(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/quotes/${initialQuote.id}/lock/takeover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsLockedByOther(false);
        setLockOwner(null);
        toast.success('Has tomado el control de edición de esta cotización.');
      } else {
        toast.error(data.error || 'No se pudo tomar el control.');
      }
    } catch (err: any) {
      toast.error('Error de conexión al intentar tomar el control.');
    } finally {
      setIsTakingOver(false);
    }
  };

  // Auto-save logic
  React.useEffect(() => {
    if (!initialQuote?.id) return;
    const draftKey = `quoteDraft_${initialQuote.id}`;

    // Si la cotización ya está Aprobada o Enviada, o bloqueada por otro usuario, descartar borrador local
    if (initialQuote.status === 'Aprobado' || initialQuote.status === 'Enviado' || isLockedByOther) {
      localStorage.removeItem(draftKey);
      return;
    }

    const draftStr = localStorage.getItem(draftKey);
    if (draftStr) {
      try {
        const draft = JSON.parse(draftStr);
        // Si el borrador tiene un estado diferente al de la cotización actual, descartarlo
        if (draft.status === 'Aprobado' || draft.status !== initialQuote.status) {
          localStorage.removeItem(draftKey);
          return;
        }

        if (draft && draft.categories) {
          draft.categories = Array.isArray(draft.categories) ? draft.categories.filter(Boolean) : [];
          draft.categories.forEach((cat: any) => {
            cat.items = Array.isArray(cat.items) ? cat.items.filter(Boolean) : [];
            cat.items.forEach((item: any) => {
              if (!item) return;
              item.subItems = ensureImprevistoInSubItems(Array.isArray(item.subItems) ? item.subItems : []);
              item.details = Array.isArray(item.details) ? item.details : [];
            });
          });
        }
        if (JSON.stringify(draft) !== JSON.stringify(quote)) {
          if (window.confirm('Tienes un borrador sin guardar de esta cotización. ¿Deseas restaurarlo?')) {
            setQuote(draft);
          } else {
            localStorage.removeItem(draftKey);
          }
        }
      } catch (e) {
        localStorage.removeItem(draftKey);
      }
    }
  }, [initialQuote?.id, initialQuote?.status, isLockedByOther]);

  React.useEffect(() => {
    if (quote && quote.id) {
      if (quote.status === 'Aprobado' || quote.status === 'Enviado' || isLockedByOther) {
        localStorage.removeItem(`quoteDraft_${quote.id}`);
      } else {
        localStorage.setItem(`quoteDraft_${quote.id}`, JSON.stringify(quote));
      }
    }
  }, [quote, isLockedByOther]);

  const handleSaveAndClearDraft = async (q: any) => {
    if (isLockedByOther) {
      toast.error('No puedes guardar cambios porque otro usuario tiene el control de edición.');
      return;
    }
    const newTotals = calculateTotals();
    const updatedQuote = { ...q, totalClient: newTotals.finalTotalClient };
    setQuote(updatedQuote);
    try {
      await onUpdateGlobal(updatedQuote);
      localStorage.removeItem(`quoteDraft_${q.id}`);
      toast.success('Cotización guardada exitosamente');
    } catch (e) {
      // Error handled by updateQuote
    }
  };

  // Keyboard shortcut Ctrl+S / Cmd+S to save
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!isReadOnly) {
          handleSaveAndClearDraft(quote);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quote, isReadOnly, isLockedByOther]);

  const handleExportPDF = async () => {
    if (!isLockedByOther) {
      const updatedQuote = { ...quote, totalClient: calculateTotals().finalTotalClient };
      setQuote(updatedQuote);
      await onUpdateGlobal(updatedQuote);
    }
    localStorage.removeItem('printQuoteData');
    const foundClient = clientes.find(c => c.id === quote.client || c.empresa === quote.client);
    const clientPart = (foundClient?.empresa || quote.client || '').trim();
    const foundProject = proyectos.find(p => p.id === quote.projectId);
    const reqPart = (quote.requirement || foundProject?.nombre || '').trim();
    window.open(buildQuoteClientUrl(quote.id, clientPart, reqPart, quote.version), '_blank');
  };

  const handleExportExcel = async () => {
    toast.loading('Generando Excel...', { id: 'excel-toast' });
    try {
      if (!isLockedByOther) {
        const updatedQuote = { ...quote, totalClient: calculateTotals().finalTotalClient };
        await onUpdateGlobal(updatedQuote);
      }

      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/quotes/${quote.id}/export-excel`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error en el servidor al generar el Excel');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const foundClient = clientes.find(c => c.id === quote.client || c.empresa === quote.client);
      const clientPart = (foundClient?.empresa || quote.client || '').trim();
      const foundProject = proyectos.find(p => p.id === quote.projectId);
      const reqPart = (quote.requirement || foundProject?.nombre || '').trim();
      let fileBase = 'Cotización';
      if (clientPart && reqPart) {
        fileBase = `Cotización ${clientPart} - ${reqPart}`;
      } else if (clientPart) {
        fileBase = `Cotización ${clientPart}`;
      } else if (reqPart) {
        fileBase = `Cotización ${reqPart}`;
      }
      a.download = `${fileBase.replace(/[\\/:*?"<>|]/g, '_').trim()}.xlsm`;

      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      toast.success('Excel descargado con éxito', { id: 'excel-toast' });
    } catch (err: any) {
      console.error(err);
      toast.error('Error al generar Excel: ' + err.message, { id: 'excel-toast' });
    }
  };

  const handleCopyLink = async () => {
    if (!isLockedByOther) {
      const updatedQuote = { ...quote, totalClient: calculateTotals().finalTotalClient };
      setQuote(updatedQuote);
      await onUpdateGlobal(updatedQuote);
    }
    localStorage.removeItem('printQuoteData');
    const foundClient = clientes.find(c => c.id === quote.client || c.empresa === quote.client);
    const clientPart = (foundClient?.empresa || quote.client || '').trim();
    const foundProject = proyectos.find(p => p.id === quote.projectId);
    const reqPart = (quote.requirement || foundProject?.nombre || '').trim();
    const fullUrl = buildQuoteClientUrl(quote.id, clientPart, reqPart, quote.version);
    navigator.clipboard.writeText(fullUrl);
    toast.success(`¡Enlace copiado!\n${clientPart ? clientPart + ' - ' : ''}${reqPart} (V${quote.version})`);
  };

  const handleOpenEmail = async () => {
    if (!isLockedByOther) {
      const updatedQuote = { ...quote, totalClient: calculateTotals().finalTotalClient };
      setQuote(updatedQuote);
      await onUpdateGlobal(updatedQuote);
    }
    localStorage.removeItem('printQuoteData');
    setIsEmailModalOpen(true);
  };


  const handleUpdateItem = (categoryId: string, itemId: string, fieldOrPatch: string | Partial<QuoteItem>, value?: any) => {
    setQuote(prev => {
      const newQuote = JSON.parse(JSON.stringify(prev));
      const category = newQuote.categories.find((c: any) => c.id === categoryId);
      if (category) {
        const item = category.items.find((i: any) => i.id === itemId);
        if (item) {
          if (typeof fieldOrPatch === 'object' && fieldOrPatch !== null) {
            Object.assign(item, fieldOrPatch);
          } else {
            (item as any)[fieldOrPatch] = value;
          }
        }
      }
      newQuote.categories = recalculateSpecialQuoteItems(newQuote.categories);
      return newQuote;
    });
  };

  const handleUpdateSubItem = (categoryId: string, itemId: string, subId: string, fieldOrData: any, value?: any) => {
    setQuote(prev => {
      const newQuote = JSON.parse(JSON.stringify(prev));
      const category = newQuote.categories.find((c: any) => c.id === categoryId);
      if (category) {
        const item = category.items.find((i: any) => i.id === itemId);
        if (item) {
          const subItem = item.subItems.find((s: any) => s.id === subId);
          if (subItem) {
            if (typeof fieldOrData === 'object' && fieldOrData !== null) {
              Object.assign(subItem, fieldOrData);
            } else {
              (subItem as any)[fieldOrData] = value;
            }
          }
        }
      }
      newQuote.categories = recalculateSpecialQuoteItems(newQuote.categories);
      return newQuote;
    });
  };

  const handleMoveCategory = (categoryId: string, direction: 'up' | 'down') => {
    setQuote(prev => {
      const newQuote = { ...prev };
      const idx = newQuote.categories.findIndex(c => c.id === categoryId);
      if (idx === -1) return prev;
      if (direction === 'up' && idx > 0) {
        [newQuote.categories[idx - 1], newQuote.categories[idx]] = [newQuote.categories[idx], newQuote.categories[idx - 1]];
      } else if (direction === 'down' && idx < newQuote.categories.length - 1) {
        [newQuote.categories[idx + 1], newQuote.categories[idx]] = [newQuote.categories[idx], newQuote.categories[idx + 1]];
      }
      return newQuote;
    });
  };

  const handleMoveItem = (categoryId: string, itemId: string, direction: 'up' | 'down') => {
    setQuote(prev => {
      const newQuote = { ...prev };
      const category = newQuote.categories.find(c => c.id === categoryId);
      if (category) {
        const idx = category.items.findIndex(i => i.id === itemId);
        if (idx === -1) return prev;
        if (direction === 'up' && idx > 0) {
          [category.items[idx - 1], category.items[idx]] = [category.items[idx], category.items[idx - 1]];
        } else if (direction === 'down' && idx < category.items.length - 1) {
          [category.items[idx + 1], category.items[idx]] = [category.items[idx], category.items[idx + 1]];
        }
      }
      return newQuote;
    });
  };

  const handleImportItems = (
    importedItems: ImportedItemPayload[],
    targetOption: ImportTargetOption
  ) => {
    if (!importedItems || importedItems.length === 0) return;

    setQuote(prev => {
      const nextCategories: QuoteCategory[] = (prev.categories || []).map(cat => ({
        ...cat,
        items: [...cat.items]
      }));

      const cloneItem = (item: any, sourceQuoteDate?: string, sourceProjectName?: string): QuoteItem => {
        if (!item) {
          return {
            id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: 'Nuevo Ítem',
            quantity: 1,
            dates: 1,
            details: [],
            subItems: [],
            internalMultiplierPercent: 10,
            financialExpensePercent: 10,
            providerContact: '',
            productionTime: ''
          };
        }
        return {
          ...item,
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: item.name || 'Nuevo Ítem',
          sourceQuoteDate: sourceQuoteDate || item.sourceQuoteDate,
          sourceProjectName: sourceProjectName || item.sourceProjectName,
          quantity: Number(item.quantity || 1),
          dates: Number(item.dates || 1),
          details: Array.isArray(item.details) ? [...item.details] : [],
          subItems: ensureImprevistoInSubItems(
            (Array.isArray(item.subItems) ? item.subItems : []).filter(Boolean).map((sub: any) => ({
              ...sub,
              id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              name: sub?.name || '',
              description: sub?.description || '',
              quantity: Number(sub?.quantity || 1),
              dates: Number(sub?.dates || 1),
              unitCost: Number(sub?.unitCost || 0),
              providerName: sub?.providerName || '',
              providerId: sub?.providerId || ''
            }))
          ),
          internalMultiplierPercent: Number(item.internalMultiplierPercent ?? 10),
          financialExpensePercent: Number(item.financialExpensePercent ?? 10),
          providerContact: item.providerContact || '',
          productionTime: item.productionTime || ''
        };
      };

      if (targetOption.mode === 'new' && targetOption.newCategoryName?.trim()) {
        const catName = targetOption.newCategoryName.trim().toUpperCase();
        nextCategories.push({
          id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: catName,
          items: importedItems.filter(p => Boolean(p?.item)).map(p => cloneItem(p.item, p.sourceQuoteDate, p.sourceProjectName))
        });
        return { ...prev, categories: recalculateSpecialQuoteItems(nextCategories) };
      }

      if (targetOption.mode === 'existing' && targetOption.targetCategoryId) {
        const targetIndex = nextCategories.findIndex(c => c.id === targetOption.targetCategoryId);
        if (targetIndex >= 0) {
          nextCategories[targetIndex].items.push(
            ...importedItems.filter(p => Boolean(p?.item)).map(p => cloneItem(p.item, p.sourceQuoteDate, p.sourceProjectName))
          );
          return { ...prev, categories: recalculateSpecialQuoteItems(nextCategories) };
        }
      }

      // Default: mode === 'origin' (Agrupa ítems por su categoría original en la cotización origen)
      const groups: Record<string, QuoteItem[]> = {};
      importedItems.forEach(({ item, categoryName, sourceQuoteDate, sourceProjectName }) => {
        if (!item) return;
        const catName = (categoryName || 'GENERAL').trim().toUpperCase();
        if (!groups[catName]) groups[catName] = [];
        groups[catName].push(cloneItem(item, sourceQuoteDate, sourceProjectName));
      });

      Object.entries(groups).forEach(([catName, itemsToAdd]) => {
        const existingCat = nextCategories.find(c => c.name.trim().toUpperCase() === catName);
        if (existingCat) {
          existingCat.items.push(...itemsToAdd);
        } else {
          nextCategories.push({
            id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: catName,
            items: itemsToAdd
          });
        }
      });

      return { ...prev, categories: nextCategories };
    });

    toast.success(`Se importaron ${importedItems.length} ítem${importedItems.length > 1 ? 's' : ''} correctamente`);
  };

  const handleAIImport = (aiCategories: any[], mode: 'add' | 'replace') => {
    setQuote(prev => {
      const newQuote = JSON.parse(JSON.stringify(prev));
      const mapped = aiCategories.map((cat: any) => ({
        id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: cat.name,
        items: (cat.items || []).map((item: any) => ({
          id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          name: item.name,
          quantity: item.quantity ?? 1,
          dates: item.dates ?? 1,
          details: Array.isArray(item.details) ? item.details : [],
          internalMultiplierPercent: 10,
          financialExpensePercent: 10,
          providerContact: '',
          productionTime: '',
          subItems: ensureImprevistoInSubItems(
            (item.subItems || []).map((sub: any) => ({
              id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              name: sub.name || '',
              description: sub.description || '',
              quantity: sub.quantity ?? 1,
              dates: sub.dates ?? 1,
              unitCost: sub.unitCost ?? 0,
              providerName: ''
            }))
          )
        }))
      }));
      if (mode === 'replace') {
        newQuote.categories = recalculateSpecialQuoteItems(preserveQuoteNodeIds(prev.categories || [], mapped));
        toast.success(`Cotización reemplazada: ${mapped.length} categoría${mapped.length !== 1 ? 's' : ''} importada${mapped.length !== 1 ? 's' : ''}`);
      } else {
        newQuote.categories = recalculateSpecialQuoteItems([...newQuote.categories, ...mapped]);
        const totalItems = mapped.reduce((a: number, c: any) => a + c.items.length, 0);
        toast.success(`✨ ${totalItems} ítem${totalItems !== 1 ? 's' : ''} agregado${totalItems !== 1 ? 's' : ''} desde IA`);
      }
      return newQuote;
    });
  };

  const handleExcelImport = (excelCategories: any[], mode: 'add' | 'replace') => {
    setQuote(prev => {
      const newQuote = JSON.parse(JSON.stringify(prev));
      const mapped = excelCategories.map((cat: any) => ({
        id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: cat.name || 'Categoría',
        items: (cat.items || []).map((item: any) => ({
          id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          name: item.name || 'Ítem',
          quantity: Number(item.quantity) || 1,
          dates: Number(item.dates) || 1,
          details: Array.isArray(item.details) ? item.details : [],
          internalMultiplierPercent: Number(item.internalMultiplierPercent) || 10,
          financialExpensePercent: Number(item.financialExpensePercent) || 10,
          providerContact: item.providerContact || '',
          productionTime: item.productionTime || '',
          subItems: ensureImprevistoInSubItems(
            (item.subItems || []).map((sub: any) => ({
              id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              name: sub.name || '',
              description: sub.description || '',
              quantity: Number(sub.quantity) || 1,
              dates: Number(sub.dates) || 1,
              unitCost: Number(sub.unitCost) || 0,
              providerName: sub.providerName || '',
              providerId: sub.providerId || ''
            }))
          )
        }))
      }));

      if (mode === 'replace') {
        newQuote.categories = recalculateSpecialQuoteItems(preserveQuoteNodeIds(prev.categories || [], mapped));
        toast.success(`Cotización actualizada: ${mapped.length} categoría(s) importada(s) desde Excel`);
      } else {
        newQuote.categories = recalculateSpecialQuoteItems([...(newQuote.categories || []), ...mapped]);
        const totalItems = mapped.reduce((a: number, c: any) => a + c.items.length, 0);
        toast.success(`📊 ${totalItems} ítem${totalItems !== 1 ? 's' : ''} agregado${totalItems !== 1 ? 's' : ''} desde Excel`);
      }
      return newQuote;
    });
  };

  const handleAddCategory = () => {
    setQuote(prev => ({
      ...prev,
      categories: [
        ...prev.categories,
        {
          id: `cat-${Date.now()}`,
          name: 'NUEVA CATEGORÍA',
          items: []
        }
      ]
    }));
  };

  const handleDeleteCategory = (categoryId: string) => {
    if (window.confirm('¿Estás seguro de eliminar esta categoría y todos sus ítems?')) {
      setQuote(prev => ({
        ...prev,
        categories: recalculateSpecialQuoteItems(prev.categories.filter(c => c.id !== categoryId))
      }));
    }
  };

  const handleAddItem = (categoryId?: string, isSpecial = false) => {
    setQuote(prev => {
      const newQuote = JSON.parse(JSON.stringify(prev)); // Deep clone
      
      if (newQuote.categories.length === 0) {
        const defaultCat = {
          id: `cat-${Date.now()}`,
          name: 'GENERAL',
          items: []
        };
        newQuote.categories.push(defaultCat);
      }

      let targetCategoryId = categoryId;
      if (!targetCategoryId) {
        targetCategoryId = newQuote.categories[newQuote.categories.length - 1].id;
      }
      
      const cat = newQuote.categories.find((c: any) => c.id === targetCategoryId);
      if (cat) {
        const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        cat.items.push({
          id: `item-${uid}`,
          name: isSpecial ? 'APDAYC / Servicio Porcentual' : 'Nuevo Ítem',
          quantity: 1,
          dates: 1,
          details: [isSpecial ? 'Gestión / Derechos porcentuales sobre ítems seleccionados' : 'Detalle 1'],
          internalMultiplierPercent: isSpecial ? 0 : 10,
          financialExpensePercent: isSpecial ? 0 : 10,
          isSpecial,
          specialRatePercent: isSpecial ? 10 : undefined,
          specialSourceItemIds: [],
          providerContact: '',
          productionTime: '',
          subItems: [
            ...(isSpecial ? [{
              id: `sub-sp-${uid}`,
              name: 'APDAYC / Servicio Porcentual',
              description: '',
              quantity: 1,
              dates: 1,
              unitCost: 0,
              providerName: '',
              providerId: ''
            }] : []),
            {
              id: `sub-${uid}-imprevisto`,
              name: 'Imprevistos',
              quantity: 1,
              dates: 1,
              unitCost: 0,
              providerName: '',
              providerId: ''
            }
          ]
        });
      }
      newQuote.categories = recalculateSpecialQuoteItems(newQuote.categories);
      return newQuote;
    });
  };

  const handleDeleteItem = (categoryId: string, itemId: string) => {
    if (window.confirm('¿Estás seguro de eliminar este ítem?')) {
      setQuote(prev => {
        const newQuote = JSON.parse(JSON.stringify(prev));
        const category = newQuote.categories.find((c: any) => c.id === categoryId);
        if (category) {
          category.items = category.items.filter((i: any) => i.id !== itemId);
        }
        newQuote.categories = recalculateSpecialQuoteItems(newQuote.categories);
        return newQuote;
      });
    }
  };

  const handleAddSubItem = (categoryId: string, itemId: string) => {
    setQuote(prev => {
      const newQuote = JSON.parse(JSON.stringify(prev));
      const category = newQuote.categories.find((c: any) => c.id === categoryId);
      if (category) {
        const item = category.items.find((i: any) => i.id === itemId);
        if (item) {
          const newSubItem = {
            id: `sub-${Date.now()}`,
            name: 'Nuevo Sub-ítem',
            quantity: 1,
            dates: 1,
            unitCost: 0,
            providerName: '',
            providerId: ''
          };
          // Insertar siempre antes de la fila de 'Imprevistos' para que este quede al fondo
          const imprevistoIndex = item.subItems.findIndex((s: any) => (s.name || '').trim().toLowerCase().includes('imprevisto'));
          if (imprevistoIndex !== -1) {
            item.subItems.splice(imprevistoIndex, 0, newSubItem);
          } else {
            item.subItems.push(newSubItem);
          }
        }
      }
        newQuote.categories = recalculateSpecialQuoteItems(newQuote.categories);
      return newQuote;
    });
  };

  const handleDeleteSubItem = (categoryId: string, itemId: string, subId: string) => {
    if (window.confirm('¿Estás seguro de eliminar este sub-ítem?')) {
      setQuote(prev => {
        const newQuote = JSON.parse(JSON.stringify(prev));
        const category = newQuote.categories.find((c: any) => c.id === categoryId);
        if (category) {
          const item = category.items.find((i: any) => i.id === itemId);
          if (item) {
            item.subItems = item.subItems.filter((s: any) => s.id !== subId);
          }
        }
        newQuote.categories = recalculateSpecialQuoteItems(newQuote.categories);
        return newQuote;
      });
    }
  };

  const handleWorkflowAction = async (newStatus: string, _actionName?: string, _details?: string) => {
    const updated = { ...quote, status: newStatus, totalClient: calculateTotals().finalTotalClient };
    setQuote(updated);
    localStorage.removeItem(`quoteDraft_${quote.id}`);
    // Para asegurar que se guarda y cambia el estado usando la prop global que muestra el overlay
    await onUpdateGlobal(updated);

    if (newStatus === 'Aprobado') {
      toast.success('¡Cotización aprobada por Directorio! Puedes generar las órdenes de compra ahora mismo.', {
        icon: '🎉',
        duration: 5000
      });
      setIsGenerateOrdersModalOpen(true);
      return; // No salir de la pantalla para que pueda generar las órdenes ahí mismo
    }

    onBack(); // Salir después de la acción
  };

  return (
    <div className="animate-fade-in quote-builder-wrapper">
      {/* Soft Lock Warning Banner */}
      {isLockedByOther && (
        <div style={{
          backgroundColor: '#fffbeb',
          border: '1px solid #fde68a',
          borderLeft: '5px solid #f59e0b',
          borderRadius: '8px',
          padding: '12px 18px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.4rem' }}>🔒</span>
            <div>
              <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.95rem' }}>
                Cotización en modo de solo lectura
              </div>
              <div style={{ fontSize: '0.84rem', color: '#b45309', marginTop: '2px' }}>
                Actualmente está siendo editada por <strong>{lockOwner?.userEmail || 'otro usuario'}</strong>
                {lockOwner?.userRole ? ` (${lockOwner.userRole})` : ''}
                {lockOwner?.lockedAt ? ` desde hace ${formatLockDuration(lockOwner.lockedAt)}.` : '.'}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleTakeover}
            disabled={isTakingOver}
            style={{
              borderColor: '#f59e0b',
              color: '#92400e',
              backgroundColor: '#fef3c7',
              fontWeight: 600,
              fontSize: '0.85rem',
              padding: '8px 16px',
              cursor: isTakingOver ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isTakingOver ? 'Tomando control...' : '⚡ Tomar control de edición'}
          </button>
        </div>
      )}

      {/* TOP HEADER: TITLE ON LEFT, ACTIONS ON RIGHT */}
      <div className="quote-builder-top-header">
        <div className="quote-header-left">
          <button className="btn-icon quote-back-btn" onClick={onBack} title="Volver al Listado">
            <ArrowLeft size={20} />
          </button>
          <div className="quote-title-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={quote.isTemplate ? (quote.templateName || '') : (quote.requirement || '')}
                onChange={(e) => setQuote(prev => (
                  quote.isTemplate 
                    ? { ...prev, templateName: e.target.value }
                    : { ...prev, requirement: e.target.value }
                ))}
                placeholder={quote.isTemplate ? "Nombre de la Plantilla" : "Nombre de la Cotización"}
                className="quote-name-input"
                title={isReadOnly ? "Modo Lectura" : "Haz clic para editar el nombre"}
                readOnly={isReadOnly}
              />
              <span className="quote-version-badge" title="Versión de cotización">
                V{quote.version || 1}
              </span>
              {quote.status && (
                <span className="quote-status-badge">
                  {quote.status}
                </span>
              )}
              {isReadOnly && (
                <div style={{ padding: '3px 8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                  🔒 {isLockedByOther ? 'En edición por otro usuario' : 'Lectura'}
                </div>
              )}
            </div>
            {quote.client && (
              <p className="quote-client-sub" style={{ color: 'var(--text-muted)', margin: '3px 0 0 0', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Building2 size={13} style={{ opacity: 0.7 }} />
                <span>{getClientName(quote.projectId, quote.client)}</span>
              </p>
            )}
          </div>
        </div>

        {/* TOP ACTIONS ALIGNED TO RIGHT (Workflow Buttons Only) */}
        <div className="quote-header-right-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* BOTÓN GENERAR ÓRDENES DE COMPRA DIRECTO */}
          <button
            type="button"
            onClick={() => setIsGenerateOrdersModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              background: (quote.status || '').toLowerCase().includes('aprob')
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.08) 100%)',
              border: (quote.status || '').toLowerCase().includes('aprob')
                ? 'none'
                : '1.5px solid rgba(16, 185, 129, 0.4)',
              color: (quote.status || '').toLowerCase().includes('aprob') ? '#fff' : '#059669',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: (quote.status || '').toLowerCase().includes('aprob')
                ? '0 3px 10px rgba(16, 185, 129, 0.35)'
                : '0 2px 8px rgba(16, 185, 129, 0.12)'
            }}
            title="Generar Órdenes de Compra y Servicio directamente desde los ítems de esta cotización"
          >
            <Package size={15} />
            <span>Generar Órdenes</span>
            {(quote.status || '').toLowerCase().includes('aprob') && (
              <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.25)', padding: '1px 5px', borderRadius: '4px' }}>
                Aprobada
              </span>
            )}
          </button>

          {/* BOTÓN CONSULTAR BRIEF IA */}
          <button
            type="button"
            onClick={() => setIsBriefDrawerOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(99, 102, 241, 0.12) 100%)',
              border: '1.5px solid rgba(139, 92, 246, 0.4)',
              color: '#7c3aed',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 8px rgba(139, 92, 246, 0.12)'
            }}
            title="Abrir panel lateral con el Brief del cliente, requerimientos técnicos y transcripción"
          >
            <Sparkles size={14} color="#8b5cf6" />
            <span>Ver Brief IA</span>
          </button>
          {/* WORKFLOW BUTTONS */}
          {(!isReadOnly || currentUserRole === 'Cuentas' || currentUserRole === 'Directorio') && (
            <div className="mobile-workflow-group" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {!isReadOnly && currentUserRole === 'Producción' && (
                <button className="btn-primary" onClick={() => handleWorkflowAction('Revisión Cuentas', 'Enviar a Cuentas', 'Enviado para revisión de Cuentas')} style={{ backgroundColor: 'var(--accent-primary)', padding: '6px 14px', fontSize: '0.85rem' }}>
                  Enviar a Cuentas
                </button>
              )}
              {!isReadOnly && currentUserRole === 'Cuentas' && (
                <>
                  <button className="btn-primary" onClick={() => handleWorkflowAction('Revisión Directorio', 'Aprobar y Enviar', 'Cuentas aprobó y envió a Directorio')} style={{ backgroundColor: 'var(--success)', padding: '6px 14px', fontSize: '0.85rem' }}>
                    Aprobar
                  </button>
                  <button className="btn-secondary" onClick={() => handleWorkflowAction('Rechazado', 'Rechazar', 'Cuentas rechazó a Producción')} style={{ color: 'var(--danger)', borderColor: 'var(--danger)', padding: '6px 14px', fontSize: '0.85rem' }}>
                    Rechazar
                  </button>
                </>
              )}
              {!isReadOnly && currentUserRole === 'Directorio' && (
                <>
                  <button className="btn-primary" onClick={() => handleWorkflowAction('Aprobado', 'Aprobar Final', 'Directorio aprobó la cotización')} style={{ backgroundColor: 'var(--success)', padding: '6px 14px', fontSize: '0.85rem' }}>
                    Aprobar
                  </button>
                  <button className="btn-secondary" onClick={() => handleWorkflowAction('Rechazado', 'Rechazar', 'Directorio rechazó a Producción')} style={{ color: 'var(--danger)', borderColor: 'var(--danger)', padding: '6px 14px', fontSize: '0.85rem' }}>
                    Rechazar
                  </button>
                </>
              )}
              {(currentUserRole === 'Cuentas' || currentUserRole === 'Directorio') && (
                <button className="btn-secondary" onClick={() => handleWorkflowAction('Enviado', 'Marcar Enviado', 'Marcado como Enviado al Cliente')} style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
                  Marcar Enviado
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* QUOTE METADATA & FINANCIAL SUMMARY (2-COLUMN GRID) */}
      <div className="quote-meta-grid">
        {/* LEFT CARD: PROJECT & PARAMETERS (~68% width) */}
        <div className="glass-panel quote-meta-info-card">
          {/* Row 1: Full-width Project Selector */}
          <div className="quote-meta-project-row">
            <span className="quote-meta-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Folder size={14} style={{ color: 'var(--accent-primary)' }} />
              <strong>Proyecto Vinculado</strong>
            </span>
            <SearchableProjectSelect
              proyectos={proyectos}
              clientes={clientes}
              value={quote.projectId || ''}
              onChange={(newProjId) => {
                const proj = proyectos.find(p => p.id === newProjId);
                const cli = proj ? clientes.find(c => c.id === proj.clienteId) : null;
                setQuote(prev => ({
                  ...prev,
                  projectId: newProjId,
                  client: cli ? cli.empresa : (newProjId ? prev.client : ''),
                  businessName: cli ? cli.empresa : (newProjId ? prev.businessName : ''),
                  requirement: prev.requirement
                }));
              }}
              disabled={isReadOnly}
              placeholder="Buscar o asignar un proyecto..."
            />
          </div>

          {/* Row 2: 4-Column Metadata Parameters Grid */}
          <div className="quote-params-grid">
            <div className="quote-param-col">
              <span className="quote-meta-label">RUC</span>
              {isReadOnly ? (
                <div className="quote-param-box">
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{quote.ruc || 'Sin RUC'}</span>
                </div>
              ) : (
                <input
                  type="text"
                  value={quote.ruc || ''}
                  onChange={(e) => setQuote(prev => ({ ...prev, ruc: e.target.value }))}
                  placeholder="RUC del Cliente"
                  className="quote-project-select quote-param-input"
                  style={{ height: '36px', fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 600 }}
                />
              )}
            </div>

            <div className="quote-param-col">
              <span className="quote-meta-label">Fecha Emisión</span>
              {isReadOnly ? (
                <div className="quote-param-box">
                  <span>{quote.date || new Date().toLocaleDateString('es-PE')}</span>
                </div>
              ) : (
                <input
                  type="text"
                  value={quote.date || ''}
                  onChange={(e) => setQuote(prev => ({ ...prev, date: e.target.value }))}
                  placeholder="DD/MM/AAAA"
                  className="quote-project-select quote-param-input"
                  style={{ height: '36px', fontSize: '0.85rem' }}
                />
              )}
            </div>

            <div className="quote-param-col">
              <span className="quote-meta-label">Condiciones de Pago</span>
              {isReadOnly ? (
                <div className="quote-param-box" title={quote.paymentConditions}>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                    {quote.paymentConditions || '30 días de crédito.'}
                  </span>
                </div>
              ) : (
                <select
                  value={quote.paymentConditions || '30 días de crédito.'}
                  onChange={(e) => setQuote(prev => ({ ...prev, paymentConditions: e.target.value }))}
                  className="quote-project-select quote-param-select"
                  style={{ height: '36px', fontSize: '0.82rem', width: '100%' }}
                >
                  {PAYMENT_CONDITIONS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt} style={{ color: 'black' }}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="quote-param-col">
              <span className="quote-meta-label">Moneda & Visualizar IGV</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <div className="quote-toggle-group">
                    <button
                      type="button"
                      className={`quote-toggle-btn ${quote.currency !== 'USD' ? 'active' : ''}`}
                      onClick={() => !isReadOnly && setQuote(prev => ({ ...prev, currency: 'PEN' }))}
                      disabled={isReadOnly}
                    >
                      S/ Soles
                    </button>
                    <button
                      type="button"
                      className={`quote-toggle-btn ${quote.currency === 'USD' ? 'active' : ''}`}
                      onClick={() => !isReadOnly && setQuote(prev => ({ ...prev, currency: 'USD' }))}
                      disabled={isReadOnly}
                    >
                      $ Dólares
                    </button>
                  </div>

                  <div className="quote-toggle-group">
                    <button
                      type="button"
                      className={`quote-toggle-btn ${!quote.includeIgv ? 'active' : ''}`}
                      onClick={() => !isReadOnly && setQuote(prev => ({ ...prev, includeIgv: false }))}
                      disabled={isReadOnly}
                    >
                      Sin IGV
                    </button>
                    <button
                      type="button"
                      className={`quote-toggle-btn ${quote.includeIgv ? 'active' : ''}`}
                      onClick={() => !isReadOnly && setQuote(prev => ({ ...prev, includeIgv: true }))}
                      disabled={isReadOnly}
                    >
                      Con IGV
                    </button>
                  </div>
                </div>

                {quote.currency === 'USD' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(102, 45, 145, 0.08)', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(102, 45, 145, 0.2)' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#662D91' }}>T.C. S/</span>
                    <input
                      type="number"
                      step="0.001"
                      min="0.01"
                      value={quote.exchangeRate ?? 3.75}
                      onChange={(e) => setQuote(prev => ({ ...prev, exchangeRate: parseFloat(e.target.value) || 0 }))}
                      disabled={isReadOnly}
                      className="quote-project-select"
                      style={{ width: '70px', padding: '2px 6px', fontSize: '0.8rem', fontWeight: 700, textAlign: 'center', backgroundColor: '#fff', height: '26px' }}
                      placeholder="3.75"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT CARD: FINANCIAL & RENTABILIDAD SUMMARY (~32% width) */}
        <div className="glass-panel quote-meta-finance-card">
          <div className="quote-finance-total-wrapper">
            <span className="quote-meta-label" style={{ fontWeight: 600, letterSpacing: '0.5px' }}>
              {quote.includeIgv ? 'TOTAL (CON IGV)' : 'TOTAL (SIN IGV)'}
            </span>
            <div className="quote-finance-total-amount">
              {currencySymbol} {displayedHeaderTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {solesEquivalent !== null && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px', fontWeight: 600 }}>
                ≈ S/ {solesEquivalent.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} al cambio
              </div>
            )}
          </div>

          <div className="quote-finance-divider" />

          {/* WIDGET RENTABILIDAD PURPLE BTL */}
          <div className="quote-meta-margin">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#662D91', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Rentabilidad
              </span>
              <span 
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: isIdealMargin ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: isIdealMargin ? '#059669' : '#d97706',
                  border: `1px solid ${isIdealMargin ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                }}
                title="Criterio oficial Purple BTL: Ideal Mark Down mayor a 25%"
              >
                {isIdealMargin ? '✓ Ideal ≥ 25%' : '⚠ Ideal > 25%'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 12px', fontSize: '0.8rem', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Margen ({currencySymbol}):</span>
              <span style={{ fontWeight: 700, textAlign: 'right', color: marginAmount >= 0 ? 'var(--text-primary)' : 'var(--danger)' }}>
                {currencySymbol} {marginAmount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>

              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Mark Up %:</span>
              <span style={{ fontWeight: 700, textAlign: 'right', color: '#662D91' }}>
                {markUpPercent.toFixed(2)}%
              </span>

              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Mark Down %:</span>
              <span style={{ fontWeight: 700, textAlign: 'right', color: isIdealMargin ? '#059669' : '#d97706' }}>
                {markDownPercent.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel table-container quote-detail-container" style={{ marginBottom: '24px' }}>
        <div className="quote-detail-header" style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)', margin: 0 }}>Detalle de Cotización</h3>
          {!isReadOnly && (
            <div className="quote-detail-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button className="btn-secondary" onClick={handleAddCategory} style={{ padding: '6px 12px', fontSize: '0.85rem' }}><Plus size={16} /> + Categoría</button>
              <button
                className="btn-secondary"
                onClick={() => handleAddItem(undefined, true)}
                style={{ padding: '6px 12px', fontSize: '0.85rem', borderColor: '#818cf8', color: '#4338ca', backgroundColor: '#eef2ff' }}
                title="Agregar Ítem Especial que suma otros ítems (APDAYC, UNIMPRO, etc.)"
              >
                <Zap size={15} /> + Ítem Especial
              </button>
              <button className="btn-primary" onClick={() => handleAddItem()} style={{ padding: '6px 12px', fontSize: '0.85rem' }}><Plus size={16} /> + Ítem</button>
            </div>
          )}
        </div>
        <div style={isReadOnly ? { pointerEvents: 'none', opacity: 0.9 } : {}}>
          {!isMobile ? (
        <table className="data-table">
          <thead>
            <tr>
              <th className="header-custom" style={{ width: '4%' }}>N°</th>
              <th className="header-custom" style={{ width: '6%' }}>CANT.</th>
              <th className="header-custom" style={{ width: '5%' }}>FECHAS</th>
              <th className="header-custom" style={{ width: '24%' }}>DETALLE DE LA<br/>COTIZACIÓN</th>
              <th className="header-custom" style={{ width: '9%' }}>COSTO X ITEM<br/>PROVEEDORES</th>
              <th className="header-custom" style={{ width: '9%' }}>COSTO TOTAL<br/>PROVEEDORES</th>
              <th className="header-custom" style={{ width: '8%' }}>MULTIPLICADOR %<br/>INTERNO</th>
              <th className="header-custom" style={{ width: '8%' }}>% INTERNO</th>
              <th className="header-custom" style={{ width: '8%' }}>GASTO FINANCIERO<br/>%</th>
              <th className="header-custom" style={{ width: '9%' }}>COSTO X ITEM<br/>CLIENTE</th>
              <th className="header-custom" style={{ width: '9%' }}>COSTO TOTAL<br/>CLIENTE</th>
              <th className="header-custom" style={{ width: '4%' }}></th>
            </tr>
          </thead>
          <tbody>
            {(quote.categories || []).map((category) => (
              <React.Fragment key={category.id}>
                <tr className="bg-gray-50 border-b border-gray-200" style={{ backgroundColor: 'rgba(0,0,0,0.03)' }}>
                  <td colSpan={12} style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-primary)', fontWeight: 'bold', padding: '12px 24px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <input 
                          type="text" 
                          value={category.name}
                          onChange={(e) => {
                            setQuote(prev => ({
                              ...prev,
                              categories: prev.categories.map(c => c.id === category.id ? { ...c, name: e.target.value } : c)
                            }));
                          }}
                          style={{ background: 'transparent', border: '1px solid transparent', color: 'inherit', fontWeight: 'bold', fontSize: 'var(--text-base)', width: '280px', outline: 'none' }}
                        />
                        <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', background: 'rgba(255,255,255,0.1)' }} onClick={() => handleAddItem(category.id)}>
                          + Ítem
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', background: '#eef2ff', color: '#4338ca', borderColor: '#c7d2fe' }}
                          onClick={() => handleAddItem(category.id, true)}
                          title="Añadir Ítem Especial (% sobre ítems)"
                        >
                          <Zap size={12} /> + Ítem Especial
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn-icon" onClick={() => handleMoveCategory(category.id, 'up')} title="Subir Categoría">▲</button>
                        <button className="btn-icon" onClick={() => handleMoveCategory(category.id, 'down')} title="Bajar Categoría">▼</button>
                        <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteCategory(category.id)} title="Eliminar Categoría"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </td>
                </tr>
                {(category.items || []).filter(Boolean).map((item, index) => (
                  <QuoteItemRow 
                    key={item?.id || index} 
                    item={item} 
                    index={index} 
                    currency={quote.currency || 'PEN'}
                    allCategories={quote.categories}
                    providerCostMap={totals.providerCostMap}
                    onUpdateItem={(itemId, fieldOrPatch, value) => handleUpdateItem(category.id, itemId, fieldOrPatch, value)}
                    onUpdateSubItem={(itemId, subId, field, value) => handleUpdateSubItem(category.id, itemId, subId, field, value)}
                    onMoveItem={(itemId, direction) => handleMoveItem(category.id, itemId, direction)}
                    onDeleteItem={(itemId) => handleDeleteItem(category.id, itemId)}
                    onAddSubItem={(itemId) => handleAddSubItem(category.id, itemId)}
                    onDeleteSubItem={(itemId, subId) => handleDeleteSubItem(category.id, itemId, subId)}
                  />
                ))}
              </React.Fragment>
            ))}
            
            {/* Totals section */}
            <tr className="totals-row" style={{ backgroundColor: '#662D91', color: 'white', fontWeight: 'bold' }}>
              <td colSpan={5} style={{ textAlign: 'right', padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>Sub Total (Sin IGV)</td>
              <td className="td-custom text-right" style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>{currencySymbol} {totals.subTotalProviders.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
              <td colSpan={4} style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}></td>
              <td className="td-custom text-right" style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>{currencySymbol} {totals.subTotalClient.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}></td>
            </tr>
            <tr className="totals-row" style={{ backgroundColor: '#662D91', color: 'white', fontWeight: 'bold' }}>
              <td colSpan={5} style={{ textAlign: 'right', padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>Fee de Agencia (12%)</td>
              <td style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}></td>
              <td colSpan={4} style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}></td>
              <td className="td-custom text-right" style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>{currencySymbol} {totals.feeAgencia.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}></td>
            </tr>
            <tr className="totals-row" style={{ backgroundColor: '#000000', color: 'white', fontWeight: 'bold' }}>
              <td colSpan={5} style={{ textAlign: 'right', padding: '12px 24px' }}>Total (Sin IGV)</td>
              <td className="td-custom text-right">{currencySymbol} {totals.subTotalProviders.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
              <td colSpan={4}></td>
              <td className="td-custom text-right">{currencySymbol} {totals.finalTotalClient.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td></td>
            </tr>
            {quote.includeIgv && (
              <>
                <tr className="totals-row" style={{ backgroundColor: '#4a154b', color: 'white', fontWeight: 'bold' }}>
                  <td colSpan={5} style={{ textAlign: 'right', padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.2)' }}>IGV (18%)</td>
                  <td colSpan={5} style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}></td>
                  <td className="td-custom text-right" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}>{currencySymbol} {igvAmount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}></td>
                </tr>
                <tr className="totals-row" style={{ backgroundColor: '#662D91', color: 'white', fontWeight: 'bold', fontSize: '1.05rem' }}>
                  <td colSpan={5} style={{ textAlign: 'right', padding: '14px 24px' }}>TOTAL CON IGV</td>
                  <td colSpan={5}></td>
                  <td className="td-custom text-right">{currencySymbol} {totalWithIgv.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td></td>
                </tr>
              </>
            )}
            {quote.currency === 'USD' && (
              <tr className="totals-row" style={{ backgroundColor: 'rgba(102, 45, 145, 0.08)', color: '#662D91', fontWeight: 'bold' }}>
                <td colSpan={5} style={{ textAlign: 'right', padding: '12px 24px', borderTop: '1px dashed #662D91' }}>
                  Subtotal Proyecto al cambio en Soles (T.C. {exchangeRate.toFixed(3)})
                </td>
                <td colSpan={5} style={{ borderTop: '1px dashed #662D91' }}></td>
                <td className="td-custom text-right" style={{ borderTop: '1px dashed #662D91', color: '#662D91', fontSize: '1rem' }}>
                  S/ {(totals.finalTotalClient * exchangeRate).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td style={{ borderTop: '1px dashed #662D91' }}></td>
              </tr>
            )}
          </tbody>
        </table>
        ) : (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {(quote.categories || []).map((category) => (
              <div key={category.id} className="glass-panel" style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <input 
                    type="text" 
                    value={category.name}
                    onChange={(e) => {
                      setQuote(prev => ({
                        ...prev,
                        categories: prev.categories.map(c => c.id === category.id ? { ...c, name: e.target.value } : c)
                      }));
                    }}
                    style={{ background: 'transparent', border: '1px dashed transparent', color: 'var(--accent-primary)', fontWeight: 'bold', fontSize: '1.1rem', width: '70%', outline: 'none' }}
                  />
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn-icon" onClick={() => handleMoveCategory(category.id, 'up')}>▲</button>
                    <button className="btn-icon" onClick={() => handleMoveCategory(category.id, 'down')}>▼</button>
                    <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteCategory(category.id)}><Trash2 size={16} /></button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {category.items.length === 0 && <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No hay ítems.</p>}
                  
                  {(category.items || []).filter(Boolean).map((item) => (
                    <div 
                      key={item?.id} 
                      onClick={() => setMobileEditItem({ categoryId: category.id, item })}
                      style={{ 
                        padding: '12px', 
                        backgroundColor: item.isSpecial ? '#f5f7ff' : 'var(--bg-secondary)', 
                        borderRadius: '8px',
                        border: item.isSpecial ? '1px solid #c7d2fe' : '1px solid rgba(0,0,0,0.05)',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span>{item.name || 'Nuevo Ítem sin nombre'}</span>
                        {item.isSpecial && (
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, backgroundColor: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', padding: '1px 6px', borderRadius: '4px' }}>
                            ⚡ {item.specialRatePercent ?? 10}% s/ {(item.specialSourceItemIds || []).length} ítems
                          </span>
                        )}
                        {item.sourceQuoteDate && (<span style={{ fontSize: '0.72rem', backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: '4px' }}>📅 Cotizado: {item.sourceQuoteDate}</span>)}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Cant: {item.quantity} | Días: {item.dates}</span>
                        <span style={{ fontWeight: 'bold', fontVariantNumeric: 'tabular-nums', color: 'var(--success)' }}>
                          {currencySymbol} {computeQuoteItemFinancials(item, totals.providerCostMap).totalClient.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <button className="btn-secondary" style={{ flex: 1, minHeight: '44px', justifyContent: 'center', padding: '10px', color: 'var(--accent-primary)' }} onClick={() => handleAddItem(category.id)}>
                      <Plus size={18} /> Añadir Ítem
                    </button>
                    <button className="btn-secondary" style={{ flex: 1, minHeight: '44px', justifyContent: 'center', padding: '10px', color: '#4338ca', borderColor: '#c7d2fe', backgroundColor: '#eef2ff' }} onClick={() => handleAddItem(category.id, true)}>
                      <Zap size={16} /> Especial (%)
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <div className="glass-panel" style={{ padding: '16px', backgroundColor: '#662D91', color: 'white', marginTop: '8px', borderRadius: 'var(--radius-md)', width: '100%', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '8px' }}>
                <span>Sub Total Prov:</span>
                <span>{currencySymbol} {totals.subTotalProviders.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '8px' }}>
                <span>Fee (12%):</span>
                <span>{currencySymbol} {totals.feeAgencia.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 'bold', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '8px', marginTop: '8px' }}>
                <span>Total (Sin IGV):</span>
                <span>{currencySymbol} {totals.finalTotalClient.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
              </div>
              {quote.includeIgv && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginTop: '8px' }}>
                    <span>IGV (18%):</span>
                    <span>{currencySymbol} {igvAmount.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 'bold', borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '8px', marginTop: '8px' }}>
                    <span>Total Con IGV:</span>
                    <span>{currencySymbol} {totalWithIgv.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                  </div>
                </>
              )}
              {quote.currency === 'USD' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#fbcfe8', marginTop: '8px', borderTop: '1px dashed rgba(255,255,255,0.3)', paddingTop: '6px' }}>
                  <span>Al cambio en Soles (T.C. {exchangeRate.toFixed(3)}):</span>
                  <span style={{ fontWeight: 'bold' }}>S/ {(totals.finalTotalClient * exchangeRate).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#e9d5ff', marginTop: '8px', borderTop: '1px dashed rgba(255,255,255,0.25)', paddingTop: '6px' }}>
                <span>Margen ({currencySymbol}):</span>
                <span style={{ fontWeight: 'bold' }}>{currencySymbol} {marginAmount.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#e9d5ff', marginTop: '4px' }}>
                <span>Mark Up %:</span>
                <span style={{ fontWeight: 'bold' }}>{markUpPercent.toFixed(2)}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: isIdealMargin ? '#86efac' : '#fde047', marginTop: '4px' }}>
                <span>Mark Down %:</span>
                <span style={{ fontWeight: 'bold' }}>{markDownPercent.toFixed(2)}% {isIdealMargin ? '✓ (Ideal ≥ 25%)' : '(Ideal > 25%)'}</span>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Sticky Mobile Totals Bar */}
      <div className="mobile-quote-sticky-footer">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Total Venta</span>
          <span style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
            {currencySymbol} {totals.finalTotalClient.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '4px 8px',
            borderRadius: '6px',
            background: isIdealMargin ? 'rgba(34, 197, 94, 0.25)' : 'rgba(234, 179, 8, 0.25)',
            color: isIdealMargin ? '#86efac' : '#fde047',
            border: isIdealMargin ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(234, 179, 8, 0.4)'
          }}>
            Margen: {markDownPercent.toFixed(1)}%
          </div>
          {!isReadOnly && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleSaveAndClearDraft(quote)}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                backgroundColor: '#ffffff',
                color: 'var(--accent-primary)',
                fontWeight: 700,
                border: 'none',
                borderRadius: '6px'
              }}
            >
              Guardar
            </button>
          )}
        </div>
      </div>

      {/* FLOATING ACTION CLUSTER (Portaled to document.body so it always floats on the viewport) */}
      {createPortal(
        <div className="quote-fab-cluster" role="toolbar" aria-label="Acciones de cotización">
          {/* Primary Action Button: GUARDAR (Visible Siempre abajo, alineado con el botón del chat) */}
          {!isReadOnly && (
            <div className="quote-fab-item">
              <span className="quote-fab-tooltip">Guardar Cotización (Ctrl+S)</span>
              <button
                type="button"
                className="quote-fab-btn quote-fab-btn-primary quote-fab-pulse"
                onClick={() => handleSaveAndClearDraft(quote)}
                title="Guardar Cotización (Ctrl+S)"
              >
                <Save size={20} />
              </button>
            </div>
          )}

          {/* Secondary Tool Actions (Expand upwards) */}
          {isFloatingActionsExpanded && (
            <div className="quote-fab-secondary-group animate-fade-in">
              {/* Asistente IA */}
              {!isReadOnly && (
                <div className="quote-fab-item">
                  <span className="quote-fab-tooltip">Asistente IA (Importar desde texto)</span>
                  <button
                    type="button"
                    className="quote-fab-btn quote-fab-btn-ia"
                    onClick={() => setIsAIModalOpen(true)}
                    title="Asistente IA"
                  >
                    <Sparkles size={16} />
                  </button>
                </div>
              )}

              {/* Generar Órdenes de Compra */}
              <div className="quote-fab-item">
                <span className="quote-fab-tooltip">Generar Órdenes de Compra</span>
                <button
                  type="button"
                  className="quote-fab-btn"
                  style={{ color: '#059669', borderColor: 'rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.08)' }}
                  onClick={() => setIsGenerateOrdersModalOpen(true)}
                  title="Generar Órdenes de Compra"
                >
                  <Package size={16} />
                </button>
              </div>

              {/* Exportar / Ver PDF */}
              <div className="quote-fab-item">
                <span className="quote-fab-tooltip">Ver / Imprimir PDF</span>
                <button
                  type="button"
                  className="quote-fab-btn quote-fab-btn-pdf"
                  onClick={handleExportPDF}
                  title="Exportar PDF"
                >
                  <FileText size={16} />
                </button>
              </div>

              {/* Exportar Excel */}
              <div className="quote-fab-item">
                <span className="quote-fab-tooltip">Descargar Excel (.xlsm)</span>
                <button
                  type="button"
                  className="quote-fab-btn quote-fab-btn-excel"
                  onClick={handleExportExcel}
                  title="Descargar Excel"
                >
                  <FileSpreadsheet size={16} />
                </button>
              </div>

              {/* Importar desde Excel */}
              {!isReadOnly && (
                <div className="quote-fab-item">
                  <span className="quote-fab-tooltip">Importar desde Excel (.xlsm)</span>
                  <button
                    type="button"
                    className="quote-fab-btn"
                    style={{ color: '#107c41', borderColor: 'rgba(16, 124, 65, 0.4)', background: 'rgba(16, 124, 65, 0.08)' }}
                    onClick={() => setIsExcelModalOpen(true)}
                    title="Importar estructura desde Excel"
                  >
                    <FileSpreadsheet size={16} />
                  </button>
                </div>
              )}

              {/* Copiar Enlace */}
              <div className="quote-fab-item">
                <span className="quote-fab-tooltip">Copiar Enlace Cliente</span>
                <button
                  type="button"
                  className="quote-fab-btn quote-fab-btn-link"
                  onClick={handleCopyLink}
                  title="Copiar Enlace"
                >
                  <Copy size={16} />
                </button>
              </div>

              {/* Enviar Correo */}
              <div className="quote-fab-item">
                <span className="quote-fab-tooltip">Enviar por Correo al Cliente</span>
                <button
                  type="button"
                  className="quote-fab-btn quote-fab-btn-mail"
                  onClick={handleOpenEmail}
                  title="Enviar Correo"
                >
                  <Mail size={16} />
                </button>
              </div>

              {/* Importar Ítems */}
              {!isReadOnly && (
                <div className="quote-fab-item">
                  <span className="quote-fab-tooltip">Importar Ítems de Cotizaciones</span>
                  <button
                    type="button"
                    className="quote-fab-btn quote-fab-btn-import"
                    onClick={() => setIsImportModalOpen(true)}
                    title="Importar Ítems"
                  >
                    <Download size={16} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Toggle Expand/Collapse Secondary Actions */}
          <button
            type="button"
            className="quote-fab-toggle-btn"
            onClick={() => setIsFloatingActionsExpanded(prev => !prev)}
            title={isFloatingActionsExpanded ? "Ocultar herramientas" : "Mostrar herramientas"}
          >
            {isFloatingActionsExpanded ? <ChevronDown size={13} /> : <MoreVertical size={13} />}
          </button>
        </div>,
        document.body
      )}

      <ImportItemsModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
        quotes={allQuotes} 
        currentQuoteId={quote.id}
        currentCategories={quote.categories}
        currentCurrency={quote.currency || 'PEN'}
        onImportItems={handleImportItems}
      />

      {isAIModalOpen && (
        <AIImportModal
          onClose={() => setIsAIModalOpen(false)}
          onApply={handleAIImport}
        />
      )}

      {isExcelModalOpen && (
        <ExcelQuoteImportModal
          onClose={() => setIsExcelModalOpen(false)}
          onApply={handleExcelImport}
          hasExistingItems={(quote.categories || []).length > 0}
        />
      )}

      {mobileEditItem && (
        <MobileItemFormModal 
          isOpen={true}
          currency={quote.currency || 'PEN'}
          item={mobileEditItem.item}
          allCategories={quote.categories}
          onClose={() => setMobileEditItem(null)}
          onSave={(updatedItem) => {
            setQuote(prev => ({
              ...prev,
              categories: recalculateSpecialQuoteItems(
                prev.categories.map(c => 
                  c.id === mobileEditItem.categoryId ? {
                    ...c,
                    items: c.items.map(i => i.id === updatedItem.id ? updatedItem : i)
                  } : c
                )
              )
            }));
            setMobileEditItem(null);
          }}
        />
      )}

      {(() => {
        const foundClient = clientes.find(c => c.id === quote.client || c.empresa === quote.client);
        const foundProject = proyectos.find(p => p.id === quote.projectId);
        return (
          <EmailModal 
            isOpen={isEmailModalOpen}
            onClose={() => setIsEmailModalOpen(false)}
            quoteId={quote.id}
            clientName={foundClient?.empresa || quote.client || 'Cliente'}
            clientEmail={foundClient?.email || ""}
            projectName={quote.requirement || foundProject?.nombre || ''}
            version={quote.version || 1}
          />
        );
      })()}
      <SmartBriefDrawer
        isOpen={isBriefDrawerOpen}
        onClose={() => setIsBriefDrawerOpen(false)}
        projectId={quote.projectId}
        clientId={quote.client}
        onImportItems={handleAIImport}
      />
      <CreateOrdenesMasivasModal
        isOpen={isGenerateOrdersModalOpen}
        onClose={() => setIsGenerateOrdersModalOpen(false)}
        initialQuoteId={quote.id}
      />
    </div>
  );
};
