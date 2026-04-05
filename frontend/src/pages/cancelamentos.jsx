// src/pages/Cancelamentos.jsx
import React, { useState } from 'react';
const API_KEY = import.meta.env.VITE_ADMIN_API_KEY || "";
const authHeaders = () => API_KEY ? { "x-api-key": API_KEY } : {};
import { useSSEData } from '../hooks/useSSEData';
import { Card } from '../components/Card';
import { Spinner } from '../components/Spinner';

const API = import.meta.env.VITE_API_URL || "";

export function PageCancelamentos() {
  const { data, loading, refetch } = useSSEData("/api/cancelamentos", "cancelamentos");
  const [filtro, setFiltro] = useState("todos");

  const cancelamentos = data || [];

  const confirmar = async (id) => {
    if (!confirm("Confirmar cancelamento? O cliente será notificado.")) return;
    await fetch(`${API}/api/cancelamentos/${id}/confirmar`, { method: "POST", headers: { ...authHeaders() } });
    refetch();
  };

  const reverter = async (id) => {
    if (!confirm("Reverter cancelamento? O cliente volta como ativo.")) return;
    await fetch(`${API}/api/cancelamentos/${id}/cancelar`, { method: "POST", headers: { ...authHeaders() } });
    refetch();
  };

  const excluir = async (id) => {
    if (!confirm("Excluir registro?")) return;
    await fetch(`${API}/api/cancelamentos/${id}`, { method: "DELETE", headers: { ...authHeaders() } });
    refetch();
  };

  const filtrados = cancelamentos.filter(c => {
    if (filtro === "todos") return true;
    return c.status === filtro;
  });

  const STATUS_INFO = {
    solicitado: { label: "Solicitado", cor: "#f59e0b" },
    confirmado: { label: "Confirmado", cor: "#f87171" },
    desistiu: { label: "Desistiu", cor: "#4ade80" },
  };

  const MOTIVO_EMOJI = {
    "Problemas financeiros": "💸",
    "Qualidade do serviço": "📶",
    "Mudança de endereço": "🏠",
    "Contratei outro provedor": "🔄",
    "Outro motivo": "💬",
  };

  const totais = {
    solicitado: cancelamentos.filter(c => c.status === "solicitado").length,
    confirmado: cancelamentos.filter(c => c.status === "confirmado").length,
    desistiu: cancelamentos.filter(c => c.status === "desistiu").length,
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div className="page-title">❌ Cancelamentos</div>
        <button onClick={refetch} style={{
          padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.3)',
          background: 'rgba(248,113,113,0.1)', color: '#f87171', fontWeight: 600, fontSize: 13, cursor: 'pointer'
        }}>
          🔄 Atualizar
        </button>
      </div>

      <div className="base-kpis" style={{ marginBottom: 20 }}>
        <div className="base-kpi">
          <span className="bk-val" style={{ color: '#f59e0b' }}>{totais.solicitado}</span>
          <span className="bk-label">⏳ Solicitados</span>
        </div>
        <div className="base-kpi">
          <span className="bk-val" style={{ color: '#f87171' }}>{totais.confirmado}</span>
          <span className="bk-label">❌ Confirmados</span>
        </div>
        <div className="base-kpi">
          <span className="bk-val" style={{ color: '#4ade80' }}>{totais.desistiu}</span>
          <span className="bk-label">✅ Desistiram</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          ["todos", "Todos"],
          ["solicitado", "⏳ Solicitados"],
          ["confirmado", "❌ Confirmados"],
          ["desistiu", "✅ Desistiram"],
        ].map(([v, l]) => (
          <button
            key={v}
            className={`filtro-btn ${filtro === v ? "filtro-ativo" : ""}`}
            onClick={() => setFiltro(v)}
            style={{
              padding: '6px 16px', borderRadius: 20, border: 'none',
              background: filtro === v ? '#2563eb' : '#1a1d2e',
              color: filtro === v ? '#fff' : '#94a3b8',
              fontSize: 12, fontWeight: 600, cursor: 'pointer'
            }}
          >
            {l}
          </button>
        ))}
      </div>

      <Card className="tabela-card" style={{ padding: 0 }}>
        {loading ? (
          <Spinner />
        ) : filtrados.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            Nenhum cancelamento encontrado
          </div>
        ) : (
          <div className="tabela-scroll">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Motivo</th>
                  <th>Plano</th>
                  <th>Venc.</th>
                  <th>Status</th>
                  <th>Data</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(c => {
                  const st = STATUS_INFO[c.status] || { label: c.status, cor: "#64748b" };
                  const emoji = MOTIVO_EMOJI[c.motivo] || "💬";
                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.nome || "—"}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {c.telefone || c.numero_whatsapp?.replace("@c.us", "") || "—"}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: 13 }}>{emoji} {c.motivo || "—"}</span>
                      </td>
                      <td style={{ color: '#94a3b8' }}>{c.plano || "—"}</td>
                      <td style={{ color: '#94a3b8' }}>Dia {c.dia_vencimento || "—"}</td>
                      <td>
                        <span className="badge" style={{
                          background: st.cor + '22',
                          color: st.cor,
                          border: `1px solid ${st.cor}44`
                        }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>
                        {c.solicitado_em ? new Date(c.solicitado_em).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {c.status === "solicitado" && (
                            <>
                              <button
                                onClick={() => confirmar(c.id)}
                                style={{
                                  padding: '4px 8px', borderRadius: 4, border: 'none',
                                  background: 'rgba(34,197,94,0.1)', color: '#4ade80',
                                  fontSize: 12, cursor: 'pointer'
                                }}
                              >
                                ✅ Confirmar
                              </button>
                              <button
                                onClick={() => reverter(c.id)}
                                style={{
                                  padding: '4px 8px', borderRadius: 4, border: 'none',
                                  background: 'rgba(34,197,94,0.1)', color: '#4ade80',
                                  fontSize: 12, cursor: 'pointer'
                                }}
                              >
                                ↩ Reverter
                              </button>
                            </>
                          )}
                          {c.status !== "solicitado" && (
                            <button
                              onClick={() => excluir(c.id)}
                              style={{
                                padding: '4px 8px', borderRadius: 4, border: 'none',
                                background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                                fontSize: 12, cursor: 'pointer'
                              }}
                            >
                              🗑️ Excluir
                            </button>
                          )}
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