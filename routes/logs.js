// routes/logs.js

module.exports = function setupLogsRoutes(app, ctx) {
    const { db: firebaseDb } = ctx;

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
};