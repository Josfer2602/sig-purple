import React, { useState, useRef } from 'react';
import { useGlobalContext } from '../context/GlobalContext';
import { ChevronDown, ChevronRight, ChevronLeft, Search, X, CheckCircle, Clock, List, FolderTree, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { Quote } from '../types/quote';
import type { Orden, OrdenSubItem, GastoProduccion, GastoProduccionItem } from '../types/models';
import { SkeletonTable } from '../components/SkeletonTable';
import { useIsMobile } from '../hooks/useIsMobile';

export const LiquidacionesView: React.FC = () => {
  const { quotes, clientes, proyectos, ordenes, pagos, gastosProduccion, proveedores, updateQuote, updateProyecto, isLoading } = useGlobalContext();
  const isMobile = useIsMobile(768);
  const [mobileDisplayMode, setMobileDisplayMode] = useState<'cards' | 'table'>('cards');
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat');
  const [sortField, setSortField] = useState<'quote' | 'client' | 'project' | 'status' | 'venta' | 'presupuesto' | 'gasto' | 'pagado'>('quote');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [expandedQuotes, setExpandedQuotes] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'todas' | 'en_proceso' | 'liquidado'>('todas');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const handleScrollTable = (direction: 'left' | 'right') => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({
        left: direction === 'left' ? -350 : 350,
        behavior: 'smooth'
      });
    }
  };

  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  const toggleClient = (clientName: string) => setExpandedClients(prev => ({ ...prev, [clientName]: !prev[clientName] }));
  const toggleProject = (projectKey: string) => setExpandedProjects(prev => ({ ...prev, [projectKey]: !prev[projectKey] }));

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [selectedCategoryByQuote, setSelectedCategoryByQuote] = useState<Record<string, string>>({});

  const toggleItem = (itemId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: prev[itemId] === undefined ? false : !prev[itemId]
    }));
  };

  const expandAllItems = (q: Quote, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const update: Record<string, boolean> = {};
    (q.categories || []).forEach(cat => (cat.items || []).forEach(it => {
      update[it.id] = true;
    }));
    setExpandedItems(prev => ({ ...prev, ...update }));
  };

  const collapseAllItems = (q: Quote, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const update: Record<string, boolean> = {};
    (q.categories || []).forEach(cat => (cat.items || []).forEach(it => {
      update[it.id] = false;
    }));
    setExpandedItems(prev => ({ ...prev, ...update }));
  };

  const getClientName = (id: string) => clientes.find(c => c.id === id)?.empresa || id;
  const getProjectName = (id: string) => proyectos.find(p => p.id === id)?.nombre || 'Proyecto Desconocido';

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(amount);
  };

  const toggleExpand = (quoteId: string) => {
    setExpandedQuotes(prev => ({
      ...prev,
      [quoteId]: !prev[quoteId]
    }));
  };

  const getEstadoLiquidacion = (q: Quote, projectId?: string): 'En Proceso' | 'Liquidado' => {
    const proj = proyectos.find(p => p.id === projectId);
    const qStatus = (q.status || '').toLowerCase();
    const projAct = (proj?.statusActividad || '').toLowerCase();

    if (qStatus === 'liquidado' || projAct === 'liquidado') {
      return 'Liquidado';
    }
    return 'En Proceso';
  };

  const handleToggleEstado = async (q: Quote, nuevoEstado: 'En Proceso' | 'Liquidado', e?: React.MouseEvent | React.ChangeEvent) => {
    if (e) e.stopPropagation();
    setUpdatingId(q.id);
    try {
      // 1. Update quote status
      const updatedQuote: Quote = {
        ...q,
        status: nuevoEstado === 'Liquidado' ? 'Liquidado' : 'Aprobado'
      };
      await updateQuote(updatedQuote);

      // 2. If project exists, update its statusActividad
      if (q.projectId) {
        await updateProyecto(q.projectId, 'statusActividad', nuevoEstado);
      }

      toast.success(`Liquidación actualizada a: ${nuevoEstado}`);
    } catch (err: any) {
      console.error('Error updating liquidation status:', err);
      toast.error('Error al actualizar el estado de liquidación');
    } finally {
      setUpdatingId(null);
    }
  };

  const isOrdenRelatedToQuote = (o: any, q: Quote) => {
    if (o.quoteId) {
      return o.quoteId === q.id;
    }
    if (q.projectId && o.proyectoId === q.projectId) {
      const quoteSubItemIds = new Set<string>();
      (q.categories || []).forEach(c => c.items?.forEach(it => it.subItems?.forEach(sub => {
        if (sub.id) quoteSubItemIds.add(String(sub.id));
      })));
      const hasMatchingItem = (o.items || []).some((oi: any) => oi.quoteSubItemId && quoteSubItemIds.has(String(oi.quoteSubItemId)));
      if (hasMatchingItem) return true;

      const approvedProjectQuotes = quotes.filter(otherQ => {
        const s = (otherQ.status || '').toLowerCase();
        return otherQ.projectId === q.projectId && (s.includes('aprob') || s.includes('liquid'));
      });
      if (approvedProjectQuotes.length <= 1) return true;
    }
    return false;
  };

  const isGastoRelatedToQuote = (g: any, q: Quote) => {
    if (g.quoteId) {
      return g.quoteId === q.id;
    }
    if (q.projectId && g.proyectoId === q.projectId) {
      const approvedProjectQuotes = quotes.filter(otherQ => {
        const s = (otherQ.status || '').toLowerCase();
        return otherQ.projectId === q.projectId && (s.includes('aprob') || s.includes('liquid'));
      });
      if (approvedProjectQuotes.length <= 1) return true;
    }
    return false;
  };

  const calculateQuoteMetrics = (q: Quote) => {
    let totalCostoProveedor = 0;
    let totalCostoCliente = 0;

    q.categories.forEach(cat => {
      cat.items.forEach(item => {
        const itemTotalProvider = item.subItems.reduce((acc, sub) => acc + (sub.unitCost * sub.quantity * sub.dates), 0);
        totalCostoProveedor += itemTotalProvider;

        const internalMultiplierAmount = itemTotalProvider * ((item.internalMultiplierPercent || 0) / 100);
        const financialExpense = itemTotalProvider * ((item.financialExpensePercent || 0) / 100);
        const rawCalculatedClientCost = itemTotalProvider + internalMultiplierAmount + financialExpense;
        const finalClientCost = Math.round(rawCalculatedClientCost);
        totalCostoCliente += finalClientCost;
      });
    });

    const ordenesRelacionadas = ordenes.filter(o => isOrdenRelatedToQuote(o, q));
    const gastosRelacionados = gastosProduccion.filter(g => isGastoRelatedToQuote(g, q));
    
    const getOrderCostSinIgv = (o: any) => {
      if (o.items && o.items.length > 0) {
        const itemsSubtotal = o.items.reduce((sum: number, it: any) => sum + (Number(it.total) || 0), 0);
        if (itemsSubtotal > 0) return itemsSubtotal;
      }
      const prov = proveedores.find(pr => pr.id === o.proveedorId);
      const tieneIgv = prov?.tipoDocumento === 'Factura';
      return tieneIgv ? (Number(o.total) || 0) / 1.18 : (Number(o.total) || 0);
    };

    const gastoRealOrdenes = ordenesRelacionadas.reduce((acc, o) => acc + getOrderCostSinIgv(o), 0);
    const gastoRealProduccion = gastosRelacionados.reduce((acc, g) => acc + g.total, 0);
    
    const gastoReal = gastoRealOrdenes + gastoRealProduccion;

    const totalVentaCliente = totalCostoCliente * 1.12; // Inclusión del 12% Fee de Agencia cotizado al cliente
    const margenProyectado = totalVentaCliente - totalCostoProveedor;
    const margenReal = totalVentaCliente - gastoReal;

    const porcentajeMargenProyectado = totalCostoProveedor > 0 ? (margenProyectado / totalCostoProveedor) * 100 : 0;
    const porcentajeMargenReal = gastoReal > 0 ? (margenReal / gastoReal) * 100 : 0;

    const pagadoTotal = pagos
      .filter(p => (p.quoteId === q.id || (p.ordenId && ordenes.some(o => o.id === p.ordenId && (o.quoteId === q.id || (q.projectId && o.proyectoId === q.projectId))))) && p.estado === 'Pagado')
      .reduce((acc, p) => acc + (Number(p.monto) || 0), 0);

    return {
      venta: totalVentaCliente,
      gastoProyectado: totalCostoProveedor,
      gastoReal,
      pagadoTotal,
      margenProyectado,
      margenReal,
      porcentajeMargenProyectado,
      porcentajeMargenReal
    };
  };

  const getQuoteDesgloseStats = (q: Quote) => {
    const norm = (s: any) => {
      if (!s) return '';
      return String(s)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    };

    const quoteOrders = ordenes.filter(o => isOrdenRelatedToQuote(o, q));
    const quoteGastos = gastosProduccion.filter(g => isGastoRelatedToQuote(g, q));

    const subsList: Array<{ sub: any; item: any; cat: any }> = [];
    (q.categories || []).forEach(cat => {
      (cat.items || []).forEach(it => {
        (it.subItems || []).forEach(sub => {
          subsList.push({ sub, item: it, cat });
        });
      });
    });

    const subOrdersMap: Record<string, Array<{ order: Orden; item: OrdenSubItem }>> = {};
    const subGastosMap: Record<string, Array<{ gasto: GastoProduccion; item: GastoProduccionItem }>> = {};

    subsList.forEach(s => {
      const sId = String(s.sub.id || '');
      subOrdersMap[sId] = [];
      subGastosMap[sId] = [];
    });

    // 1. Match order items
    quoteOrders.forEach(o => {
      (o.items || []).forEach(oi => {
        const oiId = String(oi.quoteSubItemId || '');
        const oiName = norm(oi.name || oi.customDescription || '');
        let matchedSubId: string | null = null;

        if (oiId && oiId.includes(',')) {
          // Si la orden fue consolidada de 2 o más sub-ítems
          const ids = oiId.split(',').map(s => s.trim()).filter(Boolean);
          ids.forEach(singleId => {
            if (subOrdersMap[singleId]) {
              subOrdersMap[singleId].push({ order: o, item: oi });
            }
          });
        } else if (oiId && subOrdersMap[oiId]) {
          matchedSubId = oiId;
        } else {
          // Priority 1: exact subitem name match
          for (const s of subsList) {
            const sName = norm(s.sub.name);
            if (oiName && sName === oiName) {
              matchedSubId = String(s.sub.id || '');
              break;
            }
          }
          // Priority 2: partial subitem name match (non-imprevisto)
          if (!matchedSubId) {
            for (const s of subsList) {
              const sName = norm(s.sub.name);
              if (!sName.includes('imprevist') && sName.length >= 4) {
                if (sName.includes(oiName) || oiName.includes(sName)) {
                  matchedSubId = String(s.sub.id || '');
                  break;
                }
              }
            }
          }
          // Priority 3: item name match (non-imprevisto)
          if (!matchedSubId) {
            for (const s of subsList) {
              const itName = norm(s.item.name);
              const sName = norm(s.sub.name);
              if (!sName.includes('imprevist') && itName.length >= 4) {
                if (itName.includes(oiName) || oiName.includes(itName)) {
                  matchedSubId = String(s.sub.id || '');
                  break;
                }
              }
            }
          }
        }

        if (matchedSubId && subOrdersMap[matchedSubId]) {
          subOrdersMap[matchedSubId].push({ order: o, item: oi });
        }
      });
    });

    // 2. Match gastos items
    quoteGastos.forEach(g => {
      (g.items || []).forEach(gi => {
        const giId = String(gi.quoteSubItemId || '');
        const giName = norm(gi.name || (gi as any).descripcion || '');
        let matchedSubId: string | null = null;

        if (giId && subGastosMap[giId]) {
          matchedSubId = giId;
        } else {
          for (const s of subsList) {
            const sName = norm(s.sub.name);
            if (giName && sName === giName) {
              matchedSubId = String(s.sub.id || '');
              break;
            }
          }
          if (!matchedSubId) {
            for (const s of subsList) {
              const sName = norm(s.sub.name);
              if (!sName.includes('imprevist') && sName.length >= 4) {
                if (sName.includes(giName) || giName.includes(sName)) {
                  matchedSubId = String(s.sub.id || '');
                  break;
                }
              }
            }
          }
        }

        if (matchedSubId && subGastosMap[matchedSubId]) {
          subGastosMap[matchedSubId].push({ gasto: g, item: gi });
        }
      });
    });

    // 3. Compute stats per subItem
    const subStats: Record<string, { realCost: number; paid: number; orders: Array<{ order: any; item: any }>; gastos: Array<{ gasto: any; item: any }> }> = {};
    subsList.forEach(s => {
      const sId = String(s.sub.id || '');
      const ordersForSub = subOrdersMap[sId] || [];
      const gastosForSub = subGastosMap[sId] || [];

      let realOrders = 0;
      ordersForSub.forEach(x => {
        const oi = x.item;
        const oiId = String(oi.quoteSubItemId || '');
        if (oiId.includes(',')) {
          const ids = oiId.split(',').map(str => str.trim()).filter(Boolean);
          const totalBudgetOfConsolidated = subsList
            .filter(subObj => ids.includes(String(subObj.sub.id || '')))
            .reduce((sum, subObj) => sum + ((Number(subObj.sub.quantity) || 1) * (Number(subObj.sub.dates) || 1) * (Number(subObj.sub.unitCost) || 0)), 0);

          const myBudget = (Number(s.sub.quantity) || 1) * (Number(s.sub.dates) || 1) * (Number(s.sub.unitCost) || 0);
          const ratio = totalBudgetOfConsolidated > 0 ? (myBudget / totalBudgetOfConsolidated) : (1 / Math.max(1, ids.length));
          realOrders += (Number(oi.total) || 0) * ratio;
        } else {
          realOrders += (Number(oi.total) || 0);
        }
      });

      const realGastos = gastosForSub.reduce((acc, x) => acc + (Number(x.item.monto) || 0), 0);
      const realCost = realOrders + realGastos;

      let paid = 0;
      ordersForSub.forEach(x => {
        const o = x.order;
        const oi = x.item;
        let oTotal = Number(o.total) || 0;
        if (oTotal <= 0) {
          oTotal = (o.items || []).reduce((acc, it) => acc + (Number(it.total) || 0), 0) || 1;
        }
        const oPagos = pagos
          .filter(p => p.ordenId === o.id && p.estado === 'Pagado')
          .reduce((acc, p) => acc + (Number(p.monto) || 0), 0);

        if (oTotal > 0 && oPagos > 0) {
          const oiId = String(oi.quoteSubItemId || '');
          let itemEffectiveTotal = Number(oi.total) || 0;
          if (oiId.includes(',')) {
            const ids = oiId.split(',').map(str => str.trim()).filter(Boolean);
            const totalBudgetOfConsolidated = subsList
              .filter(subObj => ids.includes(String(subObj.sub.id || '')))
              .reduce((sum, subObj) => sum + ((Number(subObj.sub.quantity) || 1) * (Number(subObj.sub.dates) || 1) * (Number(subObj.sub.unitCost) || 0)), 0);

            const myBudget = (Number(s.sub.quantity) || 1) * (Number(s.sub.dates) || 1) * (Number(s.sub.unitCost) || 0);
            const ratio = totalBudgetOfConsolidated > 0 ? (myBudget / totalBudgetOfConsolidated) : (1 / Math.max(1, ids.length));
            itemEffectiveTotal = (Number(oi.total) || 0) * ratio;
          }
          paid += (itemEffectiveTotal / oTotal) * oPagos;
        }
      });

      subStats[sId] = { realCost, paid, orders: ordersForSub, gastos: gastosForSub };
    });

    // 4. Compute stats per item
    const itemStats: Record<string, { realCost: number; paid: number }> = {};
    (q.categories || []).forEach(cat => {
      (cat.items || []).forEach(it => {
        const itId = String(it.id || '');
        let itemRealCost = 0;
        let itemPaid = 0;
        (it.subItems || []).forEach(sub => {
          const stats = subStats[String(sub.id || '')] || { realCost: 0, paid: 0 };
          itemRealCost += stats.realCost;
          itemPaid += stats.paid;
        });
        itemStats[itId] = { realCost: itemRealCost, paid: itemPaid };
      });
    });

    return { subStats, itemStats };
  };

  // Quotes elegibles para liquidaciones (estrictamente aprobadas o liquidadas)
  const isAprobadaOLiquidable = (q: Quote) => {
    if (!q.projectId) return false;
    const qStatus = (q.status || '').toLowerCase().trim();

    // Jamás incluir cotizaciones rechazadas, borradores, en creación o en revisión
    if (
      qStatus.includes('rechaz') ||
      qStatus.includes('borrador') ||
      qStatus.includes('creaci') ||
      qStatus.includes('enviad') ||
      qStatus.includes('revisi') ||
      qStatus.includes('pendient')
    ) {
      return false;
    }

    return qStatus.includes('aprob') || qStatus.includes('liquid');
  };

  const liquidablesTotal = quotes.filter(isAprobadaOLiquidable);
  const totalLiquidacionesCount = liquidablesTotal.length;
  const enProcesoCount = liquidablesTotal.filter(q => getEstadoLiquidacion(q, q.projectId) === 'En Proceso').length;
  const liquidadoCount = liquidablesTotal.filter(q => getEstadoLiquidacion(q, q.projectId) === 'Liquidado').length;

  const filteredQuotes = liquidablesTotal.filter(q => {
    const estado = getEstadoLiquidacion(q, q.projectId);
    if (activeTab === 'en_proceso' && estado !== 'En Proceso') return false;
    if (activeTab === 'liquidado' && estado !== 'Liquidado') return false;

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const clientName = getClientName(q.client).toLowerCase();
      const projectName = getProjectName(q.projectId!).toLowerCase();
      const req = (q.requirement || '').toLowerCase();
      const ver = `v${q.version}`;
      
      return clientName.includes(searchLower) || projectName.includes(searchLower) || req.includes(searchLower) || ver.includes(searchLower);
    }
    
    return true;
  });

  const groupedAprobadas = filteredQuotes.reduce((acc, quote) => {
    const clientName = getClientName(quote.client);
    const projectName = getProjectName(quote.projectId!);
    
    if (!acc[clientName]) acc[clientName] = {};
    if (!acc[clientName][projectName]) acc[clientName][projectName] = [];
    
    acc[clientName][projectName].push(quote);
    return acc;
  }, {} as Record<string, Record<string, Quote[]>>);


  const handleSort = (field: 'quote' | 'client' | 'project' | 'status' | 'venta' | 'presupuesto' | 'gasto' | 'pagado') => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const renderSortHeader = (label: string, field: 'quote' | 'client' | 'project' | 'status' | 'venta' | 'presupuesto' | 'gasto' | 'pagado', className = 'text-left', style: React.CSSProperties = {}) => {
    const isActive = sortField === field;
    return (
      <th
        className={`th-custom ${className}`}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background-color 0.15s, color 0.15s',
          ...style
        }}
        onClick={() => handleSort(field)}
        title={`Ordenar por ${label}`}
      >
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          justifyContent: className.includes('text-center') ? 'center' : className.includes('text-right') ? 'flex-end' : 'flex-start',
          width: '100%'
        }}>
          <span style={{ color: isActive ? 'var(--accent-primary)' : 'inherit', fontWeight: isActive ? 700 : 'inherit' }}>
            {label}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', opacity: isActive ? 1 : 0.35, color: isActive ? 'var(--accent-primary)' : 'inherit' }}>
            {isActive ? (
              sortOrder === 'asc' ? <ArrowUp size={13} strokeWidth={2.5} /> : <ArrowDown size={13} strokeWidth={2.5} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </span>
        </div>
      </th>
    );
  };

  const sortedQuotes = React.useMemo(() => {
    return [...filteredQuotes].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'quote': {
          const nameA = `${a.requirement || ''} v${a.version}`;
          const nameB = `${b.requirement || ''} v${b.version}`;
          comparison = nameA.localeCompare(nameB);
          break;
        }
        case 'client': {
          const cA = getClientName(a.client);
          const cB = getClientName(b.client);
          comparison = cA.localeCompare(cB);
          break;
        }
        case 'project': {
          const pA = getProjectName(a.projectId!);
          const pB = getProjectName(b.projectId!);
          comparison = pA.localeCompare(pB);
          break;
        }
        case 'status': {
          const sA = getEstadoLiquidacion(a, a.projectId);
          const sB = getEstadoLiquidacion(b, b.projectId);
          comparison = sA.localeCompare(sB);
          break;
        }
        case 'venta': {
          const vA = calculateQuoteMetrics(a).venta;
          const vB = calculateQuoteMetrics(b).venta;
          comparison = vA - vB;
          break;
        }
        case 'presupuesto': {
          const pA = calculateQuoteMetrics(a).gastoProyectado;
          const pB = calculateQuoteMetrics(b).gastoProyectado;
          comparison = pA - pB;
          break;
        }
        case 'gasto': {
          const gA = calculateQuoteMetrics(a).gastoReal;
          const gB = calculateQuoteMetrics(b).gastoReal;
          comparison = gA - gB;
          break;
        }
        case 'pagado': {
          const pgA = calculateQuoteMetrics(a).pagadoTotal;
          const pgB = calculateQuoteMetrics(b).pagadoTotal;
          comparison = pgA - pgB;
          break;
        }
        default:
          comparison = 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredQuotes, sortField, sortOrder, ordenes, pagos, gastosProduccion]);


  const renderLiquidacionQuoteRow = (q: Quote) => {

                          const metrics = calculateQuoteMetrics(q);
                          const isExpanded = expandedQuotes[q.id];
                          const estado = getEstadoLiquidacion(q, q.projectId);
                          const isUpdating = updatingId === q.id;

                          return (
                            <React.Fragment key={q.id}>
                              {/* Fila Principal de la Cotización */}
                              <tr className="expandable-row" onClick={() => toggleExpand(q.id)} style={{ cursor: 'pointer', background: isExpanded ? 'rgba(0,0,0,0.03)' : 'transparent' }}>
                                <td className="td-custom text-center sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: 'inherit' }}>
                                  {isExpanded ? <ChevronDown size={18} color="var(--accent-primary)" /> : <ChevronRight size={18} color="var(--text-muted)" />}
                                </td>
                                <td className="td-custom sticky-col-left" style={{ position: 'sticky', left: '45px', zIndex: 10, backgroundColor: 'inherit' }}>
                                  <div className="font-bold">V{q.version} - {q.requirement}</div>
                                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{q.date}</div>
                                </td>
                                <td className="td-custom">
                                  <div className="font-bold">{getClientName(q.client)}</div>
                                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{getProjectName(q.projectId!)}</div>
                                </td>
                                <td className="td-custom text-center" onClick={(e) => e.stopPropagation()}>
                                  <select
                                    value={estado}
                                    disabled={isUpdating}
                                    onChange={(e) => handleToggleEstado(q, e.target.value as 'En Proceso' | 'Liquidado', e)}
                                    style={{
                                      padding: '4px 10px',
                                      borderRadius: '20px',
                                      fontSize: '12px',
                                      fontWeight: '600',
                                      border: estado === 'Liquidado' ? '1px solid #10b981' : '1px solid #f59e0b',
                                      backgroundColor: estado === 'Liquidado' ? '#ecfdf5' : '#fffbeb',
                                      color: estado === 'Liquidado' ? '#047857' : '#b45309',
                                      cursor: isUpdating ? 'wait' : 'pointer',
                                      outline: 'none',
                                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                    }}
                                  >
                                    <option value="En Proceso">⏳ En Proceso</option>
                                    <option value="Liquidado">✓ Liquidado</option>
                                  </select>
                                </td>
                                <td className="td-custom text-right font-bold text-emerald font-tabular">
                                  {formatCurrency(metrics.venta)}
                                </td>
                                <td className="td-custom text-right text-purple font-tabular">
                                  {formatCurrency(metrics.gastoProyectado)}
                                </td>
                                <td className="td-custom text-right font-bold font-tabular" style={{ color: 'var(--accent-primary)' }}>
                                  {formatCurrency(metrics.gastoReal)}
                                </td>
                                <td className="td-custom text-right font-bold font-tabular" style={{ color: 'var(--success)' }}>
                                  {formatCurrency(
                                    pagos.filter(p => (p.quoteId === q.id || (p.ordenId && ordenes.some(o => o.id === p.ordenId && (o.quoteId === q.id || (q.projectId && o.proyectoId === q.projectId))))) && p.estado === 'Pagado')
                                      .reduce((acc, p) => acc + p.monto, 0)
                                  )}
                                </td>
                                <td className="td-custom text-center sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 10, backgroundColor: 'inherit' }} onClick={(e) => e.stopPropagation()}>
                                  <button
                                    disabled={isUpdating}
                                    onClick={(e) => handleToggleEstado(q, estado === 'Liquidado' ? 'En Proceso' : 'Liquidado', e)}
                                    style={{
                                      padding: '4px 10px',
                                      borderRadius: '6px',
                                      fontSize: '12px',
                                      fontWeight: '500',
                                      cursor: isUpdating ? 'wait' : 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      border: estado === 'Liquidado' ? '1px solid #d1d5db' : '1px solid #10b981',
                                      backgroundColor: estado === 'Liquidado' ? '#f3f4f6' : '#10b981',
                                      color: estado === 'Liquidado' ? '#4b5563' : '#ffffff',
                                      transition: 'all 0.2s'
                                    }}
                                    title={estado === 'Liquidado' ? 'Reabrir a En Proceso' : 'Marcar como Liquidado'}
                                  >
                                    {estado === 'Liquidado' ? (
                                      <>
                                        <Clock size={13} /> Reabrir
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircle size={13} /> Liquidar
                                      </>
                                    )}
                                  </button>
                                </td>
                              </tr>

                              {/* Desglose Jerárquico si está expandido */}
                              {isExpanded && (() => {
                                const desglose = getQuoteDesgloseStats(q);
                                
                                // Totales de la cotización
                                const totalPresupuesto = (q.categories || []).reduce((acc, cat) => acc + (cat.items || []).reduce((acc2, item) => acc2 + (item.subItems || []).reduce((acc3, sub) => acc3 + (sub.unitCost * sub.quantity * sub.dates), 0), 0), 0);
                                const totalGastoReal = metrics.gastoReal;
                                const totalDiferencia = totalPresupuesto - totalGastoReal;
                                const isAhorro = totalDiferencia >= 0;
                                const pctAhorro = totalPresupuesto > 0 ? (Math.abs(totalDiferencia) / totalPresupuesto) * 100 : 0;
                                
                                const totalPagado = pagos
                                  .filter(p => (p.quoteId === q.id || (p.ordenId && ordenes.some(o => o.id === p.ordenId && isOrdenRelatedToQuote(o, q)))) && p.estado === 'Pagado')
                                  .reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
                                const pctPagado = totalGastoReal > 0 ? Math.min(100, Math.round((totalPagado / totalGastoReal) * 100)) : 0;

                                // Imprevistos
                                let totalImprevistoPpto = 0;
                                let totalImprevistoReal = 0;
                                (q.categories || []).forEach(cat => (cat.items || []).forEach(it => (it.subItems || []).forEach(sub => {
                                  if ((sub.name || '').toLowerCase().includes('imprevist')) {
                                    totalImprevistoPpto += (sub.unitCost * sub.quantity * sub.dates);
                                    const st = desglose.subStats[String(sub.id || '')];
                                    totalImprevistoReal += (st?.realCost || 0);
                                  }
                                })));
                                const saldoImprevisto = totalImprevistoPpto - totalImprevistoReal;

                                const currentCatFilter = selectedCategoryByQuote[q.id] || 'todas';
                                const filteredCategories = currentCatFilter === 'todas'
                                  ? (q.categories || [])
                                  : (q.categories || []).filter(c => c.name === currentCatFilter);

                                return (
                                  <tr>
                                    <td colSpan={9} style={{ padding: 0 }}>
                                      <div style={{ padding: '20px 28px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        
                                        {/* HEADER DEL DESGLOSE + ACCIONES */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                                          <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                              <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--accent-primary)', textTransform: 'uppercase' }}>
                                                Auditoría Financiera de Producción
                                              </span>
                                              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(102, 45, 145, 0.08)', color: 'var(--accent-primary)', fontWeight: 600 }}>
                                                V{q.version} • {q.requirement}
                                              </span>
                                            </div>
                                            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '2px 0 0 0', color: '#1e293b' }}>
                                              Desglose Operativo por Ítem y Subítem
                                            </h3>
                                          </div>

                                          {/* BOTONES EXPANDIR / COLAPSAR TODOS */}
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button
                                              type="button"
                                              onClick={(e) => expandAllItems(q, e)}
                                              style={{
                                                fontSize: '11px',
                                                padding: '5px 12px',
                                                borderRadius: '6px',
                                                border: '1px solid #cbd5e1',
                                                background: '#ffffff',
                                                color: '#475569',
                                                cursor: 'pointer',
                                                fontWeight: 600,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                              }}
                                            >
                                              <span>▼</span> Expandir todos los ítems
                                            </button>
                                            <button
                                              type="button"
                                              onClick={(e) => collapseAllItems(q, e)}
                                              style={{
                                                fontSize: '11px',
                                                padding: '5px 12px',
                                                borderRadius: '6px',
                                                border: '1px solid #cbd5e1',
                                                background: '#ffffff',
                                                color: '#475569',
                                                cursor: 'pointer',
                                                fontWeight: 600,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                              }}
                                            >
                                              <span>▶</span> Colapsar todos
                                            </button>
                                          </div>
                                        </div>

                                        {/* 1. MINI DASHBOARD DE KPIS */}
                                        <div style={{
                                          display: 'grid',
                                          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                          gap: '12px',
                                          marginBottom: '18px'
                                        }}>
                                          {/* KPI 1: Presupuesto Costo */}
                                          <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Presupuesto Costo</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                                              {formatCurrency(totalPresupuesto)}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                                              Costo base cotizado a proveedores
                                            </div>
                                          </div>

                                          {/* KPI 2: Gasto Real */}
                                          <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Gasto Real Comprometido</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent-primary)', marginTop: '2px' }}>
                                              {formatCurrency(totalGastoReal)}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                              Total acumulado en órdenes OC / OS
                                            </div>
                                          </div>

                                          {/* KPI 3: Saldo / Variación */}
                                          <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '10px', border: `1px solid ${isAhorro ? '#bbf7d0' : '#fecaca'}`, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                                                {isAhorro ? 'Ahorro Obtenido' : 'Sobrecosto'}
                                              </span>
                                              <span style={{
                                                fontSize: '10px',
                                                fontWeight: 700,
                                                padding: '1px 6px',
                                                borderRadius: '10px',
                                                background: isAhorro ? '#dcfce7' : '#fee2e2',
                                                color: isAhorro ? '#15803d' : '#b91c1c'
                                              }}>
                                                {isAhorro ? `+${pctAhorro.toFixed(1)}%` : `-${pctAhorro.toFixed(1)}%`}
                                              </span>
                                            </div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: isAhorro ? '#16a34a' : '#dc2626', marginTop: '2px' }}>
                                              {isAhorro ? `+${formatCurrency(totalDiferencia)}` : `-${formatCurrency(Math.abs(totalDiferencia))}`}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                              {saldoImprevisto > 0 ? `Incluye ${formatCurrency(saldoImprevisto)} de imprevisto sin usar` : 'Variación neta en compras'}
                                            </div>
                                          </div>

                                          {/* KPI 4: Pagado a la Fecha */}
                                          <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Pagado a Proveedores</span>
                                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#047857' }}>{pctPagado}%</span>
                                            </div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#047857', marginTop: '2px' }}>
                                              {formatCurrency(totalPagado)}
                                            </div>
                                            <div style={{ width: '100%', height: '5px', background: '#e2e8f0', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                                              <div style={{ width: `${pctPagado}%`, height: '100%', background: '#10b981', borderRadius: '3px', transition: 'width 0.3s ease' }} />
                                            </div>
                                          </div>
                                        </div>

                                        {/* 2. FILTRO DE CATEGORÍAS (TABS) */}
                                        {q.categories.length > 1 && (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginRight: '4px' }}>Categoría:</span>
                                            <button
                                              type="button"
                                              onClick={() => setSelectedCategoryByQuote(prev => ({ ...prev, [q.id]: 'todas' }))}
                                              style={{
                                                fontSize: '11px',
                                                padding: '3px 10px',
                                                borderRadius: '14px',
                                                border: currentCatFilter === 'todas' ? '1px solid var(--accent-primary)' : '1px solid #cbd5e1',
                                                background: currentCatFilter === 'todas' ? 'var(--accent-primary)' : '#ffffff',
                                                color: currentCatFilter === 'todas' ? '#ffffff' : '#475569',
                                                fontWeight: currentCatFilter === 'todas' ? 700 : 500,
                                                cursor: 'pointer'
                                              }}
                                            >
                                              Todas ({q.categories.length})
                                            </button>
                                            {q.categories.map(cat => {
                                              const isSelected = currentCatFilter === cat.name;
                                              return (
                                                <button
                                                  key={cat.id || cat.name}
                                                  type="button"
                                                  onClick={() => setSelectedCategoryByQuote(prev => ({ ...prev, [q.id]: cat.name }))}
                                                  style={{
                                                    fontSize: '11px',
                                                    padding: '3px 10px',
                                                    borderRadius: '14px',
                                                    border: isSelected ? '1px solid var(--accent-primary)' : '1px solid #cbd5e1',
                                                    background: isSelected ? 'var(--accent-primary)' : '#ffffff',
                                                    color: isSelected ? '#ffffff' : '#475569',
                                                    fontWeight: isSelected ? 700 : 500,
                                                    cursor: 'pointer'
                                                  }}
                                                >
                                                  📁 {cat.name} ({cat.items.length})
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}

                                        {/* 3. LISTADO DE CATEGORÍAS E ÍTEMS */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                          {filteredCategories.map((cat, catIdx) => {
                                            const catProviderCost = (cat.items || []).reduce((acc, item) => acc + (item.subItems || []).reduce((acc2, sub) => acc2 + (sub.unitCost * sub.quantity * sub.dates), 0), 0);
                                            const catRealCost = (cat.items || []).reduce((acc, item) => acc + (desglose.itemStats[String(item.id || '')]?.realCost || 0), 0);
                                            const catPaid = (cat.items || []).reduce((acc, item) => acc + (desglose.itemStats[String(item.id || '')]?.paid || 0), 0);
                                            const catDiff = catProviderCost - catRealCost;

                                            return (
                                              <div key={cat.id || catIdx} style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
                                                
                                                {/* BARRA DE CATEGORÍA */}
                                                <div style={{
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'space-between',
                                                  padding: '10px 18px',
                                                  background: '#f1f5f9',
                                                  borderBottom: '1px solid #e2e8f0',
                                                  flexWrap: 'wrap',
                                                  gap: '8px'
                                                }}>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase' }}>
                                                      📁 {cat.name}
                                                    </span>
                                                    <span style={{ fontSize: '11px', color: '#64748b', background: '#e2e8f0', padding: '1px 8px', borderRadius: '10px', fontWeight: 600 }}>
                                                      {cat.items.length} {cat.items.length === 1 ? 'ítem' : 'ítems'}
                                                    </span>
                                                  </div>

                                                  {/* Resumen numérico de la categoría */}
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px' }}>
                                                    <span style={{ color: '#64748b' }}>
                                                      Ppto: <strong style={{ color: '#0f172a' }}>{formatCurrency(catProviderCost)}</strong>
                                                    </span>
                                                    <span style={{ color: '#64748b' }}>
                                                      Real: <strong style={{ color: 'var(--accent-primary)' }}>{formatCurrency(catRealCost)}</strong>
                                                    </span>
                                                    <span style={{ color: '#64748b' }}>
                                                      Pagado: <strong style={{ color: '#047857' }}>{formatCurrency(catPaid)}</strong>
                                                    </span>
                                                    <span style={{
                                                      padding: '2px 8px',
                                                      borderRadius: '12px',
                                                      fontWeight: 700,
                                                      fontSize: '11px',
                                                      background: catDiff >= 0 ? '#dcfce7' : '#fee2e2',
                                                      color: catDiff >= 0 ? '#15803d' : '#b91c1c'
                                                    }}>
                                                      {catDiff >= 0 ? `+${formatCurrency(catDiff)} Ahorro` : `-${formatCurrency(Math.abs(catDiff))} Sobrecosto`}
                                                    </span>
                                                  </div>
                                                </div>

                                                {/* LISTADO DE ÍTEMS DENTRO DE LA CATEGORÍA */}
                                                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                  {(cat.items || []).map((item, itemIdx) => {
                                                    const itemProviderCost = (item.subItems || []).reduce((acc, sub) => acc + (sub.unitCost * sub.quantity * sub.dates), 0);
                                                    const itemStat = desglose.itemStats[String(item.id || '')] || { realCost: 0, paid: 0 };
                                                    const itemRealCost = itemStat.realCost;
                                                    const itemPaid = itemStat.paid;
                                                    const itemDiff = itemProviderCost - itemRealCost;
                                                    const isItemExpanded = expandedItems[String(item.id || '')] !== false; // Abierto por defecto

                                                    return (
                                                      <div
                                                        key={item.id || itemIdx}
                                                        style={{
                                                          border: '1px solid #e2e8f0',
                                                          borderRadius: '8px',
                                                          background: '#ffffff',
                                                          overflow: 'hidden',
                                                          transition: 'border-color 0.2s'
                                                        }}
                                                      >
                                                        {/* CABECERA CLICKEABLE DEL ÍTEM */}
                                                        <div
                                                          onClick={(e) => toggleItem(String(item.id || ''), e)}
                                                          style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            padding: '10px 14px',
                                                            background: isItemExpanded ? '#faf5ff' : '#f8fafc',
                                                            borderBottom: isItemExpanded ? '1px solid #e9d5ff' : 'none',
                                                            cursor: 'pointer',
                                                            userSelect: 'none',
                                                            flexWrap: 'wrap',
                                                            gap: '8px'
                                                          }}
                                                        >
                                                          {/* Lado izquierdo: Chevron, Icono, Nombre del Ítem */}
                                                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <span style={{ color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center' }}>
                                                              {isItemExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                            </span>
                                                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                                                              📦 {item.name}
                                                            </span>
                                                            <span style={{ fontSize: '10px', color: '#64748b', background: '#e2e8f0', padding: '1px 6px', borderRadius: '8px', fontWeight: 500 }}>
                                                              {item.subItems.length} {item.subItems.length === 1 ? 'subítem' : 'subítems'}
                                                            </span>
                                                          </div>

                                                          {/* Lado derecho: Métricas consolidadas del ítem */}
                                                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px' }}>
                                                            <div style={{ textAlign: 'right' }}>
                                                              <span style={{ fontSize: '10px', color: '#64748b', display: 'block', textTransform: 'uppercase' }}>Ppto</span>
                                                              <strong style={{ color: '#334155' }}>{formatCurrency(itemProviderCost)}</strong>
                                                            </div>
                                                            <div style={{ textAlign: 'right' }}>
                                                              <span style={{ fontSize: '10px', color: '#64748b', display: 'block', textTransform: 'uppercase' }}>Gasto Real</span>
                                                              <strong style={{ color: 'var(--accent-primary)' }}>{formatCurrency(itemRealCost)}</strong>
                                                            </div>
                                                            <div style={{ textAlign: 'right' }}>
                                                              <span style={{ fontSize: '10px', color: '#64748b', display: 'block', textTransform: 'uppercase' }}>Pagado</span>
                                                              <strong style={{ color: '#047857' }}>{formatCurrency(itemPaid)}</strong>
                                                            </div>
                                                            <div style={{ textAlign: 'right', minWidth: '95px' }}>
                                                              <span style={{ fontSize: '10px', color: '#64748b', display: 'block', textTransform: 'uppercase' }}>Saldo</span>
                                                              <span style={{
                                                                display: 'inline-block',
                                                                padding: '2px 8px',
                                                                borderRadius: '10px',
                                                                fontWeight: 700,
                                                                fontSize: '11px',
                                                                background: itemDiff > 0 ? '#dcfce7' : itemDiff < 0 ? '#fee2e2' : '#f1f5f9',
                                                                color: itemDiff > 0 ? '#15803d' : itemDiff < 0 ? '#b91c1c' : '#64748b'
                                                              }}>
                                                                {itemDiff > 0 ? `+${formatCurrency(itemDiff)}` : itemDiff < 0 ? `-${formatCurrency(Math.abs(itemDiff))}` : 'Exacto'}
                                                              </span>
                                                            </div>
                                                          </div>
                                                        </div>

                                                        {/* CUERPO DEL ÍTEM: TABLA DE SUBÍTEMS */}
                                                        {isItemExpanded && (
                                                          <div style={{ padding: '8px 12px', background: '#ffffff', overflowX: 'auto' }}>
                                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                              <thead>
                                                                <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', fontWeight: 600 }}>
                                                                  <th style={{ textAlign: 'left', padding: '6px 8px', width: '32%' }}>CONCEPTO / SUBÍTEM</th>
                                                                  <th style={{ textAlign: 'left', padding: '6px 8px', width: '28%' }}>PROVEEDOR & DOCUMENTO</th>
                                                                  <th style={{ textAlign: 'right', padding: '6px 8px', width: '10%' }}>PRESUPUESTO</th>
                                                                  <th style={{ textAlign: 'right', padding: '6px 8px', width: '10%' }}>GASTO REAL</th>
                                                                  <th style={{ textAlign: 'right', padding: '6px 8px', width: '10%' }}>PAGADO</th>
                                                                  <th style={{ textAlign: 'right', padding: '6px 8px', width: '10%' }}>DIAGNÓSTICO</th>
                                                                </tr>
                                                              </thead>
                                                              <tbody>
                                                                {(item.subItems || []).map((sub, subIdx) => {
                                                                  const subTotal = sub.unitCost * sub.quantity * sub.dates;
                                                                  const subStat = desglose.subStats[String(sub.id || '')] || { realCost: 0, paid: 0, orders: [], gastos: [] };
                                                                  const subRealCost = subStat.realCost;
                                                                  const subPaid = subStat.paid;
                                                                  const subDiff = subTotal - subRealCost;
                                                                  const isImprevisto = (sub.name || '').toLowerCase().includes('imprevist');

                                                                  // Orders or gastos attached
                                                                  const attachedOrders = subStat.orders || [];
                                                                  const attachedGastos = subStat.gastos || [];

                                                                  return (
                                                                    <tr
                                                                      key={sub.id || subIdx}
                                                                      style={{
                                                                        borderBottom: subIdx < item.subItems.length - 1 ? '1px solid #f1f5f9' : 'none',
                                                                        background: isImprevisto ? 'rgba(59, 130, 246, 0.03)' : 'transparent',
                                                                        height: '36px'
                                                                      }}
                                                                    >
                                                                      {/* 1. Concepto / Subítem */}
                                                                      <td style={{ padding: '6px 8px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                          {isImprevisto ? (
                                                                            <span style={{
                                                                              fontSize: '10px',
                                                                              padding: '1px 6px',
                                                                              borderRadius: '4px',
                                                                              background: '#dbeafe',
                                                                              color: '#1e40af',
                                                                              fontWeight: 700,
                                                                              display: 'inline-flex',
                                                                              alignItems: 'center',
                                                                              gap: '3px'
                                                                            }}>
                                                                              🛡️ Contingencia
                                                                            </span>
                                                                          ) : (
                                                                            <span style={{ color: '#94a3b8', fontSize: '10px' }}>•</span>
                                                                          )}
                                                                          <span style={{ fontWeight: 500, color: '#1e293b' }}>{sub.name}</span>
                                                                        </div>
                                                                        <div style={{ fontSize: '10px', color: '#94a3b8', paddingLeft: isImprevisto ? '0' : '10px', marginTop: '1px' }}>
                                                                          {sub.quantity} cant. × {sub.dates} día(s) @ S/ {Number(sub.unitCost).toFixed(2)}
                                                                        </div>
                                                                      </td>

                                                                      {/* 2. Proveedor & Documento */}
                                                                      <td style={{ padding: '6px 8px' }}>
                                                                        {isImprevisto ? (
                                                                          <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
                                                                            Fondo de reserva del ítem
                                                                          </span>
                                                                        ) : attachedOrders.length > 0 ? (
                                                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                            {attachedOrders.map(({ order }, oIdx) => {
                                                                              const prov = proveedores.find(p => p.id === order.proveedorId);
                                                                              const provLabel = prov?.nombre || prov?.razonSocial || 'Proveedor';
                                                                              return (
                                                                                <div key={order.id || oIdx} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                                                                                  <span style={{
                                                                                    padding: '1px 5px',
                                                                                    borderRadius: '4px',
                                                                                    background: order.tipoOrden === 'Servicio' ? '#eff6ff' : '#faf5ff',
                                                                                    color: order.tipoOrden === 'Servicio' ? '#1d4ed8' : '#7e22ce',
                                                                                    fontWeight: 600,
                                                                                    fontSize: '10px'
                                                                                  }}>
                                                                                    {order.id}
                                                                                  </span>
                                                                                  <span style={{ color: '#475569', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }} title={provLabel}>
                                                                                    {provLabel}
                                                                                  </span>
                                                                                </div>
                                                                              );
                                                                            })}
                                                                          </div>
                                                                        ) : attachedGastos.length > 0 ? (
                                                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                            {attachedGastos.map(({ gasto }, gIdx) => (
                                                                              <span key={gasto.id || gIdx} style={{ fontSize: '11px', color: '#b45309', background: '#fffbeb', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                                                                Caja Chica / Gasto: {gasto.id}
                                                                              </span>
                                                                            ))}
                                                                          </div>
                                                                        ) : (
                                                                          <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                                                                            Sin orden emitida
                                                                          </span>
                                                                        )}
                                                                      </td>

                                                                      {/* 3. Presupuesto */}
                                                                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500, color: '#334155' }}>
                                                                        {formatCurrency(subTotal)}
                                                                      </td>

                                                                      {/* 4. Gasto Real */}
                                                                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: subRealCost > 0 ? 'var(--accent-primary)' : '#94a3b8' }}>
                                                                        {subRealCost > 0 ? formatCurrency(subRealCost) : '-'}
                                                                      </td>

                                                                      {/* 5. Pagado */}
                                                                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: subPaid > 0 ? '#047857' : '#94a3b8' }}>
                                                                        {subPaid > 0 ? formatCurrency(subPaid) : '-'}
                                                                      </td>

                                                                      {/* 6. Diagnóstico / Saldo */}
                                                                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                                                        {isImprevisto ? (
                                                                          subRealCost === 0 ? (
                                                                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px', background: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}>
                                                                              +{formatCurrency(subDiff)} Libre
                                                                            </span>
                                                                          ) : (
                                                                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px', background: '#fef3c7', color: '#b45309', fontWeight: 600 }}>
                                                                              Consumido {formatCurrency(subRealCost)}
                                                                            </span>
                                                                          )
                                                                        ) : subDiff > 0 ? (
                                                                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px', background: '#dcfce7', color: '#15803d', fontWeight: 600 }}>
                                                                            +{formatCurrency(subDiff)} Ahorro
                                                                          </span>
                                                                        ) : subDiff < 0 ? (
                                                                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px', background: '#fee2e2', color: '#b91c1c', fontWeight: 600 }}>
                                                                            -{formatCurrency(Math.abs(subDiff))} Sobrecosto
                                                                          </span>
                                                                        ) : (
                                                                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px', background: '#f1f5f9', color: '#64748b', fontWeight: 500 }}>
                                                                            En presupuesto
                                                                          </span>
                                                                        )}
                                                                      </td>
                                                                    </tr>
                                                                  );
                                                                })}
                                                              </tbody>
                                                            </table>
                                                          </div>
                                                        )}
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>

                                      </div>
                                    </td>
                                  </tr>
                                );
                              })()}
                            </React.Fragment>
                          );
  };

  return (
    <div className="animate-fade-in" style={{ height: '100%' }}>
      {/* UNIFIED TOOLBAR: TABS ON LEFT, VIEW MODE SWITCH ON RIGHT */}
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '14px' }}>
        {/* TABS DE ESTADO UNIFICADAS */}
        <div className="unified-tabs" style={{ marginBottom: 0 }}>
          <button 
            className={`unified-tab ${activeTab === 'todas' ? 'active' : ''}`}
            onClick={() => setActiveTab('todas')}
          >
            Todas las Liquidaciones
            <span className="unified-tab-badge">{totalLiquidacionesCount}</span>
          </button>
          <button 
            className={`unified-tab ${activeTab === 'en_proceso' ? 'active' : ''}`}
            onClick={() => setActiveTab('en_proceso')}
          >
            En Proceso
            {enProcesoCount > 0 && (
              <span className="unified-tab-badge badge-warning">{enProcesoCount}</span>
            )}
          </button>
          <button 
            className={`unified-tab ${activeTab === 'liquidado' ? 'active' : ''}`}
            onClick={() => setActiveTab('liquidado')}
          >
            Liquidadas
            {liquidadoCount > 0 && (
              <span className="unified-tab-badge badge-success">{liquidadoCount}</span>
            )}
          </button>
        </div>

        {/* SELECTOR DE VISTA PLANA / AGRUPADA */}
        <div style={{ display: 'inline-flex', backgroundColor: 'var(--bg-subtle, rgba(0,0,0,0.04))', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => setViewMode('flat')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: viewMode === 'flat' ? 700 : 500,
              backgroundColor: viewMode === 'flat' ? 'var(--accent-primary)' : 'transparent',
              color: viewMode === 'flat' ? '#ffffff' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title="Vista plana directa (todas las liquidaciones en una sola grilla)"
          >
            <List size={14} />
            <span>Vista Plana</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grouped')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: viewMode === 'grouped' ? 700 : 500,
              backgroundColor: viewMode === 'grouped' ? 'var(--accent-primary)' : 'transparent',
              color: viewMode === 'grouped' ? '#ffffff' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title="Vista jerárquica tradicional (agrupada por cliente y proyecto)"
          >
            <FolderTree size={14} />
            <span>Agrupada por Cliente</span>
          </button>
        </div>
      </div>

      <div className="unified-filter-panel">
        <div className="unified-filter-group search-group">
          <label className="unified-filter-label">Búsqueda Rápida</label>
          <div className="unified-search-wrapper">
            <Search size={16} className="unified-search-icon" />
            <input 
              type="text" 
              placeholder="Buscar por proyecto, cliente o requerimiento..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="unified-search-input" 
            />
          </div>
        </div>
        {searchTerm && (
          <button className="btn-clear-filters" onClick={() => setSearchTerm('')} title="Limpiar búsqueda">
            <X size={14} />
            Limpiar
          </button>
        )}
      </div>

      <div className="glass-panel table-container" style={{ marginBottom: '56px', padding: 0, overflow: 'hidden' }}>
        {/* ENCABEZADO CON CONTADOR, SELECTOR DE VISTA Y CONTROLES DE DESPLAZAMIENTO */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-color)',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.05rem', fontWeight: 700 }}>
              Control de Liquidaciones
            </h3>
            <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '3px 10px' }}>
              {filteredQuotes.length} {filteredQuotes.length === 1 ? 'liquidación' : 'liquidaciones'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            {/* SELECTOR MODO MOBILE: TARJETAS VS TABLA */}
            {isMobile && (
              <div className="mobile-view-switcher">
                <button 
                  type="button"
                  className={`mobile-view-switcher-btn ${mobileDisplayMode === 'cards' ? 'active' : ''}`}
                  onClick={() => setMobileDisplayMode('cards')}
                  title="Ver liquidaciones como tarjetas"
                >
                  📱 Tarjetas
                </button>
                <button 
                  type="button"
                  className={`mobile-view-switcher-btn ${mobileDisplayMode === 'table' ? 'active' : ''}`}
                  onClick={() => setMobileDisplayMode('table')}
                  title="Ver liquidaciones como tabla completa"
                >
                  📋 Tabla
                </button>
              </div>
            )}

            {/* Controles de desplazamiento horizontal de columnas */}
            {(!isMobile || mobileDisplayMode === 'table') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Desplazar:</span>
                <button
                  type="button"
                  onClick={() => handleScrollTable('left')}
                  className="btn-secondary"
                  style={{ padding: '4px 8px', height: '28px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                  title="Desplazar tabla a la izquierda"
                >
                  <ChevronLeft size={14} /> Izq
                </button>
                <button
                  type="button"
                  onClick={() => handleScrollTable('right')}
                  className="btn-secondary"
                  style={{ padding: '4px 8px', height: '28px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                  title="Desplazar tabla a la derecha"
                >
                  Der <ChevronRight size={14} />
                </button>
              </div>
            )}

            {(!isMobile || mobileDisplayMode === 'table') && (
              <div style={{ display: 'inline-flex', backgroundColor: 'var(--bg-subtle, rgba(0,0,0,0.04))', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setViewMode('flat')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: viewMode === 'flat' ? 700 : 500,
                    backgroundColor: viewMode === 'flat' ? 'var(--accent-primary)' : 'transparent',
                    color: viewMode === 'flat' ? '#ffffff' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title="Vista plana directa (todas las liquidaciones en una sola grilla)"
                >
                  <List size={14} />
                  <span>Vista Plana</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grouped')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: viewMode === 'grouped' ? 700 : 500,
                    backgroundColor: viewMode === 'grouped' ? 'var(--accent-primary)' : 'transparent',
                    color: viewMode === 'grouped' ? '#ffffff' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title="Vista agrupada por cliente y proyecto"
                >
                  <FolderTree size={14} />
                  <span>Agrupada por Cliente</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* CONTENEDOR SCROLL CON ESTÁNDAR PROYECTOS */}
        <div 
          ref={tableContainerRef} 
          className="custom-table-scroll" 
          style={{ 
            width: '100%', 
            overflowX: 'auto', 
            overflowY: 'auto', 
            maxHeight: 'calc(100vh - 280px)', 
            minHeight: '400px', 
            position: 'relative'
          }}
        >
          {isLoading ? (
            <SkeletonTable columns={9} rows={6} message="Cargando liquidaciones y márgenes financieros..." />
          ) : (isMobile && mobileDisplayMode === 'cards') ? (
            <div className="mobile-cards-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px', marginBottom: '20px' }}>
              {sortedQuotes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                  <Clock size={32} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>No se encontraron liquidaciones con los filtros seleccionados.</p>
                </div>
              ) : (
                sortedQuotes.map(q => {
                  const metrics = getQuoteTotals(q);
                  const estado = getEstadoLiquidacion(q, q.projectId);
                  const isLiquidado = estado === 'Liquidado';
                  const clientName = q.client || getClienteName(q.projectId || '');
                  const projectName = getProjectName(q.projectId || '');
                  const quoteTitle = (q.requirement || projectName || '').trim();
                  const isExpanded = !!expandedQuotes[q.id];

                  return (
                    <div 
                      key={q.id} 
                      className="mobile-data-card"
                      style={{
                        borderLeft: isLiquidado ? '4px solid #10b981' : '4px solid #f59e0b'
                      }}
                    >
                      <div className="mobile-data-card-header">
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="mobile-data-card-title font-mono" style={{ color: 'var(--accent-primary)', fontSize: '13px' }}>
                              {formatId(q.id)}
                            </span>
                            <span style={{ fontSize: '11px', background: 'rgba(0,0,0,0.05)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              v{q.version || 1}
                            </span>
                          </div>
                          <div className="mobile-data-card-subtitle">
                            <span>📁 {projectName}</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', flexShrink: 0 }}>
                          <span style={{ fontWeight: 800, fontSize: '15px', color: '#059669' }}>
                            {formatCurrency(metrics.venta)}
                          </span>
                          <span className={`badge ${isLiquidado ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '10px' }}>
                            {isLiquidado ? '✓ Liquidado' : '⏳ En Proceso'}
                          </span>
                        </div>
                      </div>

                      <div style={{ margin: '4px 0' }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.3 }}>
                          {quoteTitle}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          🏢 {clientName}
                        </div>
                      </div>

                      <div className="mobile-card-grid-meta">
                        <div className="mobile-card-meta-col">
                          <span className="mobile-card-meta-label">Gasto Real</span>
                          <span className="mobile-card-meta-val" style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>
                            {formatCurrency(metrics.gastoReal)}
                          </span>
                        </div>
                        <div className="mobile-card-meta-col">
                          <span className="mobile-card-meta-label">Presupuesto</span>
                          <span className="mobile-card-meta-val">
                            {formatCurrency(metrics.gastoProyectado)}
                          </span>
                        </div>
                        <div className="mobile-card-meta-col">
                          <span className="mobile-card-meta-label">Margen Real</span>
                          <span className="mobile-card-meta-val" style={{ color: metrics.margenReal >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                            {formatCurrency(metrics.margenReal)} ({metrics.porcentajeMargenReal.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="mobile-card-meta-col">
                          <span className="mobile-card-meta-label">Pagado Total</span>
                          <span className="mobile-card-meta-val" style={{ color: '#059669', fontWeight: 600 }}>
                            {formatCurrency(metrics.pagadoTotal)}
                          </span>
                        </div>
                      </div>

                      <div className="mobile-card-actions-row">
                        <button 
                          type="button" 
                          className={`mobile-action-pill ${isExpanded ? 'primary' : ''}`}
                          onClick={() => toggleQuote(q.id)}
                          title="Ver Desglose de Gastos y Órdenes"
                        >
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          <span>{isExpanded ? 'Ocultar Desglose' : 'Ver Desglose'}</span>
                        </button>
                        <button 
                          type="button" 
                          className="mobile-action-pill"
                          onClick={(e) => handleToggleEstado(q, isLiquidado ? 'En Proceso' : 'Liquidado', e)}
                          style={{
                            color: isLiquidado ? '#4b5563' : '#10b981',
                            background: isLiquidado ? 'rgba(0,0,0,0.05)' : 'rgba(16, 185, 129, 0.08)'
                          }}
                        >
                          <CheckCircle size={13} />
                          <span>{isLiquidado ? 'Reabrir' : 'Liquidar'}</span>
                        </button>
                      </div>

                      {/* Mobile Expanded Desglose Summary */}
                      {isExpanded && (
                        <div className="mobile-card-expanded-box">
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase' }}>
                            Auditoría Financiera
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                            <span>Diferencia vs Ppto:</span>
                            <strong style={{ color: (metrics.gastoProyectado - metrics.gastoReal) >= 0 ? '#10b981' : '#ef4444' }}>
                              {(metrics.gastoProyectado - metrics.gastoReal) >= 0 ? '+' : ''}{formatCurrency(metrics.gastoProyectado - metrics.gastoReal)}
                            </strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                            <span>% Pagado Proveedores:</span>
                            <strong>{metrics.gastoReal > 0 ? Math.min(100, Math.round((metrics.pagadoTotal / metrics.gastoReal) * 100)) : 0}%</strong>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Categorías: {q.categories.map(c => c.name).join(', ')}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <table className="data-table" style={{ width: '100%', minWidth: '1370px', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
              <colgroup>
              <col style={{ width: '45px', minWidth: '45px' }} /> {/* Chevron */}
              <col style={{ width: '240px', minWidth: '240px' }} /> {/* Cotización / Detalle */}
              <col style={{ width: '220px', minWidth: '220px' }} /> {/* Cliente / Proyecto */}
              <col style={{ width: '140px', minWidth: '140px' }} /> {/* Estado */}
              <col style={{ width: '140px', minWidth: '140px' }} /> {/* Venta Total */}
              <col style={{ width: '140px', minWidth: '140px' }} /> {/* Presupuesto */}
              <col style={{ width: '140px', minWidth: '140px' }} /> {/* Gasto Real */}
              <col style={{ width: '140px', minWidth: '140px' }} /> {/* Pagado */}
              <col style={{ width: '150px', minWidth: '150px' }} /> {/* Acción */}
            </colgroup>
            <thead style={{ position: 'sticky', top: 0, zIndex: 12, backgroundColor: '#f8fafc' }}>
              {viewMode === 'flat' ? (
                <tr>
                  <th className="th-custom text-center sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '45px' }}></th>
                  {renderSortHeader('COTIZACIÓN / DETALLE', 'quote', 'text-left sticky-col-left', { position: 'sticky', left: '45px', zIndex: 16, backgroundColor: '#f8fafc', width: '240px' })}
                  {renderSortHeader('CLIENTE / PROYECTO', 'client', 'text-left', { minWidth: '220px' })}
                  {renderSortHeader('ESTADO', 'status', 'text-center', { width: '140px' })}
                  {renderSortHeader('VENTA TOTAL (S/)', 'venta', 'text-right', { width: '140px' })}
                  {renderSortHeader('PRESUPUESTO', 'presupuesto', 'text-right', { width: '140px' })}
                  {renderSortHeader('GASTO REAL', 'gasto', 'text-right', { width: '140px', color: 'var(--accent-primary)' })}
                  {renderSortHeader('PAGADO', 'pagado', 'text-right', { width: '140px', color: 'var(--success)' })}
                  <th className="th-custom text-center sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '150px' }}>ACCIÓN</th>
                </tr>
              ) : (
                <tr>
                  <th className="th-custom text-center sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '45px' }}></th>
                  <th className="th-custom sticky-col-left" style={{ position: 'sticky', left: '45px', zIndex: 16, backgroundColor: '#f8fafc', width: '240px' }}>COTIZACIÓN / DETALLE</th>
                  <th className="th-custom" style={{ width: '220px' }}>CLIENTE / PROYECTO</th>
                  <th className="th-custom text-center" style={{ width: '140px' }}>ESTADO</th>
                  <th className="th-custom text-right" style={{ width: '140px' }}>VENTA TOTAL (S/)</th>
                  <th className="th-custom text-right" style={{ width: '140px' }}>PRESUPUESTO</th>
                  <th className="th-custom text-right" style={{ width: '140px', color: 'var(--accent-primary)' }}>GASTO REAL</th>
                  <th className="th-custom text-right" style={{ width: '140px', color: 'var(--success)' }}>PAGADO</th>
                  <th className="th-custom text-center sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '150px' }}>ACCIÓN</th>
                </tr>
              )}
            </thead>
          <tbody>
            {filteredQuotes.length === 0 ? (
              <tr>
                <td colSpan={9} className="td-custom" style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                  <Clock size={36} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>No se encontraron liquidaciones que coincidan con la búsqueda o el filtro seleccionado.</p>
                  {(searchTerm || activeTab !== 'todas') && (
                    <button type="button" className="btn-secondary" onClick={() => { setSearchTerm(''); setActiveTab('todas'); }} style={{ margin: '12px auto 0', fontSize: '12px' }}>
                      Restablecer Filtros
                    </button>
                  )}
                </td>
              </tr>
            ) : viewMode === 'flat' ? (
              sortedQuotes.map(q => renderLiquidacionQuoteRow(q))
            ) : (
              Object.entries(groupedAprobadas).map(([clientName, projects]) => (
                <React.Fragment key={clientName}>
                  <tr 
                    style={{ backgroundColor: 'rgba(102, 45, 145, 0.08)', cursor: 'pointer' }}
                    onClick={() => toggleClient(clientName)}
                  >
                    <td colSpan={9} style={{ padding: '12px 16px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {expandedClients[clientName] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        🏢 CLIENTE: {clientName.toUpperCase()}
                      </div>
                    </td>
                  </tr>

                  {expandedClients[clientName] && Object.entries(projects).map(([projectName, quotesList]) => {
                    const projectKey = `${clientName}_${projectName}`;
                    const allLiquidated = quotesList.length > 0 && quotesList.every(q => getEstadoLiquidacion(q, q.projectId) === 'Liquidado');
                    const projState = allLiquidated ? 'Liquidado' : 'En Proceso';

                    return (
                      <React.Fragment key={projectName}>
                        <tr 
                          style={{ backgroundColor: 'rgba(0, 0, 0, 0.03)', cursor: 'pointer' }}
                          onClick={() => toggleProject(projectKey)}
                        >
                          <td colSpan={9} style={{ padding: '8px 16px 8px 32px', fontWeight: 'bold', fontSize: '13px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {expandedProjects[projectKey] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                📁 Proyecto: {projectName}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {projState === 'Liquidado' ? (
                                  <span style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '4px', 
                                    padding: '2px 8px', 
                                    borderRadius: '12px', 
                                    fontSize: '11px', 
                                    fontWeight: 600,
                                    backgroundColor: '#ecfdf5', 
                                    color: '#047857',
                                    border: '1px solid #10b981'
                                  }}>
                                    <CheckCircle size={12} /> Liquidado
                                  </span>
                                ) : (
                                  <span style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '4px', 
                                    padding: '2px 8px', 
                                    borderRadius: '12px', 
                                    fontSize: '11px', 
                                    fontWeight: 600,
                                    backgroundColor: '#fffbeb', 
                                    color: '#b45309',
                                    border: '1px solid #f59e0b'
                                  }}>
                                    <Clock size={12} /> En Proceso
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>

                        {expandedProjects[projectKey] && quotesList.map(q => renderLiquidacionQuoteRow(q))}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
          )}
        </div>
      </div>
    </div>
  );
};
