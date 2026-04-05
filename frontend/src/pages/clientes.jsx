// src/pages/Clientes.jsx
import React, { useState, useEffect, useCallback } from 'react';
const API_KEY = import.meta.env.VITE_ADMIN_API_KEY || "";
const authHeaders = () => API_KEY ? { "x-api-key": API_KEY } : {};
import { useLocation, useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { Card } from '../components/Card';
import { Spinner } from '../components/Spinner';
import { VisualizadorBase } from '../components/VisualizadorBase';
import { ModalCriarBase } from '../components/ModalCriarBase';

const API = import.meta.env.VITE_API_URL || "";

export function PageClientes({ onBasesCarregadas }) {
  const [bases, setBases] = useState(null);
  const [baseAtiva, setBaseAtiva] = useState(null);
  const [modalCriar, setModalCriar] = useState(false);
  const { data: planilha } = useFetch("/api/planilha/resumo", 60000);
  const location = useLocation();
  const navigate = useNavigate();

  const carregarBases = useCallback(async () => {
    try {
      const r = await fetch(API + "/api/bases", { headers: authHeaders() });
      const b = await r.json();
      setBases(b);
      if (onBasesCarregadas) onBasesCarregadas(b);
    } catch (error) {
      console.error("Erro ao carregar bases:", error);
    }
  }, [onBasesCarregadas]);

  useEffect(() => { 
    carregarBases(); 
  }, [carregarBases]);

  // Verifica querystring para abrir base ou modal
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const baseId = params.get("base");
    const acao = params.get("acao");
    if (baseId && bases) setBaseAtiva(parseInt(baseId));
    if (acao === "nova") setModalCriar(true);
  }, [location.search, bases]);

  const deletarBase = async (base) => {
    if (!confirm(`Excluir a base "${base.nome}" e todos os seus clientes?`)) return;
    try {
      await fetch(`${API}/api/bases/${base.id}`, { method: "DELETE", headers: { ...authHeaders() } });
      carregarBases();
    } catch (error) {
      alert("Erro ao excluir base");
    }
  };

  // Enriquece as bases com dados da planilha (para JME)
  const basesExibir = (bases || []).map(b => {
    if (b.nome === "JME" && planilha) {
      const jmeDias = Object.entries(planilha).map(([aba, info]) => ({
        dia: parseInt(aba.replace("Data ", "")),
        total: (info.pagos || 0) + (info.pendentes || 0),
        pagos: info.pagos || 0,
        pendentes: info.pendentes || 0,
        clientes: info.clientes || [],
      }));
      return {
        ...b,
        jmeDias,
        total: jmeDias.reduce((s, d) => s + d.total, 0),
        pagos: jmeDias.reduce((s, d) => s + d.pagos, 0)
      };
    }
    return b;
  });

  // Se uma base específica foi selecionada, mostra o visualizador
  if (baseAtiva) {
    const base = basesExibir.find(b => b.id === baseAtiva);
    if (!base) { 
      setBaseAtiva(null); 
      return null; 
    }
    // Usa o mesmo visualizador para TODAS as bases
    return <VisualizadorBase base={base} onVoltar={() => setBaseAtiva(null)} />;
  }

  // Tela de listagem de bases
  return (
    <div className="page">
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 20 
      }}>
        <div className="page-title">Bases de Clientes</div>
        <button 
          onClick={() => setModalCriar(true)} 
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#2563eb',
            color: '#fff',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer'
          }}
        >
          + Nova Base
        </button>
      </div>

      {!bases ? (
        <Spinner />
      ) : bases.length === 0 ? (
        <Card style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
          <div style={{ fontSize: 16, color: '#64748b' }}>Nenhuma base cadastrada</div>
          <button 
            onClick={() => setModalCriar(true)}
            style={{
              marginTop: 16,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Criar primeira base
          </button>
        </Card>
      ) : (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
          gap: 16 
        }}>
          {basesExibir.map(base => {
            const pct = base.total > 0 ? Math.round((base.pagos / base.total) * 100) : 0;
            const isJME = base.nome === "JME";
            
            return (
              <Card 
                key={base.id} 
                onClick={() => setBaseAtiva(base.id)} 
                style={{ 
                  cursor: "pointer", 
                  padding: 0,
                  transition: 'transform 0.2s',
                  ':hover': { transform: 'translateY(-2px)' }
                }}
              >
                <div style={{ padding: '16px' }}>
                  {/* Cabeçalho */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: 8 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{base.nome}</span>
                      {isJME && (
                        <span style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: '#2563eb',
                          color: '#fff',
                          fontWeight: 600
                        }}>
                          Principal
                        </span>
                      )}
                    </div>
                    {!isJME && (
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          deletarBase(base); 
                        }} 
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          fontSize: 14
                        }}
                      >
                        🗑️
                      </button>
                    )}
                  </div>

                  {/* Descrição */}
                  {base.descricao && (
                    <div style={{ 
                      fontSize: 12, 
                      color: '#64748b', 
                      marginBottom: 12 
                    }}>
                      {base.descricao}
                    </div>
                  )}

                  {/* Dias de vencimento */}
                  <div style={{ 
                    display: 'flex', 
                    gap: 6, 
                    marginBottom: 12, 
                    flexWrap: 'wrap' 
                  }}>
                    {(base.dias || []).map(d => (
                      <span key={d} style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: '#1a1d2e',
                        fontSize: 11,
                        color: '#94a3b8'
                      }}>
                        Dia {d}
                      </span>
                    ))}
                  </div>

                  {/* Barra de progresso */}
                  <div style={{ 
                    height: 4, 
                    background: '#1e2130', 
                    borderRadius: 2, 
                    marginBottom: 12 
                  }}>
                    <div style={{ 
                      height: '100%', 
                      width: `${pct}%`, 
                      background: '#4ade80', 
                      borderRadius: 2 
                    }} />
                  </div>

                  {/* Estatísticas */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    fontSize: 12 
                  }}>
                    <span style={{ color: '#4ade80' }}>✅ {base.pagos} pagos</span>
                    <span style={{ color: '#f59e0b' }}>⏳ {base.total - base.pagos} pendentes</span>
                    <span style={{ color: '#94a3b8' }}>{pct}%</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de criação de base */}
      {modalCriar && (
        <ModalCriarBase 
          onClose={() => setModalCriar(false)} 
          onCriada={() => {
            carregarBases();
            setModalCriar(false);
          }} 
        />
      )}
    </div>
  );
}