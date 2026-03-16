import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useFetch } from './hooks/useFetch';
import { TopNav } from './components/TopNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';

// Pages
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
    const { data: status, refetch } = useFetch("/api/status", 10000);
    const [bases, setBases] = useState([]);

    const toggleBot = async () => {
        await fetch(API + "/api/bot/toggle", { method: "POST" });
        refetch();
    };

    return (
        <BrowserRouter>
            <div className="layout">
                <TopNav botAtivo={status?.botAtivo} onToggle={toggleBot} bases={bases} />
                <div className="content">
                    <ErrorBoundary>
                        <Routes>
                            <Route path="/" element={<PageDashboard status={status} refetch={refetch} />} />
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