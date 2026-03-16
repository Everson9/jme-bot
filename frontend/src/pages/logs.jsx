import React, { useState } from 'react';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from '../components/Pagination';

export function PageLogs() {
    const [filtroTipo, setFiltroTipo] = useState('');
    const [filtroNumero, setFiltroNumero] = useState('');
    
    const fetchLogs = async (page, pageSize) => {
        let url = `/api/logs/paginados?page=${page}&limit=${pageSize}`;
        if (filtroTipo) url += `&tipo=${filtroTipo}`;
        if (filtroNumero) url += `&numero=${encodeURIComponent(filtroNumero)}`;
        
        const response = await fetch(url);
        return await response.json();
    };

    const { 
        data: logs, 
        loading, 
        currentPage, 
        totalPages, 
        setCurrentPage,
        refresh
    } = usePagination(fetchLogs, 50);

    return (
        <div className="page">
            <h1 className="page-title">📜 Logs do Sistema</h1>
            
            <div style={{ 
                display: 'flex', 
                gap: '10px', 
                marginBottom: '1.5rem',
                flexWrap: 'wrap'
            }}>
                <input
                    type="text"
                    className="busca-input"
                    placeholder="Filtrar por número..."
                    value={filtroNumero}
                    onChange={(e) => setFiltroNumero(e.target.value)}
                    style={{ flex: 1 }}
                />
                
                <select 
                    className="busca-input" 
                    style={{ width: '150px' }}
                    value={filtroTipo}
                    onChange={(e) => setFiltroTipo(e.target.value)}
                >
                    <option value="">Todos os tipos</option>
                    <option value="entrada">Entrada</option>
                    <option value="decisao">Decisão</option>
                    <option value="erro">Erro</option>
                    <option value="classificacao">Classificação</option>
                </select>

                <button onClick={refresh} className="btn-save">
                    🔍 Filtrar
                </button>
            </div>

            <div className="card">
                {loading ? (
                    <div className="spinner-wrap"><div className="spinner"></div></div>
                ) : (
                    <>
                        <div className="tabela-scroll">
                            <table className="tabela">
                                <thead>
                                    <tr>
                                        <th>Data/Hora</th>
                                        <th>Número</th>
                                        <th>Direção</th>
                                        <th>Tipo</th>
                                        <th>Intenção</th>
                                        <th>Conteúdo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="td-empty">
                                                Nenhum log encontrado
                                            </td>
                                        </tr>
                                    ) : (
                                        logs.map(log => (
                                            <tr key={log.id}>
                                                <td>{new Date(log.criado_em).toLocaleString()}</td>
                                                <td className="td-mono">{log.numero}</td>
                                                <td>
                                                    <span className={`badge badge-${
                                                        log.direcao === 'entrada' ? 'pendente' : 'pago'
                                                    }`}>
                                                        {log.direcao}
                                                    </span>
                                                </td>
                                                <td>{log.tipo}</td>
                                                <td>{log.intencao || '-'}</td>
                                                <td>{log.conteudo?.substring(0, 50)}...</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        
                        <Pagination 
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={setCurrentPage}
                        />
                    </>
                )}
            </div>
        </div>
    );
}