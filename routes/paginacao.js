// routes/paginacao.js
module.exports = function setupRotasPaginacao(app, ctx) {
    const { db: firebaseDb } = ctx;

    // CLIENTES com paginação e filtros
    app.get('/api/clientes/paginados', async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const busca = req.query.busca || '';
            const dia = req.query.dia; // '10', '20', '30'
            const status = req.query.status; // 'pago', 'pendente', 'promessa'
            const base = req.query.base;

            // Firebase não tem COUNT fácil, então precisamos buscar todos e filtrar
            // Mas para performance, vamos usar queries combinadas quando possível
            let query = firebaseDb.collection('clientes');
            
            // Aplicar filtros que o Firebase suporta
            if (dia && dia !== 'todos') {
                query = query.where('dia_vencimento', '==', parseInt(dia));
            }
            if (status && status !== 'todos') {
                query = query.where('status', '==', status);
            }
            if (base && base !== 'todos') {
                query = query.where('base_id', '==', base);
            }
            
            // Buscar todos os documentos (limitado para não sobrecarregar)
            const snapshot = await query.limit(1000).get();
            
            // Filtrar por busca em memória (Firebase não tem LIKE)
            let clientes = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            if (busca) {
                const termo = busca.toLowerCase();
                clientes = clientes.filter(c => 
                    (c.nome && c.nome.toLowerCase().includes(termo)) ||
                    (c.telefone && c.telefone.includes(termo)) ||
                    (c.cpf && c.cpf.includes(termo))
                );
            }
            
            // Ordenar por nome
            clientes.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
            
            // Paginação
            const total = clientes.length;
            const totalPages = Math.ceil(total / limit);
            const start = (page - 1) * limit;
            const paginatedData = clientes.slice(start, start + limit);
            
            res.json({
                data: paginatedData,
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

    // AGENDAMENTOS com paginação
    app.get('/api/agendamentos/paginados', async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const data = req.query.data; // 'hoje', 'amanha', 'semana', 'todos'
            const status = req.query.status;

            let query = firebaseDb.collection('agendamentos');
            
            // Aplicar filtros de data
            if (data && data !== 'todos') {
                const hoje = new Date().toISOString().split('T')[0];
                const amanha = new Date(Date.now() + 86400000).toISOString().split('T')[0];
                const semana = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
                
                if (data === 'hoje') {
                    query = query.where('data', '==', hoje);
                } else if (data === 'amanha') {
                    query = query.where('data', '==', amanha);
                } else if (data === 'semana') {
                    query = query.where('data', '>=', hoje)
                                .where('data', '<=', semana);
                }
            }
            
            // Aplicar filtro de status
            if (status && status !== 'todos') {
                query = query.where('status', '==', status);
            }
            
            // Buscar dados
            const snapshot = await query
                .orderBy('data', 'asc')
                .orderBy('periodo', 'asc')
                .get();
            
            let agendamentos = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            // Paginação
            const total = agendamentos.length;
            const totalPages = Math.ceil(total / limit);
            const start = (page - 1) * limit;
            const paginatedData = agendamentos.slice(start, start + limit);
            
            res.json({
                data: paginatedData,
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