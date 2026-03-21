// src/App.jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useFetch } from './hooks/useFetch';
import { TopNav } from './components/TopNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';

// Pages
import { PageQR } from './pages/qr';
import { PageDashboard } from './pages/dashboard';
import { PageClientes } from './pages/clientes';
import { PagePromessas } from './pages/promessas';
import { PageCarne } from './pages/carne';
import { PageCancelamentos } from './pages/cancelamentos';
import { PageChamados } from './pages/chamados';
import { PageLogs } from './pages/logs';
import { PageCobranca } from './pages/cobranca';
import { PageSGP } from './pages/sgp';
import { PageNovos } from './pages/novos';
import { PageEstados } from './pages/estados';
import { PageInadimplentes } from './pages/inadimplentes';
import { PageAgendamentos } from './pages/agendamentos';

const API = import.meta.env.VITE_API_URL || "";

function AppContent() {
  const [bases, setBases] = useState([]);
  // 🔥 REMOVIDO: useFetch("/api/status", 10000) - agora usa SSE no dashboard
  
  // 🔥 SSE para o TopNav (botão de ligar/desligar)
  const [botStatus, setBotStatus] = useState(null);

  useEffect(() => {
    let es = null;
    let sseTimer = null;
    let pollTimer = null;

    // /api/status não toca Firebase — só lê variáveis em memória, custo zero
    const fetchStatus = async () => {
      try {
        const r = await fetch(API + '/api/status');
        if (r.ok) setBotStatus(await r.json());
      } catch(_) {}
    };

    // SSE para atualizações em tempo real (atendimentos, toggle bot etc)
    const conectar = () => {
      if (es) { try { es.close(); } catch(_) {} }
      es = new EventSource(API + '/api/status-stream');
      es.onmessage = (event) => {
        try { setBotStatus(JSON.parse(event.data)); } catch(_) {}
      };
      es.onerror = () => {
        es.close();
        sseTimer = setTimeout(conectar, 8000);
      };
    };

    fetchStatus();                          // imediato
    pollTimer = setInterval(fetchStatus, 5000); // a cada 5s — fonte principal
    conectar();                             // SSE como complemento

    return () => {
      if (sseTimer) clearTimeout(sseTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (es) es.close();
    };
  }, []);

  const toggleBot = async () => {
    await fetch(API + "/api/bot/toggle", { method: "POST" });
    // SSE vai atualizar automaticamente, não precisa de refetch
  };

  return (
    <BrowserRouter>
      <div className="layout">
        <TopNav 
          botAtivo={botStatus?.botAtivo} 
          onToggle={toggleBot} 
          bases={bases} 
        />
        <div className="content">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<PageDashboard status={botStatus} />} />
              <Route path="/chamados" element={<PageChamados />} />
              <Route path="/clientes" element={<PageClientes onBasesCarregadas={setBases} />} />
              <Route path="/promessas" element={<PagePromessas />} />
              <Route path="/carne" element={<PageCarne />} />
              <Route path="/logs" element={<PageLogs />} />
              <Route path="/cobranca" element={<PageCobranca />} />
              <Route path="/sgp" element={<PageSGP />} />
              <Route path="/novos" element={<PageNovos />} />
              <Route path="/estados" element={<PageEstados />} />
              <Route path="/cancelamentos" element={<PageCancelamentos />} />
              <Route path="/inadimplentes" element={<PageInadimplentes />} />
              <Route path="/agendamentos" element={<PageAgendamentos />} />
              <Route path="/qr" element={<PageQR status={botStatus} />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </ThemeProvider>
  );
}