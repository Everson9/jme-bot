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

  // --- Novo envio manual ---
  const [modalManual, setModalManual] = useState(false);
  const [telefoneManual, setTelefoneManual] = useState('');
  const [msgManual, setMsgManual] = useState('');

  // --- Arquivo do carnê ---
  const [arquivoCarne, setArquivoCarne] = useState(null);
  useEffect(() => { carregarClientes(); }, []);

  const carregarClientes = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/clientes/recentes?limite=25`, { headers: authHeaders() });
      if (r.ok) setClientes(await r.json());
    } catch(_) { }
    setLoading(false);
  };

  const enviarBoasVindas = async (cliente) => {
    if (!cliente.telefone) {
      alert(`${cliente.nome} não tem telefone cadastrado.`);
      return;
    }
    setModalCliente(cliente);
    setSolicitarCarne(false);
    setObsCarne('');
    setArquivoCarne(null);
  };

  // Lê arquivo como base64
  const lerArquivo = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Remove "data:...;base64," prefix
      const base64 = reader.result.split(',')[1];
      resolve({ base64, nome: file.name, tipo: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const confirmarEnvio = async () => {
    const cliente = modalCliente;
    if (!cliente) return;

    setEnviando(prev => ({ ...prev, [cliente.id]: true }));
    try {
      const msg = document.getElementById('msgBoasVindas')?.value || '';
      const body = {
        cliente_id: cliente.id,
        mensagem: msg,
        solicitar_carne: solicitarCarne,
        obs_carne: obsCarne
      };

      if (arquivoCarne) {
        const { base64, nome, tipo } = await lerArquivo(arquivoCarne);
        body.carne_arquivo_base64 = base64;
        body.carne_arquivo_nome = nome;
        body.carne_arquivo_tipo = tipo;
      }

      const r = await fetch(`${API}/api/boas-vindas/enviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body)
      });
      const data = await r.json();
      if (data.ok) {
        alert(`✅ Boas-vindas enviada para ${cliente.nome}!${solicitarCarne ? ' Carnê solicitado!' : ''}${arquivoCarne ? ' Carnê anexado!' : ''}`);
        setModalCliente(null);
        setArquivoCarne(null);
      } else {
        alert(`❌ Erro: ${data.erro}`);
      }
    } catch(e) {
      alert('Erro ao conectar com o servidor');
    }
    setEnviando(prev => ({ ...prev, [cliente.id]: false }));
  };

  // --- Envio manual ---
  const enviarManual = async () => {
    if (!telefoneManual.trim() || !msgManual.trim()) {
      alert('Preencha o telefone e a mensagem.');
      return;
    }
    try {
      const r = await fetch(`${API}/api/boas-vindas/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ telefone: telefoneManual, mensagem: msgManual })
      });
      const data = await r.json();
      if (data.ok) {
        alert('✅ Mensagem enviada!');
        setModalManual(false);
        setTelefoneManual('');
        setMsgManual('');
      } else {
        alert(`❌ Erro: ${data.erro}`);
      }
    } catch(e) {
      alert('Erro ao conectar com o servidor');
    }
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Boas-Vindas</h1>
          <p style={{ color: '#94a3b8', fontSize: 13 }}>
            Últimos 25 clientes cadastrados. Envie boas-vindas pelo WhatsApp e opcionalmente anexe o carnê.
          </p>
        </div>
        <button
          onClick={() => setModalManual(true)}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #38bdf8',
            background: 'rgba(56,189,248,.1)', color: '#38bdf8', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          💬 Enviar Manual
        </button>
      </div>

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
                        {enviando[c.id] ? 'Enviando...' : '👋 Enviar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal de confirmação de boas-vindas */}
      {modalCliente && (
        <div className="modal-overlay" onClick={() => { setModalCliente(null); setArquivoCarne(null); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-title">Boas-Vindas — {modalCliente.nome}</div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
                Mensagem de boas-vindas (editável):
              </label>
              <textarea
                id="msgBoasVindas"
                style={{ width: '100%', minHeight: 100, padding: 8, borderRadius: 8,
                  border: '1px solid #2d3148', background: '#0f1117', color: '#e2e8f0',
                  fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
                defaultValue={`🤖 *Assistente JMENET*\n\nOlá, *${(modalCliente.nome || 'Cliente').split(' ')[0]}*! 🎉 Seja bem-vindo(a) à JMENET!\n\n📡 Plano: ${modalCliente.plano || 'Não informado'}\n📅 Vencimento: Todo dia ${modalCliente.dia_vencimento || '10'}\n\nQualquer dúvida é só chamar! 😊`}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
                📄 Anexar carnê (PDF ou imagem):
              </label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={e => setArquivoCarne(e.target.files[0] || null)}
                style={{ width: '100%', fontSize: 12, color: '#94a3b8' }}
              />
            </div>

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
                  placeholder="Ex: entregar junto com roteiro"
                  value={obsCarne}
                  onChange={e => setObsCarne(e.target.value)}
                />
              </div>
            )}

            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => { setModalCliente(null); setArquivoCarne(null); }}>Cancelar</button>
              <button className="btn-save" onClick={confirmarEnvio}>
                ✅ Confirmar Envio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de envio manual */}
      {modalManual && (
        <div className="modal-overlay" onClick={() => setModalManual(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-title">💬 Enviar Mensagem Manual</div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
                Telefone (com DDD):
              </label>
              <input
                className="busca-input"
                style={{ maxWidth: '100%' }}
                placeholder="5581999999999"
                value={telefoneManual}
                onChange={e => setTelefoneManual(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
                Mensagem:
              </label>
              <textarea
                style={{ width: '100%', minHeight: 120, padding: 8, borderRadius: 8,
                  border: '1px solid #2d3148', background: '#0f1117', color: '#e2e8f0',
                  fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="Digite sua mensagem aqui..."
                value={msgManual}
                onChange={e => setMsgManual(e.target.value)}
              />
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setModalManual(false)}>Cancelar</button>
              <button className="btn-save" onClick={enviarManual}>Enviar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
