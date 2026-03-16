// src/components/ModalNovaPromessa.jsx
import React, { useState } from 'react';

const API = import.meta.env.VITE_API_URL || "";

export const ModalNovaPromessa = ({ onClose, onSalva }) => {
  const [nome, setNome] = useState("");
  const [numero, setNumero] = useState("");
  const [data, setData] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const salvar = async () => {
    if (!nome.trim() || !data) {
      setErro("Nome e data são obrigatórios");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(`${API}/api/promessas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          numero: numero || null,
          data_promessa: data
        })
      });
      const j = await r.json();
      if (j.ok) {
        onSalva();
        onClose();
      } else {
        setErro(j.erro || "Erro ao salvar");
      }
    } catch (e) {
      setErro("Falha de conexão");
    }
    setSalvando(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-title" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8', marginBottom: '1rem' }}>
          🤝 Nova Promessa de Pagamento
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Nome do cliente *
          </label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Marine Silva"
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #1e3a5f',
              background: '#0d1a2e',
              color: '#e2e8f0',
              fontSize: 13,
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            WhatsApp (opcional)
          </label>
          <input
            type="text"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="81999999999"
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #1e3a5f',
              background: '#0d1a2e',
              color: '#e2e8f0',
              fontSize: 13,
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Data da promessa *
          </label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #1e3a5f',
              background: '#0d1a2e',
              color: '#e2e8f0',
              fontSize: 13,
              boxSizing: 'border-box'
            }}
          />
        </div>

        {erro && (
          <div style={{ color: '#f87171', fontSize: 13, marginBottom: 8 }}>{erro}</div>
        )}

        <div className="modal-footer" style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
          <button
            className="btn-save"
            onClick={salvar}
            disabled={salvando}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 8,
              border: 'none',
              background: salvando ? '#1e3a5f' : '#2563eb',
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: salvando ? 'not-allowed' : 'pointer'
            }}
          >
            {salvando ? "Salvando..." : "🤝 Registrar Promessa"}
          </button>
          <button
            className="btn-cancel"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px',
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