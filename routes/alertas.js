// routes/alertas.js
module.exports = function setupRotasAlertas(app, ctx) {
    const { db: firebaseDb } = ctx;

    // =====================================================
    // ROTA DE ALERTAS PARA NOTIFICAÇÕES
    // =====================================================
    app.get('/api/dashboard/alertas', async (req, res) => {
        try {
            const hoje = new Date();
            // Usar horário de Brasília (UTC-3) para comparar datas corretamente
            const hojeBR = new Date(hoje.getTime() - 3 * 60 * 60 * 1000);
            const hojeStr = hojeBR.toISOString().split('T')[0];
            const amanha = new Date(hojeBR);
            amanha.setDate(amanha.getDate() + 1);
            const amanhaStr = amanha.toISOString().split('T')[0];
            
            // Função para converter data DD/MM/AAAA para YYYY-MM-DD
            const toDate = (d) => {
                if (!d) return null;
                // Formato DD/MM/AAAA (salvo pelo bot)
                if (d.includes('/')) {
                    const partes = d.split('/');
                    if (partes.length === 3) return `${partes[2]}-${partes[1]}-${partes[0]}`;
                }
                // Formato YYYY-MM-DD (salvo pelo painel) — já está correto
                if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.split('T')[0];
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
    // CLIENTES PARA BLOQUEAR (pendentes após D+10)
    // =====================================================
    app.get('/api/alertas/bloquear', async (req, res) => {
        try {
            const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
            const dia = agoraBR.getUTCDate();
            const mes = agoraBR.getUTCMonth() + 1;
            const ano = agoraBR.getUTCFullYear();

            // Calcula quais vencimentos já passaram de D+10
            // Ex: hoje dia 22 → venc 10 tem atraso 12 (>10) → bloquear
            const paraBloquear = [];
            for (const venc of [10, 20, 30]) {
                let atraso;
                if (dia >= venc) {
                    atraso = dia - venc;
                } else {
                    const diasMesAnt = new Date(ano, mes - 1, 0).getDate();
                    atraso = (diasMesAnt - venc) + dia;
                }
                if (atraso > 10) paraBloquear.push(venc);
            }

            if (paraBloquear.length === 0) {
                return res.json({ clientes: [], total: 0 });
            }

            // Calcula o ciclo atual para checar pagamentos
            const mesMM = String(mes).padStart(2,'0');
            const cicloAtual = `${mesMM}-${ano}`;

            // Busca clientes pendentes dos vencimentos que passaram D+10
            const todos = [];
            const docIds = [];
            const docMap = {};

            await Promise.all(paraBloquear.map(async venc => {
                const [snapNum, snapStr] = await Promise.all([
                    firebaseDb.collection('clientes')
                        .where('dia_vencimento', '==', venc)
                        .where('status', '==', 'pendente').get(),
                    firebaseDb.collection('clientes')
                        .where('dia_vencimento', '==', String(venc))
                        .where('status', '==', 'pendente').get(),
                ]);
                const vistos = new Set();
                const combined = [...snapNum.docs, ...snapStr.docs].filter(d => {
                    if (vistos.has(d.id)) return false;
                    vistos.add(d.id); return true;
                });
                combined.forEach(doc => {
                    docIds.push(doc.id);
                    docMap[doc.id] = { doc, venc };
                });
            }));

            // Filtra quem já pagou no ciclo atual
            const pagosNoCiclo = new Set();
            await Promise.all(docIds.map(async docId => {
                try {
                    const h = await firebaseDb.collection('clientes').doc(docId)
                        .collection('historico_pagamentos').doc(cicloAtual).get();
                    if (h.exists) {
                        const hs = h.data();
                        if (hs.status === 'pago' || hs.status === 'isento') pagosNoCiclo.add(docId);
                    }
                } catch(_) {}
            }));

            for (const docId of docIds) {
                if (pagosNoCiclo.has(docId)) continue;
                const { doc, venc } = docMap[docId];
                const d = doc.data();
                const diasAtraso = dia >= venc
                    ? dia - venc
                    : (new Date(ano, mes - 1, 0).getDate() - venc) + dia;
                todos.push({
                    id: doc.id,
                    nome: d.nome,
                    telefone: d.telefone,
                    dia_vencimento: venc,
                    dias_atraso: diasAtraso,
                    plano: d.plano,
                    forma_pagamento: d.forma_pagamento
                });
            }

            todos.sort((a, b) => b.dias_atraso - a.dias_atraso);
            res.json({ clientes: todos, total: todos.length });
        } catch(e) {
            console.error('Erro /api/alertas/bloquear:', e.message);
            res.status(500).json({ clientes: [], total: 0 });
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