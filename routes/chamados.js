// routes/chamados.js

module.exports = function setupChamadosRoutes(app, ctx) {
    const { db: firebaseDb, banco, sseService } = ctx;

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
};