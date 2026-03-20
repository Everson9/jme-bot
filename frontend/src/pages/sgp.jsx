// src/pages/SGP.jsx
import React, { useState } from 'react';
import { useSSEData } from '../hooks/useSSEData';
import { Card } from '../components/Card';
import { Spinner } from '../components/Spinner';
import { Badge } from '../components/Badge';

const API = import.meta.env.VITE_API_URL || "";

export function PageSGP() {
  const { data: planilha, loading, refetch } = useSSEData("/api/planilha/resumo", "clientes");
  const [confirmando, setConfirmando] = useState({});
  const [confirmados, setConfirmados] = useState({});

  const pendentes = planilha
    ? Object.entries(planilha).flatMap(([aba, info]) =>
        (info.clientes || []).filter(c => c.baixa_sgp).map(c => ({ ...c, aba }))
      )
    : [];

  const porAba = ["Data 10", "Data 20", "Data 30"]
    .map(aba => ({ aba, clientes: pendentes.filter(c => c.aba === aba) }))
    .filter(g => g.clientes.length > 0);

  const confirmar = async (nome, aba) => {
    const key = `${aba}-${nome}`;
    setConfirmando(p => ({ ...p, [key]: true }));
    try {
      const r = await fetch(API + "/api/sgp/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, aba })
      });
      if (r.ok) {
        setConfirmados(p => ({ ...p, [key]: true }));
        setTimeout(() => refetch(), 1000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setConfirmando(p => ({ ...p, [key]: false }));
    }
  };

  return (
    <div className="page">
      <div className="page-title">Baixas SGP</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
        Clientes que precisam de baixa manual no sistema SGP após pagamento confirmado.
      </div>

      {loading ? (
        <Spinner />
      ) : pendentes.length === 0 ? (
        <Card style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#64748b' }}>
            Tudo em dia! Nenhuma baixa pendente no SGP.
          </div>
        </Card>
      ) : (
        porAba.map(({ aba, clientes }) => (
          <Card key={aba} className="tabela-card" style={{ padding: 0, marginBottom: 16 }}>
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid #2d3148',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{aba}</span>
              <span style={{
                padding: '4px 8px', borderRadius: 12, background: 'rgba(245,158,11,0.15)',
                color: '#f59e0b', fontSize: 11, fontWeight: 600
              }}>
                {clientes.length} pendente{clientes.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="tabela-scroll">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Status</th>
                    <th>Forma Pgto</th>
                    <th>Confirmar SGP</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((c, i) => {
                    const key = `${aba}-${c.nome}`;
                    const feito = confirmados[key];
                    return (
                      <tr key={i} style={feito ? { background: 'rgba(34,197,94,0.05)' } : {}}>
                        <td className="td-nome">{c.nome}</td>
                        <td><Badge type={c.status} /></td>
                        <td>{c.forma || "—"}</td>
                        <td>
                          {feito ? (
                            <span style={{ color: '#22c55e', fontWeight: 600, fontSize: 12 }}>✅ Confirmado</span>
                          ) : (
                            <button
                              className="btn-sgp"
                              disabled={confirmando[key]}
                              onClick={() => confirmar(c.nome, aba)}
                              style={{
                                padding: '4px 10px', borderRadius: 6, border: 'none',
                                background: 'rgba(34,197,94,0.1)', color: '#22c55e',
                                fontSize: 12, fontWeight: 600, cursor: 'pointer'
                              }}
                            >
                              {confirmando[key] ? "Salvando..." : "✔ Dei baixa no SGP"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}