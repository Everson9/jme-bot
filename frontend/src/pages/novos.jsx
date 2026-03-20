// src/pages/novos.jsx — Últimos Cadastrados
import React, { useState } from 'react';
import { useFetch } from '../hooks/useFetch';

const API = import.meta.env.VITE_API_URL || "";

const STATUS_BADGE = {
  pago:       { label: 'Pago',      color: '#22c55e', bg: 'rgba(34,197,94,.12)' },
  pendente:   { label: 'Pendente',  color: '#f59e0b', bg: 'rgba(245,158,11,.12)' },
  promessa:   { label: 'Promessa',  color: '#a78bfa', bg: 'rgba(167,139,250,.12)' },
  cancelado:  { label: 'Cancelado', color: '#ef4444', bg: 'rgba(239,68,68,.12)' },
};

function Badge({ status }) {
  const s = STATUS_BADGE[status] || { label: status, color: '#94a3b8', bg: 'rgba(148,163,184,.12)' };
  return (
    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      color: s.color, background: s.bg, border: `1px solid ${s.color}44` }}>
      {s.label}
    </span>
  );
}

export function PageNovos() {
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(50);
  const { data: clientes, loading, refetch } = useFetch(`/api/clientes/recentes?limite=${limite}`, 30000);

  const filtrados = (clientes || []).filter(c =>
    !busca || (c.nome || '').toLowerCase().includes(busca.toLowerCase()) ||
    (c.telefone || '').includes(busca)
  );

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>👥 Últimos Cadastrados</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={limite} onChange={e => setLimite(Number(e.target.value))}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #2d3148',
              background: '#0f1117', color: '#e2e8f0', fontSize: 13 }}>
            <option value={20}>20 mais recentes</option>
            <option value={50}>50 mais recentes</option>
            <option value={100}>100 mais recentes</option>
          </select>
          <button onClick={refetch}
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none',
              background: 'rgba(56,189,248,.15)', color: '#38bdf8', fontWeight: 700,
              fontSize: 13, cursor: 'pointer' }}>
            ↻ Atualizar
          </button>
        </div>
      </div>

      <input placeholder="Buscar por nome ou telefone..."
        value={busca} onChange={e => setBusca(e.target.value)}
        style={{ width: '100%', padding: '9px 14px', borderRadius: 8,
          border: '1px solid #2d3148', background: '#0f1117', color: '#e2e8f0',
          fontSize: 13, marginBottom: 16, boxSizing: 'border-box' }} />

      <div className="card" style={{ background: '#0f1117', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div className="spinner-wrap"><div className="spinner" /></div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            {busca ? 'Nenhum resultado para a busca.' : 'Nenhum cliente cadastrado ainda.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#1a1d2e' }}>
                  {['Cadastrado em','Nome','Telefone','Plano','Dia Venc.','Status','Base'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left',
                      color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                      letterSpacing: '.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c, i) => (
                  <tr key={c.id}
                    style={{ borderBottom: '1px solid #1a1d2e',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)' }}>
                    <td style={{ padding: '12px 14px', color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {c.criado_em ? new Date(c.criado_em).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#e2e8f0' }}>{c.nome || '—'}</td>
                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>
                      {c.telefone || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#94a3b8', fontSize: 13 }}>{c.plano || '—'}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#94a3b8' }}>
                      {c.dia_vencimento ? `Dia ${c.dia_vencimento}` : '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}><Badge status={c.status} /></td>
                    <td style={{ padding: '12px 14px', color: '#64748b', fontSize: 12 }}>
                      {c.base_nome || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '10px 14px', color: '#64748b', fontSize: 12, borderTop: '1px solid #1a1d2e' }}>
              {filtrados.length} cliente{filtrados.length !== 1 ? 's' : ''} exibido{filtrados.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}