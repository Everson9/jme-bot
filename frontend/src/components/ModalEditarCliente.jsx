// src/components/ModalEditarCliente.jsx
import React, { useState } from 'react';
import { BadgeCliente } from './BadgeCliente';
import { PainelDatas } from './PainelDatas';

const API = import.meta.env.VITE_API_URL || "";
const API_KEY = import.meta.env.VITE_ADMIN_API_KEY || "";

export const ModalEditarCliente = ({ cliente, baseId, onClose, onSalvo }) => {
  const [form, setForm] = useState({
    nome: cliente.nome || "",
    cpf: cliente.cpf || "",
    telefone: cliente.telefone || "",
    endereco: cliente.endereco || "",
    numero: cliente.numero || "",
    senha: cliente.senha || "",
    plano: cliente.plano || "",
    forma_pagamento: cliente.forma_pagamento || "",
    dia_vencimento: String(cliente.dia_vencimento || ""),
    observacao: cliente.observacao || "",
    status: cliente.status || "pendente",
  });

  const [aba, setAba] = useState("dados");
  const [solicitandoCarne, setSolicitandoCarne] = useState(false);
  const [carneMsg, setCarneMsg] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  // Promessa
  const [dataPromessa, setDataPromessa] = useState("");
  const [salvandoProm, setSalvandoProm] = useState(false);
  const [promMsg, setPromMsg] = useState(null);

  // Cancelamento
  const MOTIVOS_CANCELAMENTO = [
    "Problemas financeiros",
    "Qualidade do serviço",
    "Mudança de endereço",
    "Contratei outro provedor",
    "Outro motivo"
  ];
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [motivoDetalhe, setMotivoDetalhe] = useState("");
  const [cancelMsg, setCancelMsg] = useState(null);
  const [salvandoCancel, setSalvandoCancel] = useState(false);
  const [cancelado, setCancelado] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro("Nome é obrigatório");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      // ✅ Rota correta para editar cliente
      const r = await fetch(`${API}/api/bases/${baseId}/clientes/${cliente.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(API_KEY ? { "x-api-key": API_KEY } : {}) },
        body: JSON.stringify({ ...form, dia_vencimento: parseInt(form.dia_vencimento) }),
      });
      
      if (!r.ok) {
        const errorText = await r.text();
        throw new Error(`HTTP ${r.status}: ${errorText}`);
      }
      
      const json = await r.json();
      if (json.id) {
        onSalvo(json);
        onClose();
      } else {
        setErro(json.erro || "Erro ao salvar");
      }
    } catch (e) {
      console.error('Erro ao salvar cliente:', e);
      setErro("Falha de conexão: " + e.message);
    }
    setSalvando(false);
  };

  const solicitarCarne = async () => {
    setSolicitandoCarne(true);
    setCarneMsg(null);
    try {
      const r = await fetch(`${API}/api/carne`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(API_KEY ? { "x-api-key": API_KEY } : {}) },
        body: JSON.stringify({
          cliente_id: cliente.id,
          nome: form.nome,
          numero: form.telefone || null,
          endereco: form.endereco || null,
        }),
      });
      const j = await r.json();
      if (j.ok) {
        setCarneMsg({ ok: true, txt: "✅ Solicitação registrada! Aparece na aba Carnês." });
      } else {
        setCarneMsg({ ok: false, txt: j.erro || "Erro ao solicitar" });
      }
    } catch (e) {
      setCarneMsg({ ok: false, txt: "Falha de conexão" });
    }
    setSolicitandoCarne(false);
  };

  const salvarPromessa = async () => {
    if (!dataPromessa) {
      setPromMsg({ ok: false, txt: "Informe a data da promessa" });
      return;
    }
    setSalvandoProm(true);
    setPromMsg(null);
    try {
      const r = await fetch(`${API}/api/promessas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(API_KEY ? { "x-api-key": API_KEY } : {}) },
        body: JSON.stringify({
          nome: form.nome,
          numero: form.telefone || null,
          data_promessa: dataPromessa,
        }),
      });
      const json = await r.json();
      if (json.ok) {
        await fetch(`${API}/api/bases/${baseId}/clientes/${cliente.id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(API_KEY ? { "x-api-key": API_KEY } : {}) },
          body: JSON.stringify({ status: "promessa" }),
        });
        setPromMsg({ ok: true, txt: `✅ Promessa registrada para ${dataPromessa}` });
        onSalvo({ ...cliente, status: "promessa" });
      } else {
        setPromMsg({ ok: false, txt: json.erro || "Erro ao salvar" });
      }
    } catch (e) {
      setPromMsg({ ok: false, txt: "Falha de conexão" });
    }
    setSalvandoProm(false);
  };

  const toggleStatus = async () => {
    const novoStatus = form.status === "pago" ? "pendente" : "pago";
    await fetch(`${API}/api/bases/${baseId}/clientes/${cliente.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(API_KEY ? { "x-api-key": API_KEY } : {}) },
      body: JSON.stringify({ status: novoStatus }),
    });
    set("status", novoStatus);
    onSalvo({ ...cliente, status: novoStatus });
  };

  const inp = (k, label, placeholder = "", type = "text") => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </label>
      <input
        type={type}
        value={form[k]}
        onChange={e => set(k, e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "9px 12px",
          borderRadius: 8,
          border: "1px solid #1e3a5f",
          background: "#0d1a2e",
          color: "#e2e8f0",
          fontSize: 13,
          boxSizing: "border-box"
        }}
      />
    </div>
  );

  const abaBtnStyle = (a) => ({
    padding: "7px 14px",
    borderRadius: 7,
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    background: aba === a ? "rgba(56,189,248,0.15)" : "transparent",
    color: aba === a ? "#38bdf8" : "#64748b",
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-grande" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="modal-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8' }}>✏️ {cliente.nome}</span>
        <BadgeCliente status={form.status} />
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #1e3a5f", paddingBottom: 8, flexWrap: 'wrap' }}>
          <button style={abaBtnStyle("dados")} onClick={() => setAba("dados")}>📋 Dados</button>
          <button style={abaBtnStyle("contato")} onClick={() => setAba("contato")}>📞 Contato</button>
          <button style={abaBtnStyle("financeiro")} onClick={() => setAba("financeiro")}>💰 Financeiro</button>
          <button style={abaBtnStyle("promessa")} onClick={() => setAba("promessa")}>🤝 Promessa</button>
          <button
            style={{
              ...abaBtnStyle("cancelar"),
              color: aba === "cancelar" ? "#f87171" : "#64748b",
              background: aba === "cancelar" ? "rgba(248,113,113,0.12)" : "transparent"
            }}
            onClick={() => setAba("cancelar")}
          >
            ❌ Cancelar
          </button>
        </div>

        {aba === "dados" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
              {inp("nome", "Nome completo", "Ex: Marine Silva")}
              {inp("cpf", "CPF", "000.000.000-00")}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: "0 12px" }}>
              {inp("endereco", "Endereço", "Rua, bairro")}
              {inp("numero", "Nº da casa", "Ex: 123")}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
              {inp("senha", "PPPoE (senha da conexão)", "Ex: cliente123")}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Plano
                </label>
                <select
                  value={form.plano}
                  onChange={e => set("plano", e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid #1e3a5f",
                    background: "#0d1a2e",
                    color: form.plano ? "#e2e8f0" : "#64748b",
                    fontSize: 13,
                    boxSizing: "border-box"
                  }}
                >
                  <option value="">-- selecione --</option>
                  <option value="Cabo 50MB — R$50">Cabo 50MB — R$ 50</option>
                  <option value="Fibra 200MB — R$60">Fibra 200MB — R$ 60</option>
                  <option value="Fibra 200MB + IPTV — R$70">Fibra 200MB + IPTV — R$ 70</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Dia de Vencimento
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                {["10", "20", "30"].map(d => (
                  <button
                    key={d}
                    onClick={() => set("dia_vencimento", d)}
                    style={{
                      flex: 1,
                      padding: "9px 0",
                      borderRadius: 8,
                      border: "1px solid",
                      borderColor: form.dia_vencimento === d ? "#38bdf8" : "#1e3a5f",
                      background: form.dia_vencimento === d ? "rgba(56,189,248,0.12)" : "transparent",
                      color: form.dia_vencimento === d ? "#38bdf8" : "#64748b",
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                  >
                    Dia {d}
                  </button>
                ))}
              </div>
            </div>

            {inp("observacao", "Observação", "Notas internas...")}

            {/* Solicitar carnê direto da ficha */}
            <div style={{ borderTop: "1px solid #1e3a5f", marginTop: 12, paddingTop: 12 }}>
              {carneMsg && (
                <div style={{
                  padding: "8px 12px",
                  borderRadius: 7,
                  marginBottom: 8,
                  fontSize: 12,
                  background: carneMsg.ok ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)",
                  border: `1px solid ${carneMsg.ok ? "rgba(34,197,94,.25)" : "rgba(239,68,68,.25)"}`,
                  color: carneMsg.ok ? "#4ade80" : "#f87171"
                }}>
                  {carneMsg.txt}
                </div>
              )}
              <button
                onClick={solicitarCarne}
                disabled={solicitandoCarne}
                style={{
                  width: "100%",
                  padding: "9px 0",
                  borderRadius: 8,
                  border: "1px solid rgba(167,139,250,.3)",
                  background: "rgba(167,139,250,.08)",
                  color: "#a78bfa",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer"
                }}
              >
                {solicitandoCarne ? "Solicitando..." : "📋 Solicitar Carnê Físico"}
              </button>
            </div>
          </div>
        )}

        {aba === "contato" && (
          <div>
            {inp("telefone", "Telefone / WhatsApp", "81999999999")}
          </div>
        )}

        {aba === "financeiro" && (
          <div>
            <PainelDatas
              clienteId={cliente.id}
              diaVencimento={parseInt(form.dia_vencimento) || cliente.dia_vencimento || 10}
              plano={form.plano || cliente.plano || ""}
              onStatusChange={(novoStatus) => {
                set("status", novoStatus);
                onSalvo({ ...cliente, status: novoStatus });
              }}
            />
          </div>
        )}

        {aba === "promessa" && (
          <div>
            <div style={{
              background: "rgba(167,139,250,0.08)",
              border: "1px solid rgba(167,139,250,0.2)",
              borderRadius: 10,
              padding: "14px",
              marginBottom: 16,
              fontSize: 13,
              color: "#94a3b8"
            }}>
              Registre uma promessa de pagamento para <b style={{ color: "#e2e8f0" }}>{form.nome}</b>.
              O status dela ficará como 🤝 Promessa e o sistema vai acompanhar o vencimento.
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Data da promessa
              </label>
              <input
                type="date"
                value={dataPromessa}
                onChange={e => setDataPromessa(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #1e3a5f",
                  background: "#0d1a2e",
                  color: "#e2e8f0",
                  fontSize: 13,
                  boxSizing: "border-box"
                }}
              />
              <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
                Ou escreva em texto: ex. "25/03", "dia 25", "próxima semana"
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                ou data em texto livre
              </label>
              <input
                type="text"
                placeholder='Ex: "dia 25", "25/03/2026"'
                onChange={e => setDataPromessa(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #1e3a5f",
                  background: "#0d1a2e",
                  color: "#e2e8f0",
                  fontSize: 13,
                  boxSizing: "border-box"
                }}
              />
            </div>

            {promMsg && (
              <div style={{
                padding: "10px 14px",
                borderRadius: 8,
                marginBottom: 12,
                background: promMsg.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                border: `1px solid ${promMsg.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                color: promMsg.ok ? "#4ade80" : "#f87171",
                fontSize: 13
              }}>
                {promMsg.txt}
              </div>
            )}

            <button
              onClick={salvarPromessa}
              disabled={salvandoProm}
              style={{
                width: "100%",
                padding: "11px 0",
                borderRadius: 8,
                border: "none",
                background: salvandoProm ? "#1e3a5f" : "linear-gradient(135deg, #7c3aed, #6d28d9)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: salvandoProm ? "not-allowed" : "pointer"
              }}
            >
              {salvandoProm ? "Salvando..." : "🤝 Registrar Promessa"}
            </button>
          </div>
        )}

        {aba === "cancelar" && (
          <div>
            {cancelado ? (
              <div style={{ textAlign: "center", padding: "2rem 0" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontWeight: 700, color: "#f87171", fontSize: 16, marginBottom: 8 }}>
                  Cancelamento registrado!
                </div>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  O cliente foi movido para a página de cancelamentos.
                </div>
              </div>
            ) : (
              <>
                <div style={{
                  background: "rgba(248,113,113,0.08)",
                  border: "1px solid rgba(248,113,113,0.2)",
                  borderRadius: 10,
                  padding: "14px",
                  marginBottom: 16,
                  fontSize: 13,
                  color: "#94a3b8"
                }}>
                  Registre o cancelamento de <b style={{ color: "#e2e8f0" }}>{form.nome}</b>.
                  O cliente será movido para a lista de cancelamentos e marcado como cancelado na base.
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Motivo do cancelamento
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {MOTIVOS_CANCELAMENTO.map(m => (
                      <button
                        key={m}
                        onClick={() => setMotivoCancelamento(m)}
                        style={{
                          padding: "9px 14px",
                          borderRadius: 8,
                          border: "1px solid",
                          borderColor: motivoCancelamento === m ? "#f87171" : "#1e3a5f",
                          background: motivoCancelamento === m ? "rgba(248,113,113,0.12)" : "transparent",
                          color: motivoCancelamento === m ? "#f87171" : "#64748b",
                          fontWeight: 600,
                          cursor: "pointer",
                          fontSize: 13,
                          textAlign: "left",
                          transition: "all .15s"
                        }}
                      >
                        {motivoCancelamento === m ? "● " : "○ "}{m}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Observação (opcional)
                  </label>
                  <textarea
                    value={motivoDetalhe}
                    onChange={e => setMotivoDetalhe(e.target.value)}
                    placeholder="Detalhes adicionais sobre o cancelamento..."
                    rows={3}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: 8,
                      border: "1px solid #1e3a5f",
                      background: "#0d1a2e",
                      color: "#e2e8f0",
                      fontSize: 13,
                      boxSizing: "border-box",
                      resize: "vertical",
                      fontFamily: "inherit"
                    }}
                  />
                </div>

                {cancelMsg && (
                  <div style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    marginBottom: 12,
                    background: cancelMsg.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                    border: `1px solid ${cancelMsg.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                    color: cancelMsg.ok ? "#4ade80" : "#f87171",
                    fontSize: 13
                  }}>
                    {cancelMsg.txt}
                  </div>
                )}

                <button
                  onClick={async () => {
                    if (!motivoCancelamento) {
                      setCancelMsg({ ok: false, txt: "Selecione um motivo" });
                      return;
                    }
                    if (!confirm(`Confirma o cancelamento de ${form.nome}?`)) return;
                    setSalvandoCancel(true);
                    setCancelMsg(null);
                    try {
                      // Cancelamento atômico — /api/cancelamentos já deleta o cliente da base
                      const r = await fetch(`${API}/api/cancelamentos`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...(API_KEY ? { "x-api-key": API_KEY } : {}) },
                        body: JSON.stringify({
                          cliente_id: cliente.id,
                          base_id: baseId,
                          nome: form.nome,
                          telefone: form.telefone || null,
                          endereco: form.endereco || null,
                          plano: form.plano || null,
                          dia_vencimento: cliente.dia_vencimento || null,
                          motivo: motivoCancelamento,
                          motivo_detalhado: motivoDetalhe || null,
                          solicitado_via: "painel",
                        }),
                      });
                      const json = await r.json();
                      if (json.ok) {
                        setCancelado(true);
                        // Remove da lista — backend já deletou do Firestore
                        onSalvo({ ...cliente, status: "cancelado" });
                        setTimeout(() => onClose(), 1500);
                      } else {
                        setCancelMsg({ ok: false, txt: json.erro || "Erro ao registrar" });
                      }
                    } catch (e) {
                      setCancelMsg({ ok: false, txt: "Falha de conexão" });
                    }
                    setSalvandoCancel(false);
                  }}
                  disabled={salvandoCancel || !motivoCancelamento}
                  style={{
                    width: "100%",
                    padding: "12px 0",
                    borderRadius: 8,
                    border: "none",
                    background: salvandoCancel || !motivoCancelamento ? "#1e3a5f" : "linear-gradient(135deg, #dc2626, #b91c1c)",
                    color: salvandoCancel || !motivoCancelamento ? "#475569" : "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: salvandoCancel || !motivoCancelamento ? "not-allowed" : "pointer"
                  }}
                >
                  {salvandoCancel ? "Registrando..." : "❌ Confirmar Cancelamento"}
                </button>
              </>
            )}
          </div>
        )}

        {erro && <div style={{ color: "#f87171", fontSize: 13, marginTop: 8 }}>{erro}</div>}

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          {aba !== "promessa" && aba !== "cancelar" && (
            <button
              className="btn-save"
              onClick={salvar}
              disabled={salvando}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: salvando ? '#1e3a5f' : '#2563eb',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: salvando ? 'not-allowed' : 'pointer'
              }}
            >
              {salvando ? "Salvando..." : "💾 Salvar alterações"}
            </button>
          )}
          <button
            className="btn-cancel"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #374151',
              background: 'transparent',
              color: '#94a3b8',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};