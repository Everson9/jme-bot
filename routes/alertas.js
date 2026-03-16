// routes/alertas.js
module.exports = function setupRotasAlertas(app, ctx) {
    const { db } = ctx;

    // =====================================================
    // ROTA DE ALERTAS PARA NOTIFICAÇÕES
    // =====================================================
    app.get('/api/dashboard/alertas', (req, res) => {
        try {
            const hoje = new Date();
            const hojeStr = hoje.toISOString().split('T')[0];
            const amanha = new Date(hoje);
            amanha.setDate(amanha.getDate() + 1);
            const amanhaStr = amanha.toISOString().split('T')[0];
            
            // Função para converter data DD/MM/AAAA para YYYY-MM-DD
            const toDate = (d) => {
                if (!d) return null;
                const partes = d.split('/');
                if (partes.length === 3) {
                    return `${partes[2]}-${partes[1]}-${partes[0]}`;
                }
                return null;
            };
            
            // Promessas pendentes
            const promessas = db.prepare(`
                SELECT nome, numero, data_promessa 
                FROM promessas 
                WHERE status = 'pendente' AND notificado = 0 AND data_promessa IS NOT NULL
            `).all();
            
            const promessasHoje = promessas.filter(p => toDate(p.data_promessa) === hojeStr);
            const promessasAmanha = promessas.filter(p => toDate(p.data_promessa) === amanhaStr);
            
            // Inadimplentes (pendente + mais de 5 dias sem atualizar)
            const inadimplentes = db.prepare(`
                SELECT COUNT(*) as total 
                FROM clientes_base 
                WHERE status = 'pendente' AND julianday('now') - julianday(atualizado_em) > 5
            `).get().total;
            
            // Chamados abertos há mais de 24h
            const chamadosAbertos = db.prepare(`
                SELECT COUNT(*) as total 
                FROM chamados 
                WHERE status = 'aberto' AND (julianday('now') * 86400000) - aberto_em > 86400000
            `).get().total;
            
            // Novos agendamentos para hoje
            const agendamentosHoje = db.prepare(`
                SELECT COUNT(*) as total 
                FROM agendamentos 
                WHERE data = date('now') AND status = 'agendado'
            `).get().total;
            
            // Instalações agendadas para hoje
            const instalacoesHoje = db.prepare(`
                SELECT COUNT(*) as total 
                FROM instalacoes_agendadas 
                WHERE data = date('now') AND status = 'agendado'
            `).get().total;
            
            res.json({
                promessasHoje: promessasHoje.length,
                promessasAmanha: promessasAmanha.length,
                promessasHojeDetalhe: promessasHoje,
                inadimplentes,
                chamadosAbertos,
                agendamentosHoje,
                instalacoesHoje
            });
        } catch (error) {
            console.error('Erro ao buscar alertas:', error);
            res.status(500).json({ 
                promessasHoje: 0, 
                promessasAmanha: 0, 
                promessasHojeDetalhe: [],
                inadimplentes: 0, 
                chamadosAbertos: 0,
                agendamentosHoje: 0,
                instalacoesHoje: 0
            });
        }
    });

    // =====================================================
    // MARCAR NOTIFICAÇÕES COMO LIDAS (opcional)
    // =====================================================
    app.post('/api/notificacoes/marcar-lida', (req, res) => {
        try {
            const { tipo, id } = req.body;
            
            // Se for promessa, marca como notificada
            if (tipo === 'promessa' && id) {
                db.prepare(`
                    UPDATE promessas SET notificado = 1 WHERE id = ?
                `).run(id);
            }
            
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    // =====================================================
    // MARCAR TODAS COMO LIDAS
    // =====================================================
    app.post('/api/notificacoes/marcar-todas-lidas', (req, res) => {
        try {
            // Marca promessas de hoje como notificadas
            const hoje = new Date().toISOString().split('T')[0];
            
            db.prepare(`
                UPDATE promessas 
                SET notificado = 1 
                WHERE status = 'pendente' AND notificado = 0
            `).run();
            
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });
};