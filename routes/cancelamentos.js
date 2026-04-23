// routes/cancelamentos.js

module.exports = function setupCancelamentosRoutes(app, ctx) {
    const { db: firebaseDb, banco, client, ADMINISTRADORES, botIniciadoEm, sseService } = ctx;

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
};