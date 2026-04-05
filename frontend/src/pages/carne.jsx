// src/pages/Carne.jsx
import React, { useState } from 'react';
const API_KEY = import.meta.env.VITE_ADMIN_API_KEY || "";
const authHeaders = () => API_KEY ? { "x-api-key": API_KEY } : {};
import { useFetch } from '../hooks/useFetch';
import { Card } from '../components/Card';
import { Spinner } from '../components/Spinner';
import { fmtDate, fmtTel } from '../utils/formatadores';

const API = import.meta.env.VITE_API_URL || "";

export function PageCarne() {
  const { data, loading, refetch } = useFetch("/api/carne");
  const [filtro, setFiltro] = useState("pendentes");
  const [atualizando, setAtualizando] = useState({});

  const todos = data || [];
  const filtrados = filtro === "todos" ? todos
    : filtro === "pendentes" ? todos.filter(c => c.status !== "concluido")
    : todos.filter(c => c.status === filtro);

  const STATUS = {
    solicitado: { label: "Solicitado", cor: "#f59e0b", emoji: "📋" },
    impresso: { label: "Impresso", cor: "#a78bfa", emoji: "🖨️" },
    entregue: { label: "Entregue", cor: "#38bdf8", emoji: "🚚" },
    concluido: { label: "Concluído", cor: "#22c55e", emoji: "✅" },
  };

  const acao = async (id, tipo) => {
    setAtualizando(prev => ({ ...prev, [`${id}-${tipo}`]: true }));
    await fetch(`${API}/api/carne/${id}/${tipo}`, { method: "POST", headers: { ...authHeaders() } });
    refetch();
    setAtualizando(prev => ({ ...prev, [`${id}-${tipo}`]: false }));
  };

  const deletar = async (id) => {
    if (!confirm("Remover solicitação de carnê?")) return;
    await fetch(`${API}/api/carne/${id}`, { method: "DELETE", headers: { ...authHeaders() } });
    refetch();
  };

  const totais = {
    pendentes: todos.filter(c => c.status !== "concluido").length,
    impressos: todos.filter(c => !!c.impresso_em).length,
    entregues: todos.filter(c => !!c.entregue_em).length,
    concluidos: todos.filter(c => c.status === "concluido").length,
  };

  return (
    <div className="page">
      <div className="page-title">📋 Carnês Físicos</div>

      <div className="base-kpis" style={{ marginBottom: 20 }}>
        <div className="base-kpi">
          <span className="bk-val" style={{ color: '#f59e0b' }}>{totais.pendentes}</span>
          <span className="bk-label">⏳ Pendentes</span>
        </div>
        <div className="base-kpi">
          <span className="bk-val" style={{ color: '#a78bfa' }}>{totais.impressos}</span>
          <span className="bk-label">🖨️ Impressos</span>
        </div>
        <div className="base-kpi">
          <span className="bk-val" style={{ color: '#38bdf8' }}>{totais.entregues}</span>
          <span className="bk-label">🚚 Entregues</span>
        </div>
        <div className="base-kpi">
          <span className="bk-val" style={{ color: '#22c55e' }}>{totais.concluidos}</span>
          <span className="bk-label">✅ Concluídos</span>
        </div>
      </div>

      <Card className="tabela-card" style={{ padding: 0 }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #2d3148' }}>
          <div className="filtro-group">
            {[
              ["pendentes", "⏳ Pendentes"],
              ["concluido", "✅ Concluídos"],
              ["todos", "Todos"]
            ].map(([v, l]) => (
              <button
                key={v}
                className={`filtro-btn ${filtro === v ? "filtro-ativo" : ""}`}
                onClick={() => setFiltro(v)}
              >
                {l}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 13, color: '#64748b', marginLeft: 12 }}>
            {filtrados.length} solicitações
          </span>
        </div>

        {loading ? (
          <Spinner />
        ) : filtrados.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            Nenhuma solicitação de carnê
          </div>
        ) : (
          <div className="tabela-scroll">
            <table className="tabela">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cliente</th>
                  <th>Dia Venc.</th>
                  <th>WhatsApp</th>
                  <th>Endereço</th>
                  <th>Origem</th>
                  <th>Status</th>
                  <th>Solicitado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(c => {
                  const s = STATUS[c.status] || STATUS.solicitado;
                  const tel = fmtTel(c.numero);
                  return (
                    <tr key={c.id}>
                      <td className="td-muted" style={{ fontWeight: 600 }}>#{c.id}</td>
                      <td className="td-nome">{c.nome || <span style={{ color: '#64748b', fontStyle: 'italic' }}>não informado</span>}</td>
                      <td style={{ textAlign: 'center' }}>{c.dia_vencimento ? `Dia ${c.dia_vencimento}` : "—"}</td>
                      <td className="td-mono">{tel || "—"}</td>
                      <td className="td-muted" style={{ maxWidth: 200 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.endereco || "—"}
                        </div>
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600,
                          background: c.origem === "painel" ? "rgba(56,189,248,0.1)" : "rgba(100,116,139,0.1)",
                          color: c.origem === "painel" ? "#38bdf8" : "#94a3b8"
                        }}>
                          {c.origem === "painel" ? "📱 Painel" : "💬 WhatsApp"}
                        </span>
                      </td>
                      <td>
                        <span className="badge" style={{
                          background: s.cor + '22',
                          color: s.cor,
                          border: `1px solid ${s.cor}44`
                        }}>
                          {s.emoji} {s.label}
                        </span>
                      </td>
                      <td className="td-muted">{fmtDate(c.solicitado_em)}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 100 }}>
                          {c.status !== "concluido" ? (
                            <>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={!!c.impresso_em}
                                  disabled={atualizando[`${c.id}-imprimir`]}
                                  onChange={() => acao(c.id, "imprimir")}
                                  style={{ accentColor: '#a78bfa' }}
                                />
                                <span style={{ color: c.impresso_em ? '#a78bfa' : '#64748b' }}>
                                  🖨️ Impresso
                                </span>
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={!!c.entregue_em}
                                  disabled={atualizando[`${c.id}-entregar`]}
                                  onChange={() => acao(c.id, "entregar")}
                                  style={{ accentColor: '#22c55e' }}
                                />
                                <span style={{ color: c.entregue_em ? '#22c55e' : '#64748b' }}>
                                  🚚 Entregue
                                </span>
                              </label>
                            </>
                          ) : (
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#22c55e' }}>
                              ✅ Concluído
                            </span>
                          )}
                          <button
                            onClick={() => deletar(c.id)}
                            style={{
                              alignSelf: 'flex-start', padding: '4px 8px', borderRadius: 4,
                              border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                              fontSize: 12, cursor: 'pointer', marginTop: 4
                            }}
                          >
                            🗑️ Remover
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}