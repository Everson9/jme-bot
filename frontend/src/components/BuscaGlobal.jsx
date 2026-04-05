// src/components/BuscaGlobal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || "";
const API_KEY = import.meta.env.VITE_ADMIN_API_KEY || "";
const authHeaders = () => API_KEY ? { "x-api-key": API_KEY } : {};

export const BuscaGlobal = () => {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const navigate = useNavigate();
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (q.length < 2) {
      setResultados([]);
      return;
    }
    const timer = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`${API}/api/clientes/busca-global?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
        const json = await r.json();
        setResultados(json);
        setAberto(true);
      } catch (e) {
        console.error("Erro na busca:", e);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const statusStyle = {
    pago: { color: "#4ade80", icon: "✅" },
    pendente: { color: "#f59e0b", icon: "⏳" },
    promessa: { color: "#a78bfa", icon: "🤝" }
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        borderRadius: 20,
        background: "#0f1117",
        border: "1px solid #2d3148",
        width: 220
      }}>
        <span style={{ color: "#475569", fontSize: 12 }}>🔍</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente..."
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#e2e8f0",
            fontSize: 12,
            width: "100%"
          }}
        />
        {buscando && <span style={{ color: "#475569", fontSize: 10 }}>...</span>}
      </div>

      {aberto && resultados.length > 0 && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          left: 0,
          width: 320,
          background: "#1a1d2e",
          border: "1px solid #2d3148",
          borderRadius: 10,
          zIndex: 999,
          overflow: "hidden",
          boxShadow: "0 8px 24px rgba(0,0,0,.5)"
        }}>
          {resultados.map((c) => {
            const st = statusStyle[c.status] || { color: "#64748b", icon: "—" };
            return (
              <div
                key={c.id}
                onClick={() => {
                  navigate(`/clientes?base=${c.base_id}&cliente=${c.id}`);
                  setAberto(false);
                  setQ("");
                }}
                style={{
                  padding: "9px 14px",
                  cursor: "pointer",
                  borderBottom: "1px solid #0f1117",
                  display: "flex",
                  alignItems: "center",
                  gap: 10
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#252836"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "#e2e8f0", fontSize: 13 }}>{c.nome}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    {c.telefone || c.cpf || "—"} · {c.base_nome}
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: st.color }}>
                  {st.icon} {c.status}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {aberto && q.length >= 2 && resultados.length === 0 && !buscando && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          left: 0,
          width: 280,
          background: "#1a1d2e",
          border: "1px solid #2d3148",
          borderRadius: 10,
          zIndex: 999,
          padding: "12px 14px",
          fontSize: 12,
          color: "#475569"
        }}>
          Nenhum cliente encontrado
        </div>
      )}
    </div>
  );
};