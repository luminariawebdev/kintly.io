import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { App } from './App';

// Last-resort error boundary — a render crash anywhere below shows a
// reload card instead of a permanently white screen.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, fontFamily: "'Fredoka', 'Satoshi', 'Inter', system-ui, sans-serif",
        }}>
          <div style={{ maxWidth: 360, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }} aria-hidden>😵</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Something went wrong</h2>
            <p style={{ color: '#666', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
              The app hit an unexpected error. Reloading usually fixes it.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16, padding: '10px 24px', borderRadius: 999,
                border: '1px solid #bbb', background: '#fff',
                fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Reload app</button>
            <pre style={{
              marginTop: 16, fontSize: 10, color: '#999',
              whiteSpace: 'pre-wrap', textAlign: 'left', wordBreak: 'break-word',
            }}>{String(this.state.error?.message || this.state.error)}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><App /></ErrorBoundary>);

// PWA: register the network-first service worker (public/sw.js).
// Skipped on localhost so dev never fights a cache.
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* non-fatal */ });
  });
}
