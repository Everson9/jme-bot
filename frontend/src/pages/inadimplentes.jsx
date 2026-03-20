// src/pages/Inadimplentes.jsx
import React, { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { Card } from '../components/Card';
import { Spinner } from '../components/Spinner';
import * as XLSX from "https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs";

export function PageInadimplentes() {
  const [dias, setDias] = useState(5);
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const API_URL = import.meta.env.VITE_API_URL || "";

  React.useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/api/relatorio/inadimplentes?dias=${dias}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [dias]); // recarrega sempre que dias mudar

  const exportar = () => {
    if (!data?.length) return;
    const rows = data.map(c => ({
      Nome: c.nome,
      Telefone: c.telefone || "",
      Plano: c.plano || "",
      Vencimento: c.dia_vencimento ? `Dia ${c.dia_vencimento}` : "",
      Base: c.base_nome || "",
      "Dias pendente": c.dias_pendente,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inadimplentes");
    XLSX.writeFile(wb, `inadimplentes_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`);
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div className="page-title" style={{ marginBottom: 0 }}>❌ Inadimplentes</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8' }}>
            Pendente há mais de
            <select
              value={dias}
              onChange={e => setDias(Number(e.target.value))}
              style={{
                padding: '4px 8px', borderRadius: 6, border: '1px solid #374151',
                background: '#252836', color: '#e2e8f0', fontSize: 13
              }}
            >
              {[3, 5, 7, 10, 15, 30].map(d => <option key={d} value={d}>{d} dias</option>)}
            </select>
          </div>
          <button
            onClick={exportar}
            style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(34,197,94,.3)',
              background: 'rgba(34,197,94,.08)', color: '#4ade80', fontWeight: 600,
              fontSize: 13, cursor: 'pointer'
            }}
          >
            📥 Exportar
          </button>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : !data?.length ? (
        <Card>
          <div className="td-empty" style={{ padding: 40, textAlign: 'center' }}>
            🎉 Nenhum cliente inadimplente há mais de {dias} dias
          </div>
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #2d3148', fontSize: 13, color: '#94a3b8' }}>
            {data.length} cliente{data.length !== 1 ? 's' : ''} pendente{data.length !== 1 ? 's' : ''} há mais de {dias} dias
          </div>
          <div className="tabela-scroll">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>Plano</th>
                  <th>Vencimento</th>
                  <th>Base</th>
                  <th>Dias pendente</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c, i) => (
                  <tr key={c.id || i}>
                    <td className="td-nome">{c.nome}</td>
                    <td className="td-mono">{c.telefone || "—"}</td>
                    <td>{c.plano || "—"}</td>
                    <td>{c.dia_vencimento ? `Dia ${c.dia_vencimento}` : "—"}</td>
                    <td style={{ fontSize: 11, color: '#64748b' }}>{c.base_nome || "—"}</td>
                    <td>
                      <span style={{
                        fontWeight: 700,
                        color: c.dias_pendente > 15 ? '#f87171' : c.dias_pendente > 7 ? '#f59e0b' : '#94a3b8'
                      }}>
                        {Math.round(c.dias_pendente)}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}