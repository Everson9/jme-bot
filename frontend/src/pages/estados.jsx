// src/pages/Estados.jsx
import React, { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { Card } from '../components/Card';
import { Spinner } from '../components/Spinner';
import { fmtTel } from '../utils/formatadores';

const API = import.meta.env.VITE_API_URL || "";

export function PageEstados() {
  const { data, loading, refetch } = useFetch("/api/estados", 8000);
  const [resetando, setResetando] = useState({});
  const [filtro, setFiltro] = useState("todos");

  const estados = data?.estados || [];
  const stats = data?.stats || { porFluxo: {}, atendimentoHumano: 0 };

  const resetar = async (numero) => {
    if (!confirm(`Resetar conversa de ${fmtTel(numero)}?`)) return;
    setResetando(p => ({ ...p, [numero]: true }));
    try {
      await fetch(`${API}/api/estados/${encodeURIComponent(numero)}/reset`, { method: "POST" });
      setTimeout(refetch, 500);
    } catch (e) {
      console.error(e);
    }
    setResetando(p => ({ ...p, [numero]: false }));
  };

  const filtrados = estados.filter(e => {
    if (filtro === "todos") return true;
    if (filtro === "humano") return e.atendimentoHumano && !e.fluxo;
    if (filtro === "fluxo") return !!e.fluxo;
    return e.fluxo === filtro;
  });

  const tempoAtras = (ts) => {
    if (!ts) return "—";
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}min`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}min`;
  };

  const FLUXO_LABEL = {
    suporte: { label: "Suporte", cor: "#f59e0b", emoji: "🔧" },
    financeiro: { label: "Financeiro", cor: "#10b981", emoji: "💰" },
    promessa: { label: "Promessa", cor: "#a78bfa", emoji: "🤝" },
    novoCliente: { label: "Novo Cliente", cor: "#38bdf8", emoji: "👤" },
    comprovantePendente: { label: "Comprovante", cor: "#fb923c", emoji: "🧾" },
    cancelamento: { label: "Cancelamento", cor: "#ef4444", emoji: "❌" }
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div className="page-title">🟢 Conversas Ativas</div>
        <button
          onClick={refetch}
          style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(56,189,248,0.3)',
            background: 'rgba(56,189,248,0.1)', color: '#38bdf8', fontWeight: 600,
            fontSize: 13, cursor: 'pointer'
          }}
        >
          🔄 Atualizar
        </button>
      </div>

      <div className="base-kpis" style={{ marginBottom: 20 }}>
        <div className="base-kpi">
          <span className="bk-val" style={{ color: '#38bdf8' }}>{filtrados.length}</span>
          <span className="bk-label">Ativas agora</span>
        </div>
        <div className="base-kpi">
          <span className="bk-val" style={{ color: '#f59e0b' }}>{stats.porFluxo?.suporte ?? 0}</span>
          <span className="bk-label">🔧 Suporte</span>
        </div>
        <div className="base-kpi">
          <span className="bk-val" style={{ color: '#10b981' }}>{stats.atendimentoHumano ?? 0}</span>
          <span className="bk-label">👤 Atend. Humano</span>
        </div>
        {Object.entries(stats.porFluxo || {})
          .filter(([f]) => f !== 'suporte')
          .map(([fluxo, count]) => {
            const info = FLUXO_LABEL[fluxo] || { cor: '#64748b', emoji: '•', label: fluxo };
            return (
              <div key={fluxo} className="base-kpi">
                <span className="bk-val" style={{ color: info.cor }}>{count}</span>
                <span className="bk-label">{info.emoji} {info.label}</span>
              </div>
            );
          })}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          ["todos", "Todos"],
          ["fluxo", "🤖 Em fluxo"],
          ["humano", "👤 Humano"],
          ["suporte", "🔧 Suporte"],
          ["financeiro", "💰 Financeiro"],
          ["promessa", "🤝 Promessa"],
          ["novoCliente", "👤 Novo Cliente"],
          ["cancelamento", "❌ Cancelamento"]
        ].map(([v, l]) => (
          <button
            key={v}
            className={`filtro-btn ${filtro === v ? "filtro-ativo" : ""}`}
            onClick={() => setFiltro(v)}
            style={{
              padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              background: filtro === v ? '#2563eb' : '#1a1d2e',
              color: filtro === v ? '#fff' : '#94a3b8'
            }}
          >
            {l}
          </button>
        ))}
      </div>

      <Card className="tabela-card" style={{ padding: 0 }}>
        {loading && estados.length === 0 ? (
          <Spinner />
        ) : filtrados.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>😴</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Nenhuma conversa ativa no momento</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Últimas 2 horas</div>
          </div>
        ) : (
          <div className="tabela-scroll">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Fluxo</th>
                  <th>Etapa</th>
                  <th>Status</th>
                  <th>Última atividade</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(e => {
                  const info = e.fluxo ? (FLUXO_LABEL[e.fluxo] || { label: e.fluxo, cor: '#64748b', emoji: '•' }) : null;
                  return (
                    <tr key={e.numero}>
                      <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{fmtTel(e.numero)}</td>
                      <td>
                        {info ? (
                          <span className="badge" style={{
                            background: info.cor + '22',
                            color: info.cor,
                            border: `1px solid ${info.cor}44`
                          }}>
                            {info.emoji} {info.label}
                          </span>
                        ) : (
                          <span style={{ color: '#64748b' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: '#94a3b8' }}>{e.etapa || "—"}</td>
                      <td>
                        {e.atendimentoHumano ? (
                          <span className="badge" style={{
                            background: '#10b98122',
                            color: '#10b981',
                            border: '1px solid #10b98144'
                          }}>
                            👤 Humano
                          </span>
                        ) : e.fluxo ? (
                          <span className="badge" style={{
                            background: '#38bdf822',
                            color: '#38bdf8',
                            border: '1px solid #38bdf844'
                          }}>
                            🤖 Bot
                          </span>
                        ) : (
                          <span style={{ color: '#64748b' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>{tempoAtras(e.atualizadoEm)}</td>
                      <td>
                        <button
                          onClick={() => resetar(e.numero)}
                          disabled={resetando[e.numero]}
                          style={{
                            padding: '4px 10px', borderRadius: 6, border: 'none',
                            background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                            fontSize: 11, fontWeight: 600, cursor: 'pointer'
                          }}
                        >
                          {resetando[e.numero] ? "..." : "🔄 Reset"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ marginTop: 12, fontSize: 11, color: '#64748b', textAlign: 'center' }}>
        Mostrando conversas com atividade nas últimas 2 horas • Atualiza a cada 8s
      </div>
    </div>
  );
}