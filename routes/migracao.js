// routes/migracao.js

module.exports = function setupMigracaoRoutes(app, ctx) {
    const { executarMigracao } = ctx;

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
};