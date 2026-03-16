import React, { useState } from 'react';
import { useFetch } from '../hooks/useFetch';

const API = import.meta.env.VITE_API_URL || "";

export function PageNovos() {
    const [abaAtiva, setAbaAtiva] = useState('solicitacoes'); // 'solicitacoes' ou 'agendadas'
    const [filtroStatus, setFiltroStatus] = useState('todos');
    
    // Dados das solicitações de instalação (novos_clientes)
    const { data: solicitacoes, loading: loadingSolic, refetch: refetchSolic } = useFetch(
        `/api/instalacoes?status=${filtroStatus === 'todos' ? '' : filtroStatus}`
    );
    
    // Dados das instalações agendadas
    const { data: agendadas, loading: loadingAgend, refetch: refetchAgend } = useFetch(
        `/api/instalacoes-agendadas?status=${filtroStatus === 'todos' ? '' : filtroStatus}`
    );

    async function confirmarInstalacao(id) {
        if (confirm('Confirmar esta instalação? O cliente será adicionado à base.')) {
            const response = await fetch(API + `/api/instalacoes-agendadas/${id}/confirmar`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.ok) {
                alert('✅ Cliente adicionado à base com sucesso!');
                refetchAgend();
                refetchSolic(); // Atualiza também as solicitações se necessário
            } else {
                alert('❌ Erro: ' + data.erro);
            }
        }
    }

    async function concluirInstalacao(id) {
        if (confirm('Marcar instalação como concluída?')) {
            await fetch(API + `/api/instalacoes-agendadas/${id}/concluir`, { method: 'POST' });
            refetchAgend();
        }
    }

    async function cancelarInstalacao(id) {
        if (confirm('Cancelar esta instalação?')) {
            await fetch(API + `/api/instalacoes-agendadas/${id}/cancelar`, { method: 'POST' });
            refetchAgend();
        }
    }

    async function finalizarSolicitacao(id) {
        if (confirm('Finalizar esta solicitação? O cliente será adicionado à base.')) {
            await fetch(API + `/api/instalacoes/${id}/finalizar`, { method: 'POST' });
            refetchSolic();
        }
    }

    async function confirmarSolicitacao(id) {
        if (confirm('Confirmar esta solicitação?')) {
            await fetch(API + `/api/instalacoes/${id}/confirmar`, { method: 'POST' });
            refetchSolic();
        }
    }

    return (
        <div className="page">
            <h1 className="page-title">🔧 Instalações</h1>
            
            {/* Abas */}
            <div style={{ 
                display: 'flex', 
                gap: '10px', 
                marginBottom: '1.5rem', 
                borderBottom: '1px solid var(--border)',
                paddingBottom: '2px'
            }}>
                <button
                    className={`filtro-btn ${abaAtiva === 'solicitacoes' ? 'filtro-ativo' : ''}`}
                    onClick={() => setAbaAtiva('solicitacoes')}
                    style={{ 
                        fontSize: '14px', 
                        padding: '8px 16px', 
                        borderRadius: '8px 8px 0 0',
                        borderBottom: abaAtiva === 'solicitacoes' ? '2px solid var(--blue)' : 'none'
                    }}
                >
                    📋 Solicitações {solicitacoes?.length ? `(${solicitacoes.length})` : ''}
                </button>
                <button
                    className={`filtro-btn ${abaAtiva === 'agendadas' ? 'filtro-ativo' : ''}`}
                    onClick={() => setAbaAtiva('agendadas')}
                    style={{ 
                        fontSize: '14px', 
                        padding: '8px 16px', 
                        borderRadius: '8px 8px 0 0',
                        borderBottom: abaAtiva === 'agendadas' ? '2px solid var(--blue)' : 'none'
                    }}
                >
                    📅 Agendadas {agendadas?.length ? `(${agendadas.length})` : ''}
                </button>
            </div>

            {/* Filtro de status */}
            <div style={{ marginBottom: '1.5rem' }}>
                <select 
                    className="busca-input" 
                    style={{ width: '200px' }}
                    value={filtroStatus}
                    onChange={(e) => setFiltroStatus(e.target.value)}
                >
                    <option value="todos">Todos os status</option>
                    {abaAtiva === 'solicitacoes' ? (
                        <>
                            <option value="solicitado">Solicitado</option>
                            <option value="confirmado">Confirmado</option>
                            <option value="finalizado">Finalizado</option>
                        </>
                    ) : (
                        <>
                            <option value="agendado">Agendado</option>
                            <option value="confirmado">Confirmado</option>
                            <option value="concluido">Concluído</option>
                            <option value="cancelado">Cancelado</option>
                        </>
                    )}
                </select>
            </div>

            {/* Conteúdo das abas */}
            <div className="card">
                {abaAtiva === 'solicitacoes' ? (
                    // =====================================================
                    // TABELA DE SOLICITAÇÕES (novos_clientes)
                    // =====================================================
                    loadingSolic ? (
                        <div className="spinner-wrap"><div className="spinner"></div></div>
                    ) : (
                        <div className="tabela-scroll">
                            <table className="tabela">
                                <thead>
                                    <tr>
                                        <th>Solicitado em</th>
                                        <th>Cliente</th>
                                        <th>Telefone</th>
                                        <th>Plano</th>
                                        <th>Roteador</th>
                                        <th>Endereço</th>
                                        <th>Disponibilidade</th>
                                        <th>Status</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {solicitacoes?.length === 0 ? (
                                        <tr><td colSpan="9" className="td-empty">Nenhuma solicitação encontrada</td></tr>
                                    ) : (
                                        solicitacoes?.map(s => (
                                            <tr key={s.id}>
                                                <td>{new Date(s.cadastrado_em).toLocaleDateString()}</td>
                                                <td className="td-nome">{s.nome}</td>
                                                <td className="td-mono">{s.telefone || s.numero?.replace('@c.us', '')}</td>
                                                <td>{s.plano}</td>
                                                <td>{s.roteador}</td>
                                                <td>{s.endereco}</td>
                                                <td>{s.disponibilidade}</td>
                                                <td>
                                                    <span className={`badge badge-${
                                                        s.status === 'finalizado' ? 'pago' : 
                                                        s.status === 'confirmado' ? 'promessa' : 'pendente'
                                                    }`}>
                                                        {s.status}
                                                    </span>
                                                </td>
                                                <td>
                                                    {s.status === 'solicitado' && (
                                                        <button 
                                                            className="btn-icon"
                                                            onClick={() => confirmarSolicitacao(s.id)}
                                                            style={{ marginRight: '8px' }}
                                                            title="Confirmar solicitação"
                                                        >✅ Confirmar</button>
                                                    )}
                                                    {s.status === 'confirmado' && (
                                                        <button 
                                                            className="btn-icon"
                                                            onClick={() => finalizarSolicitacao(s.id)}
                                                            title="Finalizar instalação"
                                                        >🏁 Finalizar</button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : (
                    // =====================================================
                    // TABELA DE AGENDAMENTOS (instalacoes_agendadas)
                    // =====================================================
                    loadingAgend ? (
                        <div className="spinner-wrap"><div className="spinner"></div></div>
                    ) : (
                        <div className="tabela-scroll">
                            <table className="tabela">
                                <thead>
                                    <tr>
                                        <th>Data Agendada</th>
                                        <th>Cliente</th>
                                        <th>Telefone</th>
                                        <th>Endereço</th>
                                        <th>Observação</th>
                                        <th>Status</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {agendadas?.length === 0 ? (
                                        <tr><td colSpan="7" className="td-empty">Nenhuma instalação agendada</td></tr>
                                    ) : (
                                        agendadas?.map(inst => (
                                            <tr key={inst.id}>
                                                <td>{new Date(inst.data).toLocaleDateString()}</td>
                                                <td className="td-nome">{inst.nome}</td>
                                                <td className="td-mono">{inst.numero.replace('@c.us', '')}</td>
                                                <td>{inst.endereco}</td>
                                                <td>{inst.observacao || '-'}</td>
                                                <td>
                                                    <span className={`badge badge-${
                                                        inst.status === 'concluido' ? 'pago' : 
                                                        inst.status === 'cancelado' ? 'vencida' : 
                                                        inst.status === 'confirmado' ? 'promessa' : 'pendente'
                                                    }`}>
                                                        {inst.status}
                                                    </span>
                                                </td>
                                                <td>
                                                    {inst.status === 'agendado' && (
                                                        <>
                                                            <button 
                                                                className="btn-icon"
                                                                onClick={() => confirmarInstalacao(inst.id)}
                                                                style={{ marginRight: '8px' }}
                                                                title="Confirmar (adicionar à base)"
                                                            >✅ Confirmar</button>
                                                            <button 
                                                                className="btn-icon"
                                                                onClick={() => cancelarInstalacao(inst.id)}
                                                                title="Cancelar agendamento"
                                                            >❌ Cancelar</button>
                                                        </>
                                                    )}
                                                    {inst.status === 'confirmado' && (
                                                        <button 
                                                            className="btn-icon"
                                                            onClick={() => concluirInstalacao(inst.id)}
                                                            title="Concluir instalação"
                                                        >🏁 Concluir</button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}