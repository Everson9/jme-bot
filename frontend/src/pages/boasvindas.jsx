import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { Spinner } from '../components/Spinner';

const API = import.meta.env.VITE_API_URL || "";
const API_KEY = import.meta.env.VITE_ADMIN_API_KEY || "";
const authHeaders = () => API_KEY ? { "x-api-key": API_KEY } : {};

export function PageBoasVindas() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState({});
  const [modalCliente, setModalCliente] = useState(null);
  const [solicitarCarne, setSolicitarCarne] = useState(false);
  const [obsCarne, setObsCarne] = useState('');

  useEffect(() => {
    carregarClientes();
  }, []);

  const carregarClientes = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/clientes/recentes?limite=15`, { headers: authHeaders() });
      if (r.ok) setClientes(await r.json());
    } catch(_) {}
    setLoading(false);
  };

  const enviarBoasVindas = async (cliente) => {
    if (!cliente.telefone) {
      alert(`${cliente.nome} não tem telefone cadastrado.`);
      return;
    }

    // Abre modal para confirmar carnê
    setModalCliente(cliente);
    setSolicitarCarne(false);
    setObsCarne('');
  };

  const confirmarEnvio = async () => {
    const cliente = modalCliente;
    if (!cliente) return;

    setEnviando(prev => ({ ...prev, [cliente.id]: true }));
    try {
      const r = await fetch(`${API}/api/boas-vindas/enviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          cliente_id: cliente.id,
          mensagem_carne: solicitarCarne ? (obsCarne || 'Solicitado via painel na boas-vindas') : null
        })
      });
      const data = await r.json();
      if (data.ok) {
        alert(`✅ Boas-vindas enviada para ${cliente.nome}!${solicitarCarne ? ' Carnê físico solicitado!' : ''}`);
        setModalCliente(null);
      } else {
        alert(`❌ Erro: ${data.erro}`);
      }
    } catch(e) {
      alert('Erro ao conectar com o servidor');
    }
    setEnviando(prev => ({ ...prev, [cliente.id]: false }));
  };

  const corStatus = (s) => {
    switch(s) {
      case 'pago': return '#22c55e';
      case 'promessa': return '#a78bfa';
      case 'cancelado': return '#ef4444';
      default: return '#f59e0b';
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">👋 Boas-Vindas — Clientes Recentes</h1>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: '1.5rem' }}>
        Últimos 15 clientes cadastrados. Envie uma mensagem de boas-vindas pelo WhatsApp e opcionalmente solicite o carnê físico.
      </p>

      {loading ? (
        <div className="spinner-wrap"><div className="spinner"></div></div>
      ) : clientes.length === 0 ? (
        <Card><div className="td-empty" style={{ padding: '3rem', textAlign: 'center' }}>
          Nenhum cliente recente cadastrado
        </div></Card>
      ) : (
        <Card style={{ padding: 0 }}>
          <div className="tabela-scroll">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>Plano</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                  <th>Cadastrado em</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map(c => (
                  <tr key={c.id}>
                    <td className="td-nome">{c.nome}</td>
                    <td className="td-mono">{c.telefone || '—'}</td>
                    <td>{c.plano || '—'}</td>
                    <td style={{ textAlign: 'center' }}>Dia {c.dia_vencimento || 'N/A'}</td>
                    <td>
                      <span className="badge" style={{
                        background: corStatus(c.status) + '22',
                        color: corStatus(c.status),
                        border: `1px solid ${corStatus(c.status)}44`
                      }}>
                        {c.status || 'pendente'}
                      </span>
                    </td>
                    <td className="td-muted">{c.criado_em ? new Date(c.criado_em).toLocaleDateString('pt-BR') : '—'}</td>
                    <td>
                      <button
                        className="btn-save"
                        style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
                        disabled={enviando[c.id] || !c.telefone}
                        onClick={() => enviarBoasVindas(c)}
                      >
                        {enviando[c.id] ? 'Enviando...' : '👋 Boas-vindas'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal de confirmação */}
      {modalCliente && (
        <div className="modal-overlay" onClick={() => setModalCliente(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-title">Boas-Vindas + Carnê</div>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
              Enviar mensagem de boas-vindas para <strong style={{ color: '#e2e8f0' }}>{modalCliente.nome}</strong>?
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={solicitarCarne}
                  onChange={e => setSolicitarCarne(e.target.checked)}
                  style={{ accentColor: '#38bdf8' }}
                />
                📋 Solicitar carnê físico
              </label>
            </div>

            {solicitarCarne && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
                  Observação (opcional):
                </label>
                <input
                  className="busca-input"
                  style={{ maxWidth: '100%' }}
                  placeholder="Ex: entregar junto com roteiro de instalação"
                  value={obsCarne}
                  onChange={e => setObsCarne(e.target.value)}
                />
              </div>
            )}

            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setModalCliente(null)}>Cancelar</button>
              <button className="btn-save" onClick={confirmarEnvio}>
                ✅ Confirmar Envio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
