// routes/relatorios.js
const { getCicloAtual, calcularStatusCliente } = require('../services/statusService');

module.exports = function setupRelatoriosRoutes(app, ctx) {
    const { db: firebaseDb, banco } = ctx;

    // ─────────────────────────────────────────────────────
    // RELATÓRIOS
    // ─────────────────────────────────────────────────────
    app.get('/api/relatorio', async (req, res) => {
        try { res.json(await banco.dbRelatorio()); } catch(e) { res.status(500).json({ erro: e.message }); }
    });

    app.get('/api/relatorio/inadimplentes', async (req, res) => {
        const dias = parseInt(req.query.dias)||5;
        try {
            const agoraBR = new Date(Date.now()-3*60*60*1000);
            const diaHoje = agoraBR.getUTCDate();

            const [snap, basesSnap] = await Promise.all([
                firebaseDb.collection('clientes').where('status', '==', 'pendente').get(),
                firebaseDb.collection('bases').get(),
            ]);

            const baseMap = {};
            basesSnap.docs.forEach(d => { baseMap[d.id] = d.data().nome; });

            const lista = [];
            snap.docs.forEach(doc => {
                const c = doc.data();
                if (c.status === 'cancelado') return;

                const diaVenc = parseInt(c.dia_vencimento) || 10;
                let atraso = diaHoje >= diaVenc
                    ? diaHoje - diaVenc
                    : 30 - diaVenc + diaHoje;

                if (atraso < dias) return;

                lista.push({
                    id: doc.id,
                    nome: c.nome,
                    telefone: c.telefone,
                    plano: c.plano,
                    dia_vencimento: diaVenc,
                    base_nome: baseMap[String(c.base_id)] || null,
                    dias_pendente: atraso,
                });
            });

            lista.sort((a,b) => b.dias_pendente - a.dias_pendente);
            res.json(lista);
        } catch { res.json([]); }
    });

    app.get('/api/graficos/atendimentos', async (req, res) => {
        try {
            const seteDiasAtras = new Date(); seteDiasAtras.setDate(seteDiasAtras.getDate()-7);
            const snap = await firebaseDb.collection('log_atendimentos').where('iniciado_em','>=',seteDiasAtras.toISOString()).get();
            const m = new Map(); snap.docs.forEach(d=>{const x=d.data().iniciado_em?.split('T')[0]; if(x) m.set(x,(m.get(x)||0)+1);});
            res.json(Array.from(m.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([dia,total])=>({dia,total})));
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.get('/api/graficos/cobrancas', async (req, res) => {
        try {
            const seteDiasAtras = new Date(); seteDiasAtras.setDate(seteDiasAtras.getDate()-7);
            const snap = await firebaseDb.collection('log_cobrancas').where('enviado_em','>=',seteDiasAtras.toISOString()).get();
            const m = new Map(); snap.docs.forEach(d=>{const x=d.data().enviado_em?.split('T')[0]; if(x) m.set(x,(m.get(x)||0)+1);});
            res.json(Array.from(m.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([dia,total])=>({dia,total})));
        } catch (e) { res.status(500).json({ erro: e.message }); }
    });

    app.get('/api/exportar/clientes', async (req, res) => {
        try {
            const snap = await firebaseDb.collection('clientes').get();
            const clientes = await Promise.all(snap.docs.map(async doc => {
                const c={id:doc.id,...doc.data()};
                let base_nome=null;
                if (c.base_id) { const b=await firebaseDb.collection('bases').doc(String(c.base_id)).get(); if(b.exists) base_nome=b.data().nome; }
                const ciclo = getCicloAtual(parseInt(c.dia_vencimento)||10);
                let hist = {};
                try {
                    const hDoc = await firebaseDb.collection('clientes').doc(c.id)
                        .collection('historico_pagamentos').doc(ciclo.docId).get().catch(()=>null);
                    if (hDoc?.exists) hist[ciclo.docId] = hDoc.data();
                } catch(_) {}
                return { status:calcularStatusCliente(c, hist), mes_referencia:ciclo.chave, nome:c.nome, cpf:c.cpf, telefone:c.telefone, endereco:c.endereco, numero_casa:c.numero, plano:c.plano, forma_pagamento:c.forma_pagamento, observacao:c.observacao, pppoe:c.senha, dia_vencimento:c.dia_vencimento, base:base_nome, criado_em:c.criado_em };
            }));
            clientes.sort((a,b)=>{ if(a.base!==b.base) return (a.base||'').localeCompare(b.base||''); return (a.nome||'').localeCompare(b.nome||''); });
            res.json(clientes);
        } catch(e) { res.status(500).json({ erro: e.message }); }
    });

    app.get('/api/planilha/resumo', async (req, res) => {
        try {
            const result = {};
            const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
            for (const dia of ['10','20','30']) {
                const snap = await firebaseDb.collection('clientes').where('dia_vencimento','==',parseInt(dia)).get();
                const cicloRef = getCicloAtual(parseInt(dia), agoraBR);

                const pagosNoCiclo = new Set();
                await Promise.all(snap.docs.map(async doc => {
                    const hDoc = await firebaseDb.collection('clientes').doc(doc.id)
                        .collection('historico_pagamentos').doc(cicloRef.docId).get().catch(() => null);
                    const reg = hDoc?.exists ? hDoc.data() : null;
                    if (reg && (reg.status === 'pago' || reg.status === 'isento')) pagosNoCiclo.add(doc.id);
                }));

                const pagos = pagosNoCiclo.size;
                result[dia] = {
                    pagos,
                    pendentes: snap.size - pagos,
                    total: snap.size,
                    mes_referencia: cicloRef.chave,
                    clientes: snap.docs.map(d => {
                        const x = d.data();
                        const pago = pagosNoCiclo.has(d.id);
                        return {
                            nome: x.nome,
                            telefone: x.telefone,
                            status: pago ? 'pago' : x.status,
                            forma_pagamento: x.forma_pagamento,
                            baixa_sgp: x.baixa_sgp || 0,
                        };
                    }).sort((a,b) => (a.nome||'').localeCompare(b.nome||'')),
                };
            }
            res.json(result);
        } catch(e) { res.status(500).json({ erro: e.message }); }
    });
};