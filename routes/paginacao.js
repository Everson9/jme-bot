// routes/paginacao.js
module.exports = function setupRotasPaginacao(app, ctx) {
    const { db } = ctx;

    // CLIENTES com paginação e filtros
    app.get('/api/clientes/paginados', (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const offset = (page - 1) * limit;
            const busca = req.query.busca || '';
            const dia = req.query.dia; // '10', '20', '30'
            const status = req.query.status; // 'pago', 'pendente', 'promessa'
            const base = req.query.base;

            let sqlCount = 'SELECT COUNT(*) as total FROM clientes_base WHERE 1=1';
            let sqlData = 'SELECT * FROM clientes_base WHERE 1=1';
            const params = [];

            if (busca) {
                const termo = `%${busca}%`;
                sqlCount += ` AND (nome LIKE ? OR telefone LIKE ? OR cpf LIKE ?)`;
                sqlData += ` AND (nome LIKE ? OR telefone LIKE ? OR cpf LIKE ?)`;
                params.push(termo, termo, termo);
            }
            if (dia && dia !== 'todos') {
                sqlCount += ` AND dia_vencimento = ?`;
                sqlData += ` AND dia_vencimento = ?`;
                params.push(parseInt(dia));
            }
            if (status && status !== 'todos') {
                sqlCount += ` AND status = ?`;
                sqlData += ` AND status = ?`;
                params.push(status);
            }
            if (base && base !== 'todos') {
                sqlCount += ` AND base_id = ?`;
                sqlData += ` AND base_id = ?`;
                params.push(parseInt(base));
            }

            const total = db.prepare(sqlCount).get(...params).total;
            const totalPages = Math.ceil(total / limit);

            // Adiciona parâmetros de paginação
            const dataParams = [...params, limit, offset];
            const clientes = db.prepare(sqlData + ' ORDER BY nome LIMIT ? OFFSET ?').all(...dataParams);

            res.json({
                data: clientes,
                total,
                totalPages,
                currentPage: page,
                limit
            });
        } catch (error) {
            console.error('Erro na paginação de clientes:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    // AGENDAMENTOS com paginação (se quiser)
    app.get('/api/agendamentos/paginados', (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const offset = (page - 1) * limit;
            const data = req.query.data; // 'hoje', 'amanha', 'semana', 'todos'
            const status = req.query.status;

            let sqlCount = 'SELECT COUNT(*) as total FROM agendamentos WHERE 1=1';
            let sqlData = 'SELECT * FROM agendamentos WHERE 1=1';
            const params = [];

            if (data && data !== 'todos') {
                if (data === 'hoje') {
                    sqlCount += ` AND data = date('now')`;
                    sqlData += ` AND data = date('now')`;
                } else if (data === 'amanha') {
                    sqlCount += ` AND data = date('now', '+1 day')`;
                    sqlData += ` AND data = date('now', '+1 day')`;
                } else if (data === 'semana') {
                    sqlCount += ` AND data BETWEEN date('now') AND date('now', '+7 days')`;
                    sqlData += ` AND data BETWEEN date('now') AND date('now', '+7 days')`;
                }
            }
            if (status && status !== 'todos') {
                sqlCount += ` AND status = ?`;
                sqlData += ` AND status = ?`;
                params.push(status);
            }

            const total = db.prepare(sqlCount).get(...params).total;
            const totalPages = Math.ceil(total / limit);

            const dataParams = [...params, limit, offset];
            const agendamentos = db.prepare(sqlData + ' ORDER BY data ASC, periodo ASC LIMIT ? OFFSET ?').all(...dataParams);

            res.json({
                data: agendamentos,
                total,
                totalPages,
                currentPage: page,
                limit
            });
        } catch (error) {
            console.error('Erro na paginação de agendamentos:', error);
            res.status(500).json({ erro: error.message });
        }
    });
};