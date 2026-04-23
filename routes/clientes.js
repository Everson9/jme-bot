// routes/clientes.js
const { getCicloAtual, calcularStatusCliente } = require('../services/statusService');

module.exports = function setupClientesRoutes(app, ctx) {
    const {
        db: firebaseDb, banco, sseService
    } = ctx;

    // ─────────────────────────────────────────────────────
    // BUSCA DE CLIENTES
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

    // ─────────────────────────────────────────────────────
    // BASES
    // ─────────────────────────────────────────────────────
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
    // CLIENTES RECENTES
    // ─────────────────────────────────────────────────────
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
};