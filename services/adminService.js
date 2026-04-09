// services/adminService.js
const { getCicloAtual, deveSerCobrado } = require('./statusService');

// =====================================================
// Ciclo de cobrança: para LEMBRETE, aponta pro PRÓXIMO
// vencimento (ainda vai vencer). Para os demais tipos,
// aponta pro ciclo atual (já venceu ou em tolerância).
// =====================================================
function getCicloCobranca(diaVencimento, tipo, hojeBr) {
    const diaHoje = hojeBr.getUTCDate();
    
    if (tipo === 'lembrete') {
        // Lembrete é sempre NO DIA ANTERIOR ao vencimento
        // Portanto o ciclo de referência é o MÊS ATUAL
        const mesRef = hojeBr.getUTCMonth() + 1;
        const anoRef = hojeBr.getUTCFullYear();
        const mm = String(mesRef).padStart(2, '0');
        return { mesRef, anoRef, chave: `${mm}/${anoRef}`, docId: `${mm}-${anoRef}` };
    }
    
    // Demais tipos (atraso, reconquista): usa o ciclo normal
    return getCicloAtual(diaVencimento, hojeBr);
}

// =====================================================
// PERGUNTA AOS ADMINS (VOTAÇÃO VIA WHATSAPP)
// =====================================================
async function perguntarAdmins(client, firebaseDb, ADMINISTRADORES, datas, tipo, total, hojeStr, listaClientes = []) {
    const votacaoId = `votacao_${Date.now()}`;
    const TIPO_LABEL = {
        lembrete:          '📅 Lembrete (D-1)',
        atraso:            '⚠️ Atraso (D+3)',
        atraso_final:      '🔴 Atraso Final (D+5)',
        reconquista:       '💙 Reconquista (D+7)',
        reconquista_final: '💔 Última Chance (D+10)',
    };

    const nomes = listaClientes.slice(0, 30).map((c, i) => `${i + 1}. ${c.nome}`).join('\n');
    const extra = listaClientes.length > 30 ? `\n... e mais ${listaClientes.length - 30}` : '';

    const mensagem =
        `📬 *COBRANÇA AUTOMÁTICA*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📅 *Dia ${datas}* — ${TIPO_LABEL[tipo] || tipo}\n` +
        `👥 *${total} clientes:*\n\n` +
        `${nomes}${extra}\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `✅ Confirmar: *!sim*\n` +
        `❌ Pular: *!nao*`;

    for (const adm of ADMINISTRADORES) {
        await client.sendMessage(adm, mensagem).catch(() => {});
    }

    await firebaseDb.collection('votacoes').doc(votacaoId).set({
        datas, tipo, total, data: hojeStr,
        status: 'aguardando', criado_em: new Date().toISOString(), resolvido: false
    });

    await firebaseDb.collection('config').doc('ultima_votacao').set({
        votacaoId, criado_em: new Date().toISOString()
    });

    return new Promise((resolve) => {
        const unsubscribe = firebaseDb.collection('votacoes').doc(votacaoId)
            .onSnapshot((doc) => {
                if (!doc.exists) return;
                const data = doc.data();
                if (data.resolvido) {
                    unsubscribe();
                    if (data.resultado === 'aprovado') resolve(true);
                    else if (data.resultado === 'negado') resolve(false);
                    else resolve(null);
                }
            });

        // Timeout de 60 minutos — expira silenciosamente
        setTimeout(() => {
            unsubscribe();
            firebaseDb.collection('votacoes').doc(votacaoId).update({
                status: 'expirado', resolvido: true, resultado: 'expirado'
            }).catch(() => {});
            resolve(null);
        }, 60 * 60 * 1000);
    });
}

// =====================================================
// VERIFICAÇÃO DE COBRANÇAS AUTOMÁTICAS
// Roda a cada 2 horas — identifica quem deve ser cobrado
// baseado no HISTÓRICO DE PAGAMENTOS, não no campo status
// =====================================================
async function verificarCobrancasAutomaticas(client, firebaseDb, ADMINISTRADORES, situacaoRede, previsaoRetorno, redeNormal, dispararCobrancaReal) {
    const agora   = new Date();
    const agoraBR = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
    const hora       = agoraBR.getUTCHours();
    const diaSemana  = agoraBR.getUTCDay(); // 0=dom, 6=sab
    const diaHoje    = agoraBR.getUTCDate();
    const mesHoje    = agoraBR.getUTCMonth() + 1;
    const anoHoje    = agoraBR.getUTCFullYear();
    const hojeStr    = `${anoHoje}-${String(mesHoje).padStart(2,'0')}-${String(diaHoje).padStart(2,'0')}`;

    // Janela de operação: 11h-17h, seg-sab
    if (hora < 11 || hora >= 17) {
        console.log('⏰ Cobrança: fora do horário (11h-17h)');
        return;
    }
    if (diaSemana === 0) {
        console.log('📅 Cobrança: domingo — sem cobranças');
        return;
    }
    if (!redeNormal()) {
        console.log(`📡 Cobrança: rede ${situacaoRede} — bloqueado`);
        return;
    }

    // =====================================================
    // CALENDÁRIO DE COBRANÇAS
    // Para cada data de vencimento, calcula os dias de disparo:
    //   Data 10: lembrete=9, atraso=13, atraso_final=15, reconquista=17, reconquista_final=20
    //   Data 20: lembrete=19, atraso=23, atraso_final=25, reconquista=27, reconquista_final=30/1
    //   Data 30: lembrete=29, atraso=3(+1m), atraso_final=5(+1m), reconquista=7(+1m), reconquista_final=10(+1m)
    // =====================================================
    const calendarioCobranças = [
        // { dataVenc, tipo, diaDisparo, mesDisparo, anoDisparo }
        // Data 10
        { dataVenc: 10, tipo: 'lembrete',          diaDisparo:  9, mesDisparo: mesHoje, anoDisparo: anoHoje },
        { dataVenc: 10, tipo: 'atraso',             diaDisparo: 13, mesDisparo: mesHoje, anoDisparo: anoHoje },
        { dataVenc: 10, tipo: 'atraso_final',       diaDisparo: 15, mesDisparo: mesHoje, anoDisparo: anoHoje },
        { dataVenc: 10, tipo: 'reconquista',        diaDisparo: 17, mesDisparo: mesHoje, anoDisparo: anoHoje },
        { dataVenc: 10, tipo: 'reconquista_final',  diaDisparo: 20, mesDisparo: mesHoje, anoDisparo: anoHoje },
        // Data 20
        { dataVenc: 20, tipo: 'lembrete',          diaDisparo: 19, mesDisparo: mesHoje, anoDisparo: anoHoje },
        { dataVenc: 20, tipo: 'atraso',             diaDisparo: 23, mesDisparo: mesHoje, anoDisparo: anoHoje },
        { dataVenc: 20, tipo: 'atraso_final',       diaDisparo: 25, mesDisparo: mesHoje, anoDisparo: anoHoje },
        { dataVenc: 20, tipo: 'reconquista',        diaDisparo: 27, mesDisparo: mesHoje, anoDisparo: anoHoje },
        { dataVenc: 20, tipo: 'reconquista_final',  diaDisparo: 30, mesDisparo: mesHoje, anoDisparo: anoHoje },
        // Data 30 — lembrete ainda no mês, pós-vencimento no mês seguinte
        { dataVenc: 30, tipo: 'lembrete',          diaDisparo: 29, mesDisparo: mesHoje,          anoDisparo: anoHoje },
        { dataVenc: 30, tipo: 'atraso',             diaDisparo:  3, mesDisparo: mesHoje,          anoDisparo: anoHoje },
        { dataVenc: 30, tipo: 'atraso_final',       diaDisparo:  5, mesDisparo: mesHoje,          anoDisparo: anoHoje },
        { dataVenc: 30, tipo: 'reconquista',        diaDisparo:  7, mesDisparo: mesHoje,          anoDisparo: anoHoje },
        { dataVenc: 30, tipo: 'reconquista_final',  diaDisparo: 10, mesDisparo: mesHoje,          anoDisparo: anoHoje },
    ];

    // Filtra apenas os disparos de hoje
    const disparosHoje = calendarioCobranças.filter(c =>
        c.diaDisparo === diaHoje &&
        c.mesDisparo === mesHoje &&
        c.anoDisparo === anoHoje
    );

    // Se segunda-feira, também verifica disparos perdidos do fim de semana (dom + sáb)
    if (diaSemana === 1) {
        for (const diasAtras of [1, 2]) {
            const d = new Date(agoraBR.getTime() - diasAtras * 86400000);
            const diaD = d.getUTCDate();
            const mesD = d.getUTCMonth() + 1;
            const anoD = d.getUTCFullYear();
            const perdidos = calendarioCobranças.filter(c =>
                c.diaDisparo === diaD && c.mesDisparo === mesD && c.anoDisparo === anoD
            );
            disparosHoje.push(...perdidos);
        }
    }

    if (disparosHoje.length === 0) {
        console.log('📭 Cobrança automática: nenhum disparo hoje');
        return;
    }

    // Para cada disparo, verifica se já foi feito hoje e quais clientes cobrar
    const cobrancasParaExecutar = [];

    for (const disparo of disparosHoje) {
        // Verifica se já foi executado hoje
        const jaFeitoSnap = await firebaseDb.collection('log_cobrancas')
            .where('data_vencimento', '==', String(disparo.dataVenc))
            .where('tipo', '==', disparo.tipo)
            .where('data_envio', '==', hojeStr)
            .limit(1)
            .get();

        if (!jaFeitoSnap.empty) {
            console.log(`⏭️ Cobrança dia ${disparo.dataVenc} (${disparo.tipo}) já feita hoje`);
            continue;
        }

        // Busca clientes com esse dia de vencimento (número E string)
        const [snapNum, snapStr] = await Promise.all([
            firebaseDb.collection('clientes').where('dia_vencimento', '==', disparo.dataVenc).get(),
            firebaseDb.collection('clientes').where('dia_vencimento', '==', String(disparo.dataVenc)).get(),
        ]);
        const vistos = new Set();
        const clientesDocs = [...snapNum.docs, ...snapStr.docs].filter(d => {
            if (vistos.has(d.id)) return false;
            vistos.add(d.id); return true;
        });

        if (clientesDocs.length === 0) continue;

        // Determina o ciclo de referência: lembrate = próximo ciclo, demais = ciclo atual
        const cicloRef = getCicloCobranca(disparo.dataVenc, disparo.tipo, agoraBR);

        // Para cada cliente, verifica o histórico do ciclo
        const clientesParaCobrar = [];
        for (const doc of clientesDocs) {
            const cliente = { id: doc.id, ...doc.data() };

            // Cancelados nunca cobrar
            if (cliente.status === 'cancelado') continue;

            // Verifica se tem carnê pendente
            const carneSnap = await firebaseDb.collection('carne_solicitacoes')
                .where('cliente_id', '==', doc.id)
                .where('status', 'in', ['solicitado', 'impresso'])
                .limit(1)
                .get();
            if (!carneSnap.empty) {
                console.log(`   ⏭️ ${cliente.nome} — tem carnê pendente`);
                continue;
            }

            // Busca registro do histórico do ciclo de cobrança
            const historicoDoc = await firebaseDb.collection('clientes').doc(doc.id)
                .collection('historico_pagamentos').doc(cicloRef.docId).get().catch(() => null);
            const registro = historicoDoc?.exists ? historicoDoc.data() : null;

            if (!deveSerCobrado(cliente, registro)) {
                console.log(`   ✅ ${cliente.nome} — já pagou ${cicloRef.chave}`);
                continue;
            }

            clientesParaCobrar.push(cliente);
        }

        if (clientesParaCobrar.length > 0) {
            cobrancasParaExecutar.push({
                dataVenc: String(disparo.dataVenc),
                tipo: disparo.tipo,
                clientes: clientesParaCobrar,
            });
        }
    }

    if (cobrancasParaExecutar.length === 0) {
        console.log('📭 Cobrança automática: todos já pagaram ou sem clientes elegíveis');
        return;
    }

    // Pergunta aos admins para cada grupo
    for (const cobranca of cobrancasParaExecutar) {
        const autorizado = await perguntarAdmins(
            client, firebaseDb, ADMINISTRADORES,
            cobranca.dataVenc, cobranca.tipo, cobranca.clientes.length,
            hojeStr, cobranca.clientes
        );

        if (autorizado === true) {
            console.log(`✅ Autorizado! Disparando dia ${cobranca.dataVenc} — ${cobranca.tipo}`);
            console.log(`📋 Enviando ${cobranca.clientes.length} clientes para disparo`);
            console.log(`📋 NOMES: ${cobranca.clientes.map(c => c.nome).join(', ')}`);
            await dispararCobrancaReal(client, firebaseDb, cobranca.dataVenc, cobranca.tipo, cobranca.clientes);
            await new Promise(r => setTimeout(r, 2000));
        } else if (autorizado === false) {
            console.log(`❌ Admin negou cobrança dia ${cobranca.dataVenc} (${cobranca.tipo})`);
        } else {
            console.log(`⏰ Votação expirou para dia ${cobranca.dataVenc} — tentará no próximo ciclo`);
        }
    }
}

module.exports = { perguntarAdmins, verificarCobrancasAutomaticas };