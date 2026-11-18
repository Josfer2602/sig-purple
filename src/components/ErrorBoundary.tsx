import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #ef4444', margin: '20px', borderRadius: '8px' }}>
          <h2>Algo salió mal (React Crash)</h2>
          <p style={{ fontWeight: 'bold', fontSize: '1rem', margin: '8px 0', color: '#7f1d1d' }}>
            {this.state.error && (this.state.error.message || this.state.error.toString())}
          </p>
          <div style={{ display: 'flex', gap: '10px', margin: '12px 0' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 16px',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Recargar Página
            </button>
            <button
              onClick={() => {
                Object.keys(localStorage).forEach(k => {
                  if (k.startsWith('quoteDraft_') || k === 'printQuoteData') {
                    localStorage.removeItem(k);
                  }
                });
                window.location.reload();
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#ffffff',
                color: '#dc2626',
                border: '1px solid #dc2626',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Limpiar Borrador Local y Recargar
            </button>
          </div>
          <details open style={{ whiteSpace: 'pre-wrap', marginTop: '12px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Detalles técnicos del error</summary>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}
