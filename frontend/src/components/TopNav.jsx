// src/components/TopNav.jsx
import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { BuscaGlobal } from './BuscaGlobal';
import { useTheme } from '../contexts/ThemeContext';
import { NotificationBell } from './NotificationBell';
import { BackupButton } from './BackupButton';

const API = import.meta.env.VITE_API_URL || "";
const API_KEY = import.meta.env.VITE_ADMIN_API_KEY || "";
const authHeaders = () => API_KEY ? { "x-api-key": API_KEY } : {};

export const TopNav = ({ botAtivo, onToggle, bases }) => {
  const { data: horario, refetch: refetchHorario } = useFetch("/api/horario");
  const { data: horarioCobranca, refetch: refetchCobranca } = useFetch("/api/horario/cobranca");
  const [editHorario, setEditHorario] = useState(false);
  const [hInicio, setHInicio] = useState(8);
  const [hFim, setHFim] = useState(20);
  const [editCobranca, setEditCobranca] = useState(false);
  const [cInicio, setCInicio] = useState(8);
  const [cFim, setCFim] = useState(17);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [maisAberto, setMaisAberto] = useState(false);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (horario) {
      setHInicio(horario.inicio);
      setHFim(horario.fim);
    }
    if (horarioCobranca) {
      setCInicio(horarioCobranca.inicio);
      setCFim(horarioCobranca.fim);
    }
  }, [horario, horarioCobranca]);

  const salvarHorario = async () => {
    await fetch(API + "/api/horario", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ inicio: Number(hInicio), fim: Number(hFim), ativo: true })
    });
    refetchHorario();
    setEditHorario(false);
  };

  const salvarCobranca = async () => {
    await fetch(API + "/api/horario/cobranca", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ inicio: Number(cInicio), fim: Number(cFim) })
    });
    refetchCobranca();
    setEditCobranca(false);
  };

  const toggleHorario = async () => {
    await fetch(API + "/api/horario", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ ativo: !horario?.ativo })
    });
    refetchHorario();
  };

  const NAV_MAIN = [
    { to: "/", label: "Dashboard", icon: "▦", exact: true },
    { to: "/chamados", label: "Chamados", icon: "🎫" },
    {
      label: "Clientes",
      icon: "👥",
      submenu: [
        { to: "/clientes", label: "📊 Todas as Bases" },
        ...(bases || []).map((b) => ({ to: `/clientes?base=${b.id}`, label: `📁 ${b.nome}` })),
        { to: "/clientes?acao=nova", label: "➕ Nova Base", divider: true }
      ]
    },
    { to: "/boas-vindas", label: "Boas-Vindas", icon: "👋" },
    { to: "/promessas", label: "Promessas", icon: "🤝" },
    { to: "/carne", label: "Carnês", icon: "📋" },
    { to: "/cobranca", label: "Cobranças", icon: "📬" },
    { to: "/qr", label: "📱 WhatsApp" },
        { to: "/agendamentos", label: "Agendamentos", icon: "📅" }
  ];

  const NAV_MAIS = [
    { to: "/estados", label: "Ao Vivo", icon: "🟢" },
    { to: "/sgp", label: "Baixas SGP", icon: "✅" },
    { to: "/logs", label: "Logs", icon: "📄" },
    { to: "/novos", label: "Cadastros", icon: "👥" },
    { to: "/cancelamentos", label: "Cancelamentos", icon: "❌" },
    { to: "/inadimplentes", label: "Inadimplentes", icon: "⚠️" }
  ];

  return (
    <>
      <style>{`
        .topnav {
          position: fixed;
          top: 0; left: 0; right: 0;
          height: 52px;
          background: rgba(10, 14, 26, 0.97);
          border-bottom: 1px solid rgba(56, 189, 248, 0.12);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          padding: 0 1rem;
          gap: 0;
          z-index: 1000;
          box-shadow: 0 1px 24px rgba(0,0,0,0.4);
        }
        [data-theme="light"] .topnav {
          background: rgba(255, 255, 255, 0.97);
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
          box-shadow: 0 1px 24px rgba(0,0,0,0.1);
        }
        .topnav-logo {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-right: 1.5rem;
          text-decoration: none;
          flex-shrink: 0;
        }
        .topnav-logo-icon { font-size: 20px; }
        .topnav-logo-text { font-size: 15px; font-weight: 800; color: #f1f5f9; letter-spacing: 0.04em; }
        [data-theme="light"] .topnav-logo-text { color: #0f172a; }
        .topnav-logo-sub { font-size: 10px; color: #38bdf8; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; margin-top: -2px; }
        .topnav-links {
          display: flex;
          align-items: center;
          gap: 2px;
          flex: 1;
          overflow: visible;
        }
        .nav-item-wrap { position: relative; }
        .nav-item-wrap:hover .nav-dropdown {
          opacity: 1;
          pointer-events: all;
          transform: translateY(0);
        }
        .topnav-link {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 11px;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 500;
          color: #94a3b8;
          text-decoration: none;
          white-space: nowrap;
          transition: color .15s, background .15s;
          cursor: pointer;
          border: none;
          background: transparent;
          height: 32px;
        }
        [data-theme="light"] .topnav-link { color: #334155; }
        .topnav-link:hover, .topnav-link.active-link {
          color: #f1f5f9;
          background: rgba(255,255,255,0.07);
        }
        [data-theme="light"] .topnav-link:hover, 
        [data-theme="light"] .topnav-link.active-link {
          color: #0f172a;
          background: rgba(0,0,0,0.05);
        }
        .topnav-link .nav-icon { font-size: 14px; }
        .nav-arrow { font-size: 9px; color: #64748b; margin-left: 1px; }
        .nav-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          min-width: 200px;
          background: #0f1117;
          border: 1px solid rgba(56,189,248,0.15);
          border-radius: 10px;
          padding: 6px;
          box-shadow: 0 16px 48px rgba(0,0,0,0.6);
          opacity: 0;
          pointer-events: none;
          transform: translateY(-6px);
          transition: opacity .18s, transform .18s;
          z-index: 999;
        }
        [data-theme="light"] .nav-dropdown {
          background: #ffffff;
          border: 1px solid rgba(0,0,0,0.1);
          box-shadow: 0 16px 48px rgba(0,0,0,0.1);
        }
        .nav-dropdown-item {
          display: block;
          padding: 7px 12px;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 500;
          color: #94a3b8;
          text-decoration: none;
          transition: background .12s, color .12s;
          cursor: pointer;
          white-space: nowrap;
        }
        [data-theme="light"] .nav-dropdown-item { color: #334155; }
        .nav-dropdown-item:hover {
          background: rgba(56,189,248,0.1);
          color: #e2e8f0;
        }
        [data-theme="light"] .nav-dropdown-item:hover {
          background: rgba(37,99,235,0.1);
          color: #0f172a;
        }
        .nav-dropdown-divider {
          border-top: 1px solid rgba(255,255,255,0.07);
          margin: 4px 0;
        }
        [data-theme="light"] .nav-dropdown-divider {
          border-top: 1px solid rgba(0,0,0,0.1);
        }
        .topnav-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
          margin-left: auto;
        }
        /* ===== NOVO: Botão de Backup ===== */
        .backup-btn-wrapper {
          margin-right: 2px;
        }
        .backup-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          cursor: pointer;
          color: #94a3b8;
          transition: all .15s;
        }
        [data-theme="light"] .backup-btn {
          background: rgba(0,0,0,0.05);
          border: 1px solid rgba(0,0,0,0.1);
          color: #334155;
        }
        .backup-btn:hover {
          background: rgba(255,255,255,0.1);
          color: #f1f5f9;
        }
        [data-theme="light"] .backup-btn:hover {
          background: rgba(0,0,0,0.1);
          color: #0f172a;
        }
        .backup-btn svg {
          font-size: 14px;
        }
        /* ===== Fim do backup ===== */
        .theme-toggle {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          padding: 8px;
          color: var(--text-secondary);
          transition: all .15s;
        }
        .theme-toggle:hover {
          transform: scale(1.1);
        }
        .bot-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          cursor: pointer;
          transition: background .15s;
        }
        [data-theme="light"] .bot-pill {
          background: rgba(0,0,0,0.05);
          border: 1px solid rgba(0,0,0,0.1);
        }
        .bot-pill:hover { background: rgba(255,255,255,0.1); }
        [data-theme="light"] .bot-pill:hover { background: rgba(0,0,0,0.1); }
        .bot-pill .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .bot-pill .dot-on { background: #4ade80; box-shadow: 0 0 6px #4ade80; }
        .bot-pill .dot-off { background: #ef4444; }
        .horario-pill {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          cursor: pointer;
          color: #94a3b8;
          transition: background .15s;
        }
        [data-theme="light"] .horario-pill {
          background: rgba(0,0,0,0.05);
          border: 1px solid rgba(0,0,0,0.1);
          color: #334155;
        }
        .horario-pill:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }
        [data-theme="light"] .horario-pill:hover { background: rgba(0,0,0,0.1); color: #0f172a; }
        .horario-dropdown-wrap { position: relative; }
        .horario-dropdown-wrap:hover .horario-dropdown {
          opacity: 1;
          pointer-events: all;
          transform: translateY(0);
        }
        .horario-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: 220px;
          background: #0f1117;
          border: 1px solid rgba(56,189,248,0.15);
          border-radius: 10px;
          padding: 12px;
          box-shadow: 0 16px 48px rgba(0,0,0,0.6);
          opacity: 0;
          pointer-events: none;
          transform: translateY(-6px);
          transition: opacity .18s, transform .18s;
          z-index: 999;
        }
        [data-theme="light"] .horario-dropdown {
          background: #ffffff;
          border: 1px solid rgba(0,0,0,0.1);
        }
        .hamburger {
          display: none;
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px;
          color: #94a3b8;
          font-size: 20px;
          margin-left: auto;
        }
        [data-theme="light"] .hamburger { color: #334155; }
        .mobile-menu {
          display: none;
          position: fixed;
          top: 52px; left: 0; right: 0;
          background: rgba(10,14,26,0.98);
          border-bottom: 1px solid rgba(56,189,248,0.12);
          padding: 8px 12px 12px;
          z-index: 999;
          flex-direction: column;
          gap: 3px;
          max-height: calc(100vh - 52px);
          overflow-y: auto;
        }
        [data-theme="light"] .mobile-menu {
          background: rgba(255,255,255,0.98);
          border-bottom: 1px solid rgba(0,0,0,0.1);
        }
        .mobile-menu.open { display: flex; }
        .mobile-menu-link {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px; border-radius: 8px; color: #94a3b8;
          text-decoration: none; font-size: 14px; font-weight: 500;
          transition: background .12s, color .12s;
        }
        [data-theme="light"] .mobile-menu-link { color: #334155; }
        .mobile-menu-link:hover, .mobile-menu-link.active { background: rgba(255,255,255,0.07); color: #f1f5f9; }
        [data-theme="light"] .mobile-menu-link:hover, 
        [data-theme="light"] .mobile-menu-link.active { 
          background: rgba(0,0,0,0.05); 
          color: #0f172a; 
        }
        .mobile-menu-divider { border-top: 1px solid #1e2130; margin: 6px 0; }
        [data-theme="light"] .mobile-menu-divider { border-top: 1px solid #e2e8f0; }
        .layout { padding-top: 52px; display: flex; flex-direction: column; min-height: 100vh; }
        .content { flex: 1; padding: 0; display: flex; justify-content: center; }
        @media (max-width: 1100px) {
          .topnav-links { display: none; }
          .topnav-right .horario-dropdown-wrap { display: none; }
          .hamburger { display: flex; }
          .busca-global-wrap { display: none; }
          .backup-btn-wrapper { display: none; } /* Esconde backup no mobile */
        }
        @media (max-width: 600px) {
          .topnav-right .bot-pill span:not(.dot) { display: none; }
          .topnav-logo-sub { display: none; }
        }
      `}</style>

      <nav className="topnav">
        <NavLink to="/" className="topnav-logo">
          <span className="topnav-logo-icon">📡</span>
          <div>
            <div className="topnav-logo-text">JMENET</div>
            <div className="topnav-logo-sub">Painel</div>
          </div>
        </NavLink>

        <div className="busca-global-wrap">
          <BuscaGlobal />
        </div>

        <div className="topnav-links">
          {NAV_MAIN.map((item) => {
            if (item.submenu) {
              const isActive = location.pathname === "/clientes";
              return (
                <div key={item.label} className="nav-item-wrap">
                  <NavLink to="/clientes" className={`topnav-link ${isActive ? "active-link" : ""}`}>
                    <span className="nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                    <span className="nav-arrow">▾</span>
                  </NavLink>
                  <div className="nav-dropdown">
                    {item.submenu.map((sub, i) => (
                      <React.Fragment key={i}>
                        {sub.divider && <div className="nav-dropdown-divider" />}
                        <NavLink to={sub.to} className="nav-dropdown-item">
                          {sub.label}
                        </NavLink>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) =>
                  `topnav-link ${isActive ? "active-link" : ""}`
                }
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>

        <div className="topnav-more-wrap" style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setMaisAberto((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 11px",
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 500,
              color: maisAberto ? "#f1f5f9" : "#94a3b8",
              background: maisAberto ? "rgba(255,255,255,0.07)" : "transparent",
              border: "none",
              cursor: "pointer",
              height: 32,
              whiteSpace: "nowrap"
            }}
          >
            Mais <span style={{ fontSize: 9, marginLeft: 1 }}>▾</span>
          </button>
          {maisAberto && (
            <>
              <div
                onClick={() => setMaisAberto(false)}
                style={{ position: "fixed", inset: 0, zIndex: 9998 }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 6,
                  minWidth: 190,
                  background: "#0f1117",
                  border: "1px solid rgba(56,189,248,0.2)",
                  borderRadius: 10,
                  padding: 6,
                  boxShadow: "0 16px 48px rgba(0,0,0,0.8)",
                  zIndex: 9999,
                  animation: "dropDown .18s ease forwards",
                  transformOrigin: "top center"
                }}
              >
                {NAV_MAIS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className="nav-dropdown-item"
                    onClick={() => setMaisAberto(false)}
                  >
                    <span style={{ marginRight: 8 }}>{item.icon}</span>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="topnav-right">
          {/* ===== NOVO: Botão de Backup ===== */}
          <div className="backup-btn-wrapper">
            <BackupButton />
          </div>

          {/* NOTIFICATION BELL */}
          <NotificationBell />

          {/* THEME TOGGLE */}
          <button 
            className="theme-toggle" 
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          <div className="horario-dropdown-wrap">
            <button className="horario-pill" style={{ color: "#fbbf24" }}>
              📬 {horarioCobranca ? `${horarioCobranca.inicio}h–${horarioCobranca.fim}h` : "8h–17h"}
            </button>
            <div className="horario-dropdown">
              <div className="h-toggle-row">
                <span className="h-toggle-label">📬 Horário de Cobrança</span>
              </div>
              {editCobranca ? (
                <>
                  <div className="h-row">
                    <label>Início</label>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={cInicio}
                      onChange={(e) => setCInicio(e.target.value)}
                      className="h-input"
                    />
                  </div>
                  <div className="h-row">
                    <label>Fim</label>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={cFim}
                      onChange={(e) => setCFim(e.target.value)}
                      className="h-input"
                    />
                  </div>
                  <div className="h-btns">
                    <button className="h-btn-save" onClick={salvarCobranca}>
                      Salvar
                    </button>
                    <button className="h-btn-cancel" onClick={() => setEditCobranca(false)}>
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <button
                  className="h-btn-edit"
                  onClick={() => {
                    setCInicio(horarioCobranca?.inicio ?? 8);
                    setCFim(horarioCobranca?.fim ?? 17);
                    setEditCobranca(true);
                  }}
                >
                  ✏️ Alterar horário
                </button>
              )}
            </div>
          </div>

          <div className="horario-dropdown-wrap">
            <button className="horario-pill">
              ⏰ {horario?.ativo ? `${horario.inicio}h–${horario.fim}h` : "24h"}
            </button>
            <div className="horario-dropdown">
              <div className="h-toggle-row">
                <span className="h-toggle-label">⏰ Horário de Atendimento</span>
                <button
                  className={`h-toggle-btn ${horario?.ativo ? "h-on" : "h-off"}`}
                  onClick={toggleHorario}
                >
                  {horario?.ativo ? "Ativo" : "24h"}
                </button>
              </div>
              {horario?.ativo &&
                (editHorario ? (
                  <>
                    <div className="h-row">
                      <label>Início</label>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={hInicio}
                        onChange={(e) => setHInicio(e.target.value)}
                        className="h-input"
                      />
                    </div>
                    <div className="h-row">
                      <label>Fim</label>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={hFim}
                        onChange={(e) => setHFim(e.target.value)}
                        className="h-input"
                      />
                    </div>
                    <div className="h-btns">
                      <button className="h-btn-save" onClick={salvarHorario}>
                        Salvar
                      </button>
                      <button className="h-btn-cancel" onClick={() => setEditHorario(false)}>
                        Cancelar
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    className="h-btn-edit"
                    onClick={() => {
                      setHInicio(horario?.inicio ?? 8);
                      setHFim(horario?.fim ?? 20);
                      setEditHorario(true);
                    }}
                  >
                    ✏️ Alterar horário
                  </button>
                ))}
            </div>
          </div>

          <button className="bot-pill" onClick={onToggle}>
            <span className={`dot ${botAtivo ? "dot-on" : "dot-off"}`} />
            <span style={{ color: botAtivo ? "#4ade80" : "#ef4444" }}>
              Auto. {botAtivo ? "On" : "Off"}
            </span>
          </button>
        </div>

        <button className="hamburger" onClick={() => setMobileOpen((o) => !o)}>
          {mobileOpen ? "✕" : "☰"}
        </button>
      </nav>

      <div className={`mobile-menu ${mobileOpen ? "open" : ""}`}>
        {[...NAV_MAIN, ...NAV_MAIS].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) => `mobile-menu-link ${isActive ? "active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
        <div className="mobile-menu-divider" />
        <NavLink
          to="/clientes"
          className="mobile-menu-link"
          onClick={() => setMobileOpen(false)}
        >
          <span>👥</span>
          <span>Clientes</span>
        </NavLink>
      </div>
    </>
  );
};