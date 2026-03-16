// src/pages/Chamados.jsx
import React, { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { Card } from '../components/Card';
import { Spinner } from '../components/Spinner';
import { fmtTel } from '../utils/formatadores';

const API = import.meta.env.VITE_API_URL || "";

export function PageChamados() {
  const { data, loading, refetch } = useFetch("/api/chamados", 15000);
  const [filtro, setFiltro] = useState("todos");

  const chamados = data || [];
  const filtrados = chamados.filter(c => filtro === "todos" || c.status === filtro);

  const statusInfo = {
    aberto: { label: "Aberto", cor: "#ef4444", dot: "🔴" },
    em_atendimento: { label: "Em atendimento", cor: "#f59e0b", dot: "🟡" },
    fechado: { label: "Fechado", cor: "#22c55e", dot: "✅" },
  };

  const acao = async (id, tipo) => {
    await fetch(`${API}/api/chamados/${id}/${tipo}`, { method: "POST" });
    refetch();
  };

  const tempoAberto = (ms) => {
    if (!ms) return "—";
    const diff = Date.now() - ms;
    const min = Math.floor(diff / 60000);
    if (min < 60) return `${min}min atrás`;
    const h = Math.floor(min / 60);
    return `${h}h ${min % 60}min atrás`;
  };

  const abertos = chamados.filter(c => c.status === "aberto").length;
  const emAtend = chamados.filter(c => c.status === "em_atendimento").length;

  return (
    <div className="page">
      <div className="page-title">🎫 Chamados</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <Card style={{ padding: '16px' }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Abertos</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#ef4444' }}>{abertos}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>aguardando atendimento</div>
        </Card>
        <Card style={{ padding: '16px' }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Em Atendimento</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#f59e0b' }}>{emAtend}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>sendo atendidos agora</div>
        </Card>
      </div>

      <Card className="tabela-card" style={{ padding: 0 }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #2d3148' }}>
          <div className="filtro-group">
            {[
              { k: "aberto", l: "🔴 Abertos" },
              { k: "em_atendimento", l: "🟡 Em atendimento" },
              { k: "fechado", l: "✅ Fechados" },
              { k: "todos", l: "Todos" }
            ].map(({ k, l }) => (
              <button
                key={k}
                className={`filtro-btn ${filtro === k ? "filtro-ativo" : ""}`}
                onClick={() => setFiltro(k)}
              >
                {l}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 13, color: '#64748b', marginLeft: 12 }}>
            {filtrados.length} chamado{filtrados.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <Spinner />
        ) : filtrados.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            Nenhum chamado encontrado
          </div>
        ) : (
          <div className="tabela-scroll">
            <table className="tabela">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Telefone</th>
                  <th>Nome</th>
                  <th>Motivo</th>
                  <th>Status</th>
                  <th>Aberto</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(c => {
                  const si = statusInfo[c.status] || statusInfo.aberto;
                  return (
                    <tr key={c.id}>
                      <td className="td-muted" style={{ fontWeight: 600 }}>#{c.id}</td>
                      <td className="td-mono">{fmtTel(c.numero)}</td>
                      <td className="td-nome">{c.nome || <span style={{ color: '#64748b', fontStyle: 'italic' }}>desconhecido</span>}</td>
                      <td>{c.motivo || "—"}</td>
                      <td>
                        <span className="badge" style={{
                          background: si.cor + '22',
                          color: si.cor,
                          border: `1px solid ${si.cor}44`
                        }}>
                          {si.dot} {si.label}
                        </span>
                      </td>
                      <td className="td-muted" style={{ fontSize: 12 }}>{tempoAberto(c.aberto_em)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {c.status === "aberto" && (
                            <button
                              onClick={() => acao(c.id, "assumir")}
                              style={{
                                padding: '4px 8px', borderRadius: 4, border: 'none',
                                background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                                fontSize: 12, cursor: 'pointer'
                              }}
                            >
                              👤 Assumir
                            </button>
                          )}
                          {c.status !== "fechado" && (
                            <button
                              onClick={() => acao(c.id, "fechar")}
                              style={{
                                padding: '4px 8px', borderRadius: 4, border: 'none',
                                background: 'rgba(34,197,94,0.1)', color: '#22c55e',
                                fontSize: 12, cursor: 'pointer'
                              }}
                            >
                              ✔ Fechar
                            </button>
                          )}
                          {c.status === "fechado" && (
                            <span style={{ fontSize: 12, color: '#22c55e' }}>✅ Encerrado</span>
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