// routes/dashboard.js
const { getCicloAtual } = require('../services/statusService');

module.exports = function setupDashboardRoutes(app, ctx) {
    const { db: firebaseDb, banco } = ctx;

    // ─────────────────────────────────────────────────────
    // DASHBOARD
    // ─────────────────────────────────────────────────────
    app.get('/api/dashboard/resumo-bases', async (req, res) => {
        try {
            const basesSnap = await firebaseDb.collection('bases').get();

            let totalPendentes = 0, totalPromessas = 0;
            const result = await Promise.all(basesSnap.docs.map(async baseDoc => {
                const cliSnap = await firebaseDb.collection('clientes')
                    .where('base_id', '==', parseInt(baseDoc.id)).get();

                let pagos = 0, pend = 0, prom = 0;
                cliSnap.docs.forEach(doc => {
                    const c = doc.data();
                    if (c.status === 'cancelado') return;
                    if (c.status === 'pago' || c.status === 'isento') pagos++;
                    else if (c.status === 'promessa') prom++;
                    else pend++;
                });

                totalPendentes += pend;
                totalPromessas += prom;

                const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
                const refCiclo = getCicloAtual(10, agoraBR);
                return {
                    id: baseDoc.id,
                    nome: baseDoc.data().nome,
                    total: cliSnap.size,
                    pagos,
                    pendentes: pend,
                    promessas: prom,
                    mes_referencia: refCiclo.chave,
                };
            }));

            res.json({ bases: result, totalPendentes, totalPromessas });
        } catch(e) { res.json({ bases:[], totalPendentes:0, totalPromessas:0 }); }
    });

    app.get('/api/dashboard/caixa-hoje', async (req, res) => {
        try {
            const hoje = new Date(Date.now()-3*60*60*1000).toISOString().split('T')[0];
            const snap = await firebaseDb.collection('pagamentos_hoje').where('data','==',hoje).get();
            const rows = snap.docs.map(d=>d.data()).sort((a,b)=>(b.pago_em||'').localeCompare(a.pago_em||''));
            res.json(rows);
        } catch { res.json([]); }
    });

    app.get('/api/dashboard/alertas', async (req, res) => {
        try {
            const hojeStr   = new Date().toISOString().split('T')[0];
            const amanhaStr = new Date(Date.now()+86400000).toISOString().split('T')[0];
            const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);

            const [phSnap, paSnap, chamSnap] = await Promise.all([
                firebaseDb.collection('promessas').where('status','==','pendente').where('data_promessa','==',hojeStr).get(),
                firebaseDb.collection('promessas').where('status','==','pendente').where('data_promessa','==',amanhaStr).get(),
                firebaseDb.collection('chamados').where('status','==','aberto').get(),
            ]);

            const inadSnap = await firebaseDb.collection('clientes')
                .where('status', '==', 'pendente').get();
            const hoje = agoraBR.getUTCDate();
            let inadimplentes = 0;
            inadSnap.docs.forEach(doc => {
                const c = doc.data();
                const diaVenc = parseInt(c.dia_vencimento) || 10;
                if (hoje > diaVenc + 3) inadimplentes++;
            });

            const umDiaAtras = Date.now()-86400000;
            res.json({
                promessasHoje: phSnap.size,
                promessasAmanha: paSnap.size,
                promessasHojeDetalhe: phSnap.docs.map(d=>({nome:d.data().nome,numero:d.data().numero,data_promessa:d.data().data_promessa})),
                inadimplentes,
                chamadosAbertos: chamSnap.docs.filter(d=>d.data().aberto_em<umDiaAtras).length,
            });
        } catch { res.json({ promessasHoje:0, promessasAmanha:0, promessasHojeDetalhe:[], inadimplentes:0, chamadosAbertos:0 }); }
    });

    app.get('/api/dashboard/fluxo-clientes', async (req, res) => {
        const hoje = new Date(); const ma=hoje.getMonth()+1, aa=hoje.getFullYear(), ms=String(ma).padStart(2,'0');
        const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);

        const [entSnap,saiSnap,allCliSnap,canSnap,novSnap,csnSnap] = await Promise.all([
            firebaseDb.collection('novos_clientes').where('status','in',['confirmado','finalizado']).get(),
            firebaseDb.collection('cancelamentos').where('status','==','confirmado').get(),
            firebaseDb.collection('clientes').where('status','!=','cancelado').get(),
            firebaseDb.collection('clientes').where('status','==','cancelado').get(),
            firebaseDb.collection('novos_clientes').where('status','in',['confirmado','finalizado']).get(),
            firebaseDb.collection('cancelamentos').where('status','==','confirmado').get(),
        ]);

        const ent = entSnap.docs.filter(d=>{const x=d.data().finalizado_em; return x&&x.startsWith(`${aa}-${ms}`);}).length;
        const sai = saiSnap.docs.filter(d=>{const x=d.data().confirmado_em; return x&&x.startsWith(`${aa}-${ms}`);}).length;

        const historico = [];
        for(let i=5;i>=0;i--){
            const d=new Date(aa,ma-1-i,1);
            const m=String(d.getMonth()+1).padStart(2,'0');
            const a=d.getFullYear();
            const pf=`${a}-${m}`;
            historico.push({
                label: d.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}),
                entradas: novSnap.docs.filter(d=>d.data().finalizado_em?.startsWith(pf)).length,
                saidas: csnSnap.docs.filter(d=>d.data().confirmado_em?.startsWith(pf)).length,
            });
        }

        const ativosReais = allCliSnap.docs.filter(doc => {
            const c = doc.data();
            return c.status === 'pago' || c.status === 'isento';
        }).length;

        res.json({ mes:{entradas:ent,saidas:sai}, totalAtivos:ativosReais, totalCancelados:canSnap.size, historico });
    });
};