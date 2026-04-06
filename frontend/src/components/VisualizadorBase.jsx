// src/components/VisualizadorBase.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from './Card';
import { Spinner } from './Spinner';
import { BadgeCliente } from './BadgeCliente';
import { ModalEditarCliente } from './ModalEditarCliente';
import { ModalNovoClienteBase } from './ModalNovoClientebase';
import * as XLSX from "https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs";

const API = import.meta.env.VITE_API_URL || "";
const API_KEY = import.meta.env.VITE_ADMIN_API_KEY || "";
const authHeaders = () => API_KEY ? { "x-api-key": API_KEY } : {};

export const VisualizadorBase = ({ base, onVoltar }) => {
  const [diaAtivo, setDiaAtivo] = useState(base?.dias?.[0] || 10);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [modalCliente, setModalCliente] = useState(null);
  const [modalNovoCliente, setModalNovoCliente] = useState(false);
  const [pagina, setPagina] = useState(1);
  const itensPorPagina = 20;
  const navigate = useNavigate();

  if (!base?.id) {
    return (
      <div className="page">
        <button onClick={onVoltar} style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 14, cursor: 'pointer', marginBottom: 16 }}>
          ← Bases
        </button>
        <div style={{ padding: '2rem', color: '#64748b' }}>
          Base não encontrada.
        </div>
      </div>
    );
  }

  const carregar = useCallback(async (silencioso = false) => {
    if (!base?.id) return;
    if (!silencioso) setLoading(true);
    try {
      const r = await fetch(`${API}/api/bases/${base.id}/clientes`, { headers: authHeaders() });
      const data = await r.json();
      setClientes(data);
    } catch (e) {
      console.error(e);
    }
    if (!silencioso) setLoading(false);
  }, [base?.id]);

  useEffect(() => {
    carregar();
    // Sem polling automático — evita leituras desnecessárias no Firebase
    // O botão ↻ permite atualizar manualmente quando precisar
  }, [carregar]);

  // Resetar página quando filtros mudarem
  useEffect(() => {
    setPagina(1);
  }, [diaAtivo, filtro, busca]);

  const clientesDia = clientes.filter(c => c.dia_vencimento === diaAtivo);
  const filtrados = clientesDia.filter(c => {
    if (filtro !== "todos") {
      const statusParaComparar = c.status_calculado || c.status;
if (filtro === 'pendente') {
  if (statusParaComparar !== 'pendente' && statusParaComparar !== 'em_dia') return false;
} else {
  if (statusParaComparar !== filtro) return false;
}
    }
    const b = busca.toLowerCase();
    return !b || 
      (c.nome || "").toLowerCase().includes(b) || 
      (c.telefone || "").includes(b) || 
      (c.cpf || "").includes(b) || 
      (c.endereco || "").toLowerCase().includes(b);
  });

  const inicio = (pagina - 1) * itensPorPagina;
  const fim = inicio + itensPorPagina;
  const clientesPagina = filtrados.slice(inicio, fim);
  const totalPaginas = Math.ceil(filtrados.length / itensPorPagina);

  const stats = (arr) => ({
    pagos: arr.filter(c => {
      const status = c.status_calculado || c.status;
      return status === "pago";
    }).length,
    pend: arr.filter(c => {
      const status = c.status_calculado || c.status;
      return status === "pendente" || status === "em_dia";
    }).length,
    inad: arr.filter(c => {
      const status = c.status_calculado || c.status;
      return status === "inadimplente";
    }).length,
    prom: arr.filter(c => {
      const status = c.status_calculado || c.status;
      return status === "promessa";
    }).length,
    total: arr.length,
    pct: arr.length > 0 ? Math.round((arr.filter(c => {
      const status = c.status_calculado || c.status;
      return status === "pago";
    }).length / arr.length) * 100) : 0,
  });

  const s = stats(clientesDia);
  const stotal = stats(clientes);

  const onSalvo = (clienteAtualizado) => {
    if (clienteAtualizado.status === 'cancelado') {
      // Remove da lista imediatamente
      setClientes(prev => prev.filter(c => c.id !== clienteAtualizado.id));
      setModalCliente(null);
    } else {
      setClientes(prev => prev.map(c => c.id === clienteAtualizado.id ? { ...c, ...clienteAtualizado } : c));
    }
  };

  const exportarExcel = async () => {
    try {
      const r = await fetch(`${API}/api/exportar/clientes`, { headers: authHeaders() });
      const clientes = await r.json();
      const rows = clientes.map(c => ({
        Nome: c.nome || "",
        CPF: c.cpf || "",
        Telefone: c.telefone || "",
        Endereco: c.endereco || "",
        NumeroCasa: c.numero_casa || "",
        Plano: c.plano || "",
        FormaPgto: c.forma_pagamento || "",
        Status: c.status_calculado || c.status || "",
        PPPoE: c.pppoe || "",
        Vencimento: c.dia_vencimento ? "Dia " + c.dia_vencimento : "",
        Base: c.base || "",
        Observacao: c.observacao || "",
        CadastradoEm: c.criado_em ? new Date(c.criado_em).toLocaleDateString("pt-BR") : "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Clientes");
      XLSX.writeFile(wb, "clientes_" + new Date().toLocaleDateString("pt-BR").replace(/[/]/g, "-") + ".xlsx");
    } catch (e) {
      alert("Erro ao exportar: " + e.message);
    }
  };

  const copiarNomes = () => {
    const nomes = filtrados.map(c => c.nome).join("\n");
    const label = filtro === "pendente" ? "Pendentes" : filtro === "pago" ? "Pagos" : "Todos";
    const texto = `${label} — Dia ${diaAtivo} (${filtrados.length})\n${"─".repeat(28)}\n` + nomes;
    navigator.clipboard.writeText(texto).catch(() => {
      const el = document.createElement("textarea");
      el.value = texto;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    });
    alert(`✅ ${filtrados.length} nome(s) copiado(s)!`);
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={onVoltar} style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 14, cursor: 'pointer' }}>
          ← Bases
        </button>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9', marginRight: 8 }}>
            {base?.nome}
          </span>
          <span style={{ fontSize: 13, color: '#64748b' }}>
            {base?.descricao} — {stotal.total} clientes
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setModalNovoCliente(true)}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: "none",
              background: "rgba(56,189,248,0.15)",
              color: "#38bdf8",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 13
            }}
          >
            + Novo Cliente
          </button>
        </div>
      </div>

      {/* Tabs por dia de vencimento */}
      {base?.dias?.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {base.dias.sort((a, b) => a - b).map(d => {
            const arr = clientes.filter(c => c.dia_vencimento === d);
            const pg = arr.filter(c => {
              const status = c.status_calculado || c.status;
              return status === "pago";
            }).length;
            return (
              <button
                key={d}
                onClick={() => setDiaAtivo(d)}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid #2d3148',
                  background: diaAtivo === d ? '#2563eb' : '#0f1117',
                  color: diaAtivo === d ? '#fff' : '#94a3b8',
                  fontWeight: 600,
                  cursor: 'pointer',
                  minWidth: 80
                }}
              >
                <div>Dia {d}</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>{pg}/{arr.length}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* KPIs do dia */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#1a1d2e', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#22c55e', display: 'block' }}>{s.pagos}</span>
          <span style={{ fontSize: 11, color: '#64748b' }}>✅ Pagos</span>
        </div>
        <div style={{ background: '#1a1d2e', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b', display: 'block' }}>{s.pend}</span>
          <span style={{ fontSize: 11, color: '#64748b' }}>⏳ Pendentes</span>
        </div>
        <div style={{ background: '#1a1d2e', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ef4444', display: 'block' }}>{s.inad}</span>
          <span style={{ fontSize: 11, color: '#64748b' }}>🔴 Inadimplentes</span>
        </div>
        <div style={{ background: '#1a1d2e', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a78bfa', display: 'block' }}>{s.prom}</span>
          <span style={{ fontSize: 11, color: '#64748b' }}>🤝 Promessas</span>
        </div>
        <div style={{ background: '#1a1d2e', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#e2e8f0', display: 'block' }}>{s.total}</span>
          <span style={{ fontSize: 11, color: '#64748b' }}>Total dia {diaAtivo}</span>
        </div>
        <div style={{ background: '#1a1d2e', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: s.pct >= 80 ? '#22c55e' : s.pct >= 50 ? '#f59e0b' : '#ef4444', display: 'block' }}>{s.pct}%</span>
          <span style={{ fontSize: 11, color: '#64748b' }}>Recebido</span>
        </div>
      </div>

      {/* Resto do componente */}
      <Card style={{ background: '#0f1117', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #2d3148' }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              placeholder="Buscar cliente..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{
                flex: 1,
                minWidth: 200,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #2d3148',
                background: '#0f1117',
                color: '#e2e8f0',
                fontSize: 13
              }}
            />
            <div style={{ display: 'flex', gap: 4, background: '#1a1d2e', padding: 4, borderRadius: 8 }}>
              {["todos", "pago", "pendente", "inadimplente", "promessa"].map(v => (
                <button
                  key={v}
                  onClick={() => setFiltro(v)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: filtro === v ? (v === 'inadimplente' ? '#ef4444' : '#2563eb') : 'transparent',
                    color: filtro === v ? '#fff' : '#94a3b8'
                  }}
                >
                  {v === 'todos' ? 'Todos' : v === 'pago' ? '✅ Pagos' : v === 'pendente' ? '⏳ Pendentes' : v === 'inadimplente' ? '🔴 Inadimplentes' : '🤝 Promessas'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>
              {filtrados.length === 0 ? '0 clientes' : `${inicio + 1}-${Math.min(fim, filtrados.length)} de ${filtrados.length}`}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {filtrados.length > 0 && (
                <button onClick={copiarNomes} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(148,163,184,0.25)", background: "rgba(148,163,184,0.08)", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}>
                  📋 Copiar nomes
                </button>
              )}
              <button onClick={exportarExcel} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(34,197,94,.3)", background: "rgba(34,197,94,.08)", color: "#4ade80", fontSize: 12, cursor: "pointer" }}>
                📥 Exportar Excel
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : filtrados.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Nenhum cliente</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#1a1d2e' }}>
                    <th style={{ padding: '12px', textAlign: 'left', color: '#94a3b8', fontSize: 11 }}>Nome</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: '#94a3b8', fontSize: 11 }}>Telefone</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: '#94a3b8', fontSize: 11 }}>Endereço</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: '#94a3b8', fontSize: 11 }}>Plano</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: '#94a3b8', fontSize: 11 }}>Status</th>
                   </tr>
                </thead>
                <tbody>
                  {clientesPagina.map(c => (
                    <tr key={c.id} onClick={() => setModalCliente(c)} style={{ cursor: "pointer", borderBottom: '1px solid #1a1d2e' }}>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{c.nome}</td>
                      <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>{c.telefone || "—"}</td>
                      <td style={{ padding: '12px', color: '#94a3b8' }}>{c.endereco || "—"}</td>
                      <td style={{ padding: '12px' }}>{c.plano || "—"}</td>
                      <td style={{ padding: '12px' }}><BadgeCliente status={c.status_calculado || c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Paginação */}
            {totalPaginas > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '16px' }}>
                <button
                  onClick={() => setPagina(p => Math.max(1, p - 1))}
                  disabled={pagina === 1}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #2d3148',
                    background: 'transparent',
                    color: pagina === 1 ? '#64748b' : '#94a3b8',
                    cursor: pagina === 1 ? 'not-allowed' : 'pointer',
                    fontSize: 13
                  }}
                >
                  ← Anterior
                </button>
                <span style={{ color: '#94a3b8', fontSize: 13 }}>
                  Página {pagina} de {totalPaginas}
                </span>
                <button
                  onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                  disabled={pagina === totalPaginas}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #2d3148',
                    background: 'transparent',
                    color: pagina === totalPaginas ? '#64748b' : '#94a3b8',
                    cursor: pagina === totalPaginas ? 'not-allowed' : 'pointer',
                    fontSize: 13
                  }}
                >
                  Próxima →
                </button>
              </div>
            )}
          </>
        )}
      </Card>

      {modalCliente && (
        <ModalEditarCliente
          cliente={modalCliente}
          baseId={base.id}
          onClose={() => setModalCliente(null)}
          onSalvo={onSalvo}
        />
      )}

      {modalNovoCliente && (
        <ModalNovoClienteBase
          baseId={base.id}
          diaDefault={diaAtivo}
          onClose={() => setModalNovoCliente(false)}
          onSalvo={(novo) => {
            setClientes(prev => [...prev, novo]);
            setModalNovoCliente(false);
          }}
        />
      )}
    </div>
  );
};