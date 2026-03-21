// src/pages/inadimplentes.jsx
import React, { useState } from 'react';
import { useSSEData } from '../hooks/useSSEData';
import { Card } from '../components/Card';
import { Spinner } from '../components/Spinner';
import * as XLSX from "https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs";

const API = import.meta.env.VITE_API_URL || "";

// ── Aba 1: Inadimplentes por dias ──────────────────────────
function AbaInadimplentes() {
  const [dias, setDias] = useState(5);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/relatorio/inadimplentes?dias=${dias}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [dias]);

  const exportar = () => {
    if (!data?.length) return;
    const rows = data.map(c => ({
      Nome: c.nome, Telefone: c.telefone || "",
      Plano: c.plano || "", Vencimento: c.dia_vencimento ? `Dia ${c.dia_vencimento}` : "",
      Base: c.base_nome || "", "Dias pendente": c.dias_pendente,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inadimplentes");
    XLSX.writeFile(wb, `inadimplentes_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`);
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8' }}>
          Pendente há mais de
          <select value={dias} onChange={e => setDias(Number(e.target.value))}
            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #374151',
              background: '#252836', color: '#e2e8f0', fontSize: 13 }}>
            {[3, 5, 7, 10, 15, 30].map(d => <option key={d} value={d}>{d} dias</option>)}
          </select>
        </div>
        <button onClick={exportar}
          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(34,197,94,.3)',
            background: 'rgba(34,197,94,.08)', color: '#4ade80', fontWeight: 600,
            fontSize: 13, cursor: 'pointer' }}>
          📥 Exportar
        </button>
      </div>

      {loading ? <Spinner /> : !data?.length ? (
        <Card><div className="td-empty" style={{ padding: 40, textAlign: 'center' }}>
          🎉 Nenhum inadimplente há mais de {dias} dias
        </div></Card>
      ) : (
        <Card style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #2d3148', fontSize: 13, color: '#94a3b8' }}>
            {data.length} cliente{data.length !== 1 ? 's' : ''} pendente{data.length !== 1 ? 's' : ''} há mais de {dias} dias
          </div>
          <div className="tabela-scroll">
            <table className="tabela">
              <thead><tr>
                <th>Nome</th><th>Telefone</th><th>Plano</th>
                <th>Vencimento</th><th>Base</th><th>Dias pendente</th>
              </tr></thead>
              <tbody>
                {data.map((c, i) => (
                  <tr key={c.id || i}>
                    <td className="td-nome">{c.nome}</td>
                    <td className="td-mono">{c.telefone || "—"}</td>
                    <td>{c.plano || "—"}</td>
                    <td>{c.dia_vencimento ? `Dia ${c.dia_vencimento}` : "—"}</td>
                    <td style={{ fontSize: 11, color: '#64748b' }}>{c.base_nome || "—"}</td>
                    <td>
                      <span style={{ fontWeight: 700,
                        color: c.dias_pendente > 15 ? '#f87171' : c.dias_pendente > 7 ? '#f59e0b' : '#94a3b8' }}>
                        {Math.round(c.dias_pendente)}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

// ── Aba 2: Para Bloquear (D+10) ───────────────────────────
function AbaBloqueio() {
  const { data, loading, refetch } = useSSEData('/api/alertas/bloquear', 'clientes');
  const [busca, setBusca] = useState('');
  const [copiado, setCopiado] = useState(null);

  const clientes = (data?.clientes || []).filter(c =>
    !busca || (c.nome || '').toLowerCase().includes(busca.toLowerCase()) ||
    (c.telefone || '').includes(busca)
  );

  const corAtraso = (d) => d >= 20 ? '#ef4444' : d >= 15 ? '#f97316' : '#f59e0b';

  const copiarTodos = () => {
    const nums = clientes.map(c => c.telefone || '').filter(Boolean).join('\n');
    navigator.clipboard.writeText(nums);
    setCopiado('todos');
    setTimeout(() => setCopiado(null), 2000);
  };

  const copiar = (tel) => {
    navigator.clipboard.writeText(tel);
    setCopiado(tel);
    setTimeout(() => setCopiado(null), 2000);
  };

  const exportar = () => {
    if (!clientes.length) return;
    const rows = clientes.map(c => ({
      Nome: c.nome, Telefone: c.telefone || "",
      Vencimento: `Dia ${c.dia_vencimento}`, "Dias de atraso": c.dias_atraso,
      Plano: c.plano || "", Pagamento: c.forma_pagamento || ""
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Para Bloquear");
    XLSX.writeFile(wb, `bloquear_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`);
  };

  return (
    <>
      <div style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)',
        borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#fca5a5' }}>
        ⚠️ Clientes abaixo já receberam todas as cobranças (até D+10) sem retorno. Candidatos a bloqueio.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input placeholder="Buscar por nome ou telefone..." value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '7px 12px', borderRadius: 8,
            border: '1px solid #2d3148', background: '#0f1117', color: '#e2e8f0', fontSize: 13 }} />
        {clientes.length > 0 && <>
          <button onClick={copiarTodos}
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none',
              background: 'rgba(239,68,68,.15)', color: '#f87171', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {copiado === 'todos' ? '✅ Copiado!' : `📋 Copiar ${clientes.length} números`}
          </button>
          <button onClick={exportar}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(34,197,94,.3)',
              background: 'rgba(34,197,94,.08)', color: '#4ade80', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            📥 Exportar
          </button>
        </>}
        <button onClick={refetch}
          style={{ padding: '7px 12px', borderRadius: 8, border: 'none',
            background: 'rgba(148,163,184,.1)', color: '#94a3b8', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          ↻
        </button>
      </div>

      {/* Resumo por vencimento */}
      {data?.clientes?.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {[10, 20, 30].map(venc => {
            const grupo = (data.clientes || []).filter(c => c.dia_vencimento === venc);
            if (!grupo.length) return null;
            const max = Math.max(...grupo.map(c => c.dias_atraso));
            return (
              <div key={venc} style={{ background: '#0f1117', borderRadius: 10, padding: '10px 16px',
                border: `1px solid ${corAtraso(max)}33` }}>
                <span style={{ fontWeight: 800, fontSize: 18, color: corAtraso(max) }}>{grupo.length}</span>
                <span style={{ fontSize: 12, color: '#64748b', marginLeft: 6 }}>venc. dia {venc} • {max}d atraso</span>
              </div>
            );
          })}
        </div>
      )}

      {loading ? <Spinner /> : clientes.length === 0 ? (
        <Card><div className="td-empty" style={{ padding: 40, textAlign: 'center' }}>
          {data?.total === 0
            ? <><div style={{ fontSize: 36 }}>✅</div><div style={{ marginTop: 8 }}>Nenhum cliente para bloquear</div></>
            : 'Nenhum resultado para a busca'}
        </div></Card>
      ) : (
        <Card style={{ padding: 0 }}>
          <div className="tabela-scroll">
            <table className="tabela">
              <thead><tr>
                <th>Nome</th><th>Telefone</th><th>Vencimento</th>
                <th>Dias atraso</th><th>Plano</th><th>Pagamento</th><th></th>
              </tr></thead>
              <tbody>
                {clientes.map((c, i) => (
                  <tr key={c.id || i}>
                    <td className="td-nome">{c.nome}</td>
                    <td className="td-mono">{c.telefone || '—'}</td>
                    <td style={{ textAlign: 'center' }}>Dia {c.dia_vencimento}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, padding: '2px 8px', borderRadius: 12, fontSize: 12,
                        color: corAtraso(c.dias_atraso), background: corAtraso(c.dias_atraso) + '18' }}>
                        {c.dias_atraso}d
                      </span>
                    </td>
                    <td>{c.plano || '—'}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{c.forma_pagamento || '—'}</td>
                    <td>
                      <button onClick={() => copiar(c.telefone)}
                        style={{ padding: '3px 8px', borderRadius: 6, border: 'none',
                          background: 'rgba(56,189,248,.1)', color: '#38bdf8',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        {copiado === c.telefone ? '✅' : '📋'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 14px', color: '#64748b', fontSize: 12, borderTop: '1px solid #1a1d2e' }}>
            {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} para bloquear
          </div>
        </Card>
      )}
    </>
  );
}

// ── Página principal ───────────────────────────────────────
export function PageInadimplentes() {
  const [aba, setAba] = useState('inadimplentes');

  const abas = [
    { id: 'inadimplentes', label: '❌ Inadimplentes' },
    { id: 'bloquear', label: '🔴 Para Bloquear (D+10)' },
  ];

  return (
    <div className="page">
      <div className="page-title">Inadimplentes</div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #2d3148' }}>
        {abas.map(a => (
          <button key={a.id} onClick={() => setAba(a.id)}
            style={{ padding: '8px 18px', borderRadius: '8px 8px 0 0', border: 'none',
              background: aba === a.id ? '#1e40af' : 'transparent',
              color: aba === a.id ? '#fff' : '#64748b', fontWeight: 600, fontSize: 13,
              cursor: 'pointer', borderBottom: aba === a.id ? '2px solid #3b82f6' : 'none' }}>
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'inadimplentes' ? <AbaInadimplentes /> : <AbaBloqueio />}
    </div>
  );
}