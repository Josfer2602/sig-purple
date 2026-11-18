// SIG Purple - Google Meet Copilot Content Script
(function () {
  console.log('🟣 [SIG Purple] Google Meet Copilot inicializado.');

  let currentMeetingId = null;
  let serverUrl = 'https://purple.devlian.de';
  let isEnabled = true;
  let ws = null;
  let questions = [];
  let briefProgress = 0;
  let isCollapsed = false;

  // Cargar configuración guardada
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['sigServerUrl', 'sigMeetingId', 'sigEnabled'], (data) => {
      if (data.sigServerUrl) serverUrl = data.sigServerUrl;
      if (data.sigMeetingId) currentMeetingId = data.sigMeetingId;
      if (typeof data.sigEnabled === 'boolean') isEnabled = data.sigEnabled;
      initOverlay();
      findOrSyncMeeting();
    });
  } else {
    initOverlay();
    findOrSyncMeeting();
  }

  // Buscar última reunión activa en el servidor si no tenemos ID
  async function findOrSyncMeeting() {
    try {
      const res = await fetch(`${serverUrl}/api/reuniones-ai`);
      if (res.ok) {
        const meetings = await res.json();
        const active = meetings.find(m => m.estado === 'EN_PROCESO');
        if (active) {
          currentMeetingId = active.id;
          updateStatus(`Conectado: ${active.titulo.substring(0, 25)}...`);
          connectWs(active.id);
        } else if (meetings.length > 0) {
          currentMeetingId = meetings[0].id;
          updateStatus(`Reunión: ${meetings[0].titulo.substring(0, 25)}...`);
          connectWs(meetings[0].id);
        }
      }
    } catch (e) {
      console.warn('No se pudo sincronizar automáticamente con SIG Purple:', e);
      updateStatus('Listo (Desconectado de SIG)');
    }
  }

  // Conectar WebSocket a SIG Purple
  function connectWs(meetingId) {
    try {
      if (ws) {
        try { ws.close(); } catch (e) {}
      }
      const wsProto = serverUrl.startsWith('https') ? 'wss:' : 'ws:';
      const host = serverUrl.replace(/^https?:\/\//, '');
      const wsUrl = `${wsProto}//${host}/ws/meeting`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join', meetingId }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'room_state' || data.type === 'brief_updated') {
            if (data.questions) renderQuestions(data.questions);
            if (typeof data.completitudPorcentaje === 'number') {
              updateProgress(data.completitudPorcentaje);
            }
          } else if (data.type === 'questions_updated') {
            renderQuestions(data.questions || []);
          }
        } catch (err) {}
      };
    } catch (e) {
      console.warn('Error en WS Meet Copilot:', e);
    }
  }

  // Crear la UI flotante en Google Meet
  function initOverlay() {
    if (document.getElementById('sig-purple-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'sig-purple-overlay';
    overlay.className = 'sig-purple-panel';
    overlay.innerHTML = `
      <div class="sig-header" id="sig-drag-handle">
        <div class="sig-title">
          <span class="sig-badge">🟣 SIG Purple</span>
          <span class="sig-subtitle">Smart Brief Copilot</span>
        </div>
        <div class="sig-actions">
          <button id="sig-toggle-collapse" title="Minimizar / Expandir">_</button>
        </div>
      </div>

      <div class="sig-body" id="sig-panel-body">
        <div class="sig-status-row">
          <span class="sig-status-dot"></span>
          <span id="sig-status-text" class="sig-status-text">Buscando reunión activa...</span>
        </div>

        <div class="sig-progress-box">
          <div class="sig-progress-label">
            <span>Completitud Brief</span>
            <strong id="sig-progress-num">0%</strong>
          </div>
          <div class="sig-progress-bar">
            <div id="sig-progress-fill" style="width: 0%"></div>
          </div>
        </div>

        <div class="sig-section-title">
          <span>🎯 Dudas Críticas para Aclarar</span>
          <span id="sig-questions-count" class="sig-count-pill">0</span>
        </div>

        <div id="sig-questions-list" class="sig-questions-container">
          <div class="sig-empty-state">
            Escuchando la reunión... A medida que conversen, aquí aparecerán las preguntas sugeridas para no colgar sin datos clave.
          </div>
        </div>

        <div class="sig-footer">
          <button id="sig-open-app" class="sig-btn-primary">Abrir en SIG Purple ↗</button>
          <button id="sig-toggle-cc" class="sig-btn-secondary" title="Activar subtítulos de Meet">Activar Subtítulos (CC)</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Eventos de la UI
    document.getElementById('sig-toggle-collapse').onclick = () => {
      isCollapsed = !isCollapsed;
      const body = document.getElementById('sig-panel-body');
      body.style.display = isCollapsed ? 'none' : 'block';
    };

    document.getElementById('sig-open-app').onclick = () => {
      window.open(serverUrl, '_blank');
    };

    document.getElementById('sig-toggle-cc').onclick = () => {
      // Simular tecla 'c' para activar subtítulos de Google Meet
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', keyCode: 67, bubbles: true }));
    };

    startCaptionsObserver();
  }

  function updateStatus(text) {
    const el = document.getElementById('sig-status-text');
    if (el) el.textContent = text;
  }

  function updateProgress(pct) {
    briefProgress = pct;
    const numEl = document.getElementById('sig-progress-num');
    const fillEl = document.getElementById('sig-progress-fill');
    if (numEl) numEl.textContent = `${pct}%`;
    if (fillEl) fillEl.style.width = `${pct}%`;
  }

  function renderQuestions(qs) {
    questions = qs.filter(q => !q.respondida);
    const countEl = document.getElementById('sig-questions-count');
    const listEl = document.getElementById('sig-questions-list');
    if (countEl) countEl.textContent = questions.length.toString();

    if (!listEl) return;

    if (questions.length === 0) {
      listEl.innerHTML = `
        <div class="sig-empty-state">
          ¡Todo en orden! No hay vacíos críticos detectados hasta el momento.
        </div>
      `;
      return;
    }

    listEl.innerHTML = questions.map(q => `
      <div class="sig-question-card ${q.prioridad === 'ALTA' ? 'sig-card-urgent' : ''}">
        <div class="sig-card-header">
          <span class="sig-card-tag">${q.categoria}</span>
          <span class="sig-card-urgency">${q.prioridad === 'ALTA' ? 'CRÍTICO' : 'RECOMENDADO'}</span>
        </div>
        <div class="sig-card-text">"${q.pregunta}"</div>
        <div class="sig-card-reason">💡 ${q.motivo}</div>
      </div>
    `).join('');
  }

  // Observador de subtítulos nativos de Google Meet
  let processedSentences = new Set();
  let lastSpeaker = '';

  function startCaptionsObserver() {
    let pendingBuffer = '';
    let sendTimeout = null;

    const observer = new MutationObserver(() => {
      if (!isEnabled || !currentMeetingId) return;

      // Selectores comunes de subtítulos de Meet
      const captionNodes = document.querySelectorAll('div[jsname="YSxPC"], .a4bIc, .iTTPfd');
      
      captionNodes.forEach(node => {
        // Encontrar nombre del hablante si está presente
        const speakerEl = node.closest('.nMxHgf, .T4LgNb, .jxFHg')?.querySelector('.zs75Bi, .y7X2Le, .poVWob') 
          || node.parentElement?.querySelector('.zs75Bi, .y7X2Le');
        
        let speaker = speakerEl ? speakerEl.textContent.trim() : lastSpeaker;
        if (speaker) lastSpeaker = speaker;

        const text = node.textContent.trim();
        if (text && text.length > 5 && !processedSentences.has(text)) {
          processedSentences.add(text);
          if (processedSentences.size > 200) processedSentences.clear();

          // Enviar chunk a SIG Purple
          fetch(`${serverUrl}/api/reuniones-ai/${currentMeetingId}/chunk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              speaker: speaker || 'Participante'
            })
          }).catch(err => console.warn('Error enviando chunk:', err));
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

})();

