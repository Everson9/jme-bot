// src/pages/Dashboard.jsx
import React, { useState, useEffect } from 'react';
const API_KEY = import.meta.env.VITE_ADMIN_API_KEY || "";
const authHeaders = () => API_KEY ? { "x-api-key": API_KEY } : {};
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
// useFetch inline — carrega uma vez ao montar, sem polling
function useFetch(url) {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    const API = import.meta.env.VITE_API_URL || "";
    fetch(API + url, { headers: authHeaders() }).then(r => r.ok ? r.json() : null).then(setData).catch(() => {});
  }, [url]);
  return { data };
}
import { useNotifications } from '../contexts/NotificationContext';
import { Card } from '../components/Card';
import { Spinner } from '../components/Spinner';
import { DonutClientes } from '../components/DonutClientes';
import { PainelRede } from '../components/PainelRede';
import { DarkTooltip } from '../components/DarkTooltip';
import { fmtDate, fmtDia } from '../utils/formatadores';

const API = import.meta.env.VITE_API_URL || "";

export function PageDashboard({ status, refetch }) {
  const navigate = useNavigate();
  
  const { data: fluxoClientes } = useFetch("/api/dashboard/fluxo-clientes");
  const { data: cobr } = useFetch("/api/graficos/cobrancas");
  const { data: bases } = useFetch("/api/bases");
  const { data: resumoBases } = useFetch("/api/dashboard/resumo-bases");
  const { data: caixaHoje } = useFetch("/api/dashboard/caixa-hoje");
  const { data: cicloInfo } = useFetch("/api/ciclo-info");
  const { alertasData: alertas } = useNotifications();
  
  // Status do bot vem via SSE do App.jsx (passado como prop 'status')
  const botStatus = status || null;

  const totalAtivos = resumoBases?.bases?.reduce((acc, base) => acc + (base.total || 0), 0) ?? 0;
  const totalCancelados = resumoBases?.bases?.reduce((acc, base) => acc + (base.cancelados || 0), 0) ?? 0;
  const totalPendentes = resumoBases?.totalPendentes ?? 0;
  const totalPromessas = resumoBases?.totalPromessas ?? 0;

  React.useEffect(() => {
    console.log('📊 Dados de cobranças:', cobr);
    console.log('💰 Caixa hoje:', caixaHoje);
  }, [cobr, caixaHoje]);

  const SectionLabel = ({ text, icon }) => (
    <div style={{
      fontSize: 10,
      color: "#64748b",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      marginBottom: 12,
      display: "flex",
      alignItems: "center",
      gap: 6
    }}>
      <span>{icon}</span>
      {text}
    </div>
  );

  return (
    <div className="page" style={{ maxWidth: "100%", gap: 0 }}>
      <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        Dashboard
        {cicloInfo && (
          <span style={{
            fontSize: 11,
            padding: '3px 10px',
            borderRadius: 6,
            background: 'rgba(56,189,248,0.1)',
            border: '1px solid rgba(56,189,248,0.25)',
            color: '#94a3b8',
            fontWeight: 500,
            marginLeft: 8,
            whiteSpace: 'nowrap',
          }}>
            📅 {cicloInfo.mesNome}
          </span>
        )}
      </div>

      {alertas && (alertas.promessasHoje > 0 || alertas.promessasAmanha > 0 || alertas.inadimplentes > 0 || alertas.chamadosAbertos > 0) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          {alertas.promessasHoje > 0 && (
            <div onClick={() => navigate("/promessas")} style={{
              flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,.08)",
              border: "1px solid rgba(239,68,68,.3)", cursor: "pointer"
            }}>
              <span style={{ fontSize: 22 }}>🔴</span>
              <div>
                <div style={{ fontWeight: 700, color: "#f87171", fontSize: 13 }}>
                  {alertas.promessasHoje} promessa{alertas.promessasHoje !== 1 ? "s" : ""} vence hoje
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                  {alertas.promessasHojeDetalhe?.map(p => p.nome?.split(" ")[0]).join(", ")}
                </div>
              </div>
            </div>
          )}
          {alertas.promessasAmanha > 0 && (
            <div onClick={() => navigate("/promessas")} style={{
              flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px", borderRadius: 10, background: "rgba(245,158,11,.08)",
              border: "1px solid rgba(245,158,11,.25)", cursor: "pointer"
            }}>
              <span style={{ fontSize: 22 }}>⚠️</span>
              <div>
                <div style={{ fontWeight: 700, color: "#f59e0b", fontSize: 13 }}>
                  {alertas.promessasAmanha} promessa{alertas.promessasAmanha !== 1 ? "s" : ""} vence amanhã
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>acompanhar pagamento</div>
              </div>
            </div>
          )}
          {alertas.inadimplentes > 0 && (
            <div onClick={() => navigate("/inadimplentes")} style={{
              flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,.05)",
              border: "1px solid rgba(239,68,68,.18)", cursor: "pointer"
            }}>
              <span style={{ fontSize: 22 }}>❌</span>
              <div>
                <div style={{ fontWeight: 700, color: "#f87171", fontSize: 13 }}>
                  {alertas.inadimplentes} inadimplente{alertas.inadimplentes !== 1 ? "s" : ""} (+5 dias)
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>ver relatório</div>
              </div>
            </div>
          )}
          {alertas.chamadosAbertos > 0 && (
            <div onClick={() => navigate("/chamados")} style={{
              flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px", borderRadius: 10, background: "rgba(251,191,36,.05)",
              border: "1px solid rgba(251,191,36,.18)", cursor: "pointer"
            }}>
              <span style={{ fontSize: 22 }}>🔧</span>
              <div>
                <div style={{ fontWeight: 700, color: "#fbbf24", fontSize: 13 }}>
                  {alertas.chamadosAbertos} chamado{alertas.chamadosAbertos !== 1 ? "s" : ""} aberto há +24h
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>ver chamados</div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="dash-grid" style={{ display: "grid", gridTemplateColumns: "380px 1fr 1fr", gap: 20, alignItems: "start" }}>
        {/* Coluna Esquerda */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card style={{ padding: "20px 22px" }}>
            <SectionLabel text="Clientes" icon="👥" />
            <DonutClientes
              ativos={totalAtivos}
              cancelados={totalCancelados}
              pendentes={totalPendentes}
              promessas={totalPromessas}
              instalacoes={fluxoClientes?.mes?.entradas ?? 0}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18, paddingTop: 14, borderTop: "1px solid #1e2130" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#4ade80", lineHeight: 1 }}>
                  +{fluxoClientes?.mes?.entradas ?? 0}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Entradas mês</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#f87171", lineHeight: 1 }}>
                  -{fluxoClientes?.mes?.saidas ?? 0}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Saídas mês</div>
              </div>
            </div>
          </Card>

          {bases?.length > 0 && (
            <Card style={{ padding: "18px 20px" }}>
              <SectionLabel text="Bases de dados" icon="📁" />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {bases.map(b => {
                  const rb = resumoBases?.bases?.find(x => x.id === b.id);
                  const pct = rb ? Math.round((rb.pagos / (rb.total || 1)) * 100) : 0;
                  return (
                    <div key={b.id} onClick={() => navigate(`/clientes?base=${b.id}`)} style={{
                      padding: "10px 12px", borderRadius: 9, background: "#0f1117",
                      cursor: "pointer", border: "1px solid #1e2130"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, color: "#e2e8f0", fontSize: 13 }}>📁 {b.nome}</span>
                        <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 700 }}>{pct}%</span>
                      </div>
                      <div style={{ height: 4, background: "#1e2130", borderRadius: 2 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "#4ade80", borderRadius: 2, transition: "width .4s" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11, color: "#64748b" }}>
                        <span>{rb?.pagos ?? 0} pagos</span>
                        <span>{rb?.pendentes ?? 0} pendentes</span>
                        <span>{rb?.total ?? 0} total</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Coluna Meio */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card style={{ padding: "18px 20px" }}>
            <SectionLabel text="Bot WhatsApp" icon="🤖" />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                background: botStatus?.online ? "#22c55e" : botStatus === null ? "#f59e0b" : "#ef4444",
                boxShadow: botStatus?.online ? "0 0 8px #22c55e88" : "none" 
              }} />
              <span style={{ fontSize: 22, fontWeight: 800, color: botStatus?.online ? "#22c55e" : botStatus === null ? "#f59e0b" : "#ef4444" }}>
                {botStatus === null ? "Conectando..." : botStatus?.online ? "Online" : "Offline"}
              </span>
            </div>
            {botStatus?.iniciadoEm && (
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 14 }}>
                desde {fmtDate(botStatus.iniciadoEm)}
              </div>
            )}
          </Card>

          <PainelRede
            situacaoRede={botStatus?.situacaoRede}
            previsaoRetorno={botStatus?.previsaoRetorno}
            onAtualizar={refetch}
          />

          <Card style={{ padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <SectionLabel text="Caixa hoje" icon="💵" />
              {caixaHoje?.length > 0 && (
                <span style={{ fontSize: 12, fontWeight: 700, color: "#4ade80", marginTop: -12 }}>
                  {caixaHoje.length} baixa{caixaHoje.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {!caixaHoje?.length ? (
              <div style={{ fontSize: 12, color: "#334155", textAlign: "center", padding: "14px 0" }}>
                Nenhuma baixa hoje
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
                {caixaHoje.map((r, i) => {
                  const forma = r.forma_baixa || r.forma_pagamento || "—";
                  const hora = r.pago_em ? new Date(r.pago_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
                  const cores = {
                    pix: "#4ade80", boleto: "#38bdf8", dinheiro: "#f59e0b",
                    cartão: "#a78bfa", carnê: "#f97316", efi: "#22d3ee"
                  };
                  const cor = cores[forma.toLowerCase()] || "#94a3b8";
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "9px 11px",
                      borderRadius: 8, background: "#0f1117", border: "1px solid #1e2130"
                    }}>
                      <span style={{ flex: 1, color: "#e2e8f0", fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.nome}
                      </span>
                      {r.valor_plano && (
                        <span style={{ color: "#4ade80", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                          R${r.valor_plano}
                        </span>
                      )}
                      <span style={{
                        padding: "2px 7px", borderRadius: 5, fontWeight: 700, fontSize: 10,
                        background: cor + "22", color: cor, border: `1px solid ${cor}44`, flexShrink: 0
                      }}>
                        {forma.toUpperCase()}
                      </span>
                      <span style={{ color: "#334155", fontSize: 10, flexShrink: 0 }}>{hora}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Coluna Direita */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card style={{ padding: "18px 20px" }}>
            <SectionLabel text="Cobranças — 7 dias" icon="💜" />
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={cobr || []} barSize={14}>
                <XAxis dataKey="dia" tickFormatter={fmtDia} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(167,139,250,0.07)" }} />
                <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                  {(cobr || []).map((_, i) => <Cell key={i} fill="#a78bfa" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card style={{ padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <SectionLabel text="Inadimplentes (+5 dias)" icon="❌" />
              <span onClick={() => navigate("/inadimplentes")} style={{ fontSize: 11, color: "#38bdf8", cursor: "pointer", marginTop: -12 }}>
                ver todos →
              </span>
            </div>
            {alertas?.inadimplentes === 0 ? (
              <div style={{ fontSize: 12, color: "#334155", textAlign: "center", padding: "10px 0" }}>
                ✅ Nenhum inadimplente
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <div style={{ fontSize: 42, fontWeight: 900, color: "#f87171", lineHeight: 1 }}>
                  {alertas?.inadimplentes ?? "—"}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                  clientes pendentes há mais de 5 dias
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 14 }}>
                  {alertas?.promessasHoje > 0 && (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#f87171" }}>{alertas.promessasHoje}</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>promessa hoje</div>
                    </div>
                  )}
                  {alertas?.promessasAmanha > 0 && (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#f59e0b" }}>{alertas.promessasAmanha}</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>promessa amanhã</div>
                    </div>
                  )}
                </div>
                <button onClick={() => navigate("/inadimplentes")} style={{
                  marginTop: 14, padding: "7px 20px", borderRadius: 8, border: "none",
                  background: "rgba(248,113,113,.1)", color: "#f87171",
                  fontWeight: 600, fontSize: 12, cursor: "pointer", width: "100%"
                }}>
                  Ver relatório completo
                </button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}