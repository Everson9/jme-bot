import React, { useState, useEffect } from 'react';
import { useFetch } from '../hooks/useFetch';
import { Pagination } from '../components/Pagination';

const API = import.meta.env.VITE_API_URL || "";

export function PageAgendamentos() {
    const [filtroData, setFiltroData] = useState('todos');
    const [filtroStatus, setFiltroStatus] = useState('todos');
    const [agendamentos, setAgendamentos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const pageSize = 20;

    useEffect(() => {
        fetchAgendamentos();
    }, [filtroData, filtroStatus]);

    const fetchAgendamentos = async () => {
        setLoading(true);
        try {
            const url = `/api/agendamentos?data=${filtroData}&status=${filtroStatus}`;
            const response = await fetch(url);
            const data = await response.json();
            setAgendamentos(data);
            setTotalPages(Math.ceil(data.length / pageSize));
            setCurrentPage(1);
        } catch (error) {
            console.error('Erro ao buscar agendamentos:', error);
        } finally {
            setLoading(false);
        }
    };

    const { data: disponibilidade } = useFetch('/api/agendamentos/disponibilidade');

    async function concluirAgendamento(id) {
        if (confirm('Marcar como concluído?')) {
            await fetch(API + `/api/agendamentos/${id}/concluir`, { method: 'POST' });
            fetchAgendamentos();
        }
    }

    async function cancelarAgendamento(id) {
        if (confirm('Cancelar este agendamento?')) {
            await fetch(API + `/api/agendamentos/${id}/cancelar`, { method: 'POST' });
            fetchAgendamentos();
        }
    }

    function getPeriodoLabel(periodo) {
        const labels = {
            manha: { icon: '🌅', text: 'Manhã', time: '8h às 12h' },
            tarde: { icon: '☀️', text: 'Tarde', time: '13h às 17h' }
        };
        return labels[periodo] || { icon: '❓', text: periodo, time: '' };
    }

    // Paginação manual
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const agendamentosPaginados = agendamentos.slice(startIndex, endIndex);

    return (
        <div className="page">
            <h1 className="page-title">📅 Agendamentos</h1>
            
            <div className="base-kpis">
                <div className="base-kpi">
                    <span className="bk-val">{disponibilidade?.hoje || 0}</span>
                    <span className="bk-label">Hoje</span>
                </div>
                <div className="base-kpi">
                    <span className="bk-val">{disponibilidade?.amanha || 0}</span>
                    <span className="bk-label">Amanhã</span>
                </div>
                <div className="base-kpi">
                    <span className="bk-val">{disponibilidade?.semana || 0}</span>
                    <span className="bk-label">Próximos 7 dias</span>
                </div>
            </div>

            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                marginBottom: '1.5rem',
                flexWrap: 'wrap',
                gap: '10px'
            }}>
                <div className="filtro-group">
                    <button 
                        className={`filtro-btn ${filtroData === 'todos' ? 'filtro-ativo' : ''}`}
                        onClick={() => setFiltroData('todos')}
                    >Todos</button>
                    <button 
                        className={`filtro-btn ${filtroData === 'hoje' ? 'filtro-ativo' : ''}`}
                        onClick={() => setFiltroData('hoje')}
                    >Hoje</button>
                    <button 
                        className={`filtro-btn ${filtroData === 'amanha' ? 'filtro-ativo' : ''}`}
                        onClick={() => setFiltroData('amanha')}
                    >Amanhã</button>
                    <button 
                        className={`filtro-btn ${filtroData === 'semana' ? 'filtro-ativo' : ''}`}
                        onClick={() => setFiltroData('semana')}
                    >Próximos 7 dias</button>
                </div>

                <select 
                    className="busca-input" 
                    style={{ width: '150px' }}
                    value={filtroStatus}
                    onChange={(e) => setFiltroStatus(e.target.value)}
                >
                    <option value="todos">Todos os status</option>
                    <option value="agendado">Agendado</option>
                    <option value="concluido">Concluído</option>
                    <option value="cancelado">Cancelado</option>
                </select>
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
                                        <th>Data</th>
                                        <th>Período</th>
                                        <th>Cliente</th>
                                        <th>Telefone</th>
                                        <th>Endereço</th>
                                        <th>Status</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {agendamentosPaginados.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="td-empty">
                                                Nenhum agendamento encontrado
                                            </td>
                                        </tr>
                                    ) : (
                                        agendamentosPaginados.map(ag => {
                                            const periodo = getPeriodoLabel(ag.periodo);
                                            return (
                                                <tr key={ag.id}>
                                                    <td>{new Date(ag.data).toLocaleDateString()}</td>
                                                    <td>{periodo.icon} {periodo.text}</td>
                                                    <td className="td-nome">{ag.cliente_nome}</td>
                                                    <td className="td-mono">{ag.numero.replace('@c.us', '')}</td>
                                                    <td>{ag.endereco}</td>
                                                    <td>
                                                        <span className={`badge badge-${
                                                            ag.status === 'concluido' ? 'pago' : 
                                                            ag.status === 'cancelado' ? 'vencida' : 'pendente'
                                                        }`}>
                                                            {ag.status}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {ag.status === 'agendado' && (
                                                            <>
                                                                <button 
                                                                    className="btn-icon"
                                                                    onClick={() => concluirAgendamento(ag.id)}
                                                                    style={{ marginRight: '8px' }}
                                                                    title="Concluir"
                                                                >✅</button>
                                                                <button 
                                                                    className="btn-icon"
                                                                    onClick={() => cancelarAgendamento(ag.id)}
                                                                    title="Cancelar"
                                                                >❌</button>
                                                            </>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
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