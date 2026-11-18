import React from 'react';
import {
  Mic, MicOff, Maximize2, X, CheckCircle2, RefreshCw, Layers
} from 'lucide-react';
import { useSmartMeeting } from '../context/SmartMeetingContext';

export const SmartMeetingFloatingWidget: React.FC = () => {
  const {
    isActive,
    isMinimized,
    isRecording,
    secondsElapsed,
    brief,
    questions,
    isAiProcessing,
    maximize,
    toggleRecording,
    closeMeeting,
    handleDismissQuestion
  } = useSmartMeeting();

  if (!isActive || !isMinimized) return null;

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
  };

  const pendingQuestions = questions.filter(q => !q.respondida);
  const topQuestion = pendingQuestions[0];

  return (
    <div
      className="animate-fade-in"
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '84px',
        zIndex: 99990,
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        border: '1.5px solid rgba(139, 92, 246, 0.4)',
        boxShadow: '0 12px 36px -4px rgba(139, 92, 246, 0.25), 0 4px 12px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        maxWidth: '460px',
        minWidth: '340px',
        fontFamily: 'inherit',
        transition: 'all 0.25s ease'
      }}
    >
      {/* BARRA PRINCIPAL COMPACTA */}
      <div
        style={{
          padding: '10px 14px',
          background: 'linear-gradient(90deg, rgba(139, 92, 246, 0.08) 0%, rgba(99, 102, 241, 0.05) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}
      >
        {/* ESTADO EN VIVO & TIEMPO */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: isRecording ? '#ef4444' : '#94a3b8',
              boxShadow: isRecording ? '0 0 10px #ef4444' : 'none',
              animation: isRecording ? 'pulse 1.5s infinite' : 'none'
            }}
          />
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
            {formatTime(secondsElapsed)}
          </span>
          
          {/* COMPLETITUD BRIEF */}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: 'rgba(139, 92, 246, 0.12)',
              color: '#7c3aed',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Layers size={11} />
            Brief: {brief.completitudPorcentaje || 0}%
          </span>

          {isAiProcessing && (
            <span title="Gemini analizando...">
              <RefreshCw size={12} className="animate-spin" color="#8b5cf6" />
            </span>
          )}
        </div>

        {/* ACCIONES DEL WIDGET */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => toggleRecording()}
            title={isRecording ? "Pausar Escucha" : "Reanudar Escucha"}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: isRecording ? 'rgba(239, 68, 68, 0.15)' : 'rgba(139, 92, 246, 0.15)',
              color: isRecording ? '#dc2626' : '#7c3aed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            {isRecording ? <MicOff size={14} /> : <Mic size={14} />}
          </button>

          <button
            onClick={maximize}
            title="Maximizar Smart Brief"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#8b5cf6',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(139, 92, 246, 0.3)'
            }}
          >
            <Maximize2 size={12} />
            <span>Ver Brief</span>
          </button>

          <button
            onClick={closeMeeting}
            title="Cerrar Asistente"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ALERTA DE PREGUNTA URGENTE EN TIEMPO REAL */}
      {topQuestion && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: '#ffffff',
            borderTop: '1px solid rgba(139, 92, 246, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: '4px',
                  backgroundColor: topQuestion.prioridad === 'ALTA' ? '#fef2f2' : '#f0fdf4',
                  color: topQuestion.prioridad === 'ALTA' ? '#dc2626' : '#16a34a'
                }}
              >
                💡 PREGUNTA CLAVE ({topQuestion.categoria})
              </span>
            </div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#334155',
                marginTop: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
              title={topQuestion.pregunta}
            >
              "{topQuestion.pregunta}"
            </div>
          </div>

          <button
            onClick={() => handleDismissQuestion(topQuestion.id)}
            title="Marcar como ya preguntada al cliente"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '6px',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              color: '#059669',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            <CheckCircle2 size={12} />
            <span>Ya la hice</span>
          </button>
        </div>
      )}
    </div>
  );
};

