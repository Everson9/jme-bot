// src/components/BackupButton.jsx
import React, { useState } from 'react';
import { FiDownloadCloud, FiExternalLink, FiInfo } from 'react-icons/fi';

const API = import.meta.env.VITE_API_URL || "";
const FIREBASE_PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID || "jme-bot";

export const BackupButton = () => {
  const [showInfo, setShowInfo] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleBackupClick = async () => {
    setLoading(true);
    try {
      // Tenta fazer backup (vai retornar info)
      const res = await fetch(`${API}/api/admin/backup-info`);
      const data = await res.json();
      
      // Abre modal com informações
      setShowInfo(true);
    } catch (error) {
      console.error('Erro ao verificar backup:', error);
    } finally {
      setLoading(false);
    }
  };

  const abrirConsoleFirebase = () => {
    window.open(
      `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/firestore/backups`,
      '_blank'
    );
  };

  const abrirDocumentacao = () => {
    window.open(
      'https://firebase.google.com/docs/firestore/backups',
      '_blank'
    );
  };

  return (
    <>
      <button
        onClick={handleBackupClick}
        disabled={loading}
        className="backup-btn"
        title="Gerenciar backups automáticos"
      >
        <FiDownloadCloud />
        <span>{loading ? '...' : 'Backup'}</span>
      </button>

      {/* Modal informativo */}
      {showInfo && (
        <div className="backup-modal-overlay" onClick={() => setShowInfo(false)}>
          <div className="backup-modal" onClick={e => e.stopPropagation()}>
            <div className="backup-modal-header">
              <FiInfo className="backup-modal-icon" />
              <h3>Backup Automático</h3>
              <button 
                className="backup-modal-close"
                onClick={() => setShowInfo(false)}
              >
                ✕
              </button>
            </div>
            
            <div className="backup-modal-body">
              <div className="backup-info-badge">
                <span className="badge-green">●</span>
                Ativo e Automático
              </div>

              <p className="backup-description">
                ✅ Seu sistema agora usa <strong>backup automático do Firebase</strong>! 
                Não é mais necessário fazer backup manual.
              </p>

              <div className="backup-features">
                <div className="backup-feature">
                  <span className="feature-icon">📅</span>
                  <div>
                    <strong>Diário</strong>
                    <small>Backups automáticos todos os dias</small>
                  </div>
                </div>
                <div className="backup-feature">
                  <span className="feature-icon">🔄</span>
                  <div>
                    <strong>Retenção</strong>
                    <small>Histórico de até 30 dias</small>
                  </div>
                </div>
                <div className="backup-feature">
                  <span className="feature-icon">⚡</span>
                  <div>
                    <strong>Restauração</strong>
                    <small>Recuperação com 1 clique</small>
                  </div>
                </div>
                <div className="backup-feature">
                  <span className="feature-icon">🔒</span>
                  <div>
                    <strong>Segurança</strong>
                    <small>Gerenciado pelo Google</small>
                  </div>
                </div>
              </div>

              <div className="backup-project-info">
                <strong>Projeto Firebase:</strong> {FIREBASE_PROJECT_ID}
              </div>
            </div>

            <div className="backup-modal-footer">
              <button
                onClick={abrirDocumentacao}
                className="backup-btn-secondary"
              >
                <FiExternalLink className="mr-1" />
                Documentação
              </button>
              <button
                onClick={abrirConsoleFirebase}
                className="backup-btn-primary"
              >
                <FiExternalLink className="mr-1" />
                Acessar Console Firebase
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
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
          white-space: nowrap;
        }
        [data-theme="light"] .backup-btn {
          background: rgba(0,0,0,0.05);
          border: 1px solid rgba(0,0,0,0.1);
          color: #334155;
        }
        .backup-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.1);
          color: #f1f5f9;
        }
        [data-theme="light"] .backup-btn:hover:not(:disabled) {
          background: rgba(0,0,0,0.1);
          color: #0f172a;
        }
        .backup-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .backup-btn svg {
          font-size: 14px;
        }

        /* Modal Overlay */
        .backup-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          animation: fadeIn 0.2s ease;
        }

        /* Modal */
        .backup-modal {
          background: #0f1117;
          border: 1px solid rgba(56,189,248,0.2);
          border-radius: 16px;
          width: 90%;
          max-width: 500px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.8);
          animation: slideUp 0.3s ease;
        }
        [data-theme="light"] .backup-modal {
          background: #ffffff;
          border: 1px solid rgba(0,0,0,0.1);
        }

        /* Modal Header */
        .backup-modal-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        [data-theme="light"] .backup-modal-header {
          border-bottom: 1px solid rgba(0,0,0,0.08);
        }
        .backup-modal-header h3 {
          margin: 0;
          flex: 1;
          font-size: 18px;
          font-weight: 600;
          color: #f1f5f9;
        }
        [data-theme="light"] .backup-modal-header h3 {
          color: #0f172a;
        }
        .backup-modal-icon {
          color: #38bdf8;
          width: 24px;
          height: 24px;
        }
        .backup-modal-close {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          color: #64748b;
          padding: 4px 8px;
          border-radius: 6px;
          transition: all .15s;
        }
        .backup-modal-close:hover {
          background: rgba(255,255,255,0.08);
          color: #f1f5f9;
        }
        [data-theme="light"] .backup-modal-close:hover {
          background: rgba(0,0,0,0.05);
          color: #0f172a;
        }

        /* Modal Body */
        .backup-modal-body {
          padding: 24px;
        }
        .backup-info-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          background: rgba(34,197,94,0.1);
          border: 1px solid rgba(34,197,94,0.2);
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          color: #4ade80;
          margin-bottom: 16px;
        }
        .badge-green {
          color: #4ade80;
          font-size: 14px;
        }
        .backup-description {
          color: #94a3b8;
          font-size: 14px;
          line-height: 1.6;
          margin-bottom: 24px;
        }
        [data-theme="light"] .backup-description {
          color: #334155;
        }
        .backup-description strong {
          color: #f1f5f9;
        }
        [data-theme="light"] .backup-description strong {
          color: #0f172a;
        }

        /* Features Grid */
        .backup-features {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        .backup-feature {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px;
          background: rgba(255,255,255,0.03);
          border-radius: 12px;
        }
        [data-theme="light"] .backup-feature {
          background: rgba(0,0,0,0.02);
        }
        .feature-icon {
          font-size: 20px;
          line-height: 1;
        }
        .backup-feature div {
          flex: 1;
        }
        .backup-feature strong {
          display: block;
          color: #f1f5f9;
          font-size: 13px;
          margin-bottom: 2px;
        }
        [data-theme="light"] .backup-feature strong {
          color: #0f172a;
        }
        .backup-feature small {
          color: #64748b;
          font-size: 11px;
          line-height: 1.4;
          display: block;
        }

        /* Project Info */
        .backup-project-info {
          padding: 12px;
          background: rgba(56,189,248,0.05);
          border: 1px solid rgba(56,189,248,0.1);
          border-radius: 8px;
          font-size: 12px;
          color: #94a3b8;
        }
        .backup-project-info strong {
          color: #38bdf8;
          margin-right: 8px;
        }

        /* Modal Footer */
        .backup-modal-footer {
          display: flex;
          gap: 12px;
          padding: 20px 24px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        [data-theme="light"] .backup-modal-footer {
          border-top: 1px solid rgba(0,0,0,0.08);
        }
        .backup-btn-primary, .backup-btn-secondary {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all .15s;
          border: none;
        }
        .backup-btn-primary {
          background: #38bdf8;
          color: #0f172a;
        }
        .backup-btn-primary:hover {
          background: #0ea5e9;
          transform: translateY(-1px);
        }
        .backup-btn-secondary {
          background: rgba(255,255,255,0.05);
          color: #94a3b8;
          border: 1px solid rgba(255,255,255,0.08);
        }
        [data-theme="light"] .backup-btn-secondary {
          background: rgba(0,0,0,0.03);
          color: #334155;
          border: 1px solid rgba(0,0,0,0.08);
        }
        .backup-btn-secondary:hover {
          background: rgba(255,255,255,0.1);
          color: #f1f5f9;
        }
        [data-theme="light"] .backup-btn-secondary:hover {
          background: rgba(0,0,0,0.05);
          color: #0f172a;
        }
        .mr-1 {
          margin-right: 4px;
        }

        /* Animações */
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Mobile */
        @media (max-width: 640px) {
          .backup-features {
            grid-template-columns: 1fr;
          }
          .backup-modal-footer {
            flex-direction: column;
          }
        }
      `}</style>
    </>
  );
};