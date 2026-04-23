// routes/instalacoes.js

module.exports = function setupInstalacoesRoutes(app, ctx) {
    const { db: firebaseDb, banco, client, botIniciadoEm, isentarMesEntrada } = ctx;

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
};