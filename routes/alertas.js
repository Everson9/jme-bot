// routes/alertas.js
module.exports = function setupRotasAlertas(app, ctx) {
    const { db: firebaseDb } = ctx;
    const { getCicloAtual } = require('../services/statusService');

    // ROTA DE ALERTAS PARA NOTIFICAÇÕES (SSE)
    // A versão principal está em routes/index.js, esta serve o SSE em tempo real
    app.get('/api/dashboard/alertas', async (req, res) => {
        try {
            const hojeBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
            const hojeStr = hojeBR.toISOString().split('T')[0];
            const amanha = new Date(hojeBR);
            amanha.setDate(amanha.getDate() + 1);
            const amanhaStr = amanha.toISOString().split('T')[0];

            const toDate = (d) => {
                if (!d) return null;
                if (d.includes('/')) {
                    const partes = d.split('/');
                    if (partes.length === 3) return `${partes[2]}-${partes[1]}-${partes[0]}`;
                }
                if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.split('T')[0];
                return null;
            };

            const [promessasSnapshot, chamadosSnapshot] = await Promise.all([
                firebaseDb.collection('promessas').where('status','==','pendente').where('notificado','==',0).get(),
                firebaseDb.collection('chamados').where('status','==','aberto').get(),
            ]);

            const promessasHoje = [], promessasAmanha = [];
            promessasSnapshot.docs.forEach(doc => {
                const p = doc.data();
                const dataFormatada = toDate(p.data_promessa);
                if (dataFormatada === hojeStr) promessasHoje.push({ nome:p.nome, numero:p.numero, data_promessa:p.data_promessa });
                else if (dataFormatada === amanhaStr) promessasAmanha.push({ nome:p.nome });
            });

            // Inadimplentes reais: calcula status por ciclo
            const cincoDiasAtras = new Date(hojeBR.getTime() - 5 * 86400000).toISOString();
            const clientesSnap = await firebaseDb.collection('clientes').where('atualizado_em','<=',cincoDiasAtras).get();
            let inadimplentes = 0;
            await Promise.all(clientesSnap.docs.map(async doc => {
                const c = doc.data();
                if (c.status === 'cancelado' || c.status === 'pago') return;
                const diaVenc = parseInt(c.dia_vencimento) || 10;
                const cicloRef = getCicloAtual(diaVenc, hojeBR);
                const hDoc = await firebaseDb.collection('clientes').doc(doc.id)
                    .collection('historico_pagamentos').doc(cicloRef.docId).get().catch(() => null);
                const reg = hDoc?.exists ? hDoc.data() : null;
                if (!reg || (reg.status !== 'pago' && reg.status !== 'isento')) inadimplentes++;
            }));

            const umDiaAtras = Date.now() - 86400000;
            const chamadosAbertos = chamadosSnapshot.docs.filter(d => d.data().aberto_em < umDiaAtras).length;
            const [agSnap, instSnap] = await Promise.all([
                firebaseDb.collection('agendamentos').where('data','==',hojeStr).where('status','==','agendado').get(),
                firebaseDb.collection('instalacoes_agendadas').where('data','==',hojeStr).where('status','==','agendado').get(),
            ]);

            res.json({
                promessasHoje: promessasHoje.length, promessasAmanha: promessasAmanha.length,
                promessasHojeDetalhe: promessasHoje, inadimplentes,
                chamadosAbertos, agendamentosHoje: agSnap.size, instalacoesHoje: instSnap.size,
            });
        } catch (error) {
            console.error('Erro ao buscar alertas:', error);
            res.status(500).json({ promessasHoje:0, promessasAmanha:0, promessasHojeDetalhe:[], inadimplentes:0, chamadosAbertos:0, agendamentosHoje:0, instalacoesHoje:0 });
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
            const paraBloquear = [];
            for (const venc of [10, 20, 30]) {
                let atraso;
                if (dia >= venc) atraso = dia - venc;
                else atraso = new Date(ano, mes - 1, 0).getDate() - venc + dia;
                if (atraso > 10) paraBloquear.push(venc);
            }

            if (paraBloquear.length === 0) {
                return res.json({ clientes: [], total: 0 });
            }

            // Busca TODOS os clientes dos vencimentos D+10 (sem filtrar por status raw)
            const todos = [];
            const docIds = [];
            const docMap = {};

            await Promise.all(paraBloquear.map(async venc => {
                // Remove filtro por status — vamos checar pelo historico real
                const [snapNum, snapStr] = await Promise.all([
                    firebaseDb.collection('clientes').where('dia_vencimento','==',venc).get(),
                    firebaseDb.collection('clientes').where('dia_vencimento','==',String(venc)).get(),
                ]);
                const vistos = new Set();
                const combined = [...snapNum.docs, ...snapStr.docs].filter(d => {
                    if (vistos.has(d.id)) return false;
                    vistos.add(d.id); return true;
                });
                combined.forEach(doc => {
                    if (doc.data().status === 'cancelado') return; // cancelados nunca
                    docIds.push(doc.id);
                    docMap[doc.id] = { doc, venc };
                });
            }));

            // Filtra quem já pagou no ciclo CORRETO de cada cliente
            const pagosNoCiclo = new Set();
            await Promise.all(docIds.map(async docId => {
                const { venc } = docMap[docId];
                const cicloRef = getCicloAtual(venc, agoraBR);
                try {
                    const h = await firebaseDb.collection('clientes').doc(docId)
                        .collection('historico_pagamentos').doc(cicloRef.docId).get();
                    if (h.exists && (h.data().status === 'pago' || h.data().status === 'isento')) pagosNoCiclo.add(docId);
                } catch(_) {}
            }));

            for (const docId of docIds) {
                if (pagosNoCiclo.has(docId)) continue;
                const { doc, venc } = docMap[docId];
                const d = doc.data();
                const diasAtraso = dia >= venc
                    ? dia - venc
                    : new Date(ano, mes - 1, 0).getDate() - venc + dia;
                todos.push({
                    id: doc.id, nome: d.nome, telefone: d.telefone,
                    dia_vencimento: venc, dias_atraso: diasAtraso,
                    plano: d.plano, forma_pagamento: d.forma_pagamento
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