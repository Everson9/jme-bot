// routes/index.js
module.exports = function setupRoutes(app, ctx) {
    const { fs, path } = ctx;

    // ─────────────────────────────────────────────────────
    // IMPORTAR MÓDULOS DE ROTAS
    // ─────────────────────────────────────────────────────
    require('./bot')(app, ctx);
    require('./clientes')(app, ctx);
    require('./cobranca')(app, ctx);
    require('./dashboard')(app, ctx);
    require('./logs')(app, ctx);
    require('./chamados')(app, ctx);
    require('./cancelamentos')(app, ctx);
    require('./instalacoes')(app, ctx);
    require('./relatorios')(app, ctx);
    require('./admin')(app, ctx);
    require('./boas-vindas')(app, ctx);
    require('./migracao')(app, ctx);

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