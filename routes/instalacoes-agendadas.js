// routes/instalacoes-agendadas.js
module.exports = function setupRotasInstalacoesAgendadas(app, ctx) {
    const { db: firebaseDb } = ctx;

    // Listar instalações agendadas
    app.get('/api/instalacoes-agendadas', async (req, res) => {
        try {
            const { status } = req.query;
            let query = firebaseDb.collection('instalacoes_agendadas');
            
            if (status && status !== 'todos') {
                query = query.where('status', '==', status);
            }
            
            const snapshot = await query
                .orderBy('data', 'asc')
                .orderBy('criado_em', 'desc')
                .get();
            
            const instalacoes = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            res.json(instalacoes);
        } catch (error) {
            console.error('Erro ao listar instalações:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    // Confirmar instalação (e adicionar à base)
    app.post('/api/instalacoes-agendadas/:id/confirmar', async (req, res) => {
        try {
            const instalacaoDoc = await firebaseDb.collection('instalacoes_agendadas').doc(req.params.id).get();
            
            if (!instalacaoDoc.exists) {
                return res.status(404).json({ erro: 'Instalação não encontrada' });
            }
            
            const instalacao = instalacaoDoc.data();
            const diaVencimento = 10;
            
            // Busca a base "Data 10"
            let baseSnapshot = await firebaseDb.collection('bases')
                .where('nome', '==', 'Data 10')
                .limit(1)
                .get();
            
            let baseId;
            if (baseSnapshot.empty) {
                // Cria a base se não existir
                const baseRef = await firebaseDb.collection('bases').add({
                    nome: 'Data 10',
                    descricao: 'Base para instalações',
                    criado_em: new Date().toISOString()
                });
                baseId = baseRef.id;
                
                // Adiciona dias à base (opcional)
                await firebaseDb.collection('bases').doc(baseId).collection('datas_base').add({
                    dia: 10
                });
            } else {
                baseId = baseSnapshot.docs[0].id;
            }
            
            // Adiciona à base de clientes
            await firebaseDb.collection('clientes').add({
                base_id: baseId,
                dia_vencimento: diaVencimento,
                numero: instalacao.numero,
                nome: instalacao.nome,
                endereco: instalacao.endereco,
                telefone: instalacao.numero ? instalacao.numero.replace('@c.us', '') : '',
                status: 'pendente',
                criado_em: new Date().toISOString()
            });
            
            // Atualiza status da instalação
            await firebaseDb.collection('instalacoes_agendadas').doc(req.params.id).update({
                status: 'confirmado',
                confirmado_em: new Date().toISOString()
            });
            
            res.json({ ok: true, mensagem: 'Cliente adicionado à base com sucesso' });
        } catch (error) {
            console.error('Erro ao confirmar instalação:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    // Concluir instalação
    app.post('/api/instalacoes-agendadas/:id/concluir', async (req, res) => {
        try {
            await firebaseDb.collection('instalacoes_agendadas').doc(req.params.id).update({
                status: 'concluido',
                concluido_em: new Date().toISOString()
            });
            res.json({ ok: true });
        } catch (error) {
            console.error('Erro ao concluir instalação:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    // Cancelar instalação
    app.post('/api/instalacoes-agendadas/:id/cancelar', async (req, res) => {
        try {
            await firebaseDb.collection('instalacoes_agendadas').doc(req.params.id).update({
                status: 'cancelado'
            });
            res.json({ ok: true });
        } catch (error) {
            console.error('Erro ao cancelar instalação:', error);
            res.status(500).json({ erro: error.message });
        }
    });
};