// src/components/PainelDatas.jsx
import React, { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || "";

export const PainelDatas = ({ clienteId, diaVencimento, plano, onStatusChange }) => {
  const [historico, setHistorico] = useState(null);
  const [baixando, setBaixando] = useState(null);
  const [modalForma, setModalForma] = useState(null);
  const [erro, setErro] = useState(null);

  // Carrega histórico
  useEffect(() => {
    let mounted = true;
    
    const carregarHistorico = async () => {
      try {
        setErro(null);
        const response = await fetch(`${API}/api/clientes/${clienteId}/historico`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        if (mounted) {
          setHistorico(data);
        }
      } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        if (mounted) {
          setErro('Não foi possível carregar o histórico');
          setHistorico({ historico: [] }); // fallback vazio
        }
      }
    };

    carregarHistorico();
    
    return () => { mounted = false; };
  }, [clienteId]);

  const FORMAS = ["pix", "boleto", "dinheiro", "cartão", "carnê", "efi"];

  const extrairValorPlano = (plano) => {
    if (!plano) return null;
    const p = plano.toLowerCase();
    if (p.includes('iptv') || p.includes('70')) return 70;
    if (p.includes('200') || p.includes('fibra')) return 60;
    if (p.includes('50') || p.includes('cabo')) return 50;
    const m = p.match(/r\$\s*(\d+)/);
    if (m) return parseInt(m[1]);
    return null;
  };

  const gerarRefs = () => {
    const list = [];
    const hoje = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const aaaa = d.getFullYear();
      const ultimo = new Date(aaaa, d.getMonth() + 1, 0).getDate();
      const diaReal = Math.min(diaVencimento || 10, ultimo);
      list.push({
        ref: `${mm}/${aaaa}`,
        label: `${String(diaReal).padStart(2, "0")}/${mm}/${aaaa}`,
        isMesAtual: i === 0,
      });
    }
    return list;
  };

  const confirmarBaixa = async (ref, forma) => {
    setModalForma(null);
    setBaixando(ref);
    setErro(null);
    
    try {
      const response = await fetch(`${API}/api/clientes/${clienteId}/historico/${encodeURIComponent(ref)}/pagar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forma_pagamento: forma || null }),
      });
      
      if (!response.ok) {
        throw new Error('Erro ao confirmar baixa');
      }
      
      // Recarrega histórico
      const newResponse = await fetch(`${API}/api/clientes/${clienteId}/historico`);
      const newData = await newResponse.json();
      setHistorico(newData);
      
      if (onStatusChange) onStatusChange("pago");
    } catch (error) {
      console.error('Erro:', error);
      setErro('Erro ao dar baixa');
    } finally {
      setBaixando(null);
    }
  };

  const reverter = async (ref) => {
    if (!confirm(`Reverter baixa de ${ref}?`)) return;
    setBaixando(ref + "_rev");
    setErro(null);
    
    try {
      const response = await fetch(`${API}/api/clientes/${clienteId}/historico/${encodeURIComponent(ref)}/reverter`, { 
        method: "POST" 
      });
      
      if (!response.ok) {
        throw new Error('Erro ao reverter');
      }
      
      // Recarrega histórico
      const newResponse = await fetch(`${API}/api/clientes/${clienteId}/historico`);
      const newData = await newResponse.json();
      setHistorico(newData);
      
      if (onStatusChange) onStatusChange("pendente");
    } catch (error) {
      console.error('Erro:', error);
      setErro('Erro ao reverter');
    } finally {
      setBaixando(null);
    }
  };

  const valorPlano = extrairValorPlano(plano);
  const refs = gerarRefs();
  const hoje = new Date();
  const refHoje = `${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
  
  const histMap = {};
  if (historico?.historico) {
    historico.historico.forEach(h => { histMap[h.referencia] = h; });
  }

  const ST = {
    pago: { color: "#4ade80", bg: "rgba(34,197,94,.15)", border: "rgba(34,197,94,.4)", icon: "✅", label: "Pago" },
    isento: { color: "#22d3ee", bg: "rgba(34,211,238,.1)", border: "rgba(34,211,238,.3)", icon: "🆓", label: "Isento (instalação)" },
    pendente: { color: "#fbbf24", bg: "rgba(245,158,11,.1)", border: "rgba(245,158,11,.35)", icon: "⏳", label: "Pendente" },
    inadimplente: { color: "#f87171", bg: "rgba(239,68,68,.12)", border: "rgba(239,68,68,.4)", icon: "❌", label: "Inadimplente" },
    promessa: { color: "#a78bfa", bg: "rgba(167,139,250,.12)", border: "rgba(167,139,250,.4)", icon: "🤝", label: "Promessa" },
    aberto: { color: "#475569", bg: "rgba(30,58,95,.35)", border: "rgba(56,189,248,.12)", icon: "📅", label: "Em aberto" },
  };

  if (!historico) {
    return (
      <div style={{ textAlign: "center", padding: "2rem", color: "#475569" }}>
        Carregando histórico...
      </div>
    );
  }

  if (erro) {
    return (
      <div style={{ textAlign: "center", padding: "2rem", color: "#f87171" }}>
        ⚠️ {erro}
      </div>
    );
  }

  const atual = histMap[refHoje];
  const stAtual = ST[atual?.status || "pendente"];

  return (
    <div>
      {/* Modal de forma de pagamento */}
      {modalForma && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200, display: "flex",
            alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.6)"
          }}
          onClick={() => setModalForma(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 14,
              padding: "20px 22px", width: 300
            }}
          >
            <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 15, marginBottom: 4 }}>
              Forma de pagamento
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
              Fatura: {modalForma}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              {FORMAS.map(f => (
                <button
                  key={f}
                  onClick={() => confirmarBaixa(modalForma, f)}
                  style={{
                    padding: "9px 4px", borderRadius: 8, border: "1px solid rgba(56,189,248,.25)",
                    background: "rgba(56,189,248,.07)", color: "#38bdf8",
                    fontWeight: 600, fontSize: 12, cursor: "pointer", textTransform: "capitalize"
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
            <button
              onClick={() => confirmarBaixa(modalForma, null)}
              style={{
                width: "100%", padding: "8px 0", borderRadius: 8, border: "1px solid #1e3a5f",
                background: "transparent", color: "#475569", fontSize: 12, cursor: "pointer"
              }}
            >
              Sem forma de pagamento
            </button>
            <button
              onClick={() => setModalForma(null)}
              style={{
                width: "100%", marginTop: 6, padding: "6px 0", borderRadius: 8,
                border: "none", background: "transparent", color: "#334155", fontSize: 11, cursor: "pointer"
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Fatura atual */}
      <div
        style={{
          borderRadius: 12, border: `1.5px solid ${stAtual.border}`,
          background: stAtual.bg, padding: "14px 16px", marginBottom: 18
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Fatura atual
            </div>
            <div style={{ fontWeight: 700, fontSize: 18, color: stAtual.color }}>
              {String(diaVencimento || 10).padStart(2, "0")}/{String(hoje.getMonth() + 1).padStart(2, "0")}/{hoje.getFullYear()}
            </div>
            {atual?.pago_em && atual.status !== "isento" && (
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                Pago em {new Date(atual.pago_em).toLocaleDateString("pt-BR")}
                {atual.forma_pagamento ? ` · ${atual.forma_pagamento.toUpperCase()}` : ""}
              </div>
            )}
            {valorPlano && (
              <div style={{ fontSize: 13, fontWeight: 700, color: "#4ade80", marginTop: 6 }}>
                R$ {valorPlano},00
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: stAtual.color }}>
              {stAtual.icon} {stAtual.label}
            </span>
            {atual?.status === "isento" ? (
              <span style={{ fontSize: 11, color: "#22d3ee", fontStyle: "italic" }}>Mês de instalação</span>
            ) : atual?.status === "pago" ? (
              <button
                disabled={baixando === refHoje + "_rev"}
                onClick={() => reverter(refHoje)}
                style={{
                  padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(239,68,68,.35)",
                  background: "transparent", color: "#f87171", fontSize: 11, cursor: "pointer"
                }}
              >
                ↩ Reverter
              </button>
            ) : (
              <button
                disabled={!!baixando}
                onClick={() => setModalForma(refHoje)}
                style={{
                  padding: "6px 16px", borderRadius: 8, border: "none",
                  background: "rgba(34,197,94,.2)", color: "#4ade80", fontSize: 13,
                  fontWeight: 700, cursor: "pointer"
                }}
              >
                {baixando === refHoje ? "..." : "✅ Dar baixa"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Próximas faturas */}
      <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, marginTop: 20, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Próximas faturas
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7, marginBottom: 18 }}>
        {refs.slice(1, 10).map(({ ref, label }) => {
          const h = histMap[ref];
          const st = ST[h?.status || "aberto"];
          const bloqueado = h?.status === "pago" || h?.status === "isento";
          return (
            <div
              key={ref}
              onClick={() => { if (!bloqueado && !baixando) setModalForma(ref); }}
              style={{
                padding: "8px 10px", borderRadius: 8, textAlign: "center",
                cursor: !bloqueado ? "pointer" : "default",
                background: st.bg, border: `1px solid ${st.border}`
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: st.color }}>{label.slice(0, 5)}</div>
              <div style={{ fontSize: 10, color: st.color, marginTop: 2, opacity: .8 }}>
                {baixando === ref ? "..." : st.icon}
              </div>
            </div>
          );
        })}
      </div>

      {/* Histórico */}
      {historico?.historico?.some(h => h.status === "pago" || h.status === "isento") && (
        <>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Histórico de pagamentos
          </div>
          <div style={{
            display: "flex", flexDirection: "column", gap: 6,
            maxHeight: 200, overflowY: "auto",
            scrollbarWidth: "thin", scrollbarColor: "#2d3148 transparent"
          }}>
            {historico.historico.filter(h => h.status === "pago" || h.status === "isento").map(h => {
              const isIsento = h.status === "isento";
              const cor = isIsento ? "#22d3ee" : "#4ade80";
              const bgC = isIsento ? "rgba(34,211,238,.07)" : "rgba(34,197,94,.07)";
              const bdC = isIsento ? "rgba(34,211,238,.18)" : "rgba(34,197,94,.18)";
              return (
                <div
                  key={h.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                    borderRadius: 9, background: bgC, border: `1px solid ${bdC}`
                  }}
                >
                  <span style={{ color: cor, fontWeight: 800, fontSize: 12, minWidth: 54 }}>
                    {h.referencia}
                  </span>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                    {isIsento ? (
                      <span style={{ color: "#22d3ee", fontSize: 11 }}>🆓 Isento — mês de instalação</span>
                    ) : (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {valorPlano && (
                            <span style={{ fontWeight: 700, fontSize: 12, color: "#4ade80" }}>
                              R$ {valorPlano},00
                            </span>
                          )}
                          {h.forma_pagamento && (
                            <span style={{
                              fontSize: 10, padding: "1px 6px", borderRadius: 4,
                              background: "rgba(56,189,248,.1)", color: "#38bdf8", fontWeight: 700
                            }}>
                              {h.forma_pagamento.toUpperCase()}
                            </span>
                          )}
                        </div>
                        {h.pago_em && (
                          <span style={{ fontSize: 10, color: "#475569" }}>
                            {new Date(h.pago_em).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {!isIsento && (
                    <button
                      disabled={!!baixando}
                      onClick={() => reverter(h.referencia)}
                      style={{
                        padding: "3px 9px", borderRadius: 5, border: "1px solid rgba(239,68,68,.2)",
                        background: "transparent", color: "#f87171", fontSize: 10,
                        cursor: "pointer", flexShrink: 0
                      }}
                    >
                      ↩
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
