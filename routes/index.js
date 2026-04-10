// routes/index.js
module.exports = function setupRoutes(app, ctx) {
    const requireAuth = require('../middleware/auth');
    const { calcularStatusCliente, getCicloAtual } = require('../services/statusService');
    const {
        db: firebaseDb, banco, state, client, ADMINISTRADORES,
        botAtivo, botIniciadoEm, situacaoRede, previsaoRetorno,
        horarioFuncionamento, horarioCobranca,
        dispararCobrancaReal, obterAgendaDia,
        executarMigracao, isentarMesEntrada,
        verificarPromessasVencidas, fs, path
    } = ctx;

    // ─────────────────────────────────────────────────────
    // MIDDLEWARE DE AUTENTICAÇÃO (aplica em todas as rotas /api/*)
    // Se ADMIN_API_KEY não estiver definida, passa sem validar (modo dev)
    // ─────────────────────────────────────────────────────
    app.use('/api', requireAuth);

    // ─────────────────────────────────────────────────────
    // HORÁRIOS
    // ─────────────────────────────────────────────────────
    app.get('/api/horario', (req, res) => res.json(horarioFuncionamento));
    app.post('/api/horario', (req, res) => {
        const { inicio, fim, ativo } = req.body;
        if (typeof ativo  === 'boolean') horarioFuncionamento.ativo = ativo;
        if (typeof inicio === 'number')  horarioFuncionamento.inicio = inicio;
        if (typeof fim    === 'number')  horarioFuncionamento.fim = fim;
        firebaseDb.collection('config').doc('horario_atendente').set(horarioFuncionamento).catch(() => {});
        res.json(horarioFuncionamento);
    });
    app.get('/api/horario/cobranca', (req, res) => res.json(horarioCobranca));
    app.post('/api/horario/cobranca', (req, res) => {
        const { inicio, fim } = req.body;
        if (typeof inicio === 'number') horarioCobranca.inicio = inicio;
        if (typeof fim    === 'number') horarioCobranca.fim = fim;
        firebaseDb.collection('config').doc('horario_cobranca').set(horarioCobranca).catch(() => {});
        res.json(horarioCobranca);
    });

    // ─────────────────────────────────────────────────────
    // STATUS DO BOT
    // ─────────────────────────────────────────────────────
    app.get('/api/status', (req, res) => {
        res.json({
            botAtivo:          ctx.botAtivo,
            online:            !!ctx.botIniciadoEm,
            iniciadoEm:        ctx.botIniciadoEm,
            atendimentosAtivos: state?.stats()?.atendimentoHumano || 0,
            situacaoRede:      ctx.situacaoRede,
            previsaoRetorno:   ctx.previsaoRetorno,
        });
    });

    app.post('/api/bot/toggle', async (req, res) => {
        try {
            const doc = await firebaseDb.collection('config').doc('bot_ativo').get();
            const novoEstado = !(doc.exists ? doc.data().valor : false);
            await firebaseDb.collection('config').doc('bot_ativo').set({ valor: novoEstado });
            ctx.botAtivo = novoEstado;
            if (ctx.sseService) ctx.sseService.broadcast();
            res.json({ success: true, botAtivo: ctx.botAtivo });
        } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    });

    app.get('/api/estados', (req, res) => res.json({ estados: state.todos(), stats: state.stats() }));

    app.post('/api/estados/:numero/reset', async (req, res) => {
        const numero = req.params.numero.includes('@c.us') ? req.params.numero : `55${req.params.numero.replace(/\D/g,'')}@c.us`;
        try {
            await banco.dbRemoverAtendimentoHumano(numero);
            await banco.dbLimparHistorico(numero);
            state.limpar(numero);
            res.json({ ok: true });
        } catch(e) { res.status(500).json({ erro: e.message }); }
    });

    app.get('/api/rede', async (req, res) => {
        try {
            const [redeDoc, previsaoDoc, motivoDoc] = await Promise.all([
                firebaseDb.collection('config').doc('situacao_rede').get(),
                firebaseDb.collection('config').doc('previsao_retorno').get(),
                firebaseDb.collection('config').doc('motivo_rede').get(),
            ]);
            res.json({
                situacaoRede:   redeDoc.exists    ? redeDoc.data().valor    : (ctx.situacaoRede   || 'normal'),
                previsaoRetorno: previsaoDoc.exists ? previsaoDoc.data().valor : (ctx.previsaoRetorno || 'sem previsão'),
                motivoRede:     motivoDoc.exists   ? motivoDoc.data().valor   : (ctx.motivoRede     || ''),
            });
        } catch(e) { res.json({ situacaoRede: 'normal', previsaoRetorno: 'sem previsão' }); }
    });

    app.post('/api/rede', async (req, res) => {
        const { status, previsao, motivo } = req.body;
        if (!['normal','instavel','manutencao','fibra_rompida'].includes(status))
            return res.status(400).json({ erro: 'Status inválido' });
        ctx.situacaoRede    = status;
        ctx.previsaoRetorno = previsao || 'sem previsão';
        ctx.motivoRede      = motivo  || '';
        await Promise.all([
            firebaseDb.collection('config').doc('situacao_rede').set({ valor: status }),
            firebaseDb.collection('config').doc('previsao_retorno').set({ valor: previsao || 'sem previsão' }),
            firebaseDb.collection('config').doc('motivo_rede').set({ valor: motivo || '' }),
        ]);
        if (ctx.sseService) ctx.sseService.broadcast();
        res.json({ situacaoRede: ctx.situacaoRede, previsaoRetorno: ctx.previsaoRetorno, motivoRede: ctx.motivoRede });
    });

    // ─────────────────────────────────────────────────────
    // INFO DO CICLO ATUAL (qual mês está sendo considerado)
    // ─────────────────────────────────────────────────────
    app.get('/api/ciclo-info', (req, res) => {
        const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
        const c10 = getCicloAtual(10, agoraBR);
        const c20 = getCicloAtual(20, agoraBR);
        const c30 = getCicloAtual(30, agoraBR);
        const mesNome = agoraBR.toLocaleDateString('pt-BR', { month: 'long' });
        res.json({
            mesReferencia: `${String(agoraBR.getUTCMonth()+1).padStart(2,'0')}/${agoraBR.getUTCFullYear()}`,
            mesNome: mesNome.charAt(0).toUpperCase() + mesNome.slice(1),
            ciclos: {
                10: { mes_ref: c10.chave, tolerancia: `até 15/0${agoraBR.getUTCMonth()+1}` },
                20: { mes_ref: c20.chave, tolerancia: `até 25/0${agoraBR.getUTCMonth()+1}` },
                30: { mes_ref: c30.chave, tolerancia: `até 05/${String(agoraBR.getUTCMonth()+2).padStart(2,'0')}` },
            },
            hoje: agoraBR.toLocaleDateString('pt-BR'),
        });
    });

    // ─────────────────────────────────────────────────────
    // BASES E CLIENTES
    // ─────────────────────────────────────────────────────
    app.get('/api/clientes/buscar', async (req, res) => {
        const { q } = req.query;
        if (!q || q.trim().length < 2) return res.json([]);
        try {
            const clientes = await banco.buscarClientePorNome(q.trim());
            const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
            const result = clientes.map(c => {
                const diaVenc = parseInt(c.dia_vencimento) || 10;
                const c10 = getCicloAtual(diaVenc, agoraBR);
                const mesRef = c10.chave;
                return { id: c.id, nome: c.nome, telefone: c.telefone, dia_vencimento: c.dia_vencimento, status: c.status, mes_referencia: mesRef, base_nome: c.base_nome };
            });
            res.json(result);
        } catch { res.json([]); }
    });

    app.get('/api/clientes/busca-global', async (req, res) => {
        const { q } = req.query;
        if (!q || q.length < 2) return res.json([]);
        try { res.json((await banco.buscarClientePorNome(q.trim())).slice(0, 20)); }
        catch { res.json([]); }
    });

    // ✅ CORRIGIDO: /api/bases — removido N+1 de histórico por cliente.
    // Agora retorna totais a partir do campo status direto (O(n) leituras, não O(3n)).
    // O campo status é mantido atualizado pelas operações de baixa/reverter.
    app.get('/api/bases', async (req, res) => {
        try {
            const snap = await firebaseDb.collection('bases').orderBy('criado_em', 'asc').get();

            const result = await Promise.all(snap.docs.map(async baseDoc => {
                const base = { id: baseDoc.id, ...baseDoc.data() };

                // Busca dias e clientes em paralelo — sem N+1 de histórico
                const [diasSnap, clientesSnap] = await Promise.all([
                    firebaseDb.collection('bases').doc(baseDoc.id)
                        .collection('datas_base').orderBy('dia', 'asc').get(),
                    firebaseDb.collection('clientes')
                        .where('base_id', '==', parseInt(baseDoc.id)).get(),
                ]);

                const dias = diasSnap.docs.map(d => d.data().dia);

                // Conta status a partir do campo direto — evita 1 leitura de historico por cliente
                let pagos = 0;
                clientesSnap.docs.forEach(doc => {
                    const c = doc.data();
                    if (c.status === 'cancelado') return;
                    if (c.status === 'pago' || c.status === 'isento') pagos++;
                });

                const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
                const mesRef = getCicloAtual(dias[0] || 10, agoraBR).chave;
                return { ...base, dias, total: clientesSnap.size, pagos, mes_referencia: mesRef };
            }));

            res.json(result);
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/bases', async (req, res) => {
        const { nome, descricao, dias } = req.body;
        if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });
        if (!dias?.length) return res.status(400).json({ erro: 'Informe pelo menos um dia' });
        try {
            const existe = await firebaseDb.collection('bases').where('nome','==',nome.trim()).get();
            if (!existe.empty) return res.status(400).json({ erro: 'Já existe uma base com esse nome' });
            const baseRef = await firebaseDb.collection('bases').add({ nome: nome.trim(), descricao: descricao||'', criado_em: new Date().toISOString() });
            const batch = firebaseDb.batch();
            for (const dia of dias) { const d=parseInt(dia); if(d>=1&&d<=31) batch.set(firebaseDb.collection('bases').doc(baseRef.id).collection('datas_base').doc(), {dia:d}); }
            await batch.commit();
            const diasSnap = await firebaseDb.collection('bases').doc(baseRef.id).collection('datas_base').orderBy('dia','asc').get();
            res.json({ id: baseRef.id, nome: nome.trim(), descricao: descricao||'', dias: diasSnap.docs.map(d=>d.data().dia), total: 0, pagos: 0 });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.delete('/api/bases/:id', async (req, res) => {
        try {
            const baseDoc = await firebaseDb.collection('bases').doc(req.params.id).get();
            if (!baseDoc.exists) return res.status(404).json({ erro: 'Base não encontrada' });
            if (baseDoc.data().nome === 'JME') return res.status(400).json({ erro: 'A base JME não pode ser excluída' });
            const batch = firebaseDb.batch();
            const clientesSnap = await firebaseDb.collection('clientes').where('base_id','==',parseInt(req.params.id)).get();
            clientesSnap.forEach(d => batch.delete(d.ref));
            const diasSnap = await firebaseDb.collection('bases').doc(req.params.id).collection('datas_base').get();
            diasSnap.forEach(d => batch.delete(d.ref));
            batch.delete(firebaseDb.collection('bases').doc(req.params.id));
            await batch.commit();
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    // ─────────────────────────────────────────────────────
    // LISTAGEM DE CLIENTES
    // Usa campo status do Firebase diretamente — sem buscar histórico
    // Isso mantém o custo de leitura em O(n) e não O(3n)
    // O campo status é atualizado sempre que dá/reverte baixa
    // ─────────────────────────────────────────────────────
    app.get('/api/bases/:id/clientes', async (req, res) => {
        const { id } = req.params;
        const { dia, busca, mes_ref } = req.query;
        try {
            const [snapNum, snapStr] = await Promise.all([
                firebaseDb.collection('clientes').where('base_id','==', parseInt(id)).get(),
                firebaseDb.collection('clientes').where('base_id','==', String(id)).get(),
            ]);
            const map = new Map();
            snapNum.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
            snapStr.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
            let clientes = Array.from(map.values());

            if (dia)   clientes = clientes.filter(c => c.dia_vencimento === parseInt(dia));
            if (busca) {
                const t = busca.toLowerCase();
                clientes = clientes.filter(c =>
                    (c.nome||'').toLowerCase().includes(t) ||
                    (c.cpf||'').includes(t) ||
                    (c.telefone||'').includes(t) ||
                    (c.endereco||'').toLowerCase().includes(t)
                );
            }
            clientes.sort((a, b) => (a.nome||'').localeCompare(b.nome||''));

            // Promessas ativas — 1 query
            const promSnap = await firebaseDb.collection('promessas').where('status','==','pendente').get();
            const promMap = {};
            promSnap.docs.forEach(d => {
                const p = d.data();
                const tel = (p.numero||'').replace('@c.us','').replace(/^55/,'').replace(/\D/g,'').slice(-8);
                if (tel) promMap[tel] = p;
            });

            const mesRefNorm = (mes_ref || '').trim();
            const docIdSelecionado = mesRefNorm ? mesRefNorm.replace(/\//g, '-') : null;

            if (docIdSelecionado) {
                await Promise.all(clientes.map(async c => {
                    try {
                        const hDoc = await firebaseDb.collection('clientes')
                            .doc(c.id).collection('historico_pagamentos').doc(docIdSelecionado).get();
                        const hist = {};
                        hist[docIdSelecionado] = hDoc.exists ? hDoc.data() : null;
                        c._historico = hist;
                    } catch(_) { c._historico = {}; }
                }));
            } else {
                const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
                await Promise.all(clientes.map(async c => {
                    try {
                        const diaVenc = parseInt(c.dia_vencimento) || 10;
                        const cicloRef = getCicloAtual(diaVenc, agoraBR);
                        const hDoc = await firebaseDb.collection('clientes')
                            .doc(c.id).collection('historico_pagamentos').doc(cicloRef.docId).get();
                        const hist = {};
                        hist[cicloRef.docId] = hDoc.exists ? hDoc.data() : null;
                        c._historico = hist;
                    } catch(_) { c._historico = {}; }
                }));
            }

            clientes = clientes.map(c => {
                const tel = (c.telefone||'').replace(/\D/g,'').slice(-8);
                const prom = promMap[tel];
                const diaVenc = parseInt(c.dia_vencimento) || 10;
                const cicloRef = getCicloAtual(diaVenc, new Date(Date.now() - 3 * 60 * 60 * 1000));

                let statusReal;
                if (docIdSelecionado) {
                    if (c.status === 'cancelado') statusReal = 'cancelado';
                    else if (c.status === 'promessa') statusReal = 'promessa';
                    else {
                        const reg = c._historico?.[docIdSelecionado] || null;
                        statusReal = (reg && (reg.status === 'pago' || reg.status === 'isento')) ? 'pago' : 'pendente';
                    }
                } else {
                    statusReal = calcularStatusCliente(c, c._historico || null);
                }

                if (prom?.data_promessa && statusReal !== 'pago' && statusReal !== 'cancelado') {
                    statusReal = 'promessa';
                }

                return {
                    ...c,
                    data_promessa: prom?.data_promessa || null,
                    status_calculado: statusReal,
                    mes_referencia: docIdSelecionado ? docIdSelecionado.replace('-', '/') : cicloRef.chave,
                    _historico: undefined,
                };
            });

            res.json(clientes);
        } catch(e) {
            console.error('Erro /api/bases/:id/clientes:', e);
            res.json([]);
        }
    });

    // ─────────────────────────────────────────────────────
    // HISTÓRICO E PAGAMENTOS
    // ─────────────────────────────────────────────────────
    app.get('/api/clientes/:clienteId/historico', async (req, res) => {
        try {
            const { clienteId } = req.params;
            const clienteDoc = await firebaseDb.collection('clientes').doc(clienteId).get();
            if (!clienteDoc.exists) return res.status(404).json({ erro: 'Cliente não encontrado' });
            const historicoSnap = await firebaseDb.collection('clientes').doc(clienteId).collection('historico_pagamentos').get();
            res.json({
                cliente:  { id: clienteDoc.id, ...clienteDoc.data() },
                historico: historicoSnap.docs.map(d => ({ id: d.id, ...d.data() })),
            });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/clientes/:clienteId/historico/:ref/pagar', async (req, res) => {
        try {
            const { clienteId, ref } = req.params;
            const { forma_pagamento } = req.body;
            const referencia = decodeURIComponent(ref);
            const docId = referencia.replace(/\//g, '-');

            const clienteDoc = await firebaseDb.collection('clientes').doc(clienteId).get();
            if (!clienteDoc.exists) return res.status(404).json({ erro: 'Cliente não encontrado' });
            const cliente = clienteDoc.data();

            await firebaseDb.collection('clientes').doc(clienteId)
                .collection('historico_pagamentos').doc(docId)
                .set({ referencia, status: 'pago', forma_pagamento: forma_pagamento||null, pago_em: new Date().toISOString(), data_vencimento: cliente.dia_vencimento||10 }, { merge: true });

            const cicloAtual = getCicloAtual(parseInt(cliente.dia_vencimento));
            if (referencia === cicloAtual.chave) {
                await firebaseDb.collection('clientes').doc(clienteId).update({ status: 'pago', atualizado_em: new Date().toISOString() });

                const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
                const hoje = agoraBR.toISOString().split('T')[0];
                const planoLower = (cliente.plano||'').toLowerCase();
                let valor_plano = null;
                if (planoLower.includes('iptv')||planoLower.includes('70')) valor_plano = 70;
                else if (planoLower.includes('200')||planoLower.includes('fibra')) valor_plano = 60;
                else if (planoLower.includes('50')||planoLower.includes('cabo'))   valor_plano = 50;
                await firebaseDb.collection('pagamentos_hoje').doc(`${clienteId}_${hoje}`).set({
                    data: hoje, cliente_id: clienteId, nome: cliente.nome||'—', plano: cliente.plano,
                    forma_pagamento: cliente.forma_pagamento, forma_baixa: forma_pagamento||'Painel',
                    pago_em: new Date().toISOString(), valor_plano,
                }).catch(() => {});
            }

            res.json({ ok: true });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/clientes/:clienteId/historico/:ref/reverter', async (req, res) => {
        try {
            const { clienteId, ref } = req.params;
            const referencia = decodeURIComponent(ref);
            const docId = referencia.replace(/\//g, '-');

            const clienteDoc = await firebaseDb.collection('clientes').doc(clienteId).get();
            if (!clienteDoc.exists) return res.status(404).json({ erro: 'Cliente não encontrado' });
            const cliente = clienteDoc.data();

            await firebaseDb.collection('clientes').doc(clienteId)
                .collection('historico_pagamentos').doc(docId)
                .set({ referencia, status: 'pendente', pago_em: null, forma_pagamento: null }, { merge: true });

            const cicloAtual = getCicloAtual(parseInt(cliente.dia_vencimento));
            if (referencia === cicloAtual.chave) {
                await firebaseDb.collection('clientes').doc(clienteId).update({ status: 'pendente', atualizado_em: new Date().toISOString() });
            }

            res.json({ ok: true });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    // ─────────────────────────────────────────────────────
    // CRUD CLIENTES
    // ─────────────────────────────────────────────────────
    app.post('/api/clientes', async (req, res) => {
        try {
            const { base_id, nome, cpf, telefone, endereco, numero, senha, plano, dia_vencimento, observacao, comodato } = req.body;
            if (!nome)    return res.status(400).json({ erro: 'Nome é obrigatório' });
            if (!base_id) return res.status(400).json({ erro: 'base_id é obrigatório' });
            const baseIdNum = parseInt(base_id);
            if (isNaN(baseIdNum)) return res.status(400).json({ erro: 'base_id inválido' });
            const ref = await firebaseDb.collection('clientes').add({
                base_id: baseIdNum, nome: nome.trim(), cpf: cpf||null, telefone: telefone||null,
                endereco: endereco||null, numero: numero||null, senha: senha||null, plano: plano||null,
                dia_vencimento: dia_vencimento ? parseInt(dia_vencimento) : 10,
                observacao: observacao||null, comodato: comodato||false, status: 'pendente',
                criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
            });
            res.json({ id: ref.id, ...(await ref.get()).data() });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.get('/api/bases/:baseId/clientes/:clienteId', async (req, res) => {
        try {
            const doc = await firebaseDb.collection('clientes').doc(req.params.clienteId).get();
            if (!doc.exists) return res.status(404).json({ erro: 'Cliente não encontrado' });
            res.json({ id: doc.id, ...doc.data() });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.put('/api/bases/:baseId/clientes/:clienteId', async (req, res) => {
        try {
            const ref = firebaseDb.collection('clientes').doc(req.params.clienteId);
            if (!(await ref.get()).exists) return res.status(404).json({ erro: 'Cliente não encontrado' });
            const campos = ['nome','cpf','endereco','numero','telefone','senha','observacao','forma_pagamento','plano','status','comodato'];
            const update = {};
            campos.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
            if (req.body.dia_vencimento !== undefined) update.dia_vencimento = parseInt(req.body.dia_vencimento);
            update.atualizado_em = new Date().toISOString();
            await ref.update(update);
            res.json({ id: req.params.clienteId, ...(await ref.get()).data() });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/bases/:baseId/clientes/:clienteId/status', async (req, res) => {
        try {
            const { clienteId } = req.params;
            const { status } = req.body;
            if (!['pago','pendente','cancelado','promessa'].includes(status))
                return res.status(400).json({ erro: 'Status inválido' });
            await firebaseDb.collection('clientes').doc(clienteId).update({ status, atualizado_em: new Date().toISOString() });
            if (status === 'cancelado' || status === 'promessa') {
                if (ctx.sseService) ctx.sseService.notificar('clientes');
            }
            res.json({ ok: true, status });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.delete('/api/bases/:baseId/clientes/:clienteId', async (req, res) => {
        try {
            const { clienteId } = req.params;
            const histSnap = await firebaseDb.collection('clientes').doc(clienteId).collection('historico_pagamentos').get();
            const batch = firebaseDb.batch();
            histSnap.docs.forEach(d => batch.delete(d.ref));
            batch.delete(firebaseDb.collection('clientes').doc(clienteId));
            await batch.commit();
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    // ─────────────────────────────────────────────────────
    // COBRANÇA MANUAL
    // ─────────────────────────────────────────────────────
    app.post('/api/cobrar/manual', async (req, res) => {
        const { data, tipo } = req.body || {};
        if (!['10','20','30'].includes(data)) return res.status(400).json({ erro: 'data inválida' });
        if (tipo && !['lembrete','atraso','atraso_final','reconquista','reconquista_final'].includes(tipo))
            return res.status(400).json({ erro: 'tipo inválido' });

        const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
        const tipoVerif = tipo || 'auto';
        const jaFeitoSnap = await firebaseDb.collection('log_cobrancas')
            .where('data_vencimento','==',data).where('data_envio','==',hoje).where('tipo','==',tipoVerif).limit(1).get();
        if (!jaFeitoSnap.empty) return res.json({ ok: false, aviso: `Cobrança ${tipoVerif} da data ${data} já foi disparada hoje.` });

        const logRef = await firebaseDb.collection('log_bot').add({ numero: 'sistema', direcao: 'decisao', tipo: 'disparo_manual', conteudo: JSON.stringify({ data, tipo: tipoVerif, iniciadoPor: 'painel' }), criado_em: new Date().toISOString() });
        res.json({ ok: true, mensagem: 'Disparo iniciado', logId: logRef.id });

        setTimeout(async () => {
            try {
                const total = await ctx.dispararCobrancaReal(client, firebaseDb, data, tipo || null);
                const labels = { lembrete:'Lembrete', atraso:'Atraso', atraso_final:'Atraso Final', reconquista:'Reconquista 1', reconquista_final:'Reconquista Final' };
                await logRef.update({ conteudo: JSON.stringify({ data, tipo: tipoVerif, total, status: 'concluido' }) });
                for (const adm of ADMINISTRADORES) await client.sendMessage(adm, `🖥️ *DISPARO MANUAL*\n📋 Data ${data} — ${labels[tipo]||'automático'}\n📨 ${total} mensagens`).catch(() => {});
            } catch (e) { await logRef.update({ conteudo: JSON.stringify({ erro: e.message, status: 'erro' }) }); }
        }, 100);
    });

    app.get('/api/cobrar/agenda', async (req, res) => {
        try {
            const agora = new Date();
            const mes = agora.getMonth() + 1, ano = agora.getFullYear(), dia = agora.getDate();
            const inicioMes = `${ano}-${String(mes).padStart(2,'0')}-01`;
            const fimMes    = `${ano}-${String(mes).padStart(2,'0')}-31`;
            const logsSnap  = await firebaseDb.collection('log_cobrancas').where('data_envio','>=',inicioMes).where('data_envio','<=',fimMes).get();
            const agenda = {};
            logsSnap.docs.forEach(doc => {
                const c = doc.data();
                const diaLog = parseInt(c.data_envio.split('-')[2]);
                if (!agenda[diaLog]) agenda[diaLog] = [];
                const ex = agenda[diaLog].find(e => e.data === c.data_vencimento && e.tipo === (c.tipo||'auto'));
                if (ex) ex.clientes++; else agenda[diaLog].push({ data: c.data_vencimento, tipo: c.tipo||'auto', clientes: 1, status: 'realizado' });
            });
            const pendDoc = await firebaseDb.collection('config').doc('cobranca_adiada').get();
            const pendencia = pendDoc.exists ? pendDoc.data().valor : null;
            if (pendencia?.dia && pendencia.mes === mes && pendencia.ano === ano) {
                if (!agenda[pendencia.dia]) agenda[pendencia.dia] = [];
                pendencia.entradas?.forEach(e => {
                    if (!agenda[pendencia.dia].some(x => x.data===e.data && x.tipo===e.tipo && x.status==='realizado'))
                        agenda[pendencia.dia].push({ data: e.data, tipo: e.tipo, clientes: e.clientes||0, status: 'pendente', motivo: pendencia.motivoBloqueio });
                });
            }
            res.json({ agenda, diaAtual: dia, mes, ano, pendencia });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    // ─────────────────────────────────────────────────────
    // PROMESSAS
    // ─────────────────────────────────────────────────────
    app.get('/api/promessas', async (req, res) => {
        try {
            const { status } = req.query;
            let q = firebaseDb.collection('promessas');
            if (status && status !== 'todos') q = q.where('status','==',status);
            const snap = await q.orderBy('criado_em','desc').limit(200).get();
            const promessas = await Promise.all(snap.docs.map(async doc => {
                const p = { id: doc.id, ...doc.data() };
                const num = p.numero?.replace('@c.us','').replace('55','');
                const cli = await banco.buscarClientePorTelefone(num);
                if (cli) {
                    p.dia_vencimento = cli.dia_vencimento;
                    if (cli.base_id && typeof cli.base_id === 'string') {
                        const baseDoc = await firebaseDb.collection('bases').doc(cli.base_id).get().catch(() => null);
                        if (baseDoc?.exists) p.base_nome = baseDoc.data().nome;
                    }
                }
                return p;
            }));
            const seteDiasAtras = new Date(); seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
            const filtradas = (!status || status === 'todos')
                ? promessas.filter(p => p.status === 'pendente' || new Date(p.criado_em) >= seteDiasAtras)
                : promessas;
            res.json(filtradas);
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/promessas/:id/pago', async (req, res) => {
        try {
            const { id } = req.params;
            const pRef = firebaseDb.collection('promessas').doc(id);
            const pDoc = await pRef.get();
            if (!pDoc.exists) return res.status(404).json({ erro: 'Promessa não encontrada' });
            const promessa = pDoc.data();
            await pRef.update({ status: 'pago', pago_em: new Date().toISOString() });
            if (promessa.nome) {
                const clis = await banco.buscarClientePorNome(promessa.nome);
                const cli  = clis?.[0];
                if (cli) {
                    await firebaseDb.collection('clientes').doc(cli.id).update({ status: 'pago', atualizado_em: new Date().toISOString() });
                    const ciclo = getCicloAtual(parseInt(cli.dia_vencimento));
                    await firebaseDb.collection('clientes').doc(cli.id).collection('historico_pagamentos').doc(ciclo.docId)
                        .set({ referencia: ciclo.chave, status: 'pago', forma_pagamento: 'Promessa', pago_em: new Date().toISOString(), data_vencimento: cli.dia_vencimento||10 }, { merge: true });
                }
            }
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/promessas/:id/cancelar', async (req, res) => {
        try {
            const { id } = req.params;
            const pRef = firebaseDb.collection('promessas').doc(id);
            const pDoc = await pRef.get();
            if (!pDoc.exists) return res.status(404).json({ erro: 'Promessa não encontrada' });
            const promessa = pDoc.data();
            await pRef.update({ status: 'cancelada' });
            if (promessa.nome) {
                const clis = await banco.buscarClientePorNome(promessa.nome);
                const cli  = clis?.[0];
                if (cli) {
                    const cDoc = await firebaseDb.collection('clientes').doc(cli.id).get();
                    if (cDoc.exists && cDoc.data().status === 'promessa')
                        await firebaseDb.collection('clientes').doc(cli.id).update({ status: 'pendente', atualizado_em: new Date().toISOString() });
                }
            }
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/promessas', async (req, res) => {
        try {
            const { nome, numero, data_promessa, cliente_id } = req.body;
            if (!data_promessa) return res.status(400).json({ erro: 'data_promessa obrigatória' });
            const numWpp = numero ? (numero.replace(/\D/g,'').replace(/^0/,'55') + '@c.us') : null;
            const pRef = await firebaseDb.collection('promessas').add({ numero: numWpp||null, nome: nome||null, data_promessa, status: 'pendente', criado_em: new Date().toISOString() });
            const cliId = cliente_id || (nome ? (await banco.buscarClientePorNome(nome))?.[0]?.id : null);
            if (cliId) {
                const cDoc = await firebaseDb.collection('clientes').doc(cliId).get();
                if (cDoc.exists && cDoc.data().status === 'pendente')
                    await firebaseDb.collection('clientes').doc(cliId).update({ status: 'promessa', atualizado_em: new Date().toISOString() });
            }
            res.json({ ok: true, id: pRef.id });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/promessas/verificar', (req, res) => {
        try { verificarPromessasVencidas?.(); res.json({ ok: true }); }
        catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.delete('/api/promessas/:id', async (req, res) => {
        try { await firebaseDb.collection('promessas').doc(req.params.id).delete(); res.json({ ok: true }); }
        catch (e) { res.status(500).json({ erro: e.message }); }
    });

    // ─────────────────────────────────────────────────────
    // LOGS
    // ─────────────────────────────────────────────────────
    app.get('/api/logs/cobrancas', async (req, res) => {
        try { res.json((await firebaseDb.collection('log_cobrancas').orderBy('enviado_em','desc').limit(parseInt(req.query.limit)||50).get()).docs.map(d=>({id:d.id,...d.data()}))); }
        catch (e) { res.status(500).json({ erro: e.message }); }
    });
    app.get('/api/logs/comprovantes', async (req, res) => {
        try { res.json((await firebaseDb.collection('log_comprovantes').orderBy('recebido_em','desc').limit(parseInt(req.query.limit)||50).get()).docs.map(d=>({id:d.id,...d.data()}))); }
        catch (e) { res.status(500).json({ erro: e.message }); }
    });
    app.get('/api/atendimentos', async (req, res) => {
        try { res.json((await firebaseDb.collection('log_atendimentos').orderBy('iniciado_em','desc').limit(parseInt(req.query.limit)||50).get()).docs.map(d=>({id:d.id,...d.data()}))); }
        catch (e) { res.status(500).json({ erro: e.message }); }
    });
    app.get('/api/logs/bot', async (req, res) => {
        const { numero, limit = 200 } = req.query;
        try {
            let q = firebaseDb.collection('log_bot');
            if (numero) q = q.where('numero','==',numero);
            const snap = await q.orderBy('criado_em','desc').limit(parseInt(limit)).get();
            res.json({ rows: snap.docs.map(d=>({id:d.id,...d.data()})), total: snap.size });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });
    app.get('/api/logs/correcoes', async (req, res) => {
        try { res.json((await firebaseDb.collection('log_correcoes').orderBy('criado_em','desc').limit(200).get()).docs.map(d=>({id:d.id,...d.data()}))); }
        catch (e) { res.status(500).json({ erro: e.message }); }
    });
    app.post('/api/logs/correcoes', async (req, res) => {
        const { log_id, mensagem, classificou_como, correto_seria, tipo } = req.body;
        if (!mensagem || !correto_seria) return res.status(400).json({ erro: 'mensagem e correto_seria obrigatórios' });
        try {
            await firebaseDb.collection('log_correcoes').add({ log_id: log_id||null, mensagem, classificou_como: classificou_como||null, correto_seria, tipo: tipo==='confirmacao'?'confirmacao':'correcao', criado_em: new Date().toISOString() });
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });
    app.get('/api/logs/stats', async (req, res) => {
        const hoje = new Date().toISOString().split('T')[0];
        try {
            const seteDiasAtras = new Date(); seteDiasAtras.setDate(seteDiasAtras.getDate()-7);
            const [hojeSnap, entSnap, intSnap, ultSnap, corrSnap] = await Promise.all([
                firebaseDb.collection('log_bot').where('criado_em','>=',hoje).get(),
                firebaseDb.collection('log_bot').where('criado_em','>=',hoje).where('direcao','==','entrada').get(),
                firebaseDb.collection('log_bot').where('criado_em','>=',seteDiasAtras.toISOString().split('T')[0]).get(),
                firebaseDb.collection('log_bot').orderBy('criado_em','desc').limit(10).get(),
                firebaseDb.collection('log_correcoes').get(),
            ]);
            const intMap = new Map();
            intSnap.docs.forEach(d => { const i = d.data().intencao||'OUTRO'; intMap.set(i,(intMap.get(i)||0)+1); });
            const numMap = new Map();
            ultSnap.docs.forEach(d => { const x=d.data(); if(!numMap.has(x.numero)) numMap.set(x.numero,x.criado_em); });
            res.json({ total_hoje: hojeSnap.size, entradas_hoje: entSnap.size, intencoes: Array.from(intMap.entries()).map(([intencao,c])=>({intencao,c})).sort((a,b)=>b.c-a.c), ultimos_numeros: Array.from(numMap.entries()).map(([numero,ultimo])=>({numero,ultimo})), total_correcoes: corrSnap.size });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });
    app.get('/api/logs/erros', async (req, res) => {
        try { res.json((await firebaseDb.collection('log_bot').where('tipo','==','erro').orderBy('criado_em','desc').limit(parseInt(req.query.limit)||50).get()).docs.map(d=>({id:d.id,...d.data()}))); }
        catch (e) { res.status(500).json({ erro: e.message }); }
    });
    app.get('/api/metricas/fila', (req, res) => res.json({ mensagem: 'Métricas de fila disponíveis apenas em tempo real' }));

    // ─────────────────────────────────────────────────────
    // DASHBOARD
    // ✅ CORRIGIDO: resumo-bases usa campo status direto (sem N+1 de histórico)
    // ─────────────────────────────────────────────────────
    app.get('/api/dashboard/resumo-bases', async (req, res) => {
        try {
            const basesSnap = await firebaseDb.collection('bases').get();

            let totalPendentes = 0, totalPromessas = 0;
            const result = await Promise.all(basesSnap.docs.map(async baseDoc => {
                // Uma query de clientes por base — sem N+1 de histórico
                const cliSnap = await firebaseDb.collection('clientes')
                    .where('base_id', '==', parseInt(baseDoc.id)).get();

                let pagos = 0, pend = 0, prom = 0;
                cliSnap.docs.forEach(doc => {
                    const c = doc.data();
                    if (c.status === 'cancelado') return;
                    if (c.status === 'pago' || c.status === 'isento') pagos++;
                    else if (c.status === 'promessa') prom++;
                    else pend++;
                });

                totalPendentes += pend;
                totalPromessas += prom;

                const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
                const refCiclo = getCicloAtual(10, agoraBR); // dia padrão para referência do mês
                return {
                    id: baseDoc.id,
                    nome: baseDoc.data().nome,
                    total: cliSnap.size,
                    pagos,
                    pendentes: pend,
                    promessas: prom,
                    mes_referencia: refCiclo.chave,
                };
            }));

            res.json({ bases: result, totalPendentes, totalPromessas });
        } catch(e) { res.json({ bases:[], totalPendentes:0, totalPromessas:0 }); }
    });

    app.get('/api/dashboard/caixa-hoje', async (req, res) => {
        try {
            const hoje = new Date(Date.now()-3*60*60*1000).toISOString().split('T')[0];
            const snap = await firebaseDb.collection('pagamentos_hoje').where('data','==',hoje).get();
            const rows = snap.docs.map(d=>d.data()).sort((a,b)=>(b.pago_em||'').localeCompare(a.pago_em||''));
            res.json(rows);
        } catch { res.json([]); }
    });

    app.get('/api/dashboard/alertas', async (req, res) => {
        try {
            const hojeStr   = new Date().toISOString().split('T')[0];
            const amanhaStr = new Date(Date.now()+86400000).toISOString().split('T')[0];
            const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);

            const [phSnap, paSnap, chamSnap] = await Promise.all([
                firebaseDb.collection('promessas').where('status','==','pendente').where('data_promessa','==',hojeStr).get(),
                firebaseDb.collection('promessas').where('status','==','pendente').where('data_promessa','==',amanhaStr).get(),
                firebaseDb.collection('chamados').where('status','==','aberto').get(),
            ]);

            // ✅ CORRIGIDO: conta inadimplentes pelo campo status direto
            // sem buscar histórico de cada cliente individualmente
            const inadSnap = await firebaseDb.collection('clientes')
                .where('status', '==', 'pendente').get();
            const hoje = agoraBR.getUTCDate();
            let inadimplentes = 0;
            inadSnap.docs.forEach(doc => {
                const c = doc.data();
                const diaVenc = parseInt(c.dia_vencimento) || 10;
                // Considera inadimplente se passou do dia de vencimento
                if (hoje > diaVenc + 3) inadimplentes++;
            });

            const umDiaAtras = Date.now()-86400000;
            res.json({
                promessasHoje: phSnap.size,
                promessasAmanha: paSnap.size,
                promessasHojeDetalhe: phSnap.docs.map(d=>({nome:d.data().nome,numero:d.data().numero,data_promessa:d.data().data_promessa})),
                inadimplentes,
                chamadosAbertos: chamSnap.docs.filter(d=>d.data().aberto_em<umDiaAtras).length,
            });
        } catch { res.json({ promessasHoje:0, promessasAmanha:0, promessasHojeDetalhe:[], inadimplentes:0, chamadosAbertos:0 }); }
    });

    // ✅ CORRIGIDO: fluxo-clientes — substituído loop serial por Promise.all com limit
    app.get('/api/dashboard/fluxo-clientes', async (req, res) => {
        const hoje = new Date(); const ma=hoje.getMonth()+1, aa=hoje.getFullYear(), ms=String(ma).padStart(2,'0');
        const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);

        const [entSnap,saiSnap,allCliSnap,canSnap,novSnap,csnSnap] = await Promise.all([
            firebaseDb.collection('novos_clientes').where('status','in',['confirmado','finalizado']).get(),
            firebaseDb.collection('cancelamentos').where('status','==','confirmado').get(),
            firebaseDb.collection('clientes').where('status','!=','cancelado').get(),
            firebaseDb.collection('clientes').where('status','==','cancelado').get(),
            firebaseDb.collection('novos_clientes').where('status','in',['confirmado','finalizado']).get(),
            firebaseDb.collection('cancelamentos').where('status','==','confirmado').get(),
        ]);

        const ent = entSnap.docs.filter(d=>{const x=d.data().finalizado_em; return x&&x.startsWith(`${aa}-${ms}`);}).length;
        const sai = saiSnap.docs.filter(d=>{const x=d.data().confirmado_em; return x&&x.startsWith(`${aa}-${ms}`);}).length;

        const historico = [];
        for(let i=5;i>=0;i--){
            const d=new Date(aa,ma-1-i,1);
            const m=String(d.getMonth()+1).padStart(2,'0');
            const a=d.getFullYear();
            const pf=`${a}-${m}`;
            historico.push({
                label: d.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}),
                entradas: novSnap.docs.filter(d=>d.data().finalizado_em?.startsWith(pf)).length,
                saidas: csnSnap.docs.filter(d=>d.data().confirmado_em?.startsWith(pf)).length,
            });
        }

        // ✅ CORRIGIDO: conta ativos pelo campo status direto — sem histórico por cliente
        // (campo status é mantido atualizado pelas operações de baixa/reverter)
        const ativosReais = allCliSnap.docs.filter(doc => {
            const c = doc.data();
            return c.status === 'pago' || c.status === 'isento';
        }).length;

        res.json({ mes:{entradas:ent,saidas:sai}, totalAtivos:ativosReais, totalCancelados:canSnap.size, historico });
    });

    // ─────────────────────────────────────────────────────
    // CHAMADOS
    // ─────────────────────────────────────────────────────
    app.get('/api/chamados', async (req, res) => {
        try { res.json(await banco.dbListarChamados(req.query.status||null)); }
        catch (e) { res.status(500).json({ erro: e.message }); }
    });
    app.post('/api/chamados/:id/assumir', async (req, res) => {
        try { await banco.dbAtualizarChamado(req.params.id,'em_atendimento'); res.json({ sucesso: true }); }
        catch (e) { res.status(500).json({ erro: e.message }); }
    });
    app.post('/api/chamados/:id/fechar', async (req, res) => {
        try {
            await banco.dbAtualizarChamado(req.params.id,'fechado');
            if (ctx.sseService) ctx.sseService.notificar('chamados');
            const doc = await firebaseDb.collection('chamados').doc(req.params.id).get();
            if (doc.exists) await banco.dbRemoverAtendimentoHumano(doc.data().numero);
            res.json({ sucesso: true });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    // ─────────────────────────────────────────────────────
    // CANCELAMENTOS
    // ─────────────────────────────────────────────────────
    app.get('/api/cancelamentos', async (req, res) => {
        try {
            let q = firebaseDb.collection('cancelamentos');
            if (req.query.status) q = q.where('status','==',req.query.status);
            res.json((await q.orderBy('solicitado_em','desc').get()).docs.map(d=>({id:d.id,...d.data()})));
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/cancelamentos', async (req, res) => {
        const { cliente_id, base_id, nome, cpf, telefone, numero_whatsapp, endereco, numero, senha, plano, forma_pagamento, baixa_sgp, dia_vencimento, observacao, motivo, motivo_detalhado, solicitado_via } = req.body;
        if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });
        try {
            let dc = {};
            if (cliente_id) { const d=await firebaseDb.collection('clientes').doc(cliente_id).get(); if(d.exists) dc=d.data(); }
            const cRef = await firebaseDb.collection('cancelamentos').add({ cliente_id:cliente_id||null, base_id:base_id||dc.base_id||null, nome:nome||dc.nome, cpf:cpf||dc.cpf||null, telefone:telefone||dc.telefone||null, numero_whatsapp:numero_whatsapp||null, endereco:endereco||dc.endereco||null, numero:numero||dc.numero||null, senha:senha||dc.senha||null, plano:plano||dc.plano||null, forma_pagamento:forma_pagamento||dc.forma_pagamento||null, baixa_sgp:baixa_sgp??dc.baixa_sgp??0, dia_vencimento:dia_vencimento||dc.dia_vencimento||null, observacao:observacao||dc.observacao||null, motivo:motivo||null, motivo_detalhado:motivo_detalhado||null, solicitado_via:solicitado_via||'painel', status:'solicitado', solicitado_em:new Date().toISOString() });
            if (cliente_id) await firebaseDb.collection('clientes').doc(cliente_id).delete();
            for (const adm of ADMINISTRADORES) await client.sendMessage(adm, `❌ *CANCELAMENTO*\n👤 ${nome}\n📅 Dia ${dia_vencimento||dc.dia_vencimento||'N/A'}\n💬 ${motivo||'Não informado'}`).catch(()=>{});
            res.json({ ok: true, id: cRef.id });
        } catch(e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/cancelamentos/:id/confirmar', async (req, res) => {
        try {
            const cRef = firebaseDb.collection('cancelamentos').doc(req.params.id);
            const cDoc = await cRef.get();
            if (!cDoc.exists) return res.status(404).json({ erro: 'Não encontrado' });
            const cancel = cDoc.data();
            await cRef.update({ status:'confirmado', confirmado_em:new Date().toISOString() });
            if (ctx.sseService) ctx.sseService.notificar('cancelamentos');
            const cliRef = cancel.cliente_id ? firebaseDb.collection('clientes').doc(cancel.cliente_id) : null;
            if (cliRef) await cliRef.update({ status:'cancelado', atualizado_em:new Date().toISOString() }).catch(()=>{});
            if (cancel.numero_whatsapp && botIniciadoEm) await client.sendMessage(cancel.numero_whatsapp, `🤖 *Assistente JMENET*\n\nSeu cancelamento foi confirmado. Sentimos muito! 😢`).catch(()=>{});
            res.json({ ok: true });
        } catch(e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/cancelamentos/:id/cancelar', async (req, res) => {
        try {
            const cRef = firebaseDb.collection('cancelamentos').doc(req.params.id);
            const cDoc = await cRef.get();
            if (!cDoc.exists) return res.status(404).json({ erro: 'Não encontrado' });
            const cancel = cDoc.data();
            if (cancel.base_id && cancel.nome) {
                const clis = await banco.buscarClientePorNome(cancel.nome);
                if (!clis?.length) await firebaseDb.collection('clientes').add({ base_id:cancel.base_id, dia_vencimento:cancel.dia_vencimento||10, nome:cancel.nome, cpf:cancel.cpf, endereco:cancel.endereco, numero:cancel.numero, telefone:cancel.telefone, senha:cancel.senha, plano:cancel.plano, forma_pagamento:cancel.forma_pagamento, baixa_sgp:cancel.baixa_sgp||0, observacao:cancel.observacao, status:'pendente', criado_em:new Date().toISOString(), atualizado_em:new Date().toISOString() });
            }
            await cRef.update({ status:'desistiu' });
            res.json({ ok: true });
        } catch(e) { res.status(500).json({ erro: e.message }); }
    });

    app.delete('/api/cancelamentos/:id', async (req, res) => {
        try { await firebaseDb.collection('cancelamentos').doc(req.params.id).delete(); res.json({ ok: true }); }
        catch (e) { res.status(500).json({ erro: e.message }); }
    });

    // ─────────────────────────────────────────────────────
    // INSTALAÇÕES
    // ─────────────────────────────────────────────────────
    app.get('/api/instalacoes', async (req, res) => {
        try {
            let q = firebaseDb.collection('novos_clientes');
            if (req.query.status) q = q.where('status','==',req.query.status);
            res.json((await q.orderBy('cadastrado_em','desc').get()).docs.map(d=>({id:d.id,...d.data()})));
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.put('/api/instalacoes/:id', async (req, res) => {
        try {
            const campos = ['nome','cpf','endereco','telefone','plano','roteador','data_vencimento','disponibilidade','obs','status'];
            const update = {};
            campos.forEach(k => { if(req.body[k]!==undefined) update[k]=req.body[k]; });
            update.atualizado_em = new Date().toISOString();
            await firebaseDb.collection('novos_clientes').doc(req.params.id).update(update);
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/instalacoes/:id/confirmar', async (req, res) => {
        try { await firebaseDb.collection('novos_clientes').doc(req.params.id).update({ status:'confirmado', confirmado_em:new Date().toISOString() }); res.json({ ok: true }); }
        catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/instalacoes/:id/finalizar', async (req, res) => {
        try {
            const iRef = firebaseDb.collection('novos_clientes').doc(req.params.id);
            const iDoc = await iRef.get();
            if (!iDoc.exists) return res.status(404).json({ erro: 'Não encontrado' });
            const inst = iDoc.data();
            await iRef.update({ status:'finalizado', finalizado_em:new Date().toISOString() });
            const dia = inst.data_vencimento;
            if (dia && [10,20,30].includes(Number(dia))) {
                const baseSnap = await firebaseDb.collection('bases').where('nome','==',`Data ${dia}`).limit(1).get();
                if (!baseSnap.empty) {
                    const base = baseSnap.docs[0];
                    const clis = await banco.buscarClientePorNome(inst.nome);
                    if (!clis?.length) {
                        const cliRef = await firebaseDb.collection('clientes').add({ base_id:base.id, dia_vencimento:parseInt(dia), numero:inst.numero, nome:inst.nome, cpf:inst.cpf||null, endereco:inst.endereco||null, telefone:inst.telefone||inst.numero||null, plano:inst.plano||null, status:'pago', criado_em:new Date().toISOString(), atualizado_em:new Date().toISOString() });
                        if (isentarMesEntrada) await isentarMesEntrada(cliRef.id, dia);
                    }
                }
            }
            if (inst.numero && botIniciadoEm) await client.sendMessage(inst.numero, `🤖 *Assistente JMENET*\n\nOlá, ${inst.nome?.split(' ')[0]||''}! 🎉 Sua instalação foi concluída!\n\nVencimento: dia *${dia}* todo mês. Após 5 dias de atraso o serviço é suspenso.\n\nQualquer dúvida é só chamar! 😊`).catch(()=>{});
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.delete('/api/instalacoes/:id', async (req, res) => {
        try { await firebaseDb.collection('novos_clientes').doc(req.params.id).delete(); res.json({ ok: true }); }
        catch (e) { res.status(500).json({ erro: e.message }); }
    });

    // ─────────────────────────────────────────────────────
    // CARNÊ
    // ─────────────────────────────────────────────────────
    app.get('/api/carne', async (req, res) => {
        try {
            let q = firebaseDb.collection('carne_solicitacoes');
            if (req.query.status) q = q.where('status','==',req.query.status);
            const snap = await q.orderBy('solicitado_em','desc').get();
            const sols = await Promise.all(snap.docs.map(async d => {
                const s = { id:d.id,...d.data() };
                if (s.cliente_id) { const c=await firebaseDb.collection('clientes').doc(s.cliente_id).get(); if(c.exists){const cd=c.data();s.dia_vencimento=cd.dia_vencimento;s.plano=cd.plano;s.telefone_cadastro=cd.telefone;} }
                return s;
            }));
            res.json(sols);
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/carne', async (req, res) => {
        const { cliente_id, nome, numero, endereco, observacao } = req.body;
        if (!nome && !cliente_id) return res.status(400).json({ erro: 'nome ou cliente_id obrigatório' });
        try {
            let dc = {};
            if (cliente_id) { const d=await firebaseDb.collection('clientes').doc(cliente_id).get(); if(d.exists) dc=d.data(); const ant=await firebaseDb.collection('carne_solicitacoes').where('cliente_id','==',cliente_id).where('status','==','solicitado').get(); const batch=firebaseDb.batch(); ant.docs.forEach(d=>batch.delete(d.ref)); await batch.commit(); }
            const solRef = await firebaseDb.collection('carne_solicitacoes').add({ cliente_id:cliente_id||null, numero:numero||dc.telefone||null, nome:nome||dc.nome, endereco:endereco||dc.endereco||null, observacao:observacao||null, origem:'painel', status:'solicitado', solicitado_em:new Date().toISOString() });
            for (const adm of ADMINISTRADORES) await client.sendMessage(adm,`📋 *CARNÊ (painel)*\n👤 ${nome||dc.nome||'?'}\n📍 ${endereco||dc.endereco||'?'}`).catch(()=>{});
            res.json({ ok: true, id: solRef.id });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/carne/:id/imprimir', async (req, res) => {
        try { await firebaseDb.collection('carne_solicitacoes').doc(req.params.id).update({ status:'impresso', impresso_em:new Date().toISOString() }); res.json({ ok: true }); }
        catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/carne/:id/entregar', async (req, res) => {
        try {
            const sRef = firebaseDb.collection('carne_solicitacoes').doc(req.params.id);
            const sDoc = await sRef.get();
            if (!sDoc.exists) return res.status(404).json({ erro: 'Não encontrado' });
            const sol = sDoc.data();
            await sRef.update({ status:'entregue', entregue_em:new Date().toISOString() });
            if (ctx.sseService) ctx.sseService.notificar('carne');
            if (botIniciadoEm && sol.numero) await client.sendMessage(sol.numero,`🤖 *Assistente JMENET*\n\nSeu carnê físico está pronto! 📋`).catch(()=>{});
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.delete('/api/carne/:id', async (req, res) => {
        try { await firebaseDb.collection('carne_solicitacoes').doc(req.params.id).delete(); res.json({ ok: true }); }
        catch (e) { res.status(500).json({ erro: e.message }); }
    });

    // ─────────────────────────────────────────────────────
    // RELATÓRIOS
    // ─────────────────────────────────────────────────────
    app.get('/api/relatorio', async (req, res) => {
        try { res.json(await banco.dbRelatorio()); } catch(e) { res.status(500).json({ erro: e.message }); }
    });

    // ✅ CORRIGIDO: inadimplentes usa campo status diretamente
    // em vez de buscar histórico de cada cliente individualmente
    app.get('/api/relatorio/inadimplentes', async (req, res) => {
        const dias = parseInt(req.query.dias)||5;
        try {
            const agoraBR = new Date(Date.now()-3*60*60*1000);
            const diaHoje = agoraBR.getUTCDate();

            // Busca apenas clientes com status pendente — sem scan total
            const [snap, basesSnap] = await Promise.all([
                firebaseDb.collection('clientes').where('status', '==', 'pendente').get(),
                firebaseDb.collection('bases').get(),
            ]);

            const baseMap = {};
            basesSnap.docs.forEach(d => { baseMap[d.id] = d.data().nome; });

            const lista = [];
            snap.docs.forEach(doc => {
                const c = doc.data();
                if (c.status === 'cancelado') return;

                const diaVenc = parseInt(c.dia_vencimento) || 10;
                // Calcula dias de atraso simples pelo dia atual vs vencimento
                let atraso = diaHoje >= diaVenc
                    ? diaHoje - diaVenc
                    : 30 - diaVenc + diaHoje; // passou do mês

                if (atraso < dias) return;

                lista.push({
                    id: doc.id,
                    nome: c.nome,
                    telefone: c.telefone,
                    plano: c.plano,
                    dia_vencimento: diaVenc,
                    base_nome: baseMap[String(c.base_id)] || null,
                    dias_pendente: atraso,
                });
            });

            lista.sort((a,b) => b.dias_pendente - a.dias_pendente);
            res.json(lista);
        } catch { res.json([]); }
    });

    app.get('/api/graficos/atendimentos', async (req, res) => {
        try {
            const seteDiasAtras = new Date(); seteDiasAtras.setDate(seteDiasAtras.getDate()-7);
            const snap = await firebaseDb.collection('log_atendimentos').where('iniciado_em','>=',seteDiasAtras.toISOString()).get();
            const m = new Map(); snap.docs.forEach(d=>{const x=d.data().iniciado_em?.split('T')[0]; if(x) m.set(x,(m.get(x)||0)+1);});
            res.json(Array.from(m.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([dia,total])=>({dia,total})));
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.get('/api/graficos/cobrancas', async (req, res) => {
        try {
            const seteDiasAtras = new Date(); seteDiasAtras.setDate(seteDiasAtras.getDate()-7);
            const snap = await firebaseDb.collection('log_cobrancas').where('enviado_em','>=',seteDiasAtras.toISOString()).get();
            const m = new Map(); snap.docs.forEach(d=>{const x=d.data().enviado_em?.split('T')[0]; if(x) m.set(x,(m.get(x)||0)+1);});
            res.json(Array.from(m.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([dia,total])=>({dia,total})));
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.get('/api/exportar/clientes', async (req, res) => {
        try {
            const snap = await firebaseDb.collection('clientes').get();
            const clientes = await Promise.all(snap.docs.map(async doc => {
                const c={id:doc.id,...doc.data()};
                let base_nome=null;
                if (c.base_id) { const b=await firebaseDb.collection('bases').doc(String(c.base_id)).get(); if(b.exists) base_nome=b.data().nome; }
                const ciclo = getCicloAtual(parseInt(c.dia_vencimento)||10);
                let hist = {};
                try {
                    const hDoc = await firebaseDb.collection('clientes').doc(c.id)
                        .collection('historico_pagamentos').doc(ciclo.docId).get().catch(()=>null);
                    if (hDoc?.exists) hist[ciclo.docId] = hDoc.data();
                } catch(_) {}
                return { status:calcularStatusCliente(c, hist), mes_referencia:ciclo.chave, nome:c.nome, cpf:c.cpf, telefone:c.telefone, endereco:c.endereco, numero_casa:c.numero, plano:c.plano, forma_pagamento:c.forma_pagamento, observacao:c.observacao, pppoe:c.senha, dia_vencimento:c.dia_vencimento, base:base_nome, criado_em:c.criado_em };
            }));
            clientes.sort((a,b)=>{ if(a.base!==b.base) return (a.base||'').localeCompare(b.base||''); return (a.nome||'').localeCompare(b.nome||''); });
            res.json(clientes);
        } catch(e) { res.status(500).json({ erro: e.message }); }
    });

    app.get('/api/planilha/resumo', async (req, res) => {
        try {
            const result = {};
            const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
            for (const dia of ['10','20','30']) {
                const snap = await firebaseDb.collection('clientes').where('dia_vencimento','==',parseInt(dia)).get();
                const cicloRef = getCicloAtual(parseInt(dia), agoraBR);

                const pagosNoCiclo = new Set();
                await Promise.all(snap.docs.map(async doc => {
                    const hDoc = await firebaseDb.collection('clientes').doc(doc.id)
                        .collection('historico_pagamentos').doc(cicloRef.docId).get().catch(() => null);
                    const reg = hDoc?.exists ? hDoc.data() : null;
                    if (reg && (reg.status === 'pago' || reg.status === 'isento')) pagosNoCiclo.add(doc.id);
                }));

                const pagos = pagosNoCiclo.size;
                result[dia] = {
                    pagos,
                    pendentes: snap.size - pagos,
                    total: snap.size,
                    mes_referencia: cicloRef.chave,
                    clientes: snap.docs.map(d => {
                        const x = d.data();
                        const pago = pagosNoCiclo.has(d.id);
                        return {
                            nome: x.nome,
                            telefone: x.telefone,
                            status: pago ? 'pago' : x.status,
                            forma_pagamento: x.forma_pagamento,
                            baixa_sgp: x.baixa_sgp || 0,
                        };
                    }).sort((a,b) => (a.nome||'').localeCompare(b.nome||'')),
                };
            }
            res.json(result);
        } catch(e) { res.status(500).json({ erro: e.message }); }
    });

    // ─────────────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────────────
    app.post('/api/admin/limpar-estado', async (req, res) => {
        const { numero } = req.body||{};
        if (!numero) return res.status(400).json({ erro: 'numero obrigatório' });
        try {
            const [aq, eq] = await Promise.all([
                firebaseDb.collection('atendimento_humano').where('numero','==',numero).get(),
                firebaseDb.collection('estados_v2').where('numero','==',numero).get(),
            ]);
            const batch = firebaseDb.batch();
            aq.docs.forEach(d=>batch.delete(d.ref)); eq.docs.forEach(d=>batch.delete(d.ref));
            await batch.commit();
            state.limpar(numero);
            res.json({ ok: true });
        } catch(e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/sgp/confirmar', async (req, res) => {
        try {
            const { nome } = req.body;
            if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });
            const clis = await banco.buscarClientePorNome(nome.trim());
            if (!clis?.length) return res.status(404).json({ erro: 'Cliente não encontrado' });
            await firebaseDb.collection('clientes').doc(clis[0].id).update({ baixa_sgp:1, atualizado_em:new Date().toISOString() });
            res.json({ sucesso: true });
        } catch(e) { res.status(500).json({ erro: e.message }); }
    });

    app.get('/api/clientes/recentes', async (req, res) => {
        const limite = parseInt(req.query.limite)||50;
        try {
            const snap = await firebaseDb.collection('clientes').get();
            const basesSnap = await firebaseDb.collection('bases').get();
            const baseMap = {}; basesSnap.docs.forEach(d=>{baseMap[d.id]=d.data().nome;});
            const clientes = snap.docs.map(d=>({ id:d.id,...d.data(), base_nome:baseMap[String(d.data().base_id)]||null }));
            clientes.sort((a,b)=>(b.criado_em||'').localeCompare(a.criado_em||''));
            const top = clientes.slice(0,limite);

            const comStatus = await Promise.all(top.map(async c => {
                const ciclo = getCicloAtual(parseInt(c.dia_vencimento)||10);
                let hist = {};
                try {
                    const hDoc = await firebaseDb.collection('clientes').doc(c.id)
                        .collection('historico_pagamentos').doc(ciclo.docId).get().catch(()=>null);
                    if (hDoc?.exists) hist[ciclo.docId] = hDoc.data();
                } catch(_) {}
                return {
                    ...c,
                    status_calculado: calcularStatusCliente(c, hist),
                    mes_referencia: ciclo.chave,
                };
            }));
            res.json(comStatus);
        } catch(e) { res.status(500).json({ erro: e.message }); }
    });

    // ─────────────────────────────────────────────────────
    // BOAS-VINDAS
    // ─────────────────────────────────────────────────────
    app.post('/api/boas-vindas/enviar', async (req, res) => {
        const { cliente_id, mensagem, solicitar_carne, obs_carne, carne_arquivo_base64, carne_arquivo_nome, carne_arquivo_tipo } = req.body || {};
        try {
            const cliDoc = await firebaseDb.collection('clientes').doc(cliente_id).get();
            if (!cliDoc.exists) return res.status(404).json({ erro: 'Cliente não encontrado' });
            const cli = cliDoc.data();
            const telefone = cli.telefone || null;
            if (!telefone) return res.status(400).json({ erro: 'Cliente sem telefone' });
            const numero = (telefone.replace(/\D/g,'').startsWith('55') ? telefone.replace(/\D/g,'') : '55' + telefone.replace(/\D/g,'')) + '@c.us';

            const msgBoasVindas = mensagem ||
                `🤖 *Assistente JMENET*\n\nOlá, *${(cli.nome || 'Cliente').split(' ')[0]}*! 🎉 Seja bem-vindo(a) à JMENET!\n\n📡 Plano: ${cli.plano || 'Não informado'}\n📅 Vencimento: Todo dia ${cli.dia_vencimento || '10'}\n\nQualquer dúvida é só chamar! 😊`;

            await client.sendMessage(numero, msgBoasVindas);

            if (carne_arquivo_base64 && carne_arquivo_nome) {
                try {
                    const { MessageMedia } = require('whatsapp-web.js');
                    const media = new MessageMedia(carne_arquivo_tipo || 'application/pdf', carne_arquivo_base64, carne_arquivo_nome);
                    await client.sendMessage(numero, media);
                } catch(fileErr) {
                    console.error('Erro ao enviar carnê:', fileErr.message);
                }
            }

            if (solicitar_carne) {
                const anteriories = await firebaseDb.collection('carne_solicitacoes')
                    .where('cliente_id', '==', cliente_id)
                    .where('status', '==', 'solicitado').get();
                const batch = firebaseDb.batch();
                anteriories.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();

                await firebaseDb.collection('carne_solicitacoes').add({
                    cliente_id, nome: cli.nome || null, numero: cli.telefone || null,
                    endereco: cli.endereco || null, origem: 'painel', status: 'solicitado',
                    observado: obs_carne || 'Solicitado via painel na boas-vindas',
                    solicitado_em: new Date().toISOString()
                });
            }

            res.json({ ok: true });
        } catch(e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/boas-vindas/manual', async (req, res) => {
        const { telefone, mensagem } = req.body || {};
        if (!telefone) return res.status(400).json({ erro: 'Telefone é obrigatório' });
        if (!mensagem) return res.status(400).json({ erro: 'Mensagem é obrigatória' });
        try {
            const numero = (telefone.replace(/\D/g,'').startsWith('55') ? telefone.replace(/\D/g,'') : '55' + telefone.replace(/\D/g,'')) + '@c.us';
            await client.sendMessage(numero, mensagem);
            res.json({ ok: true });
        } catch(e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/whatsapp/desconectar', async (req, res) => {
        try { await client.logout(); res.json({ ok: true }); }
        catch(e) { res.status(500).json({ ok: false, erro: e.message }); }
    });

    app.get('/api/health', (req, res) => res.json({ status:'ok', timestamp:new Date().toISOString(), uptime:process.uptime(), memoria:process.memoryUsage(), botAtivo, conexaoWhatsApp:!!botIniciadoEm }));

    app.get('/api/metricas', async (req, res) => {
        try {
            const hoje=new Date().toISOString().split('T')[0], ha=new Date(Date.now()-3600000).toISOString();
            const [uhSnap,atSnap] = await Promise.all([
                firebaseDb.collection('log_bot').where('criado_em','>=',ha).get(),
                firebaseDb.collection('log_atendimentos').where('iniciado_em','>=',hoje).get(),
            ]);
            res.json({ bot:{ativo:botAtivo,iniciadoEm:botIniciadoEm,uptime:botIniciadoEm?Math.floor((Date.now()-botIniciadoEm)/1000):0}, banco:{tipo:'Firebase Firestore'}, atendimentos:{ativos:state?.stats?.()?.atendimentoHumano||0,totalHoje:atSnap.size}, mensagens:{ultimaHora:uhSnap.size}, sistema:{memoria:process.memoryUsage(),versao:process.version} });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.get('/api/metricas/fluxos', async (req, res) => {
        try {
            const seteDiasAtras = new Date(); seteDiasAtras.setDate(seteDiasAtras.getDate()-7);
            const snap = await firebaseDb.collection('log_bot').where('criado_em','>=',seteDiasAtras.toISOString()).get();
            const fm=new Map(), cu=new Map();
            snap.docs.forEach(d=>{ const x=d.data(); const i=x.intencao||'OUTRO'; fm.set(i,(fm.get(i)||0)+1); if(!cu.has(i)) cu.set(i,new Set()); cu.get(i).add(x.numero); });
            const fluxos = Array.from(fm.entries()).map(([i,t])=>({intencao:i,total:t,clientes_unicos:cu.get(i)?.size||0})).sort((a,b)=>b.total-a.total);
            res.json({ fluxos, total:fluxos.reduce((a,f)=>a+f.total,0) });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    // ─────────────────────────────────────────────────────
    // BAIXA RETROATIVA EM LOTE
    // ─────────────────────────────────────────────────────
    app.post('/api/admin/baixa-retroativa', async (req, res) => {
        const { dia_vencimento, mes, ano } = req.body;
        if (!dia_vencimento||!mes||!ano) return res.status(400).json({ erro: 'dia_vencimento, mes e ano obrigatórios' });
        const diaNum=parseInt(dia_vencimento), mesStr=String(mes).padStart(2,'0'), anoNum=parseInt(ano);
        const docId=`${mesStr}-${anoNum}`, referencia=`${mesStr}/${anoNum}`;
        try {
            const snap = await firebaseDb.collection('clientes').where('dia_vencimento','==',diaNum).get();
            if (snap.empty) return res.json({ ok:true, processados:0, pulados:0 });
            let processados=0, pulados=0;
            for (const doc of snap.docs) {
                const hRef = firebaseDb.collection('clientes').doc(doc.id).collection('historico_pagamentos').doc(docId);
                const hDoc = await hRef.get();
                if (hDoc.exists) { pulados++; continue; }
                await hRef.set({ referencia, status:'pago', forma_pagamento:'Retroativo', pago_em:new Date().toISOString(), data_vencimento:diaNum });
                processados++;
            }
            res.json({ ok:true, processados, pulados, total:snap.size, mensagem:`${processados} clientes com baixa em ${referencia}. ${pulados} já tinham registro.` });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    // ─────────────────────────────────────────────────────
    // MIGRAÇÃO / PLANILHA
    // ─────────────────────────────────────────────────────
    app.post('/api/jme/migrar', async (req, res) => {
        try { const r=await executarMigracao(process.env.PLANILHA_ID,[{nome:'Data 10',diaVencimento:10},{nome:'Data 20',diaVencimento:20},{nome:'Data 30',diaVencimento:30}],null,'JME'); res.json({ok:true,...r}); }
        catch(e) { res.status(500).json({ erro: e.message }); }
    });
    app.post('/api/migrar/planilha', async (req, res) => {
        const { baseNome, planilhaId, abas, colunas } = req.body;
        if (!baseNome||!planilhaId||!abas?.length) return res.status(400).json({ erro: 'Informe baseNome, planilhaId e abas' });
        try { const r=await executarMigracao(planilhaId,abas,colunas||null,baseNome); res.json({ok:true,...r}); }
        catch(e) { res.status(500).json({ erro: e.message }); }
    });

    // ─────────────────────────────────────────────────────
    // ROTAS ADICIONAIS + FALLBACK
    // ─────────────────────────────────────────────────────
    require('./agendamentos')(app, ctx);
    require('./instalacoes-agendadas')(app, ctx);
    require('./paginacao')(app, ctx);
    require('./alertas')(app, ctx);
    require('./backup')(app, ctx);

    app.use((req, res, next) => {
        if (req.path.startsWith('/api/')) return next();
        const indexPath = path.join(__dirname, '../frontend/dist/index.html');
        if (fs.existsSync(indexPath)) res.sendFile(indexPath);
        else res.status(404).json({ status:'API JMENET online', versao:'1.0' });
    });
};