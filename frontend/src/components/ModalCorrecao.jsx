// src/components/ModalCorrecao.jsx
import React, { useState } from 'react';
import { BadgeIntencao } from './badgeintencao';
import { INTENCOES, INTENCAO_LABEL } from '../constants';

const API = import.meta.env.VITE_API_URL || "";

export const ModalCorrecao = ({ log, modo, onClose, onSalvar }) => {
  const [correto, setCorreto] = useState(log?.intencao || "");
  const [salvando, setSalvando] = useState(false);
  const isConfirmacao = modo === "confirmacao";

  const salvar = async () => {
    if (!correto && !isConfirmacao) return;
    setSalvando(true);
    try {
      await fetch("/api/logs/correcoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          log_id: log?.id,
          mensagem: log?.conteudo,
          classificou_como: log?.intencao,
          correto_seria: isConfirmacao ? log?.intencao : correto,
          tipo: isConfirmacao ? "confirmacao" : "correcao"
        })
      });
      setSalvando(false);
      onSalvar(log?.id);
      onClose();
    } catch (error) {
      console.error("Erro ao salvar correção:", error);
      setSalvando(false);
    }
  };

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
    >
      <div
        style={{
          background: "#1a1d2e",
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: 440,
          color: "#e2e8f0"
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 16,
            marginBottom: 16,
            color: isConfirmacao ? "#22c55e" : "#f59e0b"
          }}
        >
          {isConfirmacao ? "✅ Confirmar classificação" : "❌ Corrigir classificação"}
        </div>

        <div
          style={{
            background: "#0f1117",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            color: "#94a3b8",
            marginBottom: 16,
            fontStyle: "italic"
          }}
        >
          "{log?.conteudo?.substring(0, 200) || '...'}"
        </div>

        <div style={{ marginBottom: isConfirmacao ? 20 : 8, fontSize: 12, color: "#6b7280" }}>
          Bot classificou como: <BadgeIntencao intencao={log?.intencao} />
        </div>

        {isConfirmacao ? (
          <div
            style={{
              background: "#052e16",
              border: "1px solid #16a34a",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: "#86efac",
              marginBottom: 20
            }}
          >
            Isso vai reforçar que esta classificação estava certa. O bot vai usar como exemplo positivo.
          </div>
        ) : (
          <>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#9ca3af",
                display: "block",
                marginBottom: 6
              }}
            >
              Correto seria:
            </label>
            <select
              value={correto}
              onChange={(e) => setCorreto(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #374151",
                background: "#252836",
                color: "#e2e8f0",
                fontSize: 14,
                marginBottom: 20
              }}
            >
              <option value="">-- selecione --</option>
              {INTENCOES.map((k) => (
                <option key={k} value={k}>
                  {INTENCAO_LABEL[k]?.label || k}
                </option>
              ))}
            </select>
          </>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={salvar}
            disabled={(!correto && !isConfirmacao) || salvando}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: 8,
              border: "none",
              background: isConfirmacao ? "#16a34a" : (correto ? "#2563eb" : "#374151"),
              color: "#fff",
              fontWeight: 700,
              cursor: (salvando || (!correto && !isConfirmacao)) ? "not-allowed" : "pointer",
              fontSize: 14,
              opacity: (salvando || (!correto && !isConfirmacao)) ? 0.5 : 1
            }}
          >
            {salvando ? "Salvando..." : isConfirmacao ? "✅ Confirmar" : "💾 Salvar correção"}
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: 8,
              border: "1px solid #374151",
              background: "#252836",
              color: "#e2e8f0",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 14
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};