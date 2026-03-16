// src/components/ErrorBoundary.jsx
import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(e) {
    return { erro: e };
  }

  render() {
    if (this.state.erro) {
      return (
        <div style={{
          padding: '2rem',
          color: '#f87171',
          background: '#0d1a2e',
          minHeight: '100vh',
          fontFamily: 'monospace'
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            ⚠️ Erro no componente
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
            {this.state.erro?.message}
          </div>
          <button
            onClick={() => this.setState({ erro: null })}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: '#1e3a5f',
              color: '#38bdf8',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}