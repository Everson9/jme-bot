// routes/alertas.js
module.exports = function setupRotasAlertas(app, ctx) {
    const { db: firebaseDb } = ctx;

    // =====================================================
    // ROTA DE ALERTAS PARA NOTIFICAÇÕES
    // =====================================================
    app.get('/api/dashboard/alertas', async (req, res) => {
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
            
            // Promessas pendentes (não notificadas)
            const promessasSnapshot = await firebaseDb.collection('promessas')
                .where('status', '==', 'pendente')
                .where('notificado', '==', 0)
                .get();
            
            const promessasHoje = [];
            const promessasAmanha = [];
            
            promessasSnapshot.docs.forEach(doc => {
                const p = doc.data();
                const dataFormatada = toDate(p.data_promessa);
                if (dataFormatada === hojeStr) {
                    promessasHoje.push({
                        nome: p.nome,
                        numero: p.numero,
                        data_promessa: p.data_promessa
                    });
                } else if (dataFormatada === amanhaStr) {
                    promessasAmanha.push({ nome: p.nome });
                }
            });
            
            // Inadimplentes (pendente + mais de 5 dias sem atualizar)
            const cincoDiasAtras = new Date();
            cincoDiasAtras.setDate(cincoDiasAtras.getDate() - 5);
            
            const inadimplentesSnapshot = await firebaseDb.collection('clientes')
                .where('status', '==', 'pendente')
                .where('atualizado_em', '<=', cincoDiasAtras.toISOString())
                .get();
            
            // Chamados abertos há mais de 24h
            const umDiaAtras = Date.now() - 86400000;
            const chamadosSnapshot = await firebaseDb.collection('chamados')
                .where('status', '==', 'aberto')
                .get();
            
            const chamadosAbertos = chamadosSnapshot.docs.filter(doc => {
                const data = doc.data();
                return data.aberto_em && data.aberto_em < umDiaAtras;
            }).length;
            
            // Novos agendamentos para hoje
            const agendamentosHojeSnapshot = await firebaseDb.collection('agendamentos')
                .where('data', '==', hojeStr)
                .where('status', '==', 'agendado')
                .get();
            
            // Instalações agendadas para hoje
            const instalacoesHojeSnapshot = await firebaseDb.collection('instalacoes_agendadas')
                .where('data', '==', hojeStr)
                .where('status', '==', 'agendado')
                .get();
            
            res.json({
                promessasHoje: promessasHoje.length,
                promessasAmanha: promessasAmanha.length,
                promessasHojeDetalhe: promessasHoje,
                inadimplentes: inadimplentesSnapshot.size,
                chamadosAbertos,
                agendamentosHoje: agendamentosHojeSnapshot.size,
                instalacoesHoje: instalacoesHojeSnapshot.size
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
    // MARCAR NOTIFICAÇÕES COMO LIDAS
    // =====================================================
    app.post('/api/notificacoes/marcar-lida', async (req, res) => {
        try {
            const { tipo, id } = req.body;
            
            if (tipo === 'promessa' && id) {
                await firebaseDb.collection('promessas').doc(id).update({
                    notificado: 1
                });
            }
            
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    // =====================================================
    // MARCAR TODAS COMO LIDAS
    // =====================================================
    app.post('/api/notificacoes/marcar-todas-lidas', async (req, res) => {
        try {
            const snapshot = await firebaseDb.collection('promessas')
                .where('status', '==', 'pendente')
                .where('notificado', '==', 0)
                .get();
            
            const batch = firebaseDb.batch();
            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { notificado: 1 });
            });
            await batch.commit();
            
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });
};