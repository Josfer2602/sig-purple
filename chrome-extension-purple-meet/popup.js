document.addEventListener('DOMContentLoaded', () => {
  const serverInput = document.getElementById('serverUrl');
  const meetingInput = document.getElementById('meetingId');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['sigServerUrl', 'sigMeetingId'], (data) => {
      if (data.sigServerUrl) serverInput.value = data.sigServerUrl;
      if (data.sigMeetingId) meetingInput.value = data.sigMeetingId;
    });
  }

  saveBtn.addEventListener('click', () => {
    const sigServerUrl = serverInput.value.trim() || 'https://purple.devlian.de';
    const sigMeetingId = meetingInput.value.trim();

    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ sigServerUrl, sigMeetingId }, () => {
        statusEl.textContent = '¡Configuración guardada!';
        setTimeout(() => { statusEl.textContent = ''; }, 2500);
      });
    }
  });
});

