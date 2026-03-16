// src/components/PainelRede.jsx
import React, { useState, useEffect } from 'react';
import { Card } from './Card';
import { REDE_LABELS } from '../constants';

const API = import.meta.env.VITE_API_URL || "";

export const PainelRede = ({ situacaoRede: inicial, previsaoRetorno: prevInicial, onAtualizar }) => {
  const [status, setStatus] = useState(inicial || "normal");
  const [previsao, setPrevisao] = useState(prevInicial === "sem previsão" ? "" : prevInicial || "");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (inicial) setStatus(inicial);
  }, [inicial]);

  useEffect(() => {
    if (prevInicial && prevInicial !== "sem previsão") setPrevisao(prevInicial);
  }, [prevInicial]);

  const salvar = async () => {
    setSalvando(true);
    setMsg("");
    try {
      const r = await fetch(API + "/api/rede", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, previsao: previsao || "sem previsão" })
      });
      if (r.ok) {
        setMsg("✅ Status atualizado!");
        if (onAtualizar) onAtualizar();
      } else {
        setMsg("❌ Erro ao salvar");
      }
    } catch {
      setMsg("❌ Sem conexão");
    }
    setSalvando(false);
    setTimeout(() => setMsg(""), 3000);
  };

  const info = REDE_LABELS[status] || REDE_LABELS.normal;

  return (
    <Card className="rede-card" style={{ padding: '1rem' }}>
      <div className="rede-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <span className="rede-title" style={{ fontWeight: 700 }}>📡 Status da Rede</span>
        <span
          className="rede-badge"
          style={{
            background: info.cor + "22",
            color: info.cor,
            border: `1px solid ${info.cor}55`,
            padding: '4px 8px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600
          }}
        >
          {info.emoji} {info.label}
        </span>
      </div>

      <div className="rede-body">
        <div className="rede-btns" style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
          {Object.entries(REDE_LABELS).map(([val, cfg]) => (
            <button
              key={val}
              className={`rede-btn ${status === val ? "rede-btn-ativo" : ""}`}
              style={{
                flex: 1,
                minWidth: 100,
                padding: '8px',
                borderRadius: 8,
                border: `1px solid ${status === val ? cfg.cor : '#2d3148'}`,
                background: status === val ? cfg.cor + "18" : '#0f1117',
                color: status === val ? cfg.cor : '#94a3b8',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
              onClick={() => setStatus(val)}
            >
              {cfg.emoji} {cfg.label}
            </button>
          ))}
        </div>

        {status !== "normal" && (
          <div className="rede-previsao" style={{ marginBottom: '1rem' }}>
            <label className="rede-label" style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
              Previsão de retorno (opcional)
            </label>
            <input
              className="rede-input"
              placeholder="Ex: hoje às 18h, amanhã às 8h..."
              value={previsao}
              onChange={(e) => setPrevisao(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #2d3148',
                background: '#0f1117',
                color: '#e2e8f0',
                fontSize: 13
              }}
            />
          </div>
        )}

        <div className="rede-footer" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="btn-salvar-rede"
            onClick={salvar}
            disabled={salvando}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontWeight: 600,
              fontSize: 12,
              cursor: salvando ? 'not-allowed' : 'pointer',
              opacity: salvando ? 0.5 : 1
            }}
          >
            {salvando ? "Salvando..." : "Salvar Status"}
          </button>
          {msg && <span className="rede-msg" style={{ fontSize: 12, color: msg.includes('✅') ? '#4ade80' : '#f87171' }}>{msg}</span>}
        </div>
      </div>
    </Card>
  );
};