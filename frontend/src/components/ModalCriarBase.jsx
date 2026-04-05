// src/components/ModalCriarBase.jsx
import React, { useState } from 'react';

const API = import.meta.env.VITE_API_URL || "";
const API_KEY = import.meta.env.VITE_ADMIN_API_KEY || "";
const authHeaders = () => API_KEY ? { "x-api-key": API_KEY } : {};

export const ModalCriarBase = ({ onClose, onCriada }) => {
  const [form, setForm] = useState({
    nome: "",
    descricao: "",
    dias: []
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const toggleDia = (dia) => {
    setForm(prev => ({
      ...prev,
      dias: prev.dias.includes(dia)
        ? prev.dias.filter(d => d !== dia)
        : [...prev.dias, dia].sort((a, b) => a - b)
    }));
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro("Nome é obrigatório");
      return;
    }
    if (form.dias.length === 0) {
      setErro("Selecione pelo menos um dia de vencimento");
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(API + "/api/bases", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(form)
      });
      const json = await r.json();
      if (json.id) {
        onCriada();
      } else {
        setErro(json.erro || "Erro ao criar base");
      }
    } catch (e) {
      setErro("Falha de conexão");
    }
    setSalvando(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8', marginBottom: 16 }}>
          ➕ Nova Base de Clientes
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>
            Nome da Base *
          </label>
          <input
            type="text"
            value={form.nome}
            onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))}
            placeholder="Ex: JME, Clientes 2024, etc"
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #1e3a5f',
              background: '#0d1a2e',
              color: '#e2e8f0',
              fontSize: 13
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>
            Descrição (opcional)
          </label>
          <input
            type="text"
            value={form.descricao}
            onChange={e => setForm(prev => ({ ...prev, descricao: e.target.value }))}
            placeholder="Ex: Base principal, Filial centro, etc"
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #1e3a5f',
              background: '#0d1a2e',
              color: '#e2e8f0',
              fontSize: 13
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>
            Dias de Vencimento *
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[5, 10, 15, 20, 25, 30].map(dia => (
              <button
                key={dia}
                onClick={() => toggleDia(dia)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 20,
                  border: '1px solid',
                  borderColor: form.dias.includes(dia) ? '#38bdf8' : '#2d3148',
                  background: form.dias.includes(dia) ? 'rgba(56,189,248,0.15)' : 'transparent',
                  color: form.dias.includes(dia) ? '#38bdf8' : '#94a3b8',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                Dia {dia}
              </button>
            ))}
          </div>
        </div>

        {erro && (
          <div style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>
            {erro}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
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
            {salvando ? 'Criando...' : 'Criar Base'}
          </button>
          <button
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