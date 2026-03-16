// routes/instalacoes-agendadas.js
module.exports = function setupRotasInstalacoesAgendadas(app, ctx) {
    const { db } = ctx;

    // Listar instalações agendadas
    app.get('/api/instalacoes-agendadas', (req, res) => {
        try {
            const { status } = req.query;
            let sql = 'SELECT * FROM instalacoes_agendadas WHERE 1=1';
            const params = [];
            
            if (status && status !== 'todos') {
                sql += ' AND status = ?';
                params.push(status);
            }
            
            sql += ' ORDER BY data ASC, criado_em DESC';
            
            const instalacoes = db.prepare(sql).all(...params);
            res.json(instalacoes);
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    // Confirmar instalação (e adicionar à base)
    app.post('/api/instalacoes-agendadas/:id/confirmar', (req, res) => {
        try {
            const instalacao = db.prepare('SELECT * FROM instalacoes_agendadas WHERE id = ?').get(req.params.id);
            
            if (!instalacao) {
                return res.status(404).json({ erro: 'Instalação não encontrada' });
            }
            
            const diaVencimento = 10;
            
            // Busca a base "Data 10" (ou ajuste conforme necessário)
            let base = db.prepare('SELECT id FROM bases WHERE nome = ?').get('Data 10');
            if (!base) {
                const r = db.prepare('INSERT INTO bases (nome, descricao) VALUES (?, ?)').run('Data 10', 'Base para instalações');
                base = { id: r.lastInsertRowid };
            }
            
            // Adiciona à base de clientes
            db.prepare(`
                INSERT INTO clientes_base 
                    (base_id, dia_vencimento, numero, nome, endereco, telefone, status, criado_em)
                VALUES (?, ?, ?, ?, ?, ?, 'pendente', CURRENT_TIMESTAMP)
            `).run(
                base.id,
                diaVencimento,
                instalacao.numero,
                instalacao.nome,
                instalacao.endereco,
                instalacao.numero.replace('@c.us', ''),
            );
            
            // Atualiza status da instalação
            db.prepare(`
                UPDATE instalacoes_agendadas 
                SET status = 'confirmado', confirmado_em = CURRENT_TIMESTAMP 
                WHERE id = ?
            `).run(req.params.id);
            
            res.json({ ok: true, mensagem: 'Cliente adicionado à base com sucesso' });
        } catch (error) {
            console.error('Erro ao confirmar instalação:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    // Concluir instalação
    app.post('/api/instalacoes-agendadas/:id/concluir', (req, res) => {
        try {
            db.prepare(`
                UPDATE instalacoes_agendadas 
                SET status = 'concluido', concluido_em = CURRENT_TIMESTAMP 
                WHERE id = ?
            `).run(req.params.id);
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    // Cancelar instalação
    app.post('/api/instalacoes-agendadas/:id/cancelar', (req, res) => {
        try {
            db.prepare(`
                UPDATE instalacoes_agendadas 
                SET status = 'cancelado' 
                WHERE id = ?
            `).run(req.params.id);
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });
};