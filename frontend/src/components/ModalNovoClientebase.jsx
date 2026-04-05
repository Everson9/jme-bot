// src/components/ModalNovoClienteBase.jsx
import React, { useState } from 'react';

const API = import.meta.env.VITE_API_URL || "";
const API_KEY = import.meta.env.VITE_ADMIN_API_KEY || "";
const authHeaders = () => API_KEY ? { "x-api-key": API_KEY } : {};

export const ModalNovoClienteBase = ({ baseId, diaDefault, onClose, onSalvo }) => {
  const [form, setForm] = useState({
    nome: "",
    cpf: "",
    telefone: "",
    endereco: "",
    numero: "",
    senha: "",
    plano: "",
    forma_pagamento: "pix",
    dia_vencimento: String(diaDefault || 10),
    observacao: "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro("Nome é obrigatório");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      // 🔥 CORREÇÃO: Rota correta para criar cliente
      const r = await fetch(`${API}/api/clientes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          ...form, 
          base_id: parseInt(baseId),  // ← IMPORTANTE: enviar o base_id como número
          dia_vencimento: parseInt(form.dia_vencimento) 
        }),
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
      console.error('Erro ao criar cliente:', e);
      setErro("Falha de conexão: " + e.message);
    }
    setSalvando(false);
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-grande" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="modal-title" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8', marginBottom: 16 }}>➕ Novo Cliente</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
          {inp("nome", "Nome completo *", "Ex: Marine Silva")}
          {inp("cpf", "CPF", "000.000.000-00")}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
          {inp("telefone", "Telefone / WhatsApp", "81999999999")}
        </div>

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

        <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: "0 12px" }}>
          {inp("endereco", "Endereço", "Rua, bairro")}
          {inp("numero", "Nº da casa", "123")}
        </div>

        {inp("senha", "PPPoE (senha da conexão)", "Ex: cliente123")}

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

        {erro && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{erro}</div>}

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
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
            {salvando ? "Salvando..." : "💾 Criar Cliente"}
          </button>
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
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};