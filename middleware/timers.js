'use strict';

// =====================================================
// AGENDAMENTOS / TIMERS EM BACKGROUND
// Cobrança automática, limpeza de logs, promessas do dia
// =====================================================

let timersIniciados = false;
const timersAtivos = [];

function iniciarTimers(client, firebaseDb, ADMINISTRADORES, ctx) {
    if (timersIniciados) {
        console.log('⏱️  Timers já estão rodando — ignorando reentrada');
        return;
    }
    timersIniciados = true;

    const { dispararCobrancaReal, verificarCobrancasAutomaticas,
            situacaoRede, previsaoRetorno, redeNormal, state, banco, sseService } = ctx;

// Helper para rastrear e limpar timers no reconecte
function trackedSetInterval(fn, ms) {
    const id = setInterval(fn, ms);
    timersAtivos.push(id);
    return id;
}
function trackedSetTimeout(fn, ms) {
    const id = setTimeout(fn, ms);
    timersAtivos.push(id);
    return id;
}

    // ── Cobrança automática a cada 2h (primeira após 10s) ──
    async function rodarCobrancas() {
        await verificarCobrancasAutomaticas(
            client, firebaseDb, ADMINISTRADORES,
            ctx.situacaoRede, ctx.previsaoRetorno, redeNormal,
            (data, tipo, clientes) => dispararCobrancaReal(client, firebaseDb, data, tipo, clientes)
        );
    }
    trackedSetTimeout(() => { rodarCobrancas().catch(console.error); }, 10 * 1000);
    trackedSetInterval(() => { rodarCobrancas().catch(console.error); }, 2 * 60 * 60 * 1000);

    // ── Limpeza de logs antigos (1 mês) ──
    async function limparLogsAntigos() {
        try {
            const mesAtras = new Date(); mesAtras.setMonth(mesAtras.getMonth() - 1);
            const colecoes = ['log_bot', 'log_cobrancas', 'log_comprovantes', 'log_atendimentos'];
            for (const colecao of colecoes) {
                const snapshot = await firebaseDb.collection(colecao)
                    .where('criado_em', '<', mesAtras.toISOString()).get();
                if (snapshot.size === 0) continue;
                const batch = firebaseDb.batch();
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                console.log(`   🗑️ ${snapshot.size} registros antigos de ${colecao}`);
            }
        } catch (error) { console.error('Erro na limpeza:', error); }
    }
    trackedSetInterval(() => { if (new Date().getHours() === 3) limparLogsAntigos(); }, 60 * 60 * 1000);

    // ── Promessas do dia (notifica admins às 08:00 BRT) ──
    async function verificarPromessasDoDia() {
        try {
            const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
            const hoje = agoraBR.toISOString().split('T')[0];
            const snapshot = await firebaseDb.collection('promessas')
                .where('data_promessa', '==', hoje).where('status', '==', 'pendente').get();
            if (snapshot.empty) return;
            let mensagem = `🤝 *PROMESSAS DE HOJE (${hoje})*\n\n`;
            snapshot.docs.forEach((doc, i) => { const p = doc.data(); mensagem += `${i+1}. ${p.nome || 'sem nome'}\n`; });
            for (const adm of ADMINISTRADORES) await client.sendMessage(adm, mensagem).catch(() => {});
            console.log(`🔔 Notificação de promessas: ${snapshot.size}`);
        } catch (error) { console.error('Erro promessas:', error); }
    }
    trackedSetInterval(async () => {
        const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
        if (agoraBR.getUTCHours() === 8 && agoraBR.getUTCMinutes() === 0) await verificarPromessasDoDia();
    }, 60 * 1000);
}

module.exports = iniciarTimers;
