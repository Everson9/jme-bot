// src/pages/PageQR.jsx — Conexão WhatsApp
import React, { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || "";
const API_KEY = import.meta.env.VITE_ADMIN_API_KEY || "";
const authHeaders = () => API_KEY ? { "x-api-key": API_KEY } : {};

export function PageQR({ status }) {
  const [qrUrl, setQrUrl] = useState(null);
  const [desconectando, setDesconectando] = useState(false);
  const [msg, setMsg] = useState(null);

  const online = status?.online;

  // Polling do QR quando offline
  useEffect(() => {
    if (online) { setQrUrl(null); return; }
    const load = () => {
      setQrUrl(`${API}/qr?t=${Date.now()}`);
    };
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [online]);

  const desconectar = async () => {
    if (!confirm('Desconectar o WhatsApp? Você precisará escanear o QR novamente.')) return;
    setDesconectando(true);
    try {
      const r = await fetch(`${API}/api/whatsapp/desconectar`, { method: 'POST', headers: { "Content-Type": "application/json", ...authHeaders() } });
      const j = await r.json();
      setMsg(j.ok ? { tipo: 'ok', texto: 'Desconectado com sucesso. Atualize a página em alguns segundos.' }
                  : { tipo: 'erro', texto: j.erro || 'Erro ao desconectar' });
    } catch {
      setMsg({ tipo: 'erro', texto: 'Falha de conexão com o servidor.' });
    }
    setDesconectando(false);
  };

  return (
    <div className="page" style={{ maxWidth: 540, margin: '0 auto' }}>
      <h1 className="page-title">📱 Conexão WhatsApp</h1>

      {/* Card de status */}
      <div style={{ background: '#0f1117', borderRadius: 16, padding: 24, marginBottom: 20,
        border: `1px solid ${online ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 24,
            background: online ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)' }}>
            {online ? '✅' : '❌'}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: online ? '#22c55e' : '#ef4444' }}>
              {online ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {online && status?.iniciadoEm
                ? `Conectado desde ${new Date(status.iniciadoEm).toLocaleString('pt-BR')}`
                : 'Escaneie o QR Code abaixo para conectar'}
            </div>
          </div>
        </div>

        {online && (
          <button onClick={desconectar} disabled={desconectando}
            style={{ marginTop: 20, width: '100%', padding: '10px 0', borderRadius: 10,
              border: '1px solid rgba(239,68,68,.4)', background: 'rgba(239,68,68,.08)',
              color: '#f87171', fontWeight: 700, fontSize: 14,
              cursor: desconectando ? 'not-allowed' : 'pointer', opacity: desconectando ? .6 : 1 }}>
            {desconectando ? 'Desconectando...' : '🔌 Desconectar WhatsApp'}
          </button>
        )}
      </div>

      {/* Mensagem de feedback */}
      {msg && (
        <div style={{ padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13,
          background: msg.tipo === 'ok' ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
          border: `1px solid ${msg.tipo === 'ok' ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
          color: msg.tipo === 'ok' ? '#4ade80' : '#f87171' }}>
          {msg.texto}
        </div>
      )}

      {/* QR Code */}
      {!online && (
        <div style={{ background: '#0f1117', borderRadius: 16, padding: 32,
          border: '1px solid #2d3148', textAlign: 'center' }}>
          <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 20 }}>
            Abra o WhatsApp no seu celular →<br />
            <strong style={{ color: '#e2e8f0' }}>Dispositivos conectados → Conectar dispositivo</strong>
          </div>

          {qrUrl ? (
            <div>
              <img src={qrUrl} alt="QR Code WhatsApp"
                style={{ width: 240, height: 240, borderRadius: 12, background: '#fff', padding: 8 }}
                onError={() => setQrUrl(null)} />
              <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
                QR Code atualiza automaticamente a cada 20 segundos
              </div>
              <button onClick={() => setQrUrl(`${API}/qr?t=${Date.now()}`)}
                style={{ marginTop: 12, padding: '7px 20px', borderRadius: 8, border: 'none',
                  background: 'rgba(56,189,248,.15)', color: '#38bdf8',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                ↻ Recarregar QR
              </button>
            </div>
          ) : (
            <div style={{ width: 240, height: 240, borderRadius: 12, background: '#1a1d2e',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto', color: '#64748b', fontSize: 13 }}>
              Aguardando QR Code...
            </div>
          )}
        </div>
      )}
    </div>
  );
}