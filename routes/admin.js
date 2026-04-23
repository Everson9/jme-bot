// routes/admin.js
const { getCicloAtual, calcularStatusCliente } = require('../services/statusService');

module.exports = function setupAdminRoutes(app, ctx) {
    const { db: firebaseDb, banco, executarMigracao } = ctx;

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
};