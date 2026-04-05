import React, { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || "";

export function PagePromessas() {
    const [filtroStatus, setFiltroStatus] = useState('pendente');
    const [promessas, setPromessas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');

    useEffect(() => {
        carregarPromessas();
    }, [filtroStatus]);

    const carregarPromessas = async () => {
        setLoading(true);
        setErro('');
        try {
            const url = `${API}/api/promessas${filtroStatus !== 'todos' ? `?status=${filtroStatus}` : ''}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            setPromessas(data);
        } catch (error) {
            console.error('Erro ao carregar promessas:', error);
            setErro('Falha ao carregar promessas. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    async function marcarPago(id) {
        if (!confirm('Confirmar pagamento desta promessa?')) return;
        
        try {
            const response = await fetch(API + `/api/promessas/${id}/pago`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await response.json();
            
            if (data.ok) {
                alert('✅ Pagamento confirmado! O status do cliente foi atualizado.');
                carregarPromessas(); // Recarrega a lista
            } else {
                alert('❌ Erro: ' + (data.erro || 'Erro desconhecido'));
            }
        } catch (error) {
            alert('Erro ao conectar com o servidor');
            console.error(error);
        }
    }

    async function cancelarPromessa(id) {
        if (!confirm('Cancelar esta promessa?')) return;
        
        try {
            const response = await fetch(API + `/api/promessas/${id}/cancelar`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await response.json();
            
            if (data.ok) {
                alert('✅ Promessa cancelada!');
                carregarPromessas();
            } else {
                alert('❌ Erro: ' + (data.erro || 'Erro desconhecido'));
            }
        } catch (error) {
            alert('Erro ao conectar com o servidor');
            console.error(error);
        }
    }

    const parseDataPromessa = (data) => {
        if (!data) return '-';
        // Se vier no formato DD/MM/YYYY
        if (data.includes('/')) {
            const [d, m, y] = data.split('/');
            return new Date(y, m - 1, d).toLocaleDateString('pt-BR');
        }
        // Se vier no formato YYYY-MM-DD
        if (data.includes('-')) {
            const [y, m, d] = data.split('-').map(Number);
            return new Date(y, m - 1, d).toLocaleDateString('pt-BR');
        }
        return new Date(data).toLocaleDateString('pt-BR');
    };

    const getStatusBadge = (status) => {
        switch(status) {
            case 'pago': return 'badge-pago';
            case 'cancelada': return 'badge-vencida';
            default: return 'badge-pendente';
        }
    };

    const getStatusLabel = (status) => {
        switch(status) {
            case 'pago': return 'Pago';
            case 'cancelada': return 'Cancelado';
            default: return 'Pendente';
        }
    };

    return (
        <div className="page">
            <h1 className="page-title">🤝 Promessas de Pagamento</h1>
            
            <div style={{ 
                display: 'flex', 
                gap: '10px', 
                marginBottom: '1.5rem',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap'
            }}>
                <div className="filtro-group">
                    <button 
                        className={`filtro-btn ${filtroStatus === 'todos' ? 'filtro-ativo' : ''}`}
                        onClick={() => setFiltroStatus('todos')}
                    >Todos</button>
                    <button 
                        className={`filtro-btn ${filtroStatus === 'pendente' ? 'filtro-ativo' : ''}`}
                        onClick={() => setFiltroStatus('pendente')}
                    >Pendentes</button>
                    <button 
                        className={`filtro-btn ${filtroStatus === 'pago' ? 'filtro-ativo' : ''}`}
                        onClick={() => setFiltroStatus('pago')}
                    >Pagas</button>
                    <button 
                        className={`filtro-btn ${filtroStatus === 'cancelada' ? 'filtro-ativo' : ''}`}
                        onClick={() => setFiltroStatus('cancelada')}
                    >Canceladas</button>
                </div>

                <button onClick={carregarPromessas} className="btn-save">
                    🔄 Atualizar
                </button>
            </div>

            <div className="card">
                {loading ? (
                    <div className="spinner-wrap"><div className="spinner"></div></div>
                ) : erro ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--red)' }}>
                        {erro}
                    </div>
                ) : (
                    <div className="tabela-scroll">
                        <table className="tabela">
                            <thead>
                                <tr>
                                    <th>Cliente</th>
                                    <th>Data Promessa</th>
                                    <th>Vencimento</th>
                                    <th>Base</th>
                                    <th>Status</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {promessas.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="td-empty">
                                            Nenhuma promessa encontrada
                                        </td>
                                    </tr>
                                ) : (
                                    promessas.map(p => (
                                        <tr key={p.id}>
                                            <td className="td-nome">{p.nome}</td>
                                            <td>{parseDataPromessa(p.data_promessa)}</td>
                                            <td>Dia {p.dia_vencimento || 'N/A'}</td>
                                            <td>{p.base_nome || 'N/A'}</td>
                                            <td>
                                                <span className={`badge ${getStatusBadge(p.status)}`}>
                                                    {getStatusLabel(p.status)}
                                                </span>
                                            </td>
                                            <td>
                                                {p.status === 'pendente' && (
                                                    <>
                                                        <button 
                                                            className="btn-icon"
                                                            onClick={() => marcarPago(p.id)}
                                                            style={{ marginRight: '8px' }}
                                                            title="Marcar como pago"
                                                        >💰 Pago</button>
                                                        <button 
                                                            className="btn-icon"
                                                            onClick={() => cancelarPromessa(p.id)}
                                                            title="Cancelar promessa"
                                                        >❌ Cancelar</button>
                                                    </>
                                                )}
                                                {p.status === 'pago' && (
                                                    <span style={{ color: 'var(--green)', fontSize: '12px' }}>
                                                        ✅ Pago em {parseDataPromessa(p.pago_em)}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}