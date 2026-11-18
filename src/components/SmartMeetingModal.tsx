import React, { useState, useRef, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  Mic, MicOff, Sparkles, Clock, CheckCircle2, X,
  Copy, FolderKanban, Lightbulb, RefreshCw, Send,
  ExternalLink, HelpCircle, Minimize2, Headphones,
  ArrowRight, ArrowLeft, Plus,
  Calculator, Rocket, Package, FileText, BookOpen,
  Palette, Trophy, Gamepad2, Gift, Wand2, Star, Printer
} from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';
import { 
  useSmartMeeting, 
  OFFICIAL_PURPLE_BRIEF_TEMPLATE,
  getBriefTemplateForActivity,
  normalizeActivityType,
  BRIEF_ACTIVITY_TYPES
} from '../context/SmartMeetingContext';
import { CreateOrdenesMasivasModal } from './CreateOrdenesMasivasModal';
import {
  BriefIntakeBar,
  BriefQuantifiedMatrixCard,
  BriefCopilotSidePanel
} from './BriefOperationalPanels';
import {
  buildBriefWordText,
  openPrintableBriefPdf,
  convertBriefRequirementsToQuoteCategories
} from '../utils/briefExport';
import type { QuoteCategoryPayload } from '../context/SmartMeetingContext';
import toast from 'react-hot-toast';

export const SmartMeetingModal: React.FC = () => {
  const { clientes, listas } = useGlobalContext();
  const {
    isActive,
    isMinimized,
    meetingTitle,
    setMeetingTitle,
    isRecording,
    audioMode,
    setAudioMode,
    secondsElapsed,
    brief,
    setBrief,
    updateBriefManual,
    generateCreativeIdea,
    isGeneratingCreativeIdea,
    questions,
    transcript,
    interimText,
    isAiProcessing,
    deliverable,
    createdProject,
    createdQuote,
    isGeneratingDeliverable,
    isCreatingProject,
    isImportingSource,
    initialMeetLink,
    toggleRecording,
    minimize,
    closeMeeting,
    triggerAiAnalysis,
    sendTranscriptChunk,
    importBriefSource,
    handleDismissQuestion,
    handleFinishMeeting,
    handleCreateProject
  } = useSmartMeeting();

  // 5 Pasos secuenciales del flujo
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [step1SubTab, setStep1SubTab] = useState<'brief_doc' | 'transcripcion'>('brief_doc');
  const [isOrdersModalOpen, setIsOrdersModalOpen] = useState(false);
  const [manualNote, setManualNote] = useState('');
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Categorías locales de cotización para vista previa y edición en tiempo real
  const [quoteCategories, setQuoteCategories] = useState<QuoteCategoryPayload[]>([]);

  // Sincronizar categorías generadas por la IA con el estado local
  useEffect(() => {
    if (deliverable?.categoriasCotizacion && deliverable.categoriasCotizacion.length > 0) {
      setQuoteCategories(deliverable.categoriasCotizacion);
    }
  }, [deliverable]);

  // Si se genera el entregable o ya viene generado de una sesión previa, posicionar en el paso 5
  useEffect(() => {
    if (deliverable?.categoriasCotizacion && deliverable.categoriasCotizacion.length > 0) {
      if (currentStep === 4 || currentStep === 1) {
        setCurrentStep(5);
      }
    }
  }, [deliverable?.titulo]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
  };

  const handleAddManualNote = () => {
    if (!manualNote.trim()) return;
    sendTranscriptChunk(manualNote.trim());
    setManualNote('');
    triggerAiAnalysis();
  };

  const pendingQuestions = useMemo(() => {
    return questions.filter(q => !q.respondida);
  }, [questions]);

  const officialSections = useMemo(() => {
    return brief.seccionesBrief && brief.seccionesBrief.length > 0
      ? brief.seccionesBrief
      : getBriefTemplateForActivity(brief.tipoProyecto);
  }, [brief.seccionesBrief, brief.tipoProyecto]);

  const handleCopyBriefForWord = () => {
    const text = buildBriefWordText(brief, officialSections, pendingQuestions);
    navigator.clipboard.writeText(text);
    toast.success('¡Brief Ejecutivo 2.0 copiado! Listo para pegar en Word.', { icon: '📄' });
  };

  const handleExportBriefPdf = () => {
    openPrintableBriefPdf(brief, officialSections, pendingQuestions);
  };

  const handleUseRequirementsInQuote = () => {
    const reqs = brief.requerimientosCuantificados || [];
    if (reqs.length === 0) return;
    const mapped = convertBriefRequirementsToQuoteCategories(reqs, brief.locaciones?.ciudad);
    setQuoteCategories(mapped);
    setCurrentStep(5);
    toast.success('Requerimientos cargados en la vista previa de cotización', { icon: '🧮' });
  };

  const handleUpdateBriefAnswer = (preguntaNumero: number, newAnswer: string) => {
    const currentSections = officialSections;
    const updated = currentSections.map(sec => ({
      ...sec,
      preguntas: sec.preguntas.map(q => 
        q.numero === preguntaNumero
          ? { ...q, respuesta: newAnswer, respondida: Boolean(newAnswer.trim()), origenManual: Boolean(newAnswer.trim()) }
          : q
      )
    }));
    updateBriefManual({ seccionesBrief: updated });
  };

  // Opciones exactas de SIG Purple
  const serviceLines = listas?.tipoServicio || [
    'PURPLE STRATEGY & CREATIVITY',
    'PURPLE IMPULSE & PROMOTION',
    'PURPLE VISIBILITY',
    'PURPLE LOYALTY'
  ];

  const projectTypes = [
    'Activación',
    'Evento Corporativo',
    'Producción de Elemento',
    'Merchandising',
    'Campaña Integral',
    'Implementación',
    'FEE MENSUAL',
    'INDIVIDUAL'
  ];

  const budgetRanges = [
    '0 - 5000',
    '5001 - 15000',
    '15001 - 50000',
    '50000 a más'
  ];

  // Cálculos financieros de la vista previa de cotización (idéntico a CotizacionBuilder)
  const financialTotals = useMemo(() => {
    let subtotalProviderDirect = 0;
    let subtotalClientRaw = 0;

    quoteCategories.forEach(cat => {
      (cat.items || []).forEach(item => {
        const itemSubs = item.subItems || [];
        const providerCostPerUnit = itemSubs.reduce(
          (acc, sub) => acc + ((Number(sub.unitCost) || 0) * (Number(sub.quantity) || 1) * (Number(sub.dates) || 1)),
          0
        );
        const internalMult = providerCostPerUnit * ((Number(item.internalMultiplierPercent) || 10) / 100);
        const finExpense = providerCostPerUnit * ((Number(item.financialExpensePercent) || 10) / 100);
        const clientUnit = Math.round(providerCostPerUnit + internalMult + finExpense);

        const qty = Number(item.quantity) || 1;
        const dts = Number(item.dates) || 1;

        subtotalProviderDirect += providerCostPerUnit * qty * dts;
        subtotalClientRaw += clientUnit * qty * dts;
      });
    });

    const agencyFee = Math.round(subtotalClientRaw * 0.12);
    const totalClientEstimated = subtotalClientRaw + agencyFee;

    return {
      subtotalProviderDirect,
      subtotalClientRaw,
      agencyFee,
      totalClientEstimated
    };
  }, [quoteCategories]);

  // Manejo de edición rápida de ítems de cotización
  const handleUpdateItemCost = (catIdx: number, itemIdx: number, newUnitCost: number) => {
    setQuoteCategories(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      const targetItem = copy[catIdx]?.items?.[itemIdx];
      if (targetItem && targetItem.subItems?.[0]) {
        targetItem.subItems[0].unitCost = newUnitCost;
      }
      return copy;
    });
  };

  const handleUpdateItemQty = (catIdx: number, itemIdx: number, newQty: number) => {
    setQuoteCategories(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      const targetItem = copy[catIdx]?.items?.[itemIdx];
      if (targetItem) {
        targetItem.quantity = Math.max(1, newQty);
      }
      return copy;
    });
  };

  const handleUpdateItemDates = (catIdx: number, itemIdx: number, newDates: number) => {
    setQuoteCategories(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      const targetItem = copy[catIdx]?.items?.[itemIdx];
      if (targetItem) {
        targetItem.dates = Math.max(1, newDates);
      }
      return copy;
    });
  };

  const handleAddItemToCategory = (catIdx: number) => {
    const itemName = prompt('Nombre del nuevo ítem para cotizar:');
    if (!itemName?.trim()) return;

    setQuoteCategories(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy[catIdx].items.push({
        id: `item-${Date.now()}`,
        name: itemName.trim(),
        quantity: 1,
        dates: 1,
        details: ['Especificación técnica por afinar'],
        internalMultiplierPercent: 10,
        financialExpensePercent: 10,
        subItems: [
          {
            name: itemName.trim(),
            quantity: 1,
            dates: 1,
            unitCost: 200,
            providerName: 'Proveedor BTL'
          }
        ]
      });
      return copy;
    });
  };

  const handleNavigateToQuote = (quoteId: string) => {
    closeMeeting();
    localStorage.setItem('openQuoteId', quoteId);
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: { module: 'cotizaciones', quoteId } }));
    window.dispatchEvent(new CustomEvent('navigate', { detail: { module: 'cotizaciones', quoteId } }));
    toast.success('Abriendo cotización en el cotizador...', { icon: '💰' });
  };

  const handleNavigateToProjects = (projectId: string) => {
    closeMeeting();
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: { module: 'proyectos', projectId } }));
    window.dispatchEvent(new CustomEvent('navigate', { detail: { module: 'proyectos', projectId } }));
  };

  // Si no está activa o está minimizada, no renderizamos el modal completo
  if (!isActive || isMinimized) return null;

  return ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.78)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        className="animate-fade-in"
        style={{
          width: '96vw',
          maxWidth: '1440px',
          height: '92vh',
          backgroundColor: 'var(--card-bg, #ffffff)',
          borderRadius: '18px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid rgba(139, 92, 246, 0.3)'
        }}
      >
        {/* HEADER DE CONTROL */}
        <div
          style={{
            padding: '12px 22px',
            background: 'linear-gradient(90deg, rgba(139, 92, 246, 0.08) 0%, rgba(99, 102, 241, 0.04) 100%)',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(139, 92, 246, 0.35)'
              }}
            >
              <Sparkles size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="text"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px dashed transparent',
                    color: 'var(--text-primary, #0f172a)',
                    outline: 'none',
                    padding: '2px 4px'
                  }}
                  onFocus={(e) => e.target.style.borderBottomColor = '#8b5cf6'}
                  onBlur={(e) => e.target.style.borderBottomColor = 'transparent'}
                />
                {initialMeetLink && (
                  <a
                    href={initialMeetLink}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      background: 'rgba(59, 130, 246, 0.1)',
                      color: '#2563eb',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      fontWeight: 600
                    }}
                  >
                    <span>Google Meet</span>
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                <span>Smart Brief & Cotizador IA</span>
                <span>•</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} />
                  {formatTime(secondsElapsed)}
                </span>
                {isAiProcessing && (
                  <>
                    <span>•</span>
                    <span style={{ color: '#8b5cf6', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                      <RefreshCw size={12} className="animate-spin" />
                      Analizando en vivo...
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* BOTONES DE AUDIO Y VENTANA */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* SELECTOR MODO DE AUDIO */}
            <div
              style={{
                display: 'flex',
                background: 'var(--bg-secondary, #f1f5f9)',
                borderRadius: '9px',
                padding: '3px',
                border: '1px solid var(--border-color, #e2e8f0)'
              }}
            >
              <button
                onClick={() => setAudioMode('call_and_mic')}
                disabled={isRecording}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '6px 11px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: audioMode === 'call_and_mic' ? 700 : 500,
                  cursor: isRecording ? 'not-allowed' : 'pointer',
                  backgroundColor: audioMode === 'call_and_mic' ? '#ffffff' : 'transparent',
                  color: audioMode === 'call_and_mic' ? '#7c3aed' : 'var(--text-muted, #64748b)',
                  boxShadow: audioMode === 'call_and_mic' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none'
                }}
                title="Escucha tanto el audio interno de los demás participantes como tu micrófono"
              >
                <Headphones size={13} />
                <span>Llamada + Mic</span>
              </button>

              <button
                onClick={() => setAudioMode('mic_only')}
                disabled={isRecording}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '6px 11px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: audioMode === 'mic_only' ? 700 : 500,
                  cursor: isRecording ? 'not-allowed' : 'pointer',
                  backgroundColor: audioMode === 'mic_only' ? '#ffffff' : 'transparent',
                  color: audioMode === 'mic_only' ? '#7c3aed' : 'var(--text-muted, #64748b)',
                  boxShadow: audioMode === 'mic_only' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none'
                }}
                title="Solo escucha tu micrófono"
              >
                <Mic size={13} />
                <span>Solo Mi Mic</span>
              </button>
            </div>

            {/* BOTÓN INICIAR / PAUSAR */}
            <button
              onClick={() => toggleRecording()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '10px',
                border: 'none',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                backgroundColor: isRecording ? '#ef4444' : '#8b5cf6',
                color: '#fff',
                boxShadow: isRecording ? '0 0 16px rgba(239, 68, 68, 0.5)' : '0 4px 12px rgba(139, 92, 246, 0.3)'
              }}
            >
              {isRecording ? (
                <>
                  <MicOff size={16} />
                  <span>Pausar Escucha</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite' }} />
                </>
              ) : (
                <>
                  <Mic size={16} />
                  <span>Iniciar Escucha en Vivo</span>
                </>
              )}
            </button>

            {/* BOTÓN PRINCIPAL: FINALIZAR & GENERAR COTIZACIÓN */}
            <button
              onClick={async () => {
                await handleFinishMeeting(brief.requiereIdeaCreativa !== false);
                setCurrentStep(5);
              }}
              disabled={isGeneratingDeliverable}
              title="Finalizar sesión y generar desglose completo de cotización y propuesta con IA"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                borderRadius: '10px',
                border: 'none',
                fontWeight: 800,
                fontSize: '13px',
                cursor: isGeneratingDeliverable ? 'not-allowed' : 'pointer',
                background: isGeneratingDeliverable ? '#94a3b8' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#fff',
                boxShadow: isGeneratingDeliverable ? 'none' : '0 4px 14px rgba(16, 185, 129, 0.4)',
                transition: 'all 0.2s'
              }}
            >
              {isGeneratingDeliverable ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  <span>Generando Cotización...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>{deliverable ? 'Regenerar Cotización' : 'Finalizar & Generar Cotización'}</span>
                </>
              )}
            </button>

            {/* BOTÓN SEGUNDO PLANO */}
            <button
              onClick={minimize}
              title="Minimizar a barra flotante para navegar por el ERP mientras escucha"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1.5px solid rgba(139, 92, 246, 0.4)',
                background: 'rgba(139, 92, 246, 0.12)',
                color: '#7c3aed',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <Minimize2 size={15} />
              <span>Segundo Plano</span>
            </button>

            {/* CERRAR */}
            <button
              onClick={closeMeeting}
              title="Cerrar Asistente"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: '1px solid var(--border-color, #e2e8f0)',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-secondary)'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* STEPPER DE NAVEGACIÓN SECUENCIAL CLARA */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 20px',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            background: 'var(--bg-secondary, #f8fafc)',
            gap: '8px',
            overflowX: 'auto'
          }}
        >
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap' }}>
            {/* PASO 1 */}
            <button
              onClick={() => setCurrentStep(1)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: currentStep === 1 ? '1.5px solid #8b5cf6' : '1px solid transparent',
                background: currentStep === 1 ? '#8b5cf6' : 'rgba(139, 92, 246, 0.06)',
                color: currentStep === 1 ? '#fff' : '#6d28d9',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <Mic size={14} />
              <span>1. Redacción & Escucha</span>
            </button>

            {/* PASO 2 */}
            <button
              onClick={() => setCurrentStep(2)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: currentStep === 2 ? '1.5px solid #8b5cf6' : '1px solid transparent',
                background: currentStep === 2 ? '#8b5cf6' : 'rgba(139, 92, 246, 0.06)',
                color: currentStep === 2 ? '#fff' : '#6d28d9',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <HelpCircle size={14} />
              <span>2. Dudas en Vivo (Copiloto)</span>
              {pendingQuestions.length > 0 && (
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: '10px',
                    fontSize: '10px',
                    fontWeight: 800,
                    backgroundColor: currentStep === 2 ? '#ffffff' : '#ef4444',
                    color: currentStep === 2 ? '#ef4444' : '#ffffff'
                  }}
                >
                  {pendingQuestions.length}
                </span>
              )}
            </button>

            {/* PASO 3 */}
            <button
              onClick={() => setCurrentStep(3)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: currentStep === 3 ? '1.5px solid #8b5cf6' : '1px solid transparent',
                background: currentStep === 3 ? '#8b5cf6' : 'rgba(139, 92, 246, 0.06)',
                color: currentStep === 3 ? '#fff' : '#6d28d9',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <FolderKanban size={14} />
              <span>3. Datos de Proyecto (SIG)</span>
            </button>

            {/* PASO 4 */}
            <button
              onClick={() => setCurrentStep(4)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: currentStep === 4 ? '1.5px solid #8b5cf6' : '1px solid transparent',
                background: currentStep === 4 ? '#8b5cf6' : 'rgba(139, 92, 246, 0.06)',
                color: currentStep === 4 ? '#fff' : '#6d28d9',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <Lightbulb size={14} />
              <span>4. Concepto Creativo</span>
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  backgroundColor: brief.requiereIdeaCreativa !== false ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                  color: brief.requiereIdeaCreativa !== false ? '#059669' : '#475569',
                  fontWeight: 800
                }}
              >
                {brief.requiereIdeaCreativa !== false ? 'CON IDEA' : 'PRODUCCIÓN'}
              </span>
            </button>

            {/* PASO 5 */}
            <button
              onClick={() => setCurrentStep(5)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: currentStep === 5 ? '1.5px solid #10b981' : '1px solid rgba(16, 185, 129, 0.3)',
                background: currentStep === 5 ? '#10b981' : 'rgba(16, 185, 129, 0.08)',
                color: currentStep === 5 ? '#fff' : '#047857',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <Calculator size={14} />
              <span>5. Cotización & Aprobación</span>
              {deliverable && (
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: currentStep === 5 ? '#fff' : '#10b981' }} />
              )}
            </button>
          </div>

          {/* INDICADOR DE COMPLETITUD */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '180px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
              Completitud:
            </span>
            <div
              style={{
                flex: 1,
                height: '7px',
                borderRadius: '4px',
                background: 'rgba(226, 232, 240, 0.8)',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${brief.completitudPorcentaje || 0}%`,
                  background: 'linear-gradient(90deg, #8b5cf6 0%, #10b981 100%)',
                  transition: 'width 0.4s ease'
                }}
              />
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#8b5cf6' }}>
              {brief.completitudPorcentaje || 0}%
            </span>
          </div>
        </div>

        {/* CUERPO PRINCIPAL CON SCROLL INDEPENDIENTE */}
        <div style={{ flex: 1, minHeight: 0, height: '100%', overflowY: 'auto', background: 'var(--bg-main, #ffffff)', padding: '24px' }}>

          {/* ========================================================================= */}
          {/* PASO 1: REDACCIÓN, ESCUCHA & FORMATO OFICIAL DE BRIEF */}
          {/* ========================================================================= */}
          {currentStep === 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 0.65fr', gap: '20px', minHeight: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* SELECTOR SUB-PESTAÑA EN PASO 1 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1.5px solid var(--border-color, #e2e8f0)', paddingBottom: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setStep1SubTab('brief_doc')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      background: step1SubTab === 'brief_doc' ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' : 'rgba(139, 92, 246, 0.08)',
                      color: step1SubTab === 'brief_doc' ? '#fff' : '#6d28d9',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer',
                      boxShadow: step1SubTab === 'brief_doc' ? '0 2px 8px rgba(139, 92, 246, 0.25)' : 'none'
                    }}
                  >
                    <FileText size={15} />
                    <span>📄 Formato de Brief Oficial Purple BTL</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep1SubTab('transcripcion')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      background: step1SubTab === 'transcripcion' ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' : 'rgba(100, 116, 139, 0.08)',
                      color: step1SubTab === 'transcripcion' ? '#fff' : 'var(--text-secondary)',
                      fontWeight: step1SubTab === 'transcripcion' ? 700 : 500,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    <Mic size={15} />
                    <span>🎙️ Transcripción en Vivo ({transcript.length > 0 ? `${(transcript.length / 5).toFixed(0)} palabras` : 'Voz'})</span>
                  </button>

                  {step1SubTab === 'brief_doc' && (
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={handleExportBriefPdf}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '7px 13px',
                          borderRadius: '8px',
                          border: '1px solid #0f172a',
                          background: '#0f172a',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                        title="Abrir vista limpia para Imprimir o Guardar como PDF"
                      >
                        <Printer size={13} />
                        <span>Exportar Brief PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyBriefForWord}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '7px 14px',
                          borderRadius: '8px',
                          border: '1px solid #8b5cf6',
                          background: 'rgba(139, 92, 246, 0.06)',
                          color: '#7c3aed',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                        title="Copia todo el brief estructurado, inventario y mensaje WhatsApp para pegar en Word"
                      >
                        <Copy size={13} />
                        <span>Copiar para Word</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* BARRA DE INGESTA MULTIFUENTE + RE-ANÁLISIS COMPLETO */}
                <BriefIntakeBar
                  transcriptLength={transcript.length}
                  fuentesCount={(brief.fuentesIngresadas || []).length}
                  isAiProcessing={isAiProcessing}
                  isImportingSource={isImportingSource}
                  onTriggerAnalyze={triggerAiAnalysis}
                  onImportSource={importBriefSource}
                />

                {/* VISTA 1: FORMATO OFICIAL DE BRIEF PURPLE BTL (WORD STYLE) */}
                {step1SubTab === 'brief_doc' && (
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '14px',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      padding: '24px 28px',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
                      maxHeight: '620px',
                      overflowY: 'auto'
                    }}
                  >
                    {/* ENCABEZADO OFICIAL PURPLE BTL */}
                    <div style={{ borderBottom: '2px solid #8b5cf6', paddingBottom: '16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '18px', fontWeight: 900, color: '#8b5cf6', letterSpacing: '0.05em' }}>PURPLE</span>
                          <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>www.purplebtl.com</span>
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}>
                            Brief Adaptativo
                          </span>
                        </div>
                        <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '6px 0 4px 0', color: '#1e293b' }}>
                          FORMATO DE BRIEF – {normalizeActivityType(brief.tipoProyecto).toUpperCase()}
                        </h2>
                        <div style={{ fontSize: '12px', color: '#475569', display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '6px' }}>
                          <span><strong>EMPRESA:</strong> {brief.clienteNombre || 'Pendiente de registrar'}</span>
                          <span><strong>MARCA / PRODUCTO:</strong> {brief.nombreTentativoProyecto || 'Por definir'}</span>
                          <span><strong>FECHA:</strong> {new Date().toLocaleDateString('es-PE')}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '11px', color: '#64748b' }}>
                        <span style={{ padding: '4px 10px', borderRadius: '6px', background: 'rgba(139, 92, 246, 0.1)', color: '#7c3aed', fontWeight: 700 }}>
                          IA en vivo + Edición manual
                        </span>
                      </div>
                    </div>

                    {/* SELECTOR ADAPTATIVO POR TIPO DE ACTIVIDAD */}
                    <div style={{
                      marginBottom: '22px',
                      padding: '12px 14px',
                      background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.05) 0%, rgba(99, 102, 241, 0.03) 100%)',
                      border: '1.5px solid rgba(139, 92, 246, 0.22)',
                      borderRadius: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Adaptar Brief a la Actividad:
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            (Cambia las secciones y preguntas manteniendo tus datos)
                          </span>
                        </div>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#7c3aed',
                          background: '#ede9fe',
                          padding: '2px 8px',
                          borderRadius: '6px'
                        }}>
                          {officialSections.reduce((acc, s) => acc + s.preguntas.length, 0)} preguntas especializadas
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}>
                        {[
                          { id: 'Activación', label: 'Activación BTL', icon: '🎯', desc: 'Promoción, sampling, malls, vía pública' },
                          { id: 'Evento Corporativo', label: 'Evento Corporativo', icon: '🎪', desc: 'Fiestas de fin de año, aniversarios, galas' },
                          { id: 'Producción de Elemento', label: 'Producción de Elemento', icon: '🛠️', desc: 'Stands, módulos, retail, letras 3D, POP' },
                          { id: 'Merchandising', label: 'Merchandising', icon: '🎁', desc: 'Artículos promocionales, textil, welcome kits' },
                          { id: 'Campaña Integral', label: 'Campaña Integral', icon: '🚀', desc: 'Estrategia creativa 360°, multicanal' }
                        ].map(act => {
                          const isSelected = normalizeActivityType(brief.tipoProyecto) === act.id;
                          return (
                            <button
                              key={act.id}
                              type="button"
                              onClick={() => updateBriefManual({ tipoProyecto: act.id, tipoProyectoManual: true })}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: isSelected ? 800 : 600,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease-in-out',
                                border: isSelected ? '1.5px solid #7c3aed' : '1px solid #cbd5e1',
                                background: isSelected ? '#7c3aed' : '#ffffff',
                                color: isSelected ? '#ffffff' : '#334155',
                                boxShadow: isSelected ? '0 2px 8px rgba(124, 58, 237, 0.25)' : 'none'
                              }}
                              title={act.desc}
                            >
                              <span style={{ fontSize: '13px' }}>{act.icon}</span>
                              <span>{act.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* MATRIZ EDITABLE DE REQUERIMIENTOS CUANTIFICADOS */}
                    <BriefQuantifiedMatrixCard
                      requerimientos={brief.requerimientosCuantificados || []}
                      onChange={(next) => updateBriefManual({ requerimientosCuantificados: next })}
                      onGoToCotizacion={handleUseRequirementsInQuote}
                    />

                    {/* SECCIONES Y PREGUNTAS ADAPTADAS AL TIPO DE ACTIVIDAD */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                      {officialSections.map(sec => (
                        <div key={sec.numeroRomano}>
                          <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 10px 0', borderBottom: '1px dashed #e2e8f0', paddingBottom: '4px' }}>
                            {sec.numeroRomano}. {sec.titulo}
                          </h3>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {sec.preguntas.map(q => (
                              <div
                                key={q.numero}
                                style={{
                                  padding: '8px 12px',
                                  background: q.respuesta ? 'rgba(139, 92, 246, 0.03)' : 'rgba(248, 250, 252, 0.6)',
                                  borderRadius: '8px',
                                  borderLeft: q.respuesta ? '3px solid #8b5cf6' : '3px solid #cbd5e1'
                                }}
                              >
                                <div style={{ fontWeight: 700, fontSize: '12.5px', color: '#1e293b', marginBottom: '4px' }}>
                                  {q.numero}. {q.pregunta}
                                </div>
                                <textarea
                                  rows={q.respuesta && q.respuesta.length > 70 ? 3 : 2}
                                  value={q.respuesta || ''}
                                  placeholder="Pendiente de confirmación por el cliente (la IA auto-completa conforme avanza la conversación, o edita aquí)..."
                                  onChange={(e) => handleUpdateBriefAnswer(q.numero, e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '12px',
                                    lineHeight: '1.5',
                                    color: q.respuesta ? '#0f172a' : '#64748b',
                                    background: '#ffffff',
                                    resize: 'vertical'
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* VISTA 2: FEED DE TRANSCRIPCIÓN Y NOTAS MANUALES */}
                {step1SubTab === 'transcripcion' && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      background: 'var(--card-bg, #ffffff)',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      borderRadius: '14px',
                      overflow: 'hidden',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.03)'
                    }}
                  >
                    <div
                      style={{
                        padding: '14px 18px',
                        borderBottom: '1px solid var(--border-color, #e2e8f0)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'var(--bg-secondary, #f8fafc)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Mic size={16} color={isRecording ? '#ef4444' : '#8b5cf6'} />
                        <span style={{ fontWeight: 700, fontSize: '14px' }}>Redacción / Transcripción del Diálogo</span>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(transcript);
                          toast.success('Transcripción copiada al portapapeles');
                        }}
                        title="Copiar texto completo"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                      >
                        <Copy size={15} />
                      </button>
                    </div>

                    <div
                      style={{
                        flex: 1,
                        minHeight: '360px',
                        padding: '18px',
                        overflowY: 'auto',
                        fontSize: '13px',
                        lineHeight: '1.65',
                        color: 'var(--text-secondary, #334155)',
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      {transcript ? (
                        <>
                          {transcript}
                          {interimText && (
                            <span style={{ color: '#8b5cf6', fontStyle: 'italic', opacity: 0.85 }}>
                              {' ' + interimText}
                            </span>
                          )}
                          <div ref={transcriptEndRef} />
                        </>
                      ) : isRecording ? (
                        <div style={{ textAlign: 'center', color: '#7c3aed', paddingTop: '60px' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.12)', marginBottom: '14px' }}>
                            <Mic size={24} className="animate-pulse" />
                          </div>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: '14px' }}>Escuchando la conversación en vivo...</p>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Habla o reproduce la llamada en Google Meet / Zoom para transcribir.
                          </p>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: '60px' }}>
                          <MicOff size={32} style={{ opacity: 0.35, margin: '0 auto 12px auto' }} />
                          <p style={{ margin: 0, fontWeight: 600 }}>Presiona "Iniciar Escucha en Vivo" arriba</p>
                          <p style={{ fontSize: '12px', marginTop: '4px' }}>O ingresa notas y apuntes manuales abajo.</p>
                        </div>
                      )}
                    </div>

                    {/* CAJA DE APUNTES MANUALES */}
                    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', gap: '8px', background: 'var(--bg-secondary, #f8fafc)' }}>
                      <input
                        type="text"
                        placeholder="Escribir nota manual o agregar dato clave..."
                        value={manualNote}
                        onChange={(e) => setManualNote(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddManualNote()}
                        style={{
                          flex: 1,
                          fontSize: '13px',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color, #cbd5e1)',
                          background: 'var(--card-bg, #fff)'
                        }}
                      />
                      <button
                        onClick={handleAddManualNote}
                        style={{
                          background: '#8b5cf6',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '0 14px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        title="Enviar apunte"
                      >
                        <Send size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* PANEL COPILOTO OPERATIVO LATERAL */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <BriefCopilotSidePanel
                  brief={brief}
                  sections={officialSections}
                  pendingQuestions={pendingQuestions}
                  onGoToStep2={() => setCurrentStep(2)}
                  onUpdateBrief={updateBriefManual}
                />

                {/* BOTÓN CONTINUAR AL PASO 2 */}
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    onClick={() => setCurrentStep(2)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px 20px',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(139, 92, 246, 0.35)'
                    }}
                  >
                    <span>Paso 2: Revisar Preguntas & Copiloto</span>
                    <ArrowRight size={16} />
                  </button>
                  <p style={{ margin: 0, fontSize: '11px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Puedes cambiar de paso en cualquier momento usando las pestañas superiores.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PASO 2: DUDAS EN VIVO / COPILOTO */}
          {/* ========================================================================= */}
          {currentStep === 2 && (
            <div style={{ maxWidth: '980px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: '12px',
                  background: 'rgba(139, 92, 246, 0.07)',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}
              >
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 700, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <HelpCircle size={16} />
                    <span>Copiloto de Dudas & Preguntas Importantes</span>
                  </h3>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Formula estas preguntas clave al cliente antes de colgar para evitar huecos en la cotización y producción.
                  </p>
                </div>
                <button
                  onClick={triggerAiAnalysis}
                  disabled={isAiProcessing}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #8b5cf6',
                    background: '#fff',
                    color: '#8b5cf6',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  <RefreshCw size={13} className={isAiProcessing ? 'animate-spin' : ''} />
                  <span>Actualizar Preguntas</span>
                </button>
              </div>

              {/* LISTA DE PREGUNTAS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {pendingQuestions.length > 0 ? (
                  pendingQuestions.map((q) => {
                    const categoryColors: Record<string, { bg: string; text: string }> = {
                      PRODUCCION: { bg: 'rgba(234, 179, 8, 0.15)', text: '#b45309' },
                      PRESUPUESTO: { bg: 'rgba(16, 185, 129, 0.15)', text: '#059669' },
                      FECHAS: { bg: 'rgba(59, 130, 246, 0.15)', text: '#2563eb' },
                      PERMISOS: { bg: 'rgba(239, 68, 68, 0.15)', text: '#dc2626' },
                      CREATIVIDAD: { bg: 'rgba(139, 92, 246, 0.15)', text: '#7c3aed' },
                      GENERAL: { bg: 'rgba(100, 116, 139, 0.15)', text: '#475569' }
                    };
                    const color = categoryColors[q.categoria] || categoryColors.GENERAL;

                    return (
                      <div
                        key={q.id}
                        style={{
                          background: 'var(--card-bg, #ffffff)',
                          border: '1px solid var(--border-color, #e2e8f0)',
                          borderRadius: '12px',
                          padding: '16px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: '16px'
                        }}
                      >
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: color.bg,
                                color: color.text
                              }}
                            >
                              {q.categoria}
                            </span>
                            {q.prioridad === 'ALTA' && (
                              <span style={{ fontSize: '10px', fontWeight: 800, color: '#ef4444' }}>
                                ● URGENTE ANTES DE COLGAR
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: '1.4' }}>
                            "{q.pregunta}"
                          </div>

                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            🎯 <strong>Por qué es clave:</strong> {q.motivo}
                          </div>
                        </div>

                        <button
                          onClick={() => handleDismissQuestion(q.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            background: 'rgba(16, 185, 129, 0.08)',
                            color: '#059669',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <CheckCircle2 size={14} />
                          <span>Ya la formulé</span>
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '48px 20px',
                      background: 'var(--card-bg, #ffffff)',
                      borderRadius: '12px',
                      border: '1px dashed var(--border-color, #cbd5e1)'
                    }}
                  >
                    <CheckCircle2 size={36} color="#10b981" style={{ margin: '0 auto 12px auto' }} />
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 700 }}>¡Sin vacíos críticos detectados!</h4>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                      Toda la información indispensable para cotizar y proyectar ha sido recopilada.
                    </p>
                  </div>
                )}
              </div>

              {/* BOTONES NAVEGACIÓN */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
                <button
                  onClick={() => setCurrentStep(1)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  <ArrowLeft size={16} />
                  <span>Volver a Redacción</span>
                </button>

                <button
                  onClick={() => setCurrentStep(3)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#8b5cf6',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
                  }}
                >
                  <span>Paso 3: Datos de Proyecto SIG Purple</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PASO 3: DATOS DE PROYECTO SEGÚN LAS OPCIONES DE SIG PURPLE */}
          {/* ========================================================================= */}
          {currentStep === 3 && (
            <div style={{ maxWidth: '980px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div
                style={{
                  background: 'var(--card-bg, #ffffff)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: '14px',
                  padding: '22px',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.03)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                  <FolderKanban size={20} color="#8b5cf6" />
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Datos Oficiales del Proyecto en SIG Purple</h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                      Estos campos coinciden exactamente con la base de datos de SIG Purple para su creación oficial al terminar.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                  {/* CLIENTE */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Cliente Registrado en SIG Purple *
                    </label>
                    <select
                      value={brief.clienteId || ''}
                      onChange={(e) => {
                        const targetId = e.target.value;
                        const c = clientes.find(cl => cl.id === targetId);
                        const firstContact = c?.contactos?.[0];
                        updateBriefManual({
                          clienteId: targetId,
                          clienteNombre: c?.empresa || brief.clienteNombre,
                          contactoNombre: firstContact?.nombre || c?.contacto || brief.contactoNombre,
                          contactoCargo: firstContact?.cargo || c?.cargo || brief.contactoCargo,
                          contactoEmail: firstContact?.email || c?.email || brief.contactoEmail,
                          contactoTelefono: firstContact?.telefono || c?.telefono || brief.contactoTelefono
                        });
                      }}
                      style={{
                        width: '100%',
                        marginTop: '6px',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid var(--border-color, #cbd5e1)',
                        fontSize: '13px',
                        fontWeight: 600
                      }}
                    >
                      <option value="">-- Seleccionar de Clientes del Sistema --</option>
                      {clientes.map(c => (
                        <option key={c.id} value={c.id}>{c.empresa}</option>
                      ))}
                    </select>
                  </div>

                  {/* NOMBRE DEL PROYECTO */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Nombre del Proyecto *
                    </label>
                    <input
                      type="text"
                      value={brief.nombreTentativoProyecto || ''}
                      onChange={(e) => updateBriefManual({ nombreTentativoProyecto: e.target.value })}
                      placeholder="Ej: Activación Verano Mall Aventura 2026"
                      style={{
                        width: '100%',
                        marginTop: '6px',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid var(--border-color, #cbd5e1)',
                        fontSize: '13px',
                        fontWeight: 600
                      }}
                    />
                  </div>

                  {/* LÍNEA DE SERVICIO (EXACTA) */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Línea de Servicio Oficial *
                    </label>
                    <select
                      value={brief.tipoServicio || 'PURPLE STRATEGY & CREATIVITY'}
                      onChange={(e) => updateBriefManual({ tipoServicio: e.target.value })}
                      style={{
                        width: '100%',
                        marginTop: '6px',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid var(--border-color, #cbd5e1)',
                        fontSize: '13px',
                        fontWeight: 600
                      }}
                    >
                      {serviceLines.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  {/* TIPO DE PROYECTO (EXACTO) */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Tipo de Proyecto Oficial *
                    </label>
                    <select
                      value={brief.tipoProyecto || 'Activación'}
                      onChange={(e) => updateBriefManual({ tipoProyecto: e.target.value })}
                      style={{
                        width: '100%',
                        marginTop: '6px',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid var(--border-color, #cbd5e1)',
                        fontSize: '13px',
                        fontWeight: 600
                      }}
                    >
                      {projectTypes.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* MONEDA Y RANGO PRESUPUESTAL */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Moneda del Proyecto
                    </label>
                    <select
                      value={brief.presupuestoEstimado?.moneda || 'PEN'}
                      onChange={(e) => updateBriefManual({
                        presupuestoEstimado: {
                          ...brief.presupuestoEstimado,
                          moneda: e.target.value as 'PEN' | 'USD'
                        }
                      })}
                      style={{
                        width: '100%',
                        marginTop: '6px',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid var(--border-color, #cbd5e1)',
                        fontSize: '13px'
                      }}
                    >
                      <option value="PEN">Soles (PEN - S/)</option>
                      <option value="USD">Dólares (USD - $)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Rango Presupuestal Estimado
                    </label>
                    <select
                      value={String(brief.presupuestoEstimado?.monto || '')}
                      onChange={(e) => updateBriefManual({
                        presupuestoEstimado: {
                          ...brief.presupuestoEstimado,
                          monto: e.target.value
                        }
                      })}
                      style={{
                        width: '100%',
                        marginTop: '6px',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid var(--border-color, #cbd5e1)',
                        fontSize: '13px'
                      }}
                    >
                      <option value="">-- Seleccionar Rango --</option>
                      {budgetRanges.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                      {brief.presupuestoEstimado?.monto && !budgetRanges.includes(String(brief.presupuestoEstimado.monto)) && (
                        <option value={String(brief.presupuestoEstimado.monto)}>{String(brief.presupuestoEstimado.monto)}</option>
                      )}
                    </select>
                  </div>

                  {/* PROJECT MANAGER */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Project Manager (PM)
                    </label>
                    <select
                      value={brief.projectManager || 'Eric Higa'}
                      onChange={(e) => updateBriefManual({ projectManager: e.target.value })}
                      style={{
                        width: '100%',
                        marginTop: '6px',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid var(--border-color, #cbd5e1)',
                        fontSize: '13px'
                      }}
                    >
                      <option value="Eric Higa">Eric Higa</option>
                      <option value="Maria Paula de la Puente">Maria Paula de la Puente</option>
                    </select>
                  </div>

                  {/* LOCACIONES */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Locaciones / Sedes
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Jockey Plaza, Real Plaza Salaverry"
                      value={(brief.locaciones?.lugares || []).join(', ')}
                      onChange={(e) => updateBriefManual({
                        locaciones: {
                          ...brief.locaciones,
                          lugares: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                        }
                      })}
                      style={{
                        width: '100%',
                        marginTop: '6px',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid var(--border-color, #cbd5e1)',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                </div>

                {/* OBJETIVO PRINCIPAL */}
                <div style={{ marginTop: '16px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    Objetivo Principal del Cliente
                  </label>
                  <textarea
                    rows={2}
                    value={brief.objetivoPrincipal || ''}
                    onChange={(e) => updateBriefManual({ objetivoPrincipal: e.target.value })}
                    placeholder="Qué busca lograr el cliente (awareness, ventas, branding, etc.)..."
                    style={{
                      width: '100%',
                      marginTop: '6px',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid var(--border-color, #cbd5e1)',
                      fontSize: '13px',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </div>

              {/* BOTONES NAVEGACIÓN */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                <button
                  onClick={() => setCurrentStep(2)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  <ArrowLeft size={16} />
                  <span>Volver a Dudas</span>
                </button>

                <button
                  onClick={() => setCurrentStep(4)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#8b5cf6',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
                  }}
                >
                  <span>Paso 4: Decisión de Concepto Creativo</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PASO 4: DECISIÓN DE CONCEPTO CREATIVO (¿REQUIERE IDEA?) */}
          {/* ========================================================================= */}
          {currentStep === 4 && (
            <div style={{ maxWidth: '980px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div
                style={{
                  background: 'var(--card-bg, #ffffff)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: '14px',
                  padding: '22px',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.03)'
                }}
              >
                <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
                  ¿Este proyecto requiere Propuesta Creativa / Big Idea?
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 18px 0' }}>
                  Define si SIG Purple debe presentar una idea creativa conceptual y dinámicas, o si es un requerimiento técnico directo.
                </p>

                {/* SELECTORES GRANDES INTERACTIVOS */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                  {/* OPCIÓN SÍ */}
                  <div
                    onClick={() => setBrief({ ...brief, requiereIdeaCreativa: true })}
                    style={{
                      padding: '18px',
                      borderRadius: '12px',
                      border: brief.requiereIdeaCreativa !== false ? '2px solid #8b5cf6' : '1.5px solid var(--border-color, #e2e8f0)',
                      backgroundColor: brief.requiereIdeaCreativa !== false ? 'rgba(139, 92, 246, 0.05)' : 'var(--bg-secondary, #f8fafc)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: brief.requiereIdeaCreativa !== false ? '0 4px 14px rgba(139, 92, 246, 0.15)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '20px' }}>💡</span>
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          border: brief.requiereIdeaCreativa !== false ? '6px solid #8b5cf6' : '2px solid var(--border-color, #cbd5e1)',
                          backgroundColor: '#fff'
                        }}
                      />
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#6d28d9', marginBottom: '4px' }}>
                      SÍ, Requiere Propuesta Creativa / Big Idea
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                      Para activaciones de marca, campañas integrales o eventos que necesitan concepto publicitario, storytelling y dinámicas de gamificación.
                    </p>
                  </div>

                  {/* OPCIÓN NO */}
                  <div
                    onClick={() => setBrief({ ...brief, requiereIdeaCreativa: false })}
                    style={{
                      padding: '18px',
                      borderRadius: '12px',
                      border: brief.requiereIdeaCreativa === false ? '2px solid #10b981' : '1.5px solid var(--border-color, #e2e8f0)',
                      backgroundColor: brief.requiereIdeaCreativa === false ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-secondary, #f8fafc)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: brief.requiereIdeaCreativa === false ? '0 4px 14px rgba(16, 185, 129, 0.15)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '20px' }}>🛠️</span>
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          border: brief.requiereIdeaCreativa === false ? '6px solid #10b981' : '2px solid var(--border-color, #cbd5e1)',
                          backgroundColor: '#fff'
                        }}
                      />
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#047857', marginBottom: '4px' }}>
                      NO, es Producción / Implementación Directa
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                      Para vitrinas, montajes con planos ya listos, alquiler de equipos de sonido/pantallas o compras operativas sin conceptualización.
                    </p>
                  </div>
                </div>

                {/* DETALLE SI REQUIERE IDEA */}
                {brief.requiereIdeaCreativa !== false ? (
                  <div style={{ marginTop: '22px', display: 'flex', flexDirection: 'column', gap: '20px', borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: '20px' }}>
                    {/* BARRA SUPERIOR CON BOTÓN DE GENERACIÓN IA */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', background: 'rgba(139, 92, 246, 0.05)', padding: '14px 18px', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '14px', color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Wand2 size={16} />
                          <span>Desarrollo Creativo de Agencia (Big Idea, Storytelling & Momentos)</span>
                        </div>
                        <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          Conceptualiza la experiencia completa con racional creativo, 4 momentos, look & feel y gamificación.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          const res = await generateCreativeIdea();
                          if (res) {
                            toast.success('¡Propuesta creativa desarrollada con éxito!');
                          }
                        }}
                        disabled={isGeneratingCreativeIdea}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '10px 18px',
                          borderRadius: '10px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: isGeneratingCreativeIdea ? 'not-allowed' : 'pointer',
                          opacity: isGeneratingCreativeIdea ? 0.7 : 1,
                          boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
                        }}
                      >
                        {isGeneratingCreativeIdea ? (
                          <>
                            <RefreshCw size={15} className="animate-spin" />
                            <span>Creando Concepto con IA...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={15} />
                            <span>{brief.propuestaCreativaDetallada ? '🔄 Regenerar / Refinar Idea' : '✨ Desarrollar / Detallar Idea Creativa con IA'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* TARJETA HERO: BIG IDEA & CLAIM RECTOR */}
                    <div
                      style={{
                        background: 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 60%, #7c3aed 100%)',
                        borderRadius: '14px',
                        padding: '24px',
                        color: '#ffffff',
                        boxShadow: '0 8px 24px rgba(109, 40, 217, 0.25)',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: '12px' }}>
                          ⚡ BIG IDEA RECTORA
                        </span>
                        {brief.propuestaCreativaDetallada?.sloganClaim && (
                          <span style={{ fontSize: '12px', color: '#fef08a', fontWeight: 700, fontStyle: 'italic' }}>
                            "{brief.propuestaCreativaDetallada.sloganClaim}"
                          </span>
                        )}
                      </div>

                      <input
                        type="text"
                        value={brief.propuestaCreativaDetallada?.bigIdea || brief.mensajeClaveOConcepto || deliverable?.propuestaCreativa?.bigIdea || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateBriefManual({
                            mensajeClaveOConcepto: val,
                            propuestaCreativaDetallada: brief.propuestaCreativaDetallada ? {
                              ...brief.propuestaCreativaDetallada,
                              bigIdea: val
                            } : undefined
                          });
                        }}
                        placeholder="Ej: Conectando Altura y Comodidad: La Ruta Interactiva Crepier"
                        style={{
                          width: '100%',
                          background: 'rgba(255, 255, 255, 0.12)',
                          border: '1.5px solid rgba(255, 255, 255, 0.3)',
                          borderRadius: '8px',
                          padding: '12px 14px',
                          color: '#ffffff',
                          fontSize: '18px',
                          fontWeight: 800,
                          outline: 'none',
                          marginTop: '6px'
                        }}
                      />

                      {brief.propuestaCreativaDetallada?.sloganClaim && (
                        <div style={{ marginTop: '10px' }}>
                          <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Slogan / Claim Rector:</label>
                          <input
                            type="text"
                            value={brief.propuestaCreativaDetallada.sloganClaim}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (brief.propuestaCreativaDetallada) {
                                updateBriefManual({
                                  propuestaCreativaDetallada: {
                                    ...brief.propuestaCreativaDetallada,
                                    sloganClaim: val
                                  }
                                });
                              }
                            }}
                            style={{
                              width: '100%',
                              background: 'transparent',
                              border: 'none',
                              borderBottom: '1px dashed rgba(255,255,255,0.4)',
                              padding: '4px 0',
                              color: '#fef08a',
                              fontSize: '14px',
                              fontWeight: 700,
                              fontStyle: 'italic',
                              outline: 'none'
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* RACIONAL CREATIVO & STORYTELLING */}
                    {(brief.propuestaCreativaDetallada?.storytelling || brief.propuestaCreativaDetallada?.racionalCreativo) && (
                      <div style={{ background: 'var(--bg-secondary, #f8fafc)', borderRadius: '12px', padding: '16px 20px', border: '1px solid var(--border-color, #e2e8f0)' }}>
                        <div style={{ fontWeight: 800, fontSize: '13px', color: '#6d28d9', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <BookOpen size={15} />
                          <span>Storytelling & Racional Creativo</span>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.6', margin: 0, fontStyle: 'normal' }}>
                          {brief.propuestaCreativaDetallada.storytelling || brief.propuestaCreativaDetallada.racionalCreativo}
                        </p>
                      </div>
                    )}

                    {/* LOS 4 MOMENTOS DE LA EXPERIENCIA BTL */}
                    {brief.propuestaCreativaDetallada?.momentosExperiencia && (
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Star size={16} color="#f59e0b" />
                          <span>Los 4 Momentos de la Experiencia BTL:</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                          {/* BIENVENIDA */}
                          <div style={{ background: '#ffffff', borderRadius: '10px', border: '1.5px solid #e0e7ff', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '12px', color: '#4338ca', marginBottom: '6px' }}>
                              <span>🚪 1. Bienvenida & Llegada</span>
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                              {brief.propuestaCreativaDetallada.momentosExperiencia.bienvenida}
                            </p>
                          </div>

                          {/* DINÁMICA CENTRAL */}
                          <div style={{ background: '#ffffff', borderRadius: '10px', border: '1.5px solid #ede9fe', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '12px', color: '#7c3aed', marginBottom: '6px' }}>
                              <span>⚡ 2. Dinámica Central</span>
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                              {brief.propuestaCreativaDetallada.momentosExperiencia.dinamicaCentral}
                            </p>
                          </div>

                          {/* MOMENTO WOW */}
                          <div style={{ background: '#ffffff', borderRadius: '10px', border: '1.5px solid #fef3c7', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '12px', color: '#b45309', marginBottom: '6px' }}>
                              <span>⭐ 3. Momento WOW (Foto/Clímax)</span>
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                              {brief.propuestaCreativaDetallada.momentosExperiencia.momentoWow}
                            </p>
                          </div>

                          {/* CIERRE Y RECUERDO */}
                          <div style={{ background: '#ffffff', borderRadius: '10px', border: '1.5px solid #d1fae5', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '12px', color: '#047857', marginBottom: '6px' }}>
                              <span>🎁 4. Cierre & Recuerdo</span>
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                              {brief.propuestaCreativaDetallada.momentosExperiencia.cierreYRecuerdo}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* LOOK & FEEL Y PALETA DE COLORES */}
                    {brief.propuestaCreativaDetallada?.lookAndFeel && (
                      <div style={{ background: 'var(--bg-secondary, #f8fafc)', borderRadius: '12px', padding: '16px 20px', border: '1px solid var(--border-color, #e2e8f0)', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Palette size={15} color="#ec4899" />
                            <span>Look & Feel Visual & Atmósfera</span>
                          </div>
                          <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                            {brief.propuestaCreativaDetallada.lookAndFeel.estiloVisual}
                          </p>
                          {brief.propuestaCreativaDetallada.lookAndFeel.musicaEIluminacion && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              <strong>Música & Iluminación:</strong> {brief.propuestaCreativaDetallada.lookAndFeel.musicaEIluminacion}
                            </div>
                          )}
                        </div>

                        {brief.propuestaCreativaDetallada.lookAndFeel.paletaColores?.length > 0 && (
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                              Paleta de Colores Sugerida:
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                              {brief.propuestaCreativaDetallada.lookAndFeel.paletaColores.map((hex, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '6px', background: '#ffffff', border: '1px solid var(--border-color, #e2e8f0)', fontSize: '11px', fontWeight: 600 }}>
                                  <span style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: hex.startsWith('#') ? hex : `#${hex}`, border: '1px solid rgba(0,0,0,0.1)' }} />
                                  <span>{hex}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* MECÁNICAS & GAMIFICACIÓN */}
                    {brief.propuestaCreativaDetallada?.mecanicasYGamificacion && (
                      <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-color, #e2e8f0)', padding: '16px 20px' }}>
                        <div style={{ fontWeight: 800, fontSize: '13px', color: '#6d28d9', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Gamepad2 size={16} />
                          <span>Mecánicas de Gamificación & Premios</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Mecánica Principal</span>
                            <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                              {brief.propuestaCreativaDetallada.mecanicasYGamificacion.mecanicaPrincipal}
                            </p>
                          </div>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Mecánica Digital / Social</span>
                            <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                              {brief.propuestaCreativaDetallada.mecanicasYGamificacion.mecanicaDigital}
                            </p>
                          </div>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Premios & Incentivos</span>
                            <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                              {brief.propuestaCreativaDetallada.mecanicasYGamificacion.premiosOIncentivos}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* SI AÚN NO SE GENERÓ LA IDEA DETALLADA */}
                    {!brief.propuestaCreativaDetallada && (
                      <div style={{ textAlign: 'center', padding: '24px 16px', background: 'rgba(139, 92, 246, 0.04)', borderRadius: '12px', border: '1px dashed #c4b5fd' }}>
                        <Lightbulb size={28} color="#8b5cf6" style={{ margin: '0 auto 8px auto' }} />
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 700, color: '#6d28d9' }}>
                          Genera la Propuesta Creativa Integral con IA
                        </h4>
                        <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '520px', marginLeft: 'auto', marginRight: 'auto', lineHeight: '1.4' }}>
                          Haz clic en el botón superior para que la IA elabore un concepto creativo completo para {brief.clienteNombre || 'este cliente'}, con Big Idea, Racional, 4 Momentos de Activación, Paleta de Colores y Gamificación.
                        </p>
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await generateCreativeIdea();
                            if (res) toast.success('¡Propuesta creativa desarrollada!');
                          }}
                          disabled={isGeneratingCreativeIdea}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 22px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#8b5cf6',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(139, 92, 246, 0.35)'
                          }}
                        >
                          <Sparkles size={16} />
                          <span>{isGeneratingCreativeIdea ? 'Generando...' : 'Desarrollar Idea Creativa con IA'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: '20px',
                      padding: '14px 18px',
                      borderRadius: '10px',
                      background: 'rgba(16, 185, 129, 0.08)',
                      border: '1px solid rgba(16, 185, 129, 0.2)',
                      fontSize: '13px',
                      color: '#065f46',
                      lineHeight: '1.5'
                    }}
                  >
                    ✓ <strong>Enfoque Operativo Activado:</strong> Se omitirá el tiempo de conceptualización publicitaria. La propuesta avanzará directamente al dimensionamiento de escenografía, equipamiento audiovisual, personal operativo y costos de producción.
                  </div>
                )}
              </div>

              {/* BOTONES NAVEGACIÓN */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                <button
                  onClick={() => setCurrentStep(3)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  <ArrowLeft size={16} />
                  <span>Volver a Datos de Proyecto</span>
                </button>

                <button
                  onClick={async () => {
                    if (!deliverable) {
                      await handleFinishMeeting(brief.requiereIdeaCreativa !== false);
                    }
                    setCurrentStep(5);
                  }}
                  disabled={isGeneratingDeliverable}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 22px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                  }}
                >
                  {isGeneratingDeliverable ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>Generando Estructura de Cotización...</span>
                    </>
                  ) : (
                    <>
                      <span>Paso 5: Vista Previa de Cotización</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PASO 5: VISTA PREVIA DE COTIZACIÓN (FORMATO SIG PURPLE) & APROBACIÓN */}
          {/* ========================================================================= */}
          {currentStep === 5 && (
            <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* SI YA SE CREÓ EL PROYECTO Y COTIZACIÓN */}
              {createdProject && createdQuote ? (
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%)',
                    border: '2px solid #10b981',
                    borderRadius: '16px',
                    padding: '30px',
                    textAlign: 'center',
                    boxShadow: '0 10px 30px rgba(16, 185, 129, 0.15)'
                  }}
                >
                  <div
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      background: '#10b981',
                      color: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '16px',
                      boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)'
                    }}
                  >
                    <CheckCircle2 size={34} />
                  </div>

                  <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#065f46', margin: '0 0 8px 0' }}>
                    ¡Proyecto y Cotización Creados Exitosamente!
                  </h2>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto 24px auto' }}>
                    Se han generado los registros oficiales en la base de datos de SIG Purple con todos los ítems y precios listos para trabajar.
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
                    <div style={{ padding: '12px 20px', background: '#fff', borderRadius: '10px', border: '1px solid #10b981', textAlign: 'left' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>CÓDIGO DE PROYECTO</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#047857' }}>{createdProject.id}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{createdProject.nombre}</div>
                    </div>

                    <div style={{ padding: '12px 20px', background: '#fff', borderRadius: '10px', border: '1px solid #8b5cf6', textAlign: 'left' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>COTIZACIÓN OFICIAL V1</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#6d28d9' }}>{createdQuote.id}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{brief.presupuestoEstimado?.moneda || 'PEN'} {financialTotals.totalClientEstimated.toLocaleString()}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                    <button
                      onClick={() => handleNavigateToQuote(createdQuote.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 24px',
                        borderRadius: '10px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '14px',
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(139, 92, 246, 0.4)'
                      }}
                    >
                      <Rocket size={17} />
                      <span>Abrir en Cotizador</span>
                    </button>

                    <button
                      onClick={() => setIsOrdersModalOpen(true)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 22px',
                        borderRadius: '10px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '14px',
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)'
                      }}
                    >
                      <Package size={17} />
                      <span>Generar Órdenes de Compra</span>
                    </button>

                    <button
                      onClick={() => handleNavigateToProjects(createdProject.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 20px',
                        borderRadius: '10px',
                        border: '1.5px solid var(--border-color, #cbd5e1)',
                        background: '#fff',
                        color: 'var(--text-primary)',
                        fontWeight: 700,
                        fontSize: '14px',
                        cursor: 'pointer'
                      }}
                    >
                      <FolderKanban size={17} />
                      <span>Ver en Lista de Proyectos</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* CABECERA VISTA PREVIA COTIZACIÓN */}
                  <div
                    style={{
                      background: 'var(--card-bg, #ffffff)',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      borderRadius: '14px',
                      padding: '18px 22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: 'rgba(139, 92, 246, 0.15)', color: '#7c3aed' }}>
                          VISTA PREVIA DE COTIZACIÓN SIG PURPLE
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Moneda: <strong>{brief.presupuestoEstimado?.moneda || 'PEN'}</strong>
                        </span>
                      </div>
                      <h3 style={{ margin: '6px 0 0 0', fontSize: '16px', fontWeight: 800 }}>
                        {brief.nombreTentativoProyecto || 'Cotización de Proyecto'}
                      </h3>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Cliente: <strong>{brief.clienteNombre || 'Cliente'}</strong> • Fecha: <strong>{new Date().toLocaleDateString('es-PE')}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleFinishMeeting(brief.requiereIdeaCreativa !== false)}
                        disabled={isGeneratingDeliverable}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          border: '1px solid #8b5cf6',
                          background: 'rgba(139, 92, 246, 0.08)',
                          color: '#7c3aed',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        <RefreshCw size={13} className={isGeneratingDeliverable ? 'animate-spin' : ''} />
                        <span>Regenerar con IA</span>
                      </button>
                    </div>
                  </div>

                  {/* TABLA ESTILO COTIZADOR SIG PURPLE */}
                  <div
                    style={{
                      background: 'var(--card-bg, #ffffff)',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      borderRadius: '14px',
                      overflow: 'hidden',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.04)'
                    }}
                  >
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', color: 'var(--text-secondary)' }}>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>ÍTEM / DESCRIPCIÓN</th>
                            <th style={{ padding: '10px 8px', textAlign: 'center', width: '70px', fontWeight: 700 }}>CANT</th>
                            <th style={{ padding: '10px 8px', textAlign: 'center', width: '70px', fontWeight: 700 }}>DÍAS</th>
                            <th style={{ padding: '10px 10px', textAlign: 'right', width: '110px', fontWeight: 700 }}>COSTO UNIT</th>
                            <th style={{ padding: '10px 10px', textAlign: 'right', width: '110px', fontWeight: 700 }}>SUBTOTAL PROV</th>
                            <th style={{ padding: '10px 10px', textAlign: 'right', width: '120px', fontWeight: 700 }}>PRECIO CLIENTE</th>
                            <th style={{ padding: '10px 14px', textAlign: 'right', width: '120px', fontWeight: 700 }}>TOTAL CLIENTE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quoteCategories.length > 0 ? (
                            quoteCategories.map((cat, catIdx) => {
                              // Subtotal de la categoría
                              let catTotalClient = 0;
                              let catTotalProvider = 0;

                              (cat.items || []).forEach(it => {
                                const provCost = (it.subItems || []).reduce((acc, s) => acc + ((Number(s.unitCost) || 0) * (Number(s.quantity) || 1) * (Number(s.dates) || 1)), 0);
                                const mult = provCost * ((Number(it.internalMultiplierPercent) || 10) / 100);
                                const fin = provCost * ((Number(it.financialExpensePercent) || 10) / 100);
                                const unitCli = Math.round(provCost + mult + fin);
                                const q = Number(it.quantity) || 1;
                                const d = Number(it.dates) || 1;

                                catTotalProvider += provCost * q * d;
                                catTotalClient += unitCli * q * d;
                              });

                              return (
                                <React.Fragment key={catIdx}>
                                  {/* FILA DE CATEGORÍA */}
                                  <tr style={{ background: '#7c3aed', color: '#fff' }}>
                                    <td colSpan={5} style={{ padding: '8px 14px', fontWeight: 800, fontSize: '13px' }}>
                                      {cat.name}
                                    </td>
                                    <td colSpan={2} style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 800, fontSize: '13px' }}>
                                      {brief.presupuestoEstimado?.moneda || 'PEN'} {catTotalClient.toLocaleString()}
                                    </td>
                                  </tr>

                                  {/* FILAS DE ÍTEMS */}
                                  {(cat.items || []).map((item, itemIdx) => {
                                    const unitProvCost = (item.subItems?.[0]?.unitCost || 0);
                                    const mult = unitProvCost * ((Number(item.internalMultiplierPercent) || 10) / 100);
                                    const fin = unitProvCost * ((Number(item.financialExpensePercent) || 10) / 100);
                                    const clientUnitPrice = Math.round(unitProvCost + mult + fin);

                                    const qty = Number(item.quantity) || 1;
                                    const dates = Number(item.dates) || 1;

                                    const itemSubtotalProv = unitProvCost * qty * dates;
                                    const itemSubtotalClient = clientUnitPrice * qty * dates;

                                    return (
                                      <tr key={itemIdx} style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)', background: itemIdx % 2 === 0 ? '#fff' : '#fafafa' }}>
                                        <td style={{ padding: '10px 14px' }}>
                                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.name}</div>
                                          {item.details && item.details.length > 0 && (
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                              {item.details.join(' • ')}
                                            </div>
                                          )}
                                        </td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                          <input
                                            type="number"
                                            min="1"
                                            value={qty}
                                            onChange={(e) => handleUpdateItemQty(catIdx, itemIdx, parseInt(e.target.value, 10) || 1)}
                                            style={{ width: '48px', padding: '3px 4px', textAlign: 'center', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                                          />
                                        </td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                          <input
                                            type="number"
                                            min="1"
                                            value={dates}
                                            onChange={(e) => handleUpdateItemDates(catIdx, itemIdx, parseInt(e.target.value, 10) || 1)}
                                            style={{ width: '48px', padding: '3px 4px', textAlign: 'center', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                                          />
                                        </td>
                                        <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                                          <input
                                            type="number"
                                            step="10"
                                            value={unitProvCost}
                                            onChange={(e) => handleUpdateItemCost(catIdx, itemIdx, parseFloat(e.target.value) || 0)}
                                            style={{ width: '80px', padding: '3px 6px', textAlign: 'right', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                                          />
                                        </td>
                                        <td style={{ padding: '10px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                                          {itemSubtotalProv.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: '#6d28d9' }}>
                                          {clientUnitPrice.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                                          {itemSubtotalClient.toLocaleString()}
                                        </td>
                                      </tr>
                                    );
                                  })}

                                  {/* BOTÓN AGREGAR ÍTEM A CATEGORÍA */}
                                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <td colSpan={7} style={{ padding: '4px 14px' }}>
                                      <button
                                        onClick={() => handleAddItemToCategory(catIdx)}
                                        style={{
                                          background: 'transparent',
                                          border: 'none',
                                          color: '#7c3aed',
                                          fontSize: '11px',
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          padding: '4px 8px'
                                        }}
                                      >
                                        <Plus size={12} />
                                        <span>Agregar ítem a {cat.name}</span>
                                      </button>
                                    </td>
                                  </tr>
                                </React.Fragment>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={7} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                  <Sparkles size={34} color="#8b5cf6" style={{ opacity: 0.8 }} />
                                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                                    Aún no se ha generado el desglose de cotización
                                  </div>
                                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', maxWidth: '460px', lineHeight: '1.4' }}>
                                    Procesa los datos capturados en el Smart Brief para estructurar automáticamente las categorías, ítems, cantidades y costos sugeridos de proveedores.
                                  </div>
                                  <button
                                    onClick={() => handleFinishMeeting(brief.requiereIdeaCreativa !== false)}
                                    disabled={isGeneratingDeliverable}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      marginTop: '8px',
                                      padding: '11px 24px',
                                      borderRadius: '10px',
                                      border: 'none',
                                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                      color: '#fff',
                                      fontWeight: 800,
                                      fontSize: '13px',
                                      cursor: isGeneratingDeliverable ? 'not-allowed' : 'pointer',
                                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                                    }}
                                  >
                                    {isGeneratingDeliverable ? (
                                      <>
                                        <RefreshCw size={16} className="animate-spin" />
                                        <span>Generando Desglose de Cotización con IA...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Sparkles size={16} />
                                        <span>Generar Cotización y Entregables con IA</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* RESUMEN FINANCIERO AL PIE (IDÉNTICO A COTIZADOR) */}
                    <div
                      style={{
                        padding: '16px 20px',
                        background: '#f8fafc',
                        borderTop: '1px solid var(--border-color, #cbd5e1)',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '24px'
                      }}
                    >
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>SUBTOTAL DIRECTO PROVEEDORES</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                          {brief.presupuestoEstimado?.moneda || 'PEN'} {financialTotals.subtotalProviderDirect.toLocaleString()}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>FEE DE AGENCIA (12%)</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#7c3aed' }}>
                          {brief.presupuestoEstimado?.moneda || 'PEN'} {financialTotals.agencyFee.toLocaleString()}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', paddingLeft: '16px', borderLeft: '2px solid #cbd5e1' }}>
                        <div style={{ fontSize: '11px', color: '#047857', fontWeight: 800 }}>TOTAL CLIENTE ESTIMADO</div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#047857' }}>
                          {brief.presupuestoEstimado?.moneda || 'PEN'} {financialTotals.totalClientEstimated.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BARRA DE APROBACIÓN FINAL Y CREACIÓN DE PROYECTO */}
                  <div
                    style={{
                      background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)',
                      border: '1.5px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '14px',
                      padding: '18px 24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        ¿Todo conforme con el desglose y opciones del proyecto?
                      </h4>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Al aprobar, se registrará el <strong>Proyecto oficial</strong> (PRJ-2026-XXX) y la <strong>Cotización inicial</strong> en SIG Purple para empezar a trabajarla de inmediato.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        onClick={() => setCurrentStep(4)}
                        style={{
                          padding: '10px 16px',
                          borderRadius: '10px',
                          border: '1px solid var(--border-color, #cbd5e1)',
                          background: '#fff',
                          color: 'var(--text-secondary)',
                          fontWeight: 600,
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        Ajustar Concepto
                      </button>

                      <button
                        onClick={async () => {
                          await handleCreateProject(quoteCategories, brief);
                        }}
                        disabled={isCreatingProject}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '12px 24px',
                          borderRadius: '10px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: '14px',
                          cursor: 'pointer',
                          boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)'
                        }}
                      >
                        {isCreatingProject ? (
                          <>
                            <RefreshCw size={16} className="animate-spin" />
                            <span>Creando Proyecto y Cotización...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={17} />
                            <span>Aprobar y Crear en SIG Purple</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}

            </div>
          )}

        </div>
      </div>
      <CreateOrdenesMasivasModal isOpen={isOrdersModalOpen} onClose={() => setIsOrdersModalOpen(false)} initialQuoteId={createdQuote?.id} />
    </div>,
    document.body
  );
};
