// src/pages/Cobranca.jsx
import React, { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { Card } from '../components/Card';
import { Spinner } from '../components/Spinner';
import { fmtDate } from '../utils/formatadores';

const API = import.meta.env.VITE_API_URL || "";

const TIPOS_COBRANCA = [
  { value: "", label: "🔄 Automático (por data)" },
  { value: "lembrete", label: "🔔 Lembrete (D-1)" },
  { value: "atraso", label: "⏰ Atraso (D+3)" },
  { value: "atraso_final", label: "🔴 Atraso Final (D+5)" },
  { value: "reconquista", label: "📞 Reconquista 1 (D+7)" },
  { value: "reconquista_final", label: "🚨 Reconquista Final (D+10)" },
];

export function PageCobranca() {
  const { data: agenda, loading: loadAgenda, refetch: refetchAgenda } = useFetch("/api/cobrar/agenda");
  const { data: logs, refetch: refetchLogs } = useFetch("/api/logs/cobrancas?limit=20");
  const [data, setData] = useState("10");
  const [tipo, setTipo] = useState("");
  const [disparando, setDisparando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const disparar = async () => {
    if (!window.confirm(`Confirma disparo manual?\n\nData de vencimento: ${data}\nTipo: ${tipo || "automático"}`)) return;
    setDisparando(true);
    setResultado(null);
    try {
      const r = await fetch(API + "/api/cobrar/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, tipo: tipo || undefined }),
      });
      const json = await r.json();
      if (json.ok) {
        setResultado({ ok: true, mensagem: `✅ Disparo iniciado! As mensagens estão sendo enviadas em background.` });
        setTimeout(() => { refetchLogs(); refetchAgenda(); }, 3000);
      } else {
        setResultado({ ok: false, mensagem: json.erro || "Erro desconhecido" });
      }
    } catch (e) {
      setResultado({ ok: false, mensagem: "Falha de conexão com o servidor" });
    }
    setDisparando(false);
  };

  const hoje = agenda?.diaAtual;
  const pendencia = agenda?.pendencia;

  return (
    <div className="page">
      <div className="page-title">📬 Cobranças</div>

      {pendencia && (
        <div style={{
          background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.35)",
          borderRadius: 10, padding: "14px 18px", marginBottom: "1.5rem", display: "flex",
          alignItems: "flex-start", gap: 12
        }}>
          <span style={{ fontSize: 22 }}>⏸️</span>
          <div>
            <div style={{ fontWeight: 700, color: "#fbbf24", marginBottom: 4 }}>Cobrança adiada pendente</div>
            <div style={{ color: "#94a3b8", fontSize: 13 }}>
              Cobrança do dia <b style={{ color: "#e2e8f0" }}>{pendencia.dia}/{String(pendencia.mes).padStart(2, "0")}</b> foi bloqueada
              (rede: <b style={{ color: "#e2e8f0" }}>{pendencia.motivoBloqueio}</b>) e será disparada automaticamente
              no próximo dia útil às 11h.
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
              Datas: {pendencia.entradas?.map(e => `Data ${e.data} — ${e.tipo}`).join(", ")}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <Card style={{ padding: "1.5rem" }}>
          <div style={{ fontWeight: 700, color: "#e2e8f0", marginBottom: "1.2rem", fontSize: 15 }}>
            🚀 Disparo Manual
          </div>

          <label style={{
            display: "block", fontSize: 12, color: "#64748b", marginBottom: 4,
            textTransform: "uppercase", letterSpacing: "0.05em"
          }}>
            Data de Vencimento
          </label>
          <div style={{ display: "flex", gap: 8, marginBottom: "1rem" }}>
            {["10", "20", "30"].map(d => (
              <button
                key={d}
                onClick={() => setData(d)}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid",
                  borderColor: data === d ? "#38bdf8" : "#1e3a5f",
                  background: data === d ? "rgba(56,189,248,0.12)" : "transparent",
                  color: data === d ? "#38bdf8" : "#64748b",
                  fontWeight: 700, fontSize: 16, cursor: "pointer", transition: "all .15s"
                }}
              >
                Dia {d}
              </button>
            ))}
          </div>

          <label style={{
            display: "block", fontSize: 12, color: "#64748b", marginBottom: 4,
            textTransform: "uppercase", letterSpacing: "0.05em"
          }}>
            Tipo de Mensagem
          </label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #1e3a5f",
              background: "#0d1a2e", color: "#e2e8f0", fontSize: 13, marginBottom: "1.2rem", cursor: "pointer"
            }}
          >
            {TIPOS_COBRANCA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          {resultado && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: "1rem",
              background: resultado.ok ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)",
              border: `1px solid ${resultado.ok ? "rgba(74,222,128,0.3)" : "rgba(239,68,68,0.3)"}`,
              color: resultado.ok ? "#4ade80" : "#f87171", fontSize: 13
            }}>
              {resultado.mensagem}
            </div>
          )}

          <button
            onClick={disparar}
            disabled={disparando}
            style={{
              width: "100%", padding: "12px 0", borderRadius: 8, border: "none",
              background: disparando ? "#1e3a5f" : "linear-gradient(135deg, #1d4ed8, #2563eb)",
              color: disparando ? "#64748b" : "#fff", fontWeight: 700, fontSize: 14,
              cursor: disparando ? "not-allowed" : "pointer", transition: "all .15s"
            }}
          >
            {disparando ? "⏳ Disparando..." : "📤 Disparar Agora"}
          </button>

          <div style={{ marginTop: 10, fontSize: 11, color: "#475569", textAlign: "center" }}>
            As mensagens são salvas no banco e enviadas pelo WhatsApp.<br />
            Funcionam mesmo após reiniciar o bot.
          </div>
        </Card>

        <Card style={{ padding: "1.5rem" }}>
          <div style={{ fontWeight: 700, color: "#e2e8f0", marginBottom: "1.2rem", fontSize: 15 }}>
            📅 Agenda do Mês
          </div>
          {loadAgenda ? (
            <Spinner />
          ) : agenda?.agenda ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
              {Object.entries(agenda.agenda)
                .sort((a, b) => Number(a[0]) - Number(b[0]))
                .map(([dia, entradas]) => {
                  const diaNum = Number(dia);
                  const isHoje = diaNum === hoje;
                  const passou = diaNum < hoje;
                  return (
                    <div key={dia} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
                      borderRadius: 7, background: isHoje ? "rgba(56,189,248,0.1)" : "transparent",
                      border: isHoje ? "1px solid rgba(56,189,248,0.25)" : "1px solid transparent"
                    }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700, width: 24,
                        color: isHoje ? "#38bdf8" : passou ? "#334155" : "#64748b"
                      }}>
                        {diaNum}
                      </span>
                      <div style={{ flex: 1 }}>
                        {entradas.map((e, i) => (
                          <span key={i} style={{
                            display: "inline-block", fontSize: 11, padding: "2px 7px",
                            borderRadius: 4, marginRight: 4, marginBottom: 2,
                            background: passou ? "rgba(30,58,95,0.4)" : "rgba(30,58,95,0.8)",
                            color: passou ? "#334155" : "#94a3b8"
                          }}>
                            Data {e.data} · {e.tipo}
                          </span>
                        ))}
                      </div>
                      {isHoje && <span style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700 }}>HOJE</span>}
                    </div>
                  );
                })}
            </div>
          ) : (
            <div style={{ color: "#475569", fontSize: 13 }}>Nenhuma agenda carregada</div>
          )}
        </Card>
      </div>

      <Card style={{ padding: "1.5rem" }}>
        <div style={{ fontWeight: 700, color: "#e2e8f0", marginBottom: "1rem", fontSize: 15 }}>
          📋 Últimas Cobranças Enviadas
        </div>
        <div className="tabela-scroll">
          <table className="tabela">
            <thead>
              <tr><th>Nome</th><th>Vencimento</th><th>Enviado em</th></tr>
            </thead>
            <tbody>
              {!logs?.length ? (
                <tr><td colSpan={3} className="td-empty">Nenhum registro</td></tr>
              ) : (
                logs.map((r, i) => (
                  <tr key={i}>
                    <td className="td-nome">{r.nome}</td>
                    <td>Dia {r.data_vencimento}</td>
                    <td className="td-muted">{fmtDate(r.enviado_em)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}