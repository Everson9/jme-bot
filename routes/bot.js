// routes/bot.js
const { getCicloAtual } = require('../services/statusService');

module.exports = function setupBotRoutes(app, ctx) {
    const {
        db: firebaseDb, banco, ADMINISTRADORES,
        botAtivo, botIniciadoEm, situacaoRede, previsaoRetorno,
        horarioFuncionamento, horarioCobranca,
        sseService, client
    } = ctx;

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
            atendimentosAtivos: 0,
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

    app.get('/api/estados', (req, res) => res.json({ estados: [], stats: { atendimentoHumano: 0 } }));

    app.post('/api/estados/:numero/reset', async (req, res) => {
        const numero = req.params.numero.includes('@c.us') ? req.params.numero : `55${req.params.numero.replace(/\D/g,'')}@c.us`;
        try {
            await banco.dbRemoverAtendimentoHumano(numero);
            await banco.dbLimparHistorico(numero);
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
    // SAÚDE E MÉTRICAS
    // ─────────────────────────────────────────────────────
    app.get('/api/health', (req, res) => res.json({ status:'ok', timestamp:new Date().toISOString(), uptime:process.uptime(), memoria:process.memoryUsage(), botAtivo, conexaoWhatsApp:!!botIniciadoEm }));

    app.get('/api/metricas', async (req, res) => {
        try {
            const hoje=new Date().toISOString().split('T')[0], ha=new Date(Date.now()-3600000).toISOString();
            const [uhSnap,atSnap] = await Promise.all([
                firebaseDb.collection('log_bot').where('criado_em','>=',ha).get(),
                firebaseDb.collection('log_atendimentos').where('iniciado_em','>=',hoje).get(),
            ]);
            res.json({ bot:{ativo:botAtivo,iniciadoEm:botIniciadoEm,uptime:botIniciadoEm?Math.floor((Date.now()-botIniciadoEm)/1000):0}, banco:{tipo:'Firebase Firestore'}, atendimentos:{ativos:0,totalHoje:atSnap.size}, mensagens:{ultimaHora:uhSnap.size}, sistema:{memoria:process.memoryUsage(),versao:process.version} });
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.get('/api/metricas/fila', (req, res) => res.json({ mensagem: 'Métricas de fila disponíveis apenas em tempo real' }));

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
    // WHATSAPP
    // ─────────────────────────────────────────────────────
    app.post('/api/whatsapp/desconectar', async (req, res) => {
        try { await client.logout(); res.json({ ok: true }); }
        catch(e) { res.status(500).json({ ok: false, erro: e.message }); }
    });
};