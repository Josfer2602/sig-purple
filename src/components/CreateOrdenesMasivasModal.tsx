import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { 
  X, Layers, CheckSquare, Building2, AlertTriangle, 
  Sparkles, Filter, FileText, CreditCard, CheckCircle2, Paperclip
} from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';
import { SearchableProveedorSelect } from './SearchableProveedorSelect';
import { generateItemsTitle } from '../utils/orderTitleHelper';
import type { Orden, OrdenSubItem, Proveedor } from '../types/models';
import toast from 'react-hot-toast';

import {
  DEFAULT_CONDICIONES_PAGO_ORDEN,
  calculateOrdenPaymentBreakdown,
  isProveedorReciboPorHonorarios,
  resolveEffectiveDetraccion
} from '../utils/ordenPaymentHelper';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialQuoteId?: string;
}

export const CONDICIONES_PAGO_OPTIONS = DEFAULT_CONDICIONES_PAGO_ORDEN.map(c => ({ value: c, label: c }));

interface RowState {
  subItemId: string;
  categoryName: string;
  itemName: string;
  subItemName: string;
  description: string;
  quantity: number;
  quantityOriginal?: number;
  dates: number;
  unitCost: number;
  budgetedTotal: number;
  alreadyOrderedTotal: number;
  existingOrderCodes: string[];
  
  // Multi-proyecto y cotización trazabilidad
  projectId: string;
  projectName: string;
  quoteId: string;
  
  // Selection for bulk action checkbox
  selected: boolean;
  
  // Form fields
  proveedorId: string;
  tipoOrden: 'Compra' | 'Servicio';
  monto: number;
  condicionesPago: string;
  
  // Agrupador para permitir múltiples órdenes independientes para el mismo proveedor y tipo (1, 2, ...)
  orderGroup: number;
}

interface ConsolidatedConfig {
  cuentaBancariaId?: string;
  condicionesPago?: string;
  tipoOrden?: 'Compra' | 'Servicio';
  aplicaDetraccion?: boolean;
  porcentajeDetraccion?: number;
  titulo?: string;
  isConsolidated?: boolean;
  consolidatedName?: string;
}

export const CreateOrdenesMasivasModal: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  initialQuoteId 
}) => {
  const { 
    clientes, 
    proyectos, 
    quotes, 
    proveedores, 
    ordenes, 
    addBatchOrdenes, 
    listas 
  } = useGlobalContext();

  const [selectedClienteId, setSelectedClienteId] = useState('');
  const [selectedProyectoId, setSelectedProyectoId] = useState('');
  const [selectedQuoteId, setSelectedQuoteId] = useState('');

  // Pestaña activa: 'items' para la tabla amplia de ítems, 'orders' para la revisión de órdenes y cuentas
  const [activeTab, setActiveTab] = useState<'items' | 'orders'>('items');
  const [showHierarchyEdit, setShowHierarchyEdit] = useState(false);
  const [showQuickPreview, setShowQuickPreview] = useState(false);

  const [rows, setRows] = useState<RowState[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unassigned' | 'assigned'>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bulk edit values
  const [bulkProveedorId, setBulkProveedorId] = useState('');
  const [bulkTipoOrden, setBulkTipoOrden] = useState<'Compra' | 'Servicio' | ''>('');
  const [bulkCondicionesPago, setBulkCondicionesPago] = useState('');

  // Configuration for each consolidated order (keyed by groupKey: proveedorId__tipoOrden__orderGroup)
  const [consolidatedConfigs, setConsolidatedConfigs] = useState<Record<string, ConsolidatedConfig>>({});
  const [groupCotizaciones, setGroupCotizaciones] = useState<Record<string, File>>({});

  // Dynamic payment conditions list
  const dynamicCondicionesOptions = useMemo(() => {
    const list = (listas?.condicionesPagoOrden && listas.condicionesPagoOrden.length > 0)
      ? listas.condicionesPagoOrden
      : DEFAULT_CONDICIONES_PAGO_ORDEN;
    return list.map(opt => ({ value: opt, label: opt }));
  }, [listas?.condicionesPagoOrden]);

  // Initial hierarchy loading or reset
  useEffect(() => {
    if (!isOpen) {
      setSelectedClienteId('');
      setSelectedProyectoId('');
      setSelectedQuoteId('');
      setRows([]);
      setFilterCategory('all');
      setStatusFilter('all');
      setSearchFilter('');
      setConsolidatedConfigs({});
      setGroupCotizaciones({});
      setBulkProveedorId('');
      setBulkTipoOrden('');
      setBulkCondicionesPago('');
      setActiveTab('items');
      setShowHierarchyEdit(false);
      setShowQuickPreview(false);
      return;
    }

    if (initialQuoteId) {
      const q = quotes.find(item => item.id === initialQuoteId);
      if (q) {
        setSelectedQuoteId(q.id);
        if (q.projectId) {
          setSelectedProyectoId(q.projectId);
          const p = proyectos.find(proj => proj.id === q.projectId);
          if (p) setSelectedClienteId(p.clienteId);
        }
      }
    }
  }, [isOpen, initialQuoteId, quotes, proyectos]);

  const defaultCondicion = (listas?.condicionesPagoOrden && listas.condicionesPagoOrden.length > 0)
    ? listas.condicionesPagoOrden[0]
    : '50% Adelanto / 50% Contra Entrega';

  // Cascading filters: solo clientes con proyectos y cotizaciones aprobadas
  const eligibleClientes = useMemo(() => {
    return clientes.filter(c => {
      const clientProys = proyectos.filter(p => p.clienteId === c.id);
      return clientProys.some(p => {
        const hasApprovedQuote = quotes.some(q => {
          const s = (q.status || '').toLowerCase();
          return q.projectId === p.id && (s.includes('aprob') || s.includes('liquid'));
        });
        return p.estado === 'Aprobado' || hasApprovedQuote;
      });
    });
  }, [clientes, proyectos, quotes]);

  const filteredProyectos = useMemo(() => {
    if (!selectedClienteId) return [];
    return proyectos.filter(p => {
      if (p.clienteId !== selectedClienteId || p.estado === 'Rechazado') return false;
      const hasApprovedQuote = quotes.some(q => {
        const s = (q.status || '').toLowerCase();
        return q.projectId === p.id && (s.includes('aprob') || s.includes('liquid'));
      });
      return p.estado === 'Aprobado' || hasApprovedQuote;
    });
  }, [proyectos, selectedClienteId, quotes]);

  const filteredQuotes = useMemo(() => {
    if (!selectedClienteId) return [];
    if (selectedProyectoId === 'ALL') {
      const projIds = filteredProyectos.map(p => p.id);
      return quotes.filter(q => {
        const s = (q.status || '').toLowerCase();
        return projIds.includes(q.projectId) && (s.includes('aprob') || s.includes('liquid'));
      });
    }
    return quotes.filter(q => {
      const s = (q.status || '').toLowerCase();
      return q.projectId === selectedProyectoId && (s.includes('aprob') || s.includes('liquid'));
    });
  }, [quotes, selectedClienteId, selectedProyectoId, filteredProyectos]);

  const selectedCliente = useMemo(() => {
    return clientes.find(c => c.id === selectedClienteId);
  }, [clientes, selectedClienteId]);

  const selectedProyecto = useMemo(() => {
    if (selectedProyectoId === 'ALL') {
      return { id: 'ALL', nombre: `Todos los proyectos aprobados (${filteredProyectos.length})` } as any;
    }
    return proyectos.find(p => p.id === selectedProyectoId);
  }, [proyectos, selectedProyectoId, filteredProyectos]);

  // Lista de cotizaciones activas para la extracción
  const activeQuotesList = useMemo(() => {
    if (!selectedClienteId) return [];
    if (selectedQuoteId === 'ALL' || (!selectedQuoteId && selectedProyectoId === 'ALL')) {
      return filteredQuotes;
    }
    const q = quotes.find(item => item.id === selectedQuoteId);
    return q ? [q] : [];
  }, [selectedClienteId, selectedQuoteId, selectedProyectoId, filteredQuotes, quotes]);

  const selectedQuote = activeQuotesList[0];
  const hasActiveQuotes = activeQuotesList.length > 0;

  // Auto-select single options
  useEffect(() => {
    if (selectedClienteId && !selectedProyectoId && filteredProyectos.length === 1) {
      setSelectedProyectoId(filteredProyectos[0].id);
    }
  }, [selectedClienteId, selectedProyectoId, filteredProyectos]);

  useEffect(() => {
    if (selectedProyectoId && !selectedQuoteId && filteredQuotes.length === 1) {
      setSelectedQuoteId(filteredQuotes[0].id);
    }
  }, [selectedProyectoId, selectedQuoteId, filteredQuotes]);

  // Load sub-items and compute existing orders when quote changes
  useEffect(() => {
    if (activeQuotesList.length === 0) {
      setRows([]);
      return;
    }

    const activeQuoteIds = activeQuotesList.map(q => q.id);
    const existingOrders = ordenes.filter(o => activeQuoteIds.includes(o.quoteId));
    const orderedAmountsMap: Record<string, number> = {};
    const orderedCodesMap: Record<string, string[]> = {};

    existingOrders.forEach(ord => {
      (ord.items || []).forEach(it => {
        if (it.quoteSubItemId) {
          orderedAmountsMap[it.quoteSubItemId] = (orderedAmountsMap[it.quoteSubItemId] || 0) + (it.total || 0);
          if (!orderedCodesMap[it.quoteSubItemId]) orderedCodesMap[it.quoteSubItemId] = [];
          if (!orderedCodesMap[it.quoteSubItemId].includes(ord.id)) {
            orderedCodesMap[it.quoteSubItemId].push(ord.id);
          }
        }
      });
    });

    const newRows: RowState[] = [];

    activeQuotesList.forEach(currentQuote => {
      const proj = proyectos.find(p => p.id === currentQuote.projectId);
      const projectName = proj?.nombre || 'Proyecto';

      (currentQuote.categories || []).forEach(cat => {
        (cat.items || []).forEach(item => {
          (item.subItems || []).forEach(sub => {
            const budgeted = (Number(sub.quantity) || 1) * (Number(sub.dates) || 1) * (Number(sub.unitCost) || 0);
            const alreadyOrdered = orderedAmountsMap[sub.id] || 0;
            const pendingAmount = Math.max(0, budgeted - alreadyOrdered);

            // Auto-match con proveedor registrado
            let matchedProveedorId = (sub as any).providerId || '';
            if (matchedProveedorId && !proveedores.some(p => p.id === matchedProveedorId)) {
              matchedProveedorId = '';
            }
            if (!matchedProveedorId && sub.providerName && typeof sub.providerName === 'string') {
              const cleanSubProv = sub.providerName.trim().toLowerCase();
              const matched = proveedores.find(p => 
                (p.razonSocial && (p.razonSocial.toLowerCase() === cleanSubProv || p.razonSocial.toLowerCase().includes(cleanSubProv) || cleanSubProv.includes(p.razonSocial.toLowerCase()))) ||
                (p.nombre && (p.nombre.toLowerCase() === cleanSubProv || p.nombre.toLowerCase().includes(cleanSubProv) || cleanSubProv.includes(p.nombre.toLowerCase()))) ||
                p.id === sub.providerName
              );
              if (matched) matchedProveedorId = matched.id;
            }

            const lowerName = `${cat.name || ''} ${item.name || ''} ${sub.name || ''}`.toLowerCase();
            const isServicio = lowerName.includes('servicio') || 
                               lowerName.includes('montaje') || 
                               lowerName.includes('transporte') || 
                               lowerName.includes('personal') || 
                               lowerName.includes('alquiler') || 
                               lowerName.includes('mano de obra') ||
                               lowerName.includes('encuestador') ||
                               lowerName.includes('supervisor') ||
                               lowerName.includes('promotor') ||
                               lowerName.includes('instalación') ||
                               lowerName.includes('desinstalación') ||
                               lowerName.includes('activación') ||
                               lowerName.includes('viáticos') ||
                               lowerName.includes('sctr');

            newRows.push({
              subItemId: sub.id,
              categoryName: cat.name || 'General',
              itemName: item.name || 'Ítem',
              subItemName: sub.name || '',
              description: sub.description || '',
              quantity: sub.quantity || 1,
              quantityOriginal: sub.quantity || 1,
              dates: sub.dates || 1,
              unitCost: sub.unitCost || 0,
              budgetedTotal: budgeted,
              alreadyOrderedTotal: alreadyOrdered,
              existingOrderCodes: orderedCodesMap[sub.id] || [],
              projectId: currentQuote.projectId || '',
              projectName: projectName,
              quoteId: currentQuote.id,
              selected: Boolean(matchedProveedorId),
              proveedorId: matchedProveedorId,
              tipoOrden: isServicio ? 'Servicio' : 'Compra',
              monto: pendingAmount > 0 ? Math.round(pendingAmount * 100) / 100 : Math.round(budgeted * 100) / 100,
              condicionesPago: defaultCondicion,
              orderGroup: 1
            });
          });
        });
      });
    });

    setRows(newRows);
  }, [activeQuotesList, ordenes, proveedores, defaultCondicion, proyectos]);

  // Categories for filter
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => set.add(r.categoryName));
    return Array.from(set);
  }, [rows]);

  // Filtered rows for table display
  const visibleRows = useMemo(() => {
    return rows.filter(r => {
      // Filtro de categoría
      if (filterCategory !== 'all' && r.categoryName !== filterCategory) return false;
      
      // Filtro de estado de asignación
      if (statusFilter === 'unassigned' && r.proveedorId) return false;
      if (statusFilter === 'assigned' && !r.proveedorId) return false;

      // Filtro de búsqueda
      if (searchFilter) {
        const q = searchFilter.toLowerCase();
        const match = r.subItemName.toLowerCase().includes(q) || 
                      r.itemName.toLowerCase().includes(q) || 
                      r.categoryName.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [rows, filterCategory, statusFilter, searchFilter]);

  // Group visible rows by category for structured display
  const rowsByCategory = useMemo(() => {
    const map: Record<string, RowState[]> = {};
    visibleRows.forEach(r => {
      if (!map[r.categoryName]) map[r.categoryName] = [];
      map[r.categoryName].push(r);
    });
    return map;
  }, [visibleRows]);

  // Selected rows for bulk assignment
  const selectedRows = useMemo(() => rows.filter(r => r.selected), [rows]);
  const selectedCount = selectedRows.length;

  // Items ready to be ordered (those that have a supplier assigned and positive amount)
  const orderableRows = useMemo(() => {
    return rows.filter(r => Boolean(r.proveedorId) && (Number(r.monto) || 0) > 0);
  }, [rows]);

  const totalSumOrderable = useMemo(() => {
    return orderableRows.reduce((acc, r) => acc + (Number(r.monto) || 0), 0);
  }, [orderableRows]);

  // Row update helpers
  const handleToggleRow = (subItemId: string) => {
    setRows(prev => prev.map(r => r.subItemId === subItemId ? { ...r, selected: !r.selected } : r));
  };

  const handleUpdateRow = (subItemId: string, field: keyof RowState, value: any) => {
    setRows(prev => prev.map(r => r.subItemId === subItemId ? { ...r, [field]: value } : r));
  };

  const handleSelectAll = (select: boolean) => {
    const visibleIds = new Set(visibleRows.map(r => r.subItemId));
    setRows(prev => prev.map(r => visibleIds.has(r.subItemId) ? { ...r, selected: select } : r));
  };

  const handleSelectUnassignedOnly = () => {
    setRows(prev => prev.map(r => ({
      ...r,
      selected: !r.proveedorId
    })));
  };

  const handleSelectAssignedOnly = () => {
    setRows(prev => prev.map(r => ({
      ...r,
      selected: Boolean(r.proveedorId)
    })));
  };

  const handleToggleCategorySelection = (catName: string) => {
    const catRows = rows.filter(r => r.categoryName === catName);
    const allSelected = catRows.every(r => r.selected);
    const targetSelection = !allSelected;
    setRows(prev => prev.map(r => r.categoryName === catName ? { ...r, selected: targetSelection } : r));
  };

  // UNIFIED BULK ASSIGNMENT ACTION (Proveedor + Tipo + Condición en 1 solo botón)
  const handleApplyBulk = () => {
    if (selectedCount === 0) {
      toast.error('Selecciona primero los casilleros de los ítems en la tabla.');
      return;
    }

    if (!bulkProveedorId && !bulkTipoOrden && !bulkCondicionesPago) {
      toast.error('Elige al menos una opción (Proveedor, Tipo o Condición) para aplicar.');
      return;
    }

    const prov = proveedores.find(p => p.id === bulkProveedorId);

    setRows(prev => prev.map(r => {
      if (!r.selected) return r;
      return {
        ...r,
        proveedorId: bulkProveedorId ? bulkProveedorId : r.proveedorId,
        tipoOrden: bulkTipoOrden ? bulkTipoOrden : r.tipoOrden,
        condicionesPago: bulkCondicionesPago ? bulkCondicionesPago : r.condicionesPago,
        selected: false // Se desmarcan automáticamente para poder seleccionar el siguiente lote sin solapamientos
      };
    }));

    if (bulkCondicionesPago) {
      setConsolidatedConfigs(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          next[k] = { ...next[k], condicionesPago: bulkCondicionesPago };
        });
        return next;
      });
    }

    const details: string[] = [];
    if (prov) details.push(`Proveedor: ${prov.razonSocial}`);
    if (bulkTipoOrden) details.push(`Tipo: ${bulkTipoOrden === 'Servicio' ? '🛠️ Servicio (OS)' : '📦 Compra (OC)'}`);
    if (bulkCondicionesPago) details.push(`Condición: ${bulkCondicionesPago}`);

    toast.success(`¡Aplicado exitosamente a ${selectedCount} ítem(s)!\n${details.join(' • ')}\nAhora puedes seleccionar otros ítems para el siguiente proveedor.`);

    // Limpiar campos masivos para la siguiente asignación
    setBulkProveedorId('');
    setBulkTipoOrden('');
    setBulkCondicionesPago('');
  };

  // Separar un sub-ítem específico en una orden nueva independiente para el mismo proveedor y tipo
  const handleSplitItemToNewOrder = (subItemId: string) => {
    setRows(prev => {
      const target = prev.find(r => r.subItemId === subItemId);
      if (!target) return prev;
      
      const sameRows = prev.filter(r => r.proveedorId === target.proveedorId && r.tipoOrden === target.tipoOrden);
      const maxGroup = Math.max(...sameRows.map(r => r.orderGroup || 1), 1);
      const nextGroup = maxGroup + 1;

      return prev.map(r => r.subItemId === subItemId ? { ...r, orderGroup: nextGroup } : r);
    });
    toast.success('Ítem separado en una orden independiente.');
  };

  // Unir un sub-ítem de vuelta a la orden principal (orderGroup: 1)
  const handleMergeItemToMainOrder = (subItemId: string) => {
    setRows(prev => prev.map(r => r.subItemId === subItemId ? { ...r, orderGroup: 1 } : r));
    toast.success('Ítem unido a la orden principal del proveedor.');
  };

  // Cambiar el tipo de orden (Compra/Servicio) de todos los ítems de una tarjeta consolidada
  const handleChangeCardTipoOrden = (groupKey: string, newTipo: 'Compra' | 'Servicio') => {
    const group = groupsByOrder[groupKey];
    if (!group) return;

    const itemIds = new Set(group.items.map(it => it.subItemId));
    setRows(prev => prev.map(r => itemIds.has(r.subItemId) ? { ...r, tipoOrden: newTipo } : r));
    toast.success(`Orden cambiada a ${newTipo === 'Servicio' ? '🛠️ Servicio (OS)' : '📦 Compra (OC)'}.`);
  };

  // Helper to update consolidated order config per groupKey
  const updateConsolidatedConfig = (groupKey: string, field: keyof ConsolidatedConfig, value: any) => {
    setConsolidatedConfigs(prev => ({
      ...prev,
      [groupKey]: {
        ...prev[groupKey],
        [field]: value
      }
    }));
  };

  // LIVE GROUPING POR PROVEEDOR + TIPO DE ORDEN + PROYECTO + ORDER_GROUP
  // Esto permite que el mismo proveedor tenga tanto una OC (Compra) como una OS (Servicio), o varias OCs/OSs independientes
  const groupsByOrder = useMemo(() => {
    const groups: Record<string, {
      groupKey: string;
      proveedorId: string;
      proveedor: Proveedor | null;
      tipoOrden: 'Compra' | 'Servicio';
      orderGroup: number;
      projectId: string;
      projectName: string;
      quoteId: string;
      items: RowState[];
      total: number;
      condicionesPago: string;
      hasValidRuc: boolean;
      hasValidAccount: boolean;
    }> = {};

    orderableRows.forEach(r => {
      const pId = r.proveedorId;
      const tOrd = r.tipoOrden || 'Compra';
      const projId = r.projectId || '';
      const oGrp = r.orderGroup || 1;
      const groupKey = `${pId}__${tOrd}__${projId}__${oGrp}`;

      if (!groups[groupKey]) {
        const prov = proveedores.find(p => p.id === pId) || null;
        const ruc = (prov?.ruc || '').trim();
        const hasValidRuc = Boolean(ruc && ruc !== '-' && ruc.length >= 8);
        const hasValidAccount = Boolean(prov?.cuentas && prov.cuentas.some(c => c.numeroCuenta && c.numeroCuenta.trim() !== '-'));

        groups[groupKey] = {
          groupKey,
          proveedorId: pId,
          proveedor: prov,
          tipoOrden: tOrd,
          orderGroup: oGrp,
          projectId: projId,
          projectName: r.projectName,
          quoteId: r.quoteId,
          items: [],
          total: 0,
          condicionesPago: r.condicionesPago || defaultCondicion,
          hasValidRuc,
          hasValidAccount
        };
      }

      groups[groupKey].items.push(r);
      groups[groupKey].total += Number(r.monto) || 0;
      if (r.condicionesPago) {
        groups[groupKey].condicionesPago = r.condicionesPago;
      }
    });

    return groups;
  }, [orderableRows, proveedores, defaultCondicion]);

  // Contar cuántas órdenes tiene cada proveedor en total (para mostrar badges diferenciadores si tiene más de una)
  const ordersCountByProveedor = useMemo(() => {
    const map: Record<string, number> = {};
    Object.values(groupsByOrder).forEach(g => {
      map[g.proveedorId] = (map[g.proveedorId] || 0) + 1;
    });
    return map;
  }, [groupsByOrder]);

  // Auto-initialize account selection for orders
  useEffect(() => {
    setConsolidatedConfigs(prev => {
      const next = { ...prev };
      Object.entries(groupsByOrder).forEach(([groupKey, g]) => {
        if (g.proveedor) {
          const cuentas = g.proveedor.cuentas || [];
          const validAccount = cuentas.find(c => c.numeroCuenta && c.numeroCuenta.trim() !== '-');
          if (!next[groupKey]) {
            next[groupKey] = {
              cuentaBancariaId: validAccount ? validAccount.id : (cuentas[0]?.id || ''),
              condicionesPago: g.condicionesPago || defaultCondicion,
              tipoOrden: g.tipoOrden,
              isConsolidated: false,
              consolidatedName: ''
            };
          } else {
            if (!next[groupKey].cuentaBancariaId && validAccount) {
              next[groupKey].cuentaBancariaId = validAccount.id;
            }
            if (g.condicionesPago && (!next[groupKey].condicionesPago || next[groupKey].condicionesPago === '50/50' || next[groupKey].condicionesPago === defaultCondicion)) {
              next[groupKey].condicionesPago = g.condicionesPago;
            }
          }
        }
      });
      return next;
    });
  }, [groupsByOrder, defaultCondicion]);

  // Validation
  const validationSummary = useMemo(() => {
    const orderableCount = orderableRows.length;
    if (orderableCount === 0) {
      return { 
        canGenerate: false, 
        error: 'No hay ítems con proveedor asignado. Asigna proveedores a los ítems para poder generar órdenes.' 
      };
    }

    const groupsList = Object.values(groupsByOrder);
    if (groupsList.length === 0) {
      return { canGenerate: false, error: 'No hay órdenes listas para emitir.' };
    }

    const invalidProviders: string[] = [];
    groupsList.forEach(g => {
      if (g.proveedor) {
        if (!g.hasValidRuc || !g.hasValidAccount) {
          invalidProviders.push(g.proveedor.razonSocial);
        }
      }
    });

    if (invalidProviders.length > 0) {
      const uniqueNames = Array.from(new Set(invalidProviders));
      return {
        canGenerate: false,
        error: `Los siguientes proveedores no tienen RUC de 11 dígitos o cuenta bancaria válida registrada: ${uniqueNames.join(', ')}. Deben completarse en el módulo Proveedores para poder emitir órdenes.`
      };
    }

    const zeroAmountItems = orderableRows.filter(r => (Number(r.monto) || 0) <= 0);
    if (zeroAmountItems.length > 0) {
      return {
        canGenerate: false,
        error: `Hay ${zeroAmountItems.length} ítem(s) con importe menor o igual a S/ 0.`
      };
    }

    return { canGenerate: true, error: null };
  }, [orderableRows, groupsByOrder]);

  // Final submission: generate batch orders
  const handleGenerateBatch = async () => {
    if (!validationSummary.canGenerate) {
      toast.error(validationSummary.error || 'Por favor completa todos los campos requeridos.');
      return;
    }

    const groupsList = Object.entries(groupsByOrder);
    if (groupsList.length === 0) {
      toast.error('No hay órdenes para generar.');
      return;
    }

    const ocCount = groupsList.filter(([_, g]) => g.tipoOrden === 'Compra').length;
    const osCount = groupsList.filter(([_, g]) => g.tipoOrden === 'Servicio').length;

    const confirmMsg = `¿Confirmas generar ${groupsList.length} orden(es) (${ocCount} OC y ${osCount} OS) por un total de S/ ${totalSumOrderable.toLocaleString('es-PE', { minimumFractionDigits: 2 })}?`;
    if (!window.confirm(confirmMsg)) return;

    setIsSubmitting(true);

    try {
      const year = new Date().getFullYear();
      const today = new Date().toISOString().split('T')[0];
      const ordersToCreate: Orden[] = [];

      for (let i = 0; i < groupsList.length; i++) {
        const [groupKey, group] = groupsList[i];
        const prov = group.proveedor!;
        const config = consolidatedConfigs[groupKey] || {};
        
        // Pick designated bank account, or fallback to first valid account
        const designatedAccountId = config.cuentaBancariaId || 
          (prov.cuentas || []).find(c => c.numeroCuenta && c.numeroCuenta.trim() !== '-')?.id;

        const effectiveTipoOrden = config.tipoOrden || group.tipoOrden;
        const effectiveCondiciones = config.condicionesPago || group.condicionesPago || defaultCondicion;
        
        // Random 4-digit code to avoid collisions
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const orderId = `${effectiveTipoOrden === 'Servicio' ? 'OS' : 'OC'}-${year}-${randomNum}`;
        const defaultAutoTitle = generateItemsTitle(group.items.map(itemRow => ({ name: itemRow.subItemName || itemRow.itemName })));

        let orderItems: OrdenSubItem[] = [];

        // Consolidación de 2 o más sub-ítems en 1 solo ítem comercial para la factura
        if (config.isConsolidated && group.items.length > 1) {
          const totalAmount = group.total;
          const subItemsBreakdown = group.items.map((it, idx) => {
            const desc = it.description || it.subItemName || it.itemName;
            return `${idx + 1}) ${desc}: S/ ${it.monto.toFixed(2)}`;
          }).join(' | ');

          orderItems = [{
            id: crypto.randomUUID(),
            ordenId: orderId,
            quoteSubItemId: group.items.map(it => it.subItemId).join(','),
            name: (config.consolidatedName || config.titulo || defaultAutoTitle || 'Servicio/Compra Consolidada').trim(),
            quantity: 1,
            unitCost: totalAmount,
            total: totalAmount,
            customDescription: `[Consolidado de ${group.items.length} sub-ítems: ${subItemsBreakdown}]`,
            costPercentage: 100
          }];
        } else {
          orderItems = group.items.map(itemRow => {
            const costPercentage = itemRow.budgetedTotal > 0 
              ? Math.round(((itemRow.monto / itemRow.budgetedTotal) * 100) * 100) / 100 
              : 100;
            const unitCostAdjusted = (itemRow.quantity * itemRow.dates) > 0 
              ? itemRow.monto / (itemRow.quantity * itemRow.dates) 
              : itemRow.monto;

            return {
              id: crypto.randomUUID(),
              ordenId: orderId,
              quoteSubItemId: itemRow.subItemId,
              name: itemRow.description || itemRow.subItemName || itemRow.itemName,
              quantity: itemRow.quantity,
              unitCost: unitCostAdjusted,
              total: itemRow.monto,
              customDescription: itemRow.description || itemRow.subItemName || itemRow.itemName,
              costPercentage
            };
          });
        }

        const isRxH = isProveedorReciboPorHonorarios(group.proveedor);
        const rawAplicaDet = isRxH
          ? false
          : effectiveTipoOrden === 'Servicio' && (config.aplicaDetraccion !== undefined ? config.aplicaDetraccion : group.total > 700);
        const pctDetr = rawAplicaDet ? (config.porcentajeDetraccion || 12) : 0;
        const hasDetraccion = resolveEffectiveDetraccion({
          aplicaDetraccion: rawAplicaDet,
          porcentajeDetraccion: pctDetr,
          isServicio: effectiveTipoOrden === 'Servicio',
          proveedorTipoDocumento: group.proveedor?.tipoDocumento
        });
        const ordTotal = Math.round(group.total * 100) / 100;
        const montoDetr = hasDetraccion ? Number((ordTotal * (pctDetr / 100)).toFixed(2)) : 0;
        const montoNet = hasDetraccion ? Number((ordTotal - montoDetr).toFixed(2)) : ordTotal;

        const newOrden: Orden = {
          id: orderId,
          titulo: (config.titulo || defaultAutoTitle).trim(),
          proveedorId: prov.id,
          clienteId: selectedClienteId,
          proyectoId: group.projectId || selectedProyectoId,
          quoteId: group.quoteId || selectedQuoteId,
          items: orderItems,
          fechaEmision: today,
          total: ordTotal,
          aplicaDetraccion: hasDetraccion,
          porcentajeDetraccion: pctDetr,
          montoDetraccion: montoDetr,
          montoNeto: montoNet,
          estadoEntrega: ((listas?.estadoOrdenEntrega || ['Pendiente'])[0]) as any,
          condicionesPago: effectiveCondiciones,
          tipoOrden: effectiveTipoOrden,
          cuentaBancariaId: designatedAccountId || undefined
        };

        ordersToCreate.push(newOrden);
      }

      const created = await addBatchOrdenes(ordersToCreate);
      
      // Subir cotizaciones de proveedor que se hayan adjuntado en las tarjetas
      if (Array.isArray(created)) {
        created.forEach((ord, idx) => {
          const [gKey] = groupsList[idx] || [];
          const fileToUpload = gKey ? groupCotizaciones[gKey] : null;
          if (fileToUpload && ord?.id) {
            const formData = new FormData();
            formData.append('cotizacionFile', fileToUpload);
            const token = localStorage.getItem('token') || '';
            fetch(`/api/ordenes/${ord.id}/upload-cotizacion`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` },
              body: formData
            }).catch(e => console.error(`Error subiendo cotización batch para ${ord.id}:`, e));
          }
        });
      }

      toast.success(`🎉 ¡Se generaron exitosamente ${ordersToCreate.length} orden(es) (${ocCount} OC y ${osCount} OS)!`);
      onClose();
    } catch (err: any) {
      console.error('Error generando órdenes en lote:', err);
      toast.error('Error al generar órdenes: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div 
      className="modal-overlay" 
      style={{ 
        zIndex: 1200, 
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px'
      }}
    >
      <div 
        className="modal-content" 
        style={{ 
          maxWidth: '1520px', 
          width: '98vw', 
          height: '96vh', 
          maxHeight: '98vh', 
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden',
          background: '#ffffff',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          border: '1px solid #cbd5e1'
        }}
      >
        {/* MODAL HEADER COMPACTO */}
        <div className="modal-header" style={{ padding: '12px 20px', flexShrink: 0, borderBottom: '1px solid #e2e8f0', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'linear-gradient(135deg, #7c3aed, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
              <Layers size={18} />
            </div>
            <div>
              <h2 className="modal-title" style={{ margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Generación Masiva de Órdenes de Compra y Servicio
                <span style={{ fontSize: '11px', background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', padding: '2px 7px', borderRadius: '10px', fontWeight: 600 }}>
                  Multi-Proveedor • OC y OS Separadas
                </span>
              </h2>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} disabled={isSubmitting}>
            <X size={20} />
          </button>
        </div>

        {/* MODAL BODY CON PESTAÑAS Y MÁXIMO ESPACIO PARA LOS ÍTEMS */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc' }}>
          
          {/* BARRA DE JERARQUÍA COMPACTA (Ahorra más de 65px de espacio vertical) */}
          {hasActiveQuotes && !showHierarchyEdit ? (
            <div style={{ 
              background: '#ffffff', 
              padding: '8px 14px', 
              borderRadius: '8px', 
              border: '1px solid #e2e8f0', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#475569', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Building2 size={13} color="#7c3aed" />
                  <span style={{ color: '#64748b' }}>Cliente:</span> <strong>{selectedCliente?.empresa || 'Cliente'}</strong>
                </span>
                <span style={{ color: '#cbd5e1' }}>•</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Layers size={13} color="#6366f1" />
                  <span style={{ color: '#64748b' }}>Proyecto:</span> <strong>{selectedProyectoId === 'ALL' ? `Todos los proyectos aprobados (${filteredProyectos.length})` : (selectedProyecto?.nombre || 'Proyecto')}</strong>
                </span>
                <span style={{ color: '#cbd5e1' }}>•</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <FileText size={13} color="#059669" />
                  <span style={{ color: '#64748b' }}>Cotización:</span> <strong>{selectedQuoteId === 'ALL' ? `Todas las cotizaciones aprobadas (${activeQuotesList.length})` : `Cotización V${selectedQuote?.version || 1}${selectedQuote?.requirement ? ` - ${selectedQuote.requirement}` : ''}`}</strong>
                </span>
              </div>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => setShowHierarchyEdit(true)}
                style={{ fontSize: '11px', padding: '3px 8px' }}
              >
                Cambiar Selección
              </button>
            </div>
          ) : (
            /* SELECTORES DE JERARQUÍA COMPLETOS */
            <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', flexShrink: 0 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>1. Cliente Aprobado *</label>
                <select 
                  className="form-control" 
                  value={selectedClienteId} 
                  onChange={e => {
                    setSelectedClienteId(e.target.value);
                    setSelectedProyectoId('');
                    setSelectedQuoteId('');
                  }}
                  style={{ fontSize: '12px', padding: '6px 8px' }}
                >
                  <option value="">-- Seleccionar Cliente Aprobado --</option>
                  {eligibleClientes.map(c => <option key={c.id} value={c.id}>{c.empresa}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>2. Proyecto Aprobado *</label>
                <select 
                  className="form-control" 
                  value={selectedProyectoId} 
                  onChange={e => {
                    setSelectedProyectoId(e.target.value);
                    setSelectedQuoteId('');
                  }}
                  disabled={!selectedClienteId}
                  style={{ fontSize: '12px', padding: '6px 8px', fontWeight: selectedProyectoId === 'ALL' ? 700 : 'normal' }}
                >
                  <option value="">-- Seleccionar Proyecto --</option>
                  {filteredProyectos.length > 1 && (
                    <option value="ALL">📁 TODOS LOS PROYECTOS APROBADOS ({filteredProyectos.length})</option>
                  )}
                  {filteredProyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569', margin: 0 }}>3. Cotización Aprobada *</label>
                  {hasActiveQuotes && (
                    <button 
                      type="button" 
                      onClick={() => setShowHierarchyEdit(false)}
                      style={{ border: 'none', background: 'transparent', color: '#6366f1', fontSize: '11px', cursor: 'pointer', padding: 0 }}
                    >
                      Ocultar panel ▲
                    </button>
                  )}
                </div>
                <select 
                  className="form-control" 
                  value={selectedQuoteId} 
                  onChange={e => {
                    setSelectedQuoteId(e.target.value);
                    setShowHierarchyEdit(false);
                  }}
                  disabled={!selectedProyectoId}
                  style={{ fontSize: '12px', padding: '6px 8px', fontWeight: selectedQuoteId === 'ALL' ? 700 : 'normal' }}
                >
                  <option value="">-- Seleccionar Cotización Aprobada --</option>
                  {filteredQuotes.length > 1 && (
                    <option value="ALL">📑 TODAS LAS COTIZACIONES APROBADAS ({filteredQuotes.length})</option>
                  )}
                  {filteredQuotes.map(q => {
                    const req = q.requirement ? ` - ${q.requirement}` : '';
                    return <option key={q.id} value={q.id}>Cotización V{q.version}{req}</option>;
                  })}
                </select>
              </div>
            </div>
          )}

          {/* SI NO HAY COTIZACIÓN SELECCIONADA */}
          {!hasActiveQuotes && (
            <div style={{ flex: 1, minHeight: '320px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cbd5e1', borderRadius: '12px', color: '#64748b', padding: '40px', background: '#ffffff' }}>
              <FileText size={48} color="#94a3b8" style={{ marginBottom: '16px' }} />
              <h3 style={{ margin: 0, fontSize: '16px', color: '#334155' }}>Selecciona una Cotización Aprobada</h3>
              <p style={{ margin: '6px 0 0 0', fontSize: '13px', maxWidth: '480px', textAlign: 'center' }}>
                Elige el cliente, proyecto y cotización para listar todos los sub-ítems presupuestados y comenzar a asignar los proveedores para generar las órdenes de compra y servicio.
              </p>
            </div>
          )}

          {/* CONTENIDO CUANDO HAY COTIZACIÓN SELECCIONADA */}
          {hasActiveQuotes && (
            <>
              {/* BARRA DE PESTAÑAS PRINCIPALES */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #e2e8f0', flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setActiveTab('items')}
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: 700,
                      borderRadius: '8px 8px 0 0',
                      border: 'none',
                      cursor: 'pointer',
                      background: activeTab === 'items' ? '#ffffff' : 'transparent',
                      color: activeTab === 'items' ? '#7c3aed' : '#64748b',
                      borderBottom: activeTab === 'items' ? '3px solid #7c3aed' : '3px solid transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: activeTab === 'items' ? '0 -2px 6px rgba(0,0,0,0.03)' : 'none'
                    }}
                  >
                    <Layers size={15} />
                    1. Matriz de Ítems ({rows.length})
                    <span style={{ 
                      fontSize: '11px', 
                      padding: '2px 7px', 
                      borderRadius: '10px', 
                      background: activeTab === 'items' ? '#ede9fe' : '#e2e8f0',
                      color: activeTab === 'items' ? '#6d28d9' : '#475569',
                      fontWeight: 700
                    }}>
                      {orderableRows.length} / {rows.length} listos
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('orders')}
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: 700,
                      borderRadius: '8px 8px 0 0',
                      border: 'none',
                      cursor: 'pointer',
                      background: activeTab === 'orders' ? '#ffffff' : 'transparent',
                      color: activeTab === 'orders' ? '#7c3aed' : '#64748b',
                      borderBottom: activeTab === 'orders' ? '3px solid #7c3aed' : '3px solid transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: activeTab === 'orders' ? '0 -2px 6px rgba(0,0,0,0.03)' : 'none'
                    }}
                  >
                    <CreditCard size={15} />
                    2. Órdenes y Cuentas Bancarias ({Object.keys(groupsByOrder).length})
                    {Object.keys(groupsByOrder).length > 0 && (
                      <span style={{ 
                        fontSize: '11px', 
                        padding: '2px 7px', 
                        borderRadius: '10px', 
                        background: '#dcfce7',
                        color: '#15803d',
                        fontWeight: 700
                      }}>
                        S/ {totalSumOrderable.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </button>
                </div>

                <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '14px', paddingRight: '4px' }}>
                  <span>Total Cotización: <strong>S/ {rows.reduce((a, b) => a + b.budgetedTotal, 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</strong></span>
                </div>
              </div>

              {/* VISTA 1: MATRIZ DE ÍTEMS (MÁXIMO ESPACIO PARA VER TODOS LOS ÍTEMS) */}
              {activeTab === 'items' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0 }}>
                  
                  {/* PANEL DE ASIGNACIÓN MASIVA Y HERRAMIENTAS COMPACTO */}
                  <div style={{
                    background: '#ffffff',
                    border: selectedCount > 0 ? '1.5px solid #7c3aed' : '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    boxShadow: selectedCount > 0 ? '0 3px 10px rgba(124, 58, 237, 0.08)' : '0 1px 2px rgba(0,0,0,0.02)',
                    flexShrink: 0
                  }}>
                    {/* FILA 1: Botones de selección rápida y filtros de vista */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <button 
                          type="button" 
                          className="btn-secondary" 
                          onClick={() => handleSelectAll(true)}
                          style={{ fontSize: '11.5px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
                        >
                          <CheckSquare size={13} /> Todos ({visibleRows.length})
                        </button>

                        <button 
                          type="button" 
                          className="btn-secondary" 
                          onClick={handleSelectAssignedOnly}
                          style={{ fontSize: '11.5px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '5px', color: '#047857', borderColor: '#a7f3d0', background: '#ecfdf5' }}
                        >
                          <CheckCircle2 size={13} /> Con Proveedor ({rows.filter(r => Boolean(r.proveedorId)).length})
                        </button>

                        <button 
                          type="button" 
                          className="btn-secondary" 
                          onClick={handleSelectUnassignedOnly}
                          style={{ fontSize: '11.5px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
                        >
                          <Filter size={13} /> Sin Proveedor ({rows.filter(r => !r.proveedorId).length})
                        </button>

                        {selectedCount > 0 && (
                          <button 
                            type="button" 
                            className="btn-secondary" 
                            onClick={() => handleSelectAll(false)}
                            style={{ fontSize: '11.5px', padding: '5px 10px', color: '#dc2626' }}
                          >
                            Deseleccionar ({selectedCount})
                          </button>
                        )}

                        <div style={{ height: '18px', width: '1px', background: '#cbd5e1', margin: '0 2px' }} />

                        {/* Filtro categoría */}
                        <select 
                          className="form-control" 
                          value={filterCategory} 
                          onChange={e => setFilterCategory(e.target.value)}
                          style={{ width: 'auto', fontSize: '11.5px', padding: '5px 8px' }}
                        >
                          <option value="all">Todas las Categorías ({categoriesList.length})</option>
                          {categoriesList.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>

                        {/* Filtro por estado de asignación */}
                        <select 
                          className="form-control" 
                          value={statusFilter} 
                          onChange={e => setStatusFilter(e.target.value as any)}
                          style={{ width: 'auto', fontSize: '11.5px', padding: '5px 8px' }}
                        >
                          <option value="all">Mostrar Todos ({rows.length})</option>
                          <option value="unassigned">⚪ Sin Proveedor ({rows.filter(r => !r.proveedorId).length})</option>
                          <option value="assigned">🟢 Con Proveedor ({rows.filter(r => !!r.proveedorId).length})</option>
                        </select>

                        {/* Búsqueda */}
                        <input 
                          type="text" 
                          className="form-control" 
                          placeholder="Filtrar por texto..." 
                          value={searchFilter} 
                          onChange={e => setSearchFilter(e.target.value)}
                          style={{ width: '160px', fontSize: '11.5px', padding: '5px 8px' }}
                        />
                      </div>

                      {/* Resumen de estado en barra */}
                      <div style={{ fontSize: '11.5px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span>Listos: <strong style={{ color: '#059669' }}>{orderableRows.length}</strong>/{rows.length}</span>
                        <span>Órdenes a emitir: <strong style={{ color: '#7c3aed' }}>{Object.keys(groupsByOrder).length}</strong></span>
                      </div>
                    </div>

                    {/* FILA 2: BARRA UNIFICADA DE ASIGNACIÓN (LAS 3 OPCIONES + BOTÓN DE APLICAR) */}
                    <div style={{ 
                      background: selectedCount > 0 ? '#f5f3ff' : '#f8fafc', 
                      border: '1px solid ' + (selectedCount > 0 ? '#a78bfa' : '#e2e8f0'), 
                      borderRadius: '8px', 
                      padding: '8px 12px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      flexWrap: 'wrap', 
                      gap: '10px' 
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Sparkles size={15} color={selectedCount > 0 ? '#7c3aed' : '#94a3b8'} />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: selectedCount > 0 ? '#6d28d9' : '#64748b' }}>
                            {selectedCount > 0 ? `Asignar a (${selectedCount}) seleccionados:` : 'Asignar a seleccionados:'}
                          </span>
                        </div>

                        {/* 1. Proveedor */}
                        <div style={{ width: '270px' }}>
                          <SearchableProveedorSelect
                            proveedores={proveedores}
                            value={bulkProveedorId}
                            onChange={id => setBulkProveedorId(id)}
                            placeholder="1. Seleccionar proveedor..."
                          />
                        </div>

                        {/* 2. Tipo de Orden */}
                        <div style={{ width: '160px' }}>
                          <select 
                            className="form-control" 
                            value={bulkTipoOrden} 
                            onChange={e => setBulkTipoOrden(e.target.value as any)}
                            style={{ fontSize: '11.5px', padding: '6px 8px' }}
                          >
                            <option value="">2. Tipo: (Sin cambiar)</option>
                            <option value="Compra">📦 Compra (OC)</option>
                            <option value="Servicio">🛠️ Servicio (OS)</option>
                          </select>
                        </div>

                        {/* 3. Condición de Pago */}
                        <div style={{ width: '210px' }}>
                          <select 
                            className="form-control" 
                            value={bulkCondicionesPago} 
                            onChange={e => setBulkCondicionesPago(e.target.value)}
                            style={{ fontSize: '11.5px', padding: '6px 8px' }}
                          >
                            <option value="">3. Condición: (Sin cambiar)</option>
                            {dynamicCondicionesOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* BOTÓN ÚNICO DE APLICAR */}
                      <div>
                        <button 
                          type="button" 
                          className="btn-primary" 
                          onClick={handleApplyBulk} 
                          disabled={selectedCount === 0 || (!bulkProveedorId && !bulkTipoOrden && !bulkCondicionesPago)}
                          style={{ 
                            fontSize: '12px', 
                            padding: '6px 14px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px',
                            background: selectedCount > 0 && (bulkProveedorId || bulkTipoOrden || bulkCondicionesPago) 
                              ? 'linear-gradient(135deg, #7c3aed, #6366f1)' 
                              : undefined
                          }}
                        >
                          <Sparkles size={14} />
                          Aplicar a seleccionados ({selectedCount})
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* TABLA MATRIZ DE SUB-ITEMS (AMPLITUD MÁXIMA PARA VER TODOS LOS ÍTEMS) */}
                  <div style={{ 
                    background: '#ffffff', 
                    borderRadius: '10px', 
                    border: '1px solid #e2e8f0', 
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)', 
                    overflowX: 'auto',
                    position: 'relative',
                    flex: 1,
                    minHeight: '380px'
                  }}>
                    <table style={{ minWidth: '1540px', width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                      <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 15, borderBottom: '2px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
                        <tr>
                          <th style={{ padding: '10px 12px', width: '48px', minWidth: '48px', textAlign: 'center' }}>
                            <input 
                              type="checkbox" 
                              checked={visibleRows.length > 0 && selectedRows.length === visibleRows.length} 
                              onChange={e => handleSelectAll(e.target.checked)} 
                              style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                              title="Seleccionar o deseleccionar todos los ítems visibles"
                            />
                          </th>
                          <th style={{ padding: '10px 12px', width: '320px', minWidth: '300px' }}>Sub-Ítem / Descripción</th>
                          <th style={{ padding: '10px 12px', width: '130px', minWidth: '125px', textAlign: 'right' }}>Presupuesto Cotiz.</th>
                          <th style={{ padding: '10px 12px', width: '135px', minWidth: '125px', textAlign: 'center' }}>Historial Órdenes</th>
                          <th style={{ padding: '10px 12px', width: '300px', minWidth: '280px' }}>Proveedor Asignado *</th>
                          <th style={{ padding: '10px 12px', width: '130px', minWidth: '125px' }}>Tipo Orden *</th>
                          <th style={{ padding: '10px 12px', width: '110px', minWidth: '100px', textAlign: 'center' }}>Cant. Ordenar *</th>
                          <th style={{ padding: '10px 12px', width: '160px', minWidth: '150px', textAlign: 'right' }}>Monto a Ordenar (S/) *</th>
                          <th style={{ padding: '10px 12px', width: '190px', minWidth: '180px' }}>Condición de Pago *</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(rowsByCategory).map(([catName, catRows]) => {
                          const allCatSelected = catRows.every(r => r.selected);
                          const catBudgetedTotal = catRows.reduce((a, b) => a + b.budgetedTotal, 0);

                          return (
                            <React.Fragment key={`cat-${catName}`}>
                              {/* ENCABEZADO DE CATEGORÍA CON ACCIÓN RÁPIDA */}
                              <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
                                <td colSpan={9} style={{ padding: '7px 14px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <Layers size={14} color="#7c3aed" />
                                      <span style={{ fontWeight: 700, fontSize: '12px', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                        Categoría: {catName}
                                      </span>
                                      <span style={{ fontSize: '11px', background: '#e2e8f0', color: '#475569', padding: '1px 8px', borderRadius: '10px', fontWeight: 600 }}>
                                        {catRows.length} sub-ítem(s) • S/ {catBudgetedTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                    <button 
                                      type="button" 
                                      className="btn-secondary"
                                      onClick={() => handleToggleCategorySelection(catName)}
                                      style={{ fontSize: '11px', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '5px' }}
                                    >
                                      <CheckSquare size={12} />
                                      {allCatSelected ? 'Deseleccionar categoría' : 'Seleccionar categoría'}
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {/* FILAS DE SUB-ITEMS DE LA CATEGORÍA */}
                              {catRows.map((row) => {
                                const isFullyOrdered = row.alreadyOrderedTotal >= row.budgetedTotal && row.budgetedTotal > 0;
                                const diff = (Number(row.monto) || 0) - row.budgetedTotal;
                                const hasProvider = Boolean(row.proveedorId);

                                return (
                                  <tr 
                                    key={row.subItemId} 
                                    style={{ 
                                      borderBottom: '1px solid #f1f5f9', 
                                      borderLeft: hasProvider 
                                        ? (row.tipoOrden === 'Servicio' ? '4px solid #6366f1' : '4px solid #10b981')
                                        : '4px solid #cbd5e1',
                                      background: row.selected ? '#f5f3ff' : '#ffffff',
                                      transition: 'background 0.15s ease'
                                    }}
                                  >
                                    {/* Checkbox para asignación masiva */}
                                    <td style={{ padding: '9px 12px', textAlign: 'center', width: '48px', minWidth: '48px' }}>
                                      <input 
                                        type="checkbox" 
                                        checked={row.selected} 
                                        onChange={() => handleToggleRow(row.subItemId)} 
                                        style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                                        title="Marcar para asignar proveedor/condiciones con la barra superior"
                                      />
                                    </td>

                                    {/* Sub-item info */}
                                    <td style={{ padding: '9px 12px', width: '320px', minWidth: '300px' }}>
                                      <div style={{ fontSize: '10.5px', color: '#6366f1', fontWeight: 600, textTransform: 'uppercase' }}>
                                        {row.categoryName} &gt; {row.itemName}
                                      </div>
                                      <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '12.5px' }}>
                                        {row.subItemName}
                                      </div>
                                      {row.description && (
                                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px', maxWidth: '320px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {row.description}
                                        </div>
                                      )}
                                      <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>Cant: {row.quantity} • Días: {row.dates} • Unit: S/ {row.unitCost.toFixed(2)}</span>
                                        {row.orderGroup > 1 && (
                                          <span style={{ background: '#ede9fe', color: '#7c3aed', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                            Orden #{row.orderGroup}
                                          </span>
                                        )}
                                      </div>
                                    </td>

                                    {/* Presupuesto Cotizado */}
                                    <td style={{ padding: '9px 12px', width: '130px', minWidth: '125px', textAlign: 'right', fontWeight: 600, color: '#334155' }}>
                                      S/ {row.budgetedTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>

                                    {/* Historial Órdenes */}
                                    <td style={{ padding: '9px 12px', width: '135px', minWidth: '125px', textAlign: 'center' }}>
                                      {row.alreadyOrderedTotal === 0 ? (
                                        <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: '#f1f5f9', color: '#64748b' }}>
                                          ⚪ Sin orden
                                        </span>
                                      ) : isFullyOrdered ? (
                                        <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: '#ecfdf5', color: '#065f46', fontWeight: 600 }}>
                                          ✅ 100% Ordenado
                                        </span>
                                      ) : (
                                        <div>
                                          <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: '#fffbeb', color: '#b45309', fontWeight: 600 }}>
                                            ⚠️ S/ {row.alreadyOrderedTotal.toFixed(2)}
                                          </span>
                                          {row.existingOrderCodes.length > 0 && (
                                            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>
                                              {row.existingOrderCodes.join(', ')}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </td>

                                    {/* Proveedor Selector (SIEMPRE EDITABLE DIRECTAMENTE O EN LOTE) */}
                                    <td style={{ padding: '9px 12px', width: '300px', minWidth: '280px' }}>
                                      <SearchableProveedorSelect
                                        proveedores={proveedores}
                                        value={row.proveedorId}
                                        onChange={(pId) => handleUpdateRow(row.subItemId, 'proveedorId', pId)}
                                        placeholder="Seleccionar proveedor..."
                                      />
                                    </td>

                                    {/* Tipo Orden (CAMBIAR DE TIPO AUTOMÁTICAMENTE SEPARA EN OC O EN OS) */}
                                    <td style={{ padding: '9px 12px', width: '130px', minWidth: '125px' }}>
                                      <select 
                                        className="form-control" 
                                        value={row.tipoOrden} 
                                        onChange={e => handleUpdateRow(row.subItemId, 'tipoOrden', e.target.value)}
                                        style={{ 
                                          fontSize: '11.5px', 
                                          padding: '5px 8px', 
                                          width: '100%', 
                                          fontWeight: 600,
                                          color: row.tipoOrden === 'Servicio' ? '#4f46e5' : '#047857',
                                          background: row.tipoOrden === 'Servicio' ? '#eef2ff' : '#ecfdf5'
                                        }}
                                      >
                                        <option value="Compra">📦 Compra</option>
                                        <option value="Servicio">🛠️ Servicio</option>
                                      </select>
                                    </td>

                                    {/* Cantidad a Ordenar */}
                                    <td style={{ padding: '9px 12px', width: '110px', minWidth: '100px', textAlign: 'center' }}>
                                      <input 
                                        type="number" 
                                        min="1"
                                        step="1"
                                        className="form-control" 
                                        value={row.quantity} 
                                        onChange={e => handleUpdateRow(row.subItemId, 'quantity', parseInt(e.target.value) || 1)}
                                        style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '12px', padding: '5px 6px', width: '100%', borderColor: '#c4b5fd' }}
                                        title="Cantidad a colocar en la orden de compra"
                                      />
                                      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>
                                        Cot: {row.quantityOriginal || row.quantity} un.
                                      </div>
                                    </td>

                                    {/* Monto a Ordenar */}
                                    <td style={{ padding: '9px 12px', width: '160px', minWidth: '150px', textAlign: 'right' }}>
                                      <input 
                                        type="number" 
                                        step="0.01" 
                                        className="form-control" 
                                        value={row.monto} 
                                        onChange={e => handleUpdateRow(row.subItemId, 'monto', parseFloat(e.target.value) || 0)}
                                        style={{ 
                                          textAlign: 'right', 
                                          fontWeight: 'bold', 
                                          fontSize: '12.5px', 
                                          padding: '5px 8px', 
                                          width: '100%',
                                          color: hasProvider ? '#059669' : '#334155' 
                                        }}
                                      />
                                      {Math.abs(diff) > 0.05 && (
                                        <div style={{ fontSize: '10px', marginTop: '1px', fontWeight: 600, color: diff > 0 ? '#dc2626' : '#2563eb' }}>
                                          {diff > 0 ? `+S/ ${diff.toFixed(2)}` : `-S/ ${Math.abs(diff).toFixed(2)}`} vs cotiz.
                                        </div>
                                      )}
                                    </td>

                                    {/* Condiciones de Pago (DESPLEGABLE COMPLETO) */}
                                    <td style={{ padding: '9px 12px', width: '190px', minWidth: '180px' }}>
                                      <select 
                                        className="form-control" 
                                        value={row.condicionesPago} 
                                        onChange={e => handleUpdateRow(row.subItemId, 'condicionesPago', e.target.value)}
                                        style={{ fontSize: '11.5px', padding: '5px 8px', width: '100%' }}
                                      >
                                        {dynamicCondicionesOptions.map(opt => (
                                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                      </select>
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* BARRA INFERIOR DE NAVEGACIÓN HACIA LA REVISIÓN DE ÓRDENES */}
                  <div style={{ 
                    background: '#ffffff', 
                    borderRadius: '8px', 
                    border: '1px solid #e2e8f0', 
                    padding: '8px 14px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                    flexShrink: 0
                  }}>
                    <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Sparkles size={15} color="#7c3aed" />
                      <span>
                        <strong>{orderableRows.length}</strong> ítems asignados para emitir <strong>{Object.keys(groupsByOrder).length}</strong> orden(es) independiente(s) • Total: <strong style={{ color: '#059669', fontSize: '13px' }}>S/ {totalSumOrderable.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</strong>
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setShowQuickPreview(!showQuickPreview)}
                        style={{ border: 'none', background: 'transparent', color: '#6366f1', fontSize: '11.5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        {showQuickPreview ? 'Ocultar resumen ▼' : 'Ver resumen aquí ▲'}
                      </button>

                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => setActiveTab('orders')}
                        style={{ fontSize: '12px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <CreditCard size={14} />
                        Revisar Órdenes y Cuentas ({Object.keys(groupsByOrder).length}) ➡️
                      </button>
                    </div>
                  </div>

                  {/* VISTA PREVIA DESPLEGABLE DENTRO DE LA PESTAÑA DE ÍTEMS (OPCIONAL) */}
                  {showQuickPreview && Object.keys(groupsByOrder).length > 0 && (
                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '10px', flexShrink: 0 }}>
                      {Object.entries(groupsByOrder).map(([key, g]) => (
                        <div key={key} style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', fontSize: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700 }}>
                            <span>{g.proveedor?.razonSocial}</span>
                            <span style={{ fontSize: '10.5px', padding: '2px 6px', borderRadius: '6px', background: g.tipoOrden === 'Servicio' ? '#e0e7ff' : '#ecfdf5', color: g.tipoOrden === 'Servicio' ? '#3730a3' : '#065f46' }}>
                              {g.tipoOrden === 'Servicio' ? '🛠️ OS' : '📦 OC'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginTop: '4px' }}>
                            <span>{g.items.length} sub-ítem(s)</span>
                            <strong style={{ color: '#059669' }}>S/ {g.total.toFixed(2)}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )}

              {/* VISTA 2: ÓRDENES Y CUENTAS BANCARIAS (PANEL DEDICADO Y DESPEJADO) */}
              {activeTab === 'orders' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minHeight: 0 }}>
                  <div style={{ background: '#ffffff', padding: '14px 18px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>
                        Revisión de Órdenes a Emitir ({Object.keys(groupsByOrder).length} órdenes independientes)
                      </h4>
                      <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: '#64748b' }}>
                        Verifica el número de cuenta bancaria de destino y la condición de pago para cada orden antes de emitirlas.
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setActiveTab('items')}
                        style={{ fontSize: '11.5px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        ⬅️ Volver a editar ítems
                      </button>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569', background: '#f8fafc', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        Total Consolidado: <strong style={{ color: '#059669', fontSize: '14px' }}>S/ {totalSumOrderable.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Grid de tarjetas por orden independiente */}
                  {Object.keys(groupsByOrder).length === 0 ? (
                    <div style={{ padding: '36px', textAlign: 'center', background: '#ffffff', borderRadius: '10px', border: '1.5px dashed #cbd5e1', color: '#64748b' }}>
                      <AlertTriangle size={28} color="#f59e0b" style={{ margin: '0 auto 10px' }} />
                      <div style={{ fontWeight: 600, fontSize: '14px', color: '#334155' }}>Aún no hay proveedores asignados</div>
                      <p style={{ margin: '4px 0 12px 0', fontSize: '12px' }}>
                        Regresa a la pestaña "Matriz de Ítems" y asigna proveedores a los sub-ítems para configurar sus órdenes.
                      </p>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => setActiveTab('items')}
                        style={{ fontSize: '12px', padding: '6px 14px' }}
                      >
                        Ir a Matriz de Ítems
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '14px', flex: 1, overflowY: 'auto' }}>
                      {Object.entries(groupsByOrder).map(([groupKey, g]) => {
                        const config = consolidatedConfigs[groupKey] || {};
                        const selectedAccountId = config.cuentaBancariaId || g.proveedor?.cuentas?.[0]?.id || '';
                        const selectedCondiciones = config.condicionesPago || g.condicionesPago || defaultCondicion;
                        const selectedTipoOrden = config.tipoOrden || g.tipoOrden;
                        const hasMultipleForProvider = (ordersCountByProveedor[g.proveedorId] || 0) > 1;
                        const defaultAutoTitle = generateItemsTitle(g.items.map(it => ({ name: it.subItemName || it.itemName })));
                        const paymentBreakdown = calculateOrdenPaymentBreakdown(g.total, selectedCondiciones);

                        return (
                          <div 
                            key={groupKey} 
                            style={{ 
                              background: '#ffffff', 
                              border: g.tipoOrden === 'Servicio' ? '1.5px solid #c7d2fe' : '1.5px solid #a7f3d0', 
                              borderRadius: '10px', 
                              padding: '14px 16px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
                            }}
                          >
                            {/* Cabecera Proveedor y Tipo de Orden */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 700, fontSize: '13.5px', color: '#1e293b' }}>
                                    {g.proveedor?.razonSocial}
                                  </span>
                                  {hasMultipleForProvider && (
                                    <span style={{ fontSize: '10.5px', background: '#ede9fe', color: '#6d28d9', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>
                                      Orden #{g.orderGroup}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '11px', color: '#6366f1', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                  <Layers size={12} /> Proyecto: {g.projectName}
                                </div>
                                {g.proveedor && (
                                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                                    RUC: <strong>{g.proveedor.ruc || 'Sin RUC'}</strong> {!g.hasValidRuc && <span style={{ color: '#ef4444', fontWeight: 600 }}>(Falta RUC de 11 dígitos)</span>}
                                  </div>
                                )}
                              </div>

                              {/* Badge/Selector de Tipo de Orden para esta tarjeta */}
                              <select
                                className="form-control"
                                value={selectedTipoOrden}
                                onChange={e => handleChangeCardTipoOrden(groupKey, e.target.value as any)}
                                style={{ 
                                  width: 'auto', 
                                  fontSize: '11px', 
                                  padding: '4px 8px', 
                                  fontWeight: 700, 
                                  borderRadius: '8px', 
                                  background: selectedTipoOrden === 'Servicio' ? '#e0e7ff' : '#ecfdf5', 
                                  color: selectedTipoOrden === 'Servicio' ? '#3730a3' : '#065f46',
                                  border: selectedTipoOrden === 'Servicio' ? '1px solid #c7d2fe' : '1px solid #a7f3d0'
                                }}
                              >
                                <option value="Compra">📦 Compra (OC)</option>
                                <option value="Servicio">🛠️ Servicio (OS)</option>
                              </select>
                            </div>

                            {/* DETRACCIÓN SUNAT SPOT (PARA SERVICIOS) */}
                            {selectedTipoOrden === 'Servicio' && (() => {
                              const isRxH = isProveedorReciboPorHonorarios(g.proveedor);
                              if (isRxH) {
                                return (
                                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '8px 10px', borderRadius: '8px', fontSize: '10.5px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>📄</span>
                                    <span>
                                      <strong>Recibo por Honorarios:</strong> No corresponde detracción SPOT SUNAT.
                                    </span>
                                  </div>
                                );
                              }

                              const aplicaDet = config.aplicaDetraccion !== undefined ? config.aplicaDetraccion : g.total > 700;
                              const pctDet = config.porcentajeDetraccion || 12;
                              const montoDet = aplicaDet ? Number((g.total * (pctDet / 100)).toFixed(2)) : 0;
                              const montoNeto = aplicaDet ? Number((g.total - montoDet).toFixed(2)) : g.total;
                              const cuentaBN = g.proveedor?.cuentas?.find(c => 
                                (c.tipoCuenta || '').toLowerCase().includes('detracc') ||
                                (c.banco || '').toLowerCase().includes('nacion') ||
                                (c.banco || '').toLowerCase().includes('nación')
                              );

                              return (
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '8px 10px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#166534', cursor: 'pointer', margin: 0 }}>
                                      <input
                                        type="checkbox"
                                        checked={aplicaDet}
                                        onChange={e => updateConsolidatedConfig(groupKey, 'aplicaDetraccion', e.target.checked)}
                                        style={{ width: '14px', height: '14px', accentColor: '#16a34a' }}
                                      />
                                      <span>🏛️ Detracción SPOT SUNAT</span>
                                    </label>
                                    {aplicaDet && (
                                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                        <button
                                          type="button"
                                          onClick={() => updateConsolidatedConfig(groupKey, 'porcentajeDetraccion', 10)}
                                          style={{
                                            fontSize: '10px',
                                            padding: '1px 6px',
                                            borderRadius: '4px',
                                            border: '1px solid #16a34a',
                                            background: pctDet === 10 ? '#16a34a' : '#ffffff',
                                            color: pctDet === 10 ? '#ffffff' : '#166534',
                                            cursor: 'pointer',
                                            fontWeight: 600
                                          }}
                                        >
                                          10%
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => updateConsolidatedConfig(groupKey, 'porcentajeDetraccion', 12)}
                                          style={{
                                            fontSize: '10px',
                                            padding: '1px 6px',
                                            borderRadius: '4px',
                                            border: '1px solid #16a34a',
                                            background: pctDet === 12 ? '#16a34a' : '#ffffff',
                                            color: pctDet === 12 ? '#ffffff' : '#166534',
                                            cursor: 'pointer',
                                            fontWeight: 600
                                          }}
                                        >
                                          12%
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  {aplicaDet && (
                                    <div style={{ fontSize: '10.5px', color: '#15803d', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #86efac', paddingTop: '4px' }}>
                                      <span>Detracción ({pctDet}%): <strong>- S/ {montoDet.toFixed(2)}</strong></span>
                                      <span>Neto Comercial: <strong>S/ {montoNeto.toFixed(2)}</strong></span>
                                    </div>
                                  )}
                                  {aplicaDet && cuentaBN && (
                                    <div style={{ fontSize: '10px', color: '#166534' }}>
                                      🏦 Cuenta BN: <strong>{cuentaBN.numeroCuenta}</strong>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* ASIGNACIÓN DE CUENTA BANCARIA */}
                            {g.proveedor && (
                              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                                  <CreditCard size={13} color="#6366f1" /> Cuenta Bancaria de Depósito:
                                </label>
                                {(!g.proveedor.cuentas || g.proveedor.cuentas.length === 0) ? (
                                  <div style={{ fontSize: '11px', color: '#b91c1c', fontWeight: 600, background: '#fee2e2', padding: '4px 8px', borderRadius: '4px' }}>
                                    ⚠️ Sin cuenta bancaria registrada en Proveedores.
                                  </div>
                                ) : (
                                  <select
                                    className="form-control"
                                    value={selectedAccountId}
                                    onChange={e => updateConsolidatedConfig(groupKey, 'cuentaBancariaId', e.target.value)}
                                    style={{ fontSize: '11.5px', padding: '5px 8px', width: '100%', background: '#ffffff' }}
                                  >
                                    {g.proveedor.cuentas.map(c => (
                                      <option key={c.id} value={c.id}>
                                        {c.banco} ({c.tipoCuenta || 'Cuenta'}) - {c.numeroCuenta} {c.cci ? `| CCI: ${c.cci}` : ''}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            )}

                            {/* TÍTULO / CONCEPTO DE LA ORDEN CONSOLIDADA */}
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '3px' }}>
                                Concepto / Refiere a:
                              </label>
                              <input
                                type="text"
                                className="form-control"
                                placeholder="Título breve de la orden"
                                value={config.titulo ?? defaultAutoTitle}
                                onChange={e => updateConsolidatedConfig(groupKey, 'titulo', e.target.value)}
                                style={{ fontSize: '11.5px', padding: '4px 8px', width: '100%', background: '#ffffff' }}
                              />
                            </div>

                            {/* CONDICIÓN DE PAGO DE LA ORDEN CONSOLIDADA */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 500 }}>Condición Orden:</span>
                              <select
                                className="form-control"
                                value={selectedCondiciones}
                                onChange={e => updateConsolidatedConfig(groupKey, 'condicionesPago', e.target.value)}
                                style={{ width: '60%', fontSize: '11px', padding: '4px 6px' }}
                              >
                                {dynamicCondicionesOptions.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>

                            {/* DESGLOSE AUTOMÁTICO DE PAGO */}
                            <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px', color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600, color: '#334155' }}>Desglose de Pago:</span>
                              <strong style={{ color: '#0f766e' }}>{paymentBreakdown.descripcion}</strong>
                            </div>

                            {/* COMBINAR / CONSOLIDAR VARIOS ÍTEMS EN 1 */}
                            {g.items.length > 1 && (
                              <div style={{
                                background: config.isConsolidated ? '#f0fdf4' : '#f8fafc',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: config.isConsolidated ? '1.5px solid #86efac' : '1px dashed #cbd5e1',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                transition: 'all 0.2s ease'
                              }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: config.isConsolidated ? '#166534' : '#334155', cursor: 'pointer', margin: 0, fontWeight: 700 }}>
                                  <input 
                                    type="checkbox" 
                                    checked={Boolean(config.isConsolidated)} 
                                    onChange={e => updateConsolidatedConfig(groupKey, 'isConsolidated', e.target.checked)} 
                                    style={{ width: '16px', height: '16px', accentColor: '#16a34a', cursor: 'pointer' }}
                                  />
                                  <span>🔗 Combinar los {g.items.length} ítems en 1 solo ítem comercial para la orden</span>
                                </label>
                                {config.isConsolidated && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#15803d', margin: 0 }}>
                                      Descripción comercial consolidada (como saldrá en la factura/orden):
                                    </label>
                                    <input 
                                      type="text" 
                                      className="form-control" 
                                      placeholder="Ej: Servicio Integral de Producción y Espacio" 
                                      value={config.consolidatedName !== undefined ? config.consolidatedName : (config.titulo || defaultAutoTitle)} 
                                      onChange={e => updateConsolidatedConfig(groupKey, 'consolidatedName', e.target.value)}
                                      style={{ fontSize: '11.5px', padding: '6px 8px', width: '100%', background: '#ffffff', border: '1px solid #86efac' }}
                                    />
                                    <div style={{ fontSize: '10.5px', color: '#166534', lineHeight: 1.3 }}>
                                      ✓ La orden se emitirá con <strong>1 solo ítem por S/ {g.total.toFixed(2)}</strong>.
                                      <br />
                                      ✓ Se guardará el detalle de cada uno de los {g.items.length} subítems para la liquidación.
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* LISTADO DE SUB-ITEMS CON POSIBILIDAD DE SEPARAR EN OTRA ORDEN */}
                            <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>
                                Ítems en esta orden ({g.items.length}):
                              </span>
                              {g.items.map(it => (
                                <div key={it.subItemId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px', color: '#334155' }}>
                                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }} title={`${it.itemName} - ${it.subItemName}`}>
                                    • {it.subItemName || it.itemName}
                                  </span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <strong>S/ {it.monto.toFixed(2)}</strong>
                                    {g.items.length > 1 && (
                                      <button
                                        type="button"
                                        className="btn-icon"
                                        onClick={() => handleSplitItemToNewOrder(it.subItemId)}
                                        title="Separar este ítem en otra orden independiente"
                                        style={{ fontSize: '10px', padding: '2px 5px', color: '#7c3aed', background: '#ede9fe', borderRadius: '4px', cursor: 'pointer', border: 'none' }}
                                      >
                                        ↗️ Separar
                                      </button>
                                    )}
                                    {g.orderGroup > 1 && g.items.length === 1 && (
                                      <button
                                        type="button"
                                        className="btn-icon"
                                        onClick={() => handleMergeItemToMainOrder(it.subItemId)}
                                        title="Unir a la orden principal del proveedor"
                                        style={{ fontSize: '10px', padding: '2px 5px', color: '#047857', background: '#d1fae5', borderRadius: '4px', cursor: 'pointer', border: 'none' }}
                                      >
                                        ↙️ Unir
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Adjuntar Cotización del Proveedor (Opcional) */}
                            <div style={{
                              background: '#f8fafc',
                              border: '1px dashed #cbd5e1',
                              borderRadius: '8px',
                              padding: '6px 10px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              flexWrap: 'wrap'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                <Paperclip size={13} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                                <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>
                                  Cotización Proveedor:
                                </span>
                                {groupCotizaciones[groupKey] ? (
                                  <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {groupCotizaciones[groupKey].name}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                                    (Opcional)
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input 
                                  type="file" 
                                  id={`cotiz-masivo-${groupKey}`}
                                  accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                                  style={{ display: 'none' }}
                                  onChange={e => {
                                    if (e.target.files && e.target.files[0]) {
                                      const selected = e.target.files[0];
                                      setGroupCotizaciones(prev => ({ ...prev, [groupKey]: selected }));
                                    }
                                  }}
                                />
                                <label 
                                  htmlFor={`cotiz-masivo-${groupKey}`}
                                  style={{ fontSize: '10.5px', padding: '3px 8px', borderRadius: '4px', background: '#ffffff', border: '1px solid #cbd5e1', cursor: 'pointer', color: '#334155', fontWeight: 500 }}
                                >
                                  {groupCotizaciones[groupKey] ? 'Cambiar' : '📎 Adjuntar'}
                                </label>
                                {groupCotizaciones[groupKey] && (
                                  <button
                                    type="button"
                                    onClick={() => setGroupCotizaciones(prev => {
                                      const next = { ...prev };
                                      delete next[groupKey];
                                      return next;
                                    })}
                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                                    title="Quitar archivo"
                                  >
                                    <X size={13} />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Total de esta orden */}
                            <div style={{ fontSize: '12px', color: '#475569', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
                              <span>Total a emitir en esta {selectedTipoOrden === 'Servicio' ? 'OS' : 'OC'}:</span>
                              <span style={{ fontSize: '14px', fontWeight: 700, color: '#059669' }}>
                                S/ {g.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Alerta de validación */}
                  {!validationSummary.canGenerate && validationSummary.error && (
                    <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#991b1b', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangle size={18} color="#ef4444" style={{ flexShrink: 0 }} />
                      <span>{validationSummary.error}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="modal-footer" style={{ padding: '12px 20px', flexShrink: 0, borderTop: '1px solid #e2e8f0', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '12.5px', color: '#64748b' }}>
            {orderableRows.length > 0 ? (
              <span>
                <strong>{orderableRows.length}</strong> ítems listos para emitir <strong>{Object.keys(groupsByOrder).length}</strong> orden(es) independiente(s) • Total: <strong style={{ color: '#059669' }}>S/ {totalSumOrderable.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</strong>
              </span>
            ) : (
              <span>Asigna proveedores a los ítems para poder generar las órdenes.</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={onClose} 
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            
            {activeTab === 'items' && Object.keys(groupsByOrder).length > 0 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setActiveTab('orders')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#7c3aed', borderColor: '#c4b5fd' }}
              >
                <CreditCard size={15} />
                Revisar Cuentas ({Object.keys(groupsByOrder).length})
              </button>
            )}

            <button 
              type="button" 
              className="btn-primary" 
              onClick={handleGenerateBatch}
              disabled={isSubmitting || !validationSummary.canGenerate}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Layers size={17} />
              {isSubmitting 
                ? 'Generando Órdenes...' 
                : `Generar ${Object.keys(groupsByOrder).length} Órdenes (S/ ${totalSumOrderable.toLocaleString('es-PE', { minimumFractionDigits: 2 })})`
              }
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
