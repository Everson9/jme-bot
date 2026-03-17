// services/adminService.js
async function perguntarAdmins(client, firebaseDb, ADMINISTRADORES, data, tipo, quantidade, hojeStr) {
    const mensagem = 
        `🤖 *AUTORIZAÇÃO PARA COBRANÇA*\n\n` +
        `📅 Data: ${data}\n📋 Tipo: ${tipo || 'automático'}\n👥 Clientes: ${quantidade}\n\n` +
        `Deseja autorizar?\n\n✅ *!sim* - Autorizar\n❌ *!nao* - Cancelar\n\n⏳ 5 minutos`;
    
    const respostas = {};
    for (const adm of ADMINISTRADORES) {
        try { respostas[adm] = { msg: await client.sendMessage(adm, mensagem), respondido: false };
        } catch (e) { console.error(`Erro ao enviar para admin ${adm}:`, e); }
    }
    
    return new Promise((resolve) => {
        const timeout = setTimeout(() => { client.removeListener('message', listener); resolve(false); }, 5 * 60 * 1000);
        const listener = async (msg) => {
            if (ADMINISTRADORES.includes(msg.from) && !respostas[msg.from]?.respondido) {
                const texto = msg.body?.toLowerCase() || '';
                if (texto === '!sim') {
                    respostas[msg.from].respondido = true;
                    clearTimeout(timeout); client.removeListener('message', listener); resolve(true);
                }
                if (texto === '!nao') {
                    respostas[msg.from].respondido = true;
                    clearTimeout(timeout); client.removeListener('message', listener);
                    await firebaseDb.collection('config').doc('cobranca_negada').set({
                        data: hojeStr, motivo: 'negado_admin', timestamp: new Date().toISOString()
                    });
                    resolve(false);
                }
            }
        };
        client.on('message', listener);
    });
}

async function verificarCobrancasAutomaticas(client, firebaseDb, ADMINISTRADORES, situacaoRede, previsaoRetorno, redeNormal, dispararCobrancaReal) {
    console.log('⏰ Verificando cobranças automáticas...');

    const agora = new Date();
    const hora = agora.getHours();
    const dia = agora.getDate();
    const mes = agora.getMonth() + 1;
    const ano = agora.getFullYear();
    const diaSemana = agora.getDay();
    const hojeStr = agora.toISOString().split('T')[0];
    
    // Verifica se já foi negado hoje
    const negadoHoje = await firebaseDb.collection('config').doc('cobranca_negada').get();
    if (negadoHoje.exists && negadoHoje.data().data === hojeStr) {
        console.log(`⏭️ Cobrança já negada hoje`);
        return;
    }
    
    // Verificações
    if (hora < 11 || hora >= 17) { console.log('⏰ Fora do horário'); return; }
    if (diaSemana === 0) { console.log('📅 Domingo'); return; }
    if (!redeNormal()) {
        console.log(`📡 Rede ${situacaoRede} - bloqueado`);
        await firebaseDb.collection('config').doc('cobranca_adiada').set({
            valor: { dia, mes, ano, motivoBloqueio: situacaoRede, previsao: previsaoRetorno, entradas: [] }
        });
        return;
    }
    
    // Verifica dias de vencimento
    const diasVenc = [10, 20, 30];
    const cobrancas = [];
    
    for (const venc of diasVenc) {
        const atraso = dia - venc;
        let tipo = null;
        if (atraso === -1) tipo = 'lembrete';
        else if (atraso === 3) tipo = 'atraso';
        else if (atraso === 5) tipo = 'atraso_final';
        else if (atraso === 7) tipo = 'reconquista';
        else if (atraso === 10) tipo = 'reconquista_final';
        
        if (tipo) {
            const snap = await firebaseDb.collection('clientes')
                .where('dia_vencimento', '==', venc)
                .where('status', '==', 'pendente')
                .get();
            if (snap.size > 0) cobrancas.push({ data: String(venc), tipo, clientes: snap.size });
        }
    }
    
    if (cobrancas.length === 0) { console.log('📭 Nada para hoje'); return; }
    
    // Pergunta admins
    let resumo = `📋 *COBRANÇAS HOJE*\n\n`;
    cobrancas.forEach(c => resumo += `📅 Data ${c.data} - ${c.tipo} - ${c.clientes} clientes\n`);
    for (const adm of ADMINISTRADORES) await client.sendMessage(adm, resumo).catch(() => {});
    
    const total = cobrancas.reduce((acc, c) => acc + c.clientes, 0);
    const autorizado = await perguntarAdmins(
        client, firebaseDb, ADMINISTRADORES,
        cobrancas.map(c => c.data).join(', '), 'automático', total, hojeStr
    );
    
    if (!autorizado) {
        console.log('❌ Cobrança negada');
        await firebaseDb.collection('config').doc('cobranca_adiada').set({
            valor: { dia, mes, ano, motivoBloqueio: 'negado_admin', entradas: cobrancas }
        });
        return;
    }
    
    // Executa
    console.log('✅ Autorizado, iniciando...');
    for (const c of cobrancas) {
        await dispararCobrancaReal(client, firebaseDb, c.data, c.tipo);
        await new Promise(r => setTimeout(r, 2000));
    }
}

module.exports = { perguntarAdmins, verificarCobrancasAutomaticas };