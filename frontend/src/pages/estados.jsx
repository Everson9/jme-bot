// src/pages/Estados.jsx
import React from 'react';
import { Card } from '../components/Card';

export function PageEstados() {
  return (
    <div className="page">
      <div className="page-title">🟢 Estado do Sistema</div>

      <Card style={{ padding: '2rem', textAlign: 'center', marginTop: 20 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔕</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>
          Atendimento Automático Desativado
        </h2>
        <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
          O sistema de atendimento automático via WhatsApp foi desativado.
          O bot não está processando mensagens ou gerenciando conversas.
        </p>
        <div style={{
          padding: '12px 20px',
          borderRadius: 8,
          background: 'rgba(34,197,94,0.1)',
          border: '1px solid rgba(34,197,94,0.3)',
          display: 'inline-block'
        }}>
          <span style={{ color: '#4ade80', fontWeight: 600, fontSize: 13 }}>
            ✓ Sistema operacional — apenas sem atendimento automático
          </span>
        </div>
      </Card>

      <div style={{ marginTop: 20, fontSize: 12, color: '#64748b', textAlign: 'center' }}>
        Para gerenciar clientes, use as páginas de Clientes, Cobrança e Promessas.
      </div>
    </div>
  );
}