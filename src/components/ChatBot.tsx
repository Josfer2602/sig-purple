import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot } from 'lucide-react';

import { API_URL } from '../utils/apiUrl';

export const ChatBot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<{role: 'user'|'assistant', content: string}[]>([
    { role: 'assistant', content: '¡Hola! Soy Purple Bot 💜. ¿En qué te puedo ayudar hoy con tus proyectos o datos?' }
  ]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!message.trim()) return;

    const userMessage = message;
    setMessage('');
    
    const newHistory = [...history, { role: 'user' as const, content: userMessage }];
    setHistory(newHistory);
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const currentQuoteId = localStorage.getItem('currentViewingQuoteId') || (window as any).__currentActiveQuoteId || undefined;

      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          message: userMessage,
          history: history.slice(1), // Exclude the initial greeting
          currentQuoteId
        })
      });
      
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.response) {
        throw new Error(data.error || 'Respuesta no válida del servidor');
      }
      setHistory([...newHistory, { role: 'assistant', content: data.response }]);
    } catch (error: any) {
      console.error('Chat error:', error);
      setHistory([...newHistory, { role: 'assistant', content: 'Lo siento, hubo un problema al procesar tu solicitud. Por favor intenta nuevamente.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button 
        className="pulse-btn chat-floating-btn"
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '46px',
          height: '46px',
          borderRadius: '50%',
          backgroundColor: '#7c3aed', // Purple
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 16px rgba(124, 58, 237, 0.45)',
          display: isOpen ? 'none' : 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: 'pointer',
          zIndex: 1000,
          transition: 'transform 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        title="Hablar con Purple Bot"
      >
        <MessageCircle size={22} />
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div 
          className="chat-window-panel"
          style={{
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            width: 'min(390px, calc(100vw - 32px))',
            height: 'min(560px, calc(100vh - 90px))',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1000,
            border: '1px solid #e2e8f0',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 18px',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #edf2f7',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: 'var(--accent-primary, #662D91)', padding: '7px', borderRadius: '50%', display: 'flex' }}>
                <Bot size={18} color="white" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#1a202c' }}>Purple Bot</h3>
                <span style={{ fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }}></span>
                  En línea
                </span>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              style={{ background: 'transparent', border: 'none', color: '#718096', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', borderRadius: '6px' }}
              title="Cerrar chat"
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            backgroundColor: '#ffffff'
          }}>
            {history.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                gap: '8px',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%'
              }}>
                {msg.role === 'assistant' && (
                  <div style={{ background: 'rgba(102, 45, 145, 0.1)', padding: '6px', borderRadius: '50%', height: 'fit-content', flexShrink: 0 }}>
                    <Bot size={16} color="var(--accent-primary, #662D91)" />
                  </div>
                )}
                
                <div style={{
                  padding: '11px 15px',
                  borderRadius: msg.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  backgroundColor: msg.role === 'user' ? 'var(--accent-primary, #662D91)' : '#f3f4f6',
                  color: msg.role === 'user' ? '#ffffff' : '#1f2937',
                  border: msg.role === 'user' ? 'none' : '1px solid #e5e7eb',
                  fontSize: '13.5px',
                  lineHeight: '1.45',
                  whiteSpace: 'pre-wrap',
                  boxShadow: msg.role === 'user' ? '0 2px 8px rgba(102, 45, 145, 0.25)' : 'none'
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            
            {loading && (
              <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-start' }}>
                <div style={{ background: 'rgba(102, 45, 145, 0.1)', padding: '6px', borderRadius: '50%', height: 'fit-content', flexShrink: 0 }}>
                  <Bot size={16} color="var(--accent-primary, #662D91)" />
                </div>
                <div style={{ padding: '11px 15px', borderRadius: '14px 14px 14px 2px', backgroundColor: '#f3f4f6', color: '#6b7280', fontSize: '13px', border: '1px solid #e5e7eb' }}>
                  Escribiendo...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSend} style={{
            padding: '12px 16px',
            borderTop: '1px solid #edf2f7',
            display: 'flex',
            gap: '8px',
            backgroundColor: '#ffffff'
          }}>
            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Escribe tu mensaje..."
              style={{
                flex: 1,
                padding: '10px 14px',
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                color: '#1e293b',
                fontSize: '13.5px',
                outline: 'none'
              }}
            />
            <button 
              type="submit"
              disabled={loading || !message.trim()}
              style={{
                background: 'var(--accent-primary, #662D91)',
                border: 'none',
                borderRadius: '8px',
                width: '42px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                color: 'white',
                cursor: (loading || !message.trim()) ? 'not-allowed' : 'pointer',
                opacity: (loading || !message.trim()) ? 0.5 : 1,
                transition: 'opacity 0.2s'
              }}
            >
              <Send size={17} />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
