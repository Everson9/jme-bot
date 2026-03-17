// routes/agendamentos.js
module.exports = function setupRotasAgendamentos(app, ctx) {
    const { db: firebaseDb, banco } = ctx;

    // Listar agendamentos com filtros
    app.get('/api/agendamentos', async (req, res) => {
        try {
            const { data, status } = req.query;
            let query = firebaseDb.collection('agendamentos');
            
            // Filtro por data
            if (data === 'hoje') {
                const hoje = new Date().toISOString().split('T')[0];
                query = query.where('data', '==', hoje);
            } else if (data === 'amanha') {
                const amanha = new Date();
                amanha.setDate(amanha.getDate() + 1);
                query = query.where('data', '==', amanha.toISOString().split('T')[0]);
            } else if (data === 'semana') {
                const hoje = new Date().toISOString().split('T')[0];
                const semana = new Date();
                semana.setDate(semana.getDate() + 7);
                query = query.where('data', '>=', hoje)
                            .where('data', '<=', semana.toISOString().split('T')[0]);
            }
            
            // Filtro por status
            if (status && status !== 'todos') {
                query = query.where('status', '==', status);
            }
            
            const snapshot = await query
                .orderBy('data', 'asc')
                .orderBy('periodo', 'asc')
                .get();
            
            const agendamentos = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            res.json(agendamentos);
        } catch (error) {
            console.error('Erro ao listar agendamentos:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    // Ver disponibilidade para os próximos dias
    app.get('/api/agendamentos/disponibilidade', async (req, res) => {
        try {
            const dias = [];
            const hoje = new Date();
            
            for (let i = 0; i < 14; i++) { // Próximos 14 dias
                const data = new Date(hoje);
                data.setDate(hoje.getDate() + i);
                
                // Pula domingo
                if (data.getDay() === 0) continue;
                
                const dataBanco = data.toISOString().split('T')[0];
                const diaSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][data.getDay()];
                
                const manha = await banco.agendamentos.verificarDisponibilidade(dataBanco, 'manha');
                const tarde = await banco.agendamentos.verificarDisponibilidade(dataBanco, 'tarde');
                
                // Só mostra se tiver pelo menos 1 vaga
                if (manha.disponivel || tarde.disponivel) {
                    dias.push({
                        data: dataBanco,
                        label: `${diaSemana} ${data.getDate()}/${data.getMonth()+1}`,
                        vagas: {
                            manha: manha.vagas,
                            tarde: tarde.vagas
                        }
                    });
                }
                
                if (dias.length >= 7) break; // Mostra no máximo 7 dias
            }
            
            // Contagens totais
            const hojeStr = new Date().toISOString().split('T')[0];
            const amanhaStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
            const semanaStr = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
            
            const hojeSnapshot = await firebaseDb.collection('agendamentos')
                .where('data', '==', hojeStr)
                .where('status', '==', 'agendado')
                .get();
            
            const amanhaSnapshot = await firebaseDb.collection('agendamentos')
                .where('data', '==', amanhaStr)
                .where('status', '==', 'agendado')
                .get();
            
            const semanaSnapshot = await firebaseDb.collection('agendamentos')
                .where('data', '>=', hojeStr)
                .where('data', '<=', semanaStr)
                .where('status', '==', 'agendado')
                .get();
            
            res.json({
                hoje: hojeSnapshot.size,
                amanha: amanhaSnapshot.size,
                semana: semanaSnapshot.size,
                proximosDias: dias
            });
        } catch (error) {
            console.error('Erro ao ver disponibilidade:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    // Marcar como concluído
    app.post('/api/agendamentos/:id/concluir', async (req, res) => {
        try {
            await firebaseDb.collection('agendamentos').doc(req.params.id).update({
                status: 'concluido'
            });
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    // Cancelar agendamento
    app.post('/api/agendamentos/:id/cancelar', async (req, res) => {
        try {
            await firebaseDb.collection('agendamentos').doc(req.params.id).update({
                status: 'cancelado'
            });
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });
};