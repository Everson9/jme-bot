// pages/BackupPage.jsx
import React, { useState, useEffect } from 'react';
import { FiExternalLink, FiInfo, FiClock } from 'react-icons/fi';

export default function BackupPage() {
  const [backupInfo, setBackupInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBackupInfo();
  }, []);

  const fetchBackupInfo = async () => {
    try {
      const res = await fetch('/api/admin/backup-info');
      const data = await res.json();
      setBackupInfo(data);
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  const abrirConsoleFirebase = () => {
    const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID || 'SEU-PROJETO';
    window.open(`https://console.firebase.google.com/project/${projectId}/firestore/backups`, '_blank');
  };

  if (loading) {
    return <div className="text-center py-8">Carregando...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Gerenciamento de Backup</h1>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-start mb-4">
          <div className="bg-green-100 p-3 rounded-full mr-4">
            <FiInfo className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-2">Backup Automático Ativo</h2>
            <p className="text-gray-600">
              Seu banco de dados está sendo backup automático pelo Google Firebase.
              Não é necessário fazer backup manual.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="border rounded-lg p-4">
            <h3 className="font-medium mb-2 flex items-center">
              <FiClock className="mr-2 text-blue-600" />
              Frequência
            </h3>
            <p className="text-gray-600">Backups diários automáticos</p>
          </div>
          
          <div className="border rounded-lg p-4">
            <h3 className="font-medium mb-2">Retenção</h3>
            <p className="text-gray-600">Histórico de até 30 dias</p>
          </div>
        </div>

        <div className="mt-6 bg-blue-50 p-4 rounded-lg">
          <p className="text-sm text-blue-800 mb-3">
            <strong>Para restaurar um backup:</strong> Acesse o Console do Firebase e vá para 
            Firestore → Backups. Lá você pode visualizar e restaurar qualquer backup automático.
          </p>
          
          <button
            onClick={abrirConsoleFirebase}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <FiExternalLink className="mr-2" />
            Abrir Console Firebase
          </button>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="font-medium mb-4">Informações do Firebase</h3>
        {backupInfo && (
          <div className="space-y-2 text-sm">
            <p><strong>Projeto:</strong> {backupInfo.projectId || 'Configurar no .env'}</p>
            <p><strong>Status:</strong> <span className="text-green-600">✓ Backup automático ativo</span></p>
            <p><strong>Instruções:</strong> {backupInfo.instrucoes}</p>
          </div>
        )}
      </div>
    </div>
  );
}