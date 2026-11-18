import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'

registerSW({ immediate: true });

// Auto-recarga automática cuando se despliega una nueva versión y un chunk anterior ya no existe
window.addEventListener('vite:preloadError', (event) => {
  console.warn('Nueva versión detectada o recurso desactualizado. Recargando página...', event);
  window.location.reload();
});
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
