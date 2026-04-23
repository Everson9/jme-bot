// routes/cobranca.js
const { getCicloAtual } = require('../services/statusService');

module.exports = function setupCobrancaRoutes(app, ctx) {
    const {
        db: firebaseDb, banco, client, ADMINISTRADORES,
        botIniciadoEm, dispararCobrancaReal,
        verificarPromessasVencidas, sseService
    } = ctx;

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
                const total = await ctx.dispararCobrancaReal(data, tipo || null);
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
};