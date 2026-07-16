import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(e) {
    return { erro: e };
  }

  componentDidCatch(e, info) {
    console.error('[ErrorBoundary]', e, info.componentStack);
  }

  render() {
    if (this.state.erro) {
      const msg = this.state.erro?.message || String(this.state.erro);
      return (
        <div style={{ fontFamily: 'monospace', padding: 24, maxWidth: 800, margin: '40px auto' }}>
          <div style={{ background: '#fee', border: '2px solid #c00', borderRadius: 8, padding: 16 }}>
            <b style={{ fontSize: 18, color: '#c00' }}>Erro na renderização</b>
            <pre style={{ marginTop: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 }}>
              {msg}
            </pre>
            <div style={{ marginTop: 12 }}>
              <button
                onClick={() => this.setState({ erro: null })}
                style={{ marginRight: 8, padding: '6px 14px', borderRadius: 6, border: '1px solid #c00', background: '#fff', cursor: 'pointer' }}>
                Tentar novamente
              </button>
              <button
                onClick={() => { localStorage.clear(); window.location.reload(); }}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #888', background: '#fff', cursor: 'pointer' }}>
                Limpar sessão e recarregar
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
