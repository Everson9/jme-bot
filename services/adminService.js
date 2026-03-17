// services/adminService.js - COMPLETO E CORRIGIDO

// =====================================================
// FUNÇÃO PARA PERGUNTAR AOS ADMINS (COM VOTAÇÃO)
// =====================================================
async function perguntarAdmins(client, firebaseDb, ADMINISTRADORES, datas, tipo, total, hojeStr) {
    console.log(`🤔 Perguntando aos admins sobre cobrança dia ${datas}...`);
    
    // Cria um ID único para esta votação
    const votacaoId = `votacao_${Date.now()}`;
    
    // Prepara a mensagem
    const mensagem = 
        `🤖 *AUTORIZAÇÃO PARA COBRANÇA*\n\n` +
        `📅 *Datas:* ${datas}\n` +
        `📋 *Tipo:* ${tipo}\n` +
        `👥 *Total de clientes:* ${total}\n\n` +
        `✅ *Para autorizar, qualquer admin responda:*\n` +
        `!cobrar-sim ${votacaoId}\n\n` +
        `❌ *Para negar, qualquer admin responda:*\n` +
        `!cobrar-nao ${votacaoId}\n\n` +
        `⏳ *Aguardando resposta (5 minutos)...*`;

    // Envia para todos os admins
    for (const adm of ADMINISTRADORES) {
        await client.sendMessage(adm, mensagem).catch(() => {});
    }
    
    // Salva no Firebase para controle
    await firebaseDb.collection('votacoes').doc(votacaoId).set({
        datas,
        tipo,
        total,
        data: hojeStr,
        status: 'aguardando',
        criado_em: new Date().toISOString(),
        votos: [],
        resolvido: false
    });
    
    // Aguarda resposta (promessa que será resolvida por um listener externo)
    return new Promise((resolve) => {
        // Cria um listener temporário no Firebase
        const unsubscribe = firebaseDb.collection('votacoes').doc(votacaoId)
            .onSnapshot((doc) => {
                if (!doc.exists) return;
                
                const data = doc.data();
                if (data.resolvido) {
                    unsubscribe();
                    if (data.resultado === 'aprovado') {
                        console.log('✅ Votação aprovada');
                        resolve(true);
                    } else {
                        console.log('❌ Votação negada');
                        resolve(false);
                    }
                }
            });
        
        // Timeout de 5 minutos
        setTimeout(() => {
            unsubscribe();
            console.log('⏰ Tempo esgotado, assumindo negado');
            
            // Marca como expirado no Firebase
            firebaseDb.collection('votacoes').doc(votacaoId).update({
                status: 'expirado',
                resolvido: true,
                resultado: 'negado'
            }).catch(() => {});
            
            resolve(false);
        }, 5 * 60 * 1000);
    });
}

// =====================================================
// FUNÇÃO PARA VERIFICAR COBRANÇAS AUTOMÁTICAS
// =====================================================
async function verificarCobrancasAutomaticas(client, firebaseDb, ADMINISTRADORES, situacaoRede, previsaoRetorno, redeNormal, dispararCobrancaReal) {
    console.log('⏰ Verificando cobranças automáticas...');

    const agora = new Date();
    const hora = agora.getHours();
    const dia = agora.getDate();
    const mes = agora.getMonth() + 1;
    const ano = agora.getFullYear();
    const diaSemana = agora.getDay();
    const hojeStr = agora.toISOString().split('T')[0];
    
    // =====================================================
    // VERIFICAÇÕES INICIAIS
    // =====================================================
    if (hora < 11 || hora >= 17) { 
        console.log('⏰ Fora do horário (11h-17h)'); 
        return; 
    }
    
    if (diaSemana === 0) { 
        console.log('📅 Domingo - sem cobranças'); 
        return; 
    }
    
    if (!redeNormal()) {
        console.log(`📡 Rede ${situacaoRede} - bloqueado`);
        await firebaseDb.collection('config').doc('cobranca_adiada').set({
            valor: { 
                dia, mes, ano, 
                motivoBloqueio: situacaoRede, 
                previsao: previsaoRetorno, 
                entradas: [] 
            }
        });
        return;
    }
    
    // =====================================================
    // VERIFICAR SE JÁ FOI NEGADO HOJE
    // =====================================================
    const negadoHoje = await firebaseDb.collection('config').doc('cobranca_negada').get();
    if (negadoHoje.exists && negadoHoje.data().data === hojeStr) {
        console.log(`⏭️ Cobrança já negada hoje`);
        return;
    }
    
    // =====================================================
    // VERIFICAR DIAS DE VENCIMENTO
    // =====================================================
    const diasVenc = [10, 20, 30];
    const cobrancasParaExecutar = [];
    
    for (const venc of diasVenc) {
        const atraso = dia - venc;
        let tipo = null;
        
        if (atraso === -1) tipo = 'lembrete';
        else if (atraso === 3) tipo = 'atraso';
        else if (atraso === 5) tipo = 'atraso_final';
        else if (atraso === 7) tipo = 'reconquista';
        else if (atraso === 10) tipo = 'reconquista_final';
        
        if (tipo) {
            // 🔥 VERIFICAR SE JÁ FOI COBRADO HOJE
            const jaCobradoHoje = await firebaseDb.collection('log_cobrancas')
                .where('data_vencimento', '==', String(venc))
                .where('tipo', '==', tipo)
                .where('data_envio', '==', hojeStr)
                .get();
            
            if (!jaCobradoHoje.empty) {
                console.log(`⏭️ Data ${venc} (${tipo}) já processada hoje - ignorando`);
                continue;
            }
            
            // 🔥 BUSCA CLIENTES PENDENTES DESTE DIA
            const clientesSnapshot = await firebaseDb.collection('clientes')
                .where('dia_vencimento', '==', venc)
                .where('status', '==', 'pendente')
                .get();
            
            if (clientesSnapshot.size > 0) {
                // 🔥 FILTRA CLIENTES QUE NÃO TÊM CARNÊ PENDENTE
                const clientesValidos = [];
                
                for (const doc of clientesSnapshot.docs) {
                    const cliente = doc.data();
                    
                    // ⚠️ VERIFICA SE TEM CARNÊ SOLICITADO PENDENTE
                    const carnesPendentes = await firebaseDb.collection('carne_solicitacoes')
                        .where('cliente_id', '==', doc.id)
                        .where('status', 'in', ['solicitado', 'impresso'])
                        .get();
                    
                    if (!carnesPendentes.empty) {
                        console.log(`   ⏭️ Cliente ${cliente.nome} tem carnê pendente - não cobrar`);
                        continue; // Pula este cliente
                    }
                    
                    // Cliente válido para cobrança
                    clientesValidos.push(cliente);
                }
                
                if (clientesValidos.length > 0) {
                    cobrancasParaExecutar.push({ 
                        data: String(venc), 
                        tipo, 
                        clientes: clientesValidos.length,
                        total_original: clientesSnapshot.size
                    });
                }
            }
        }
    }
    
    if (cobrancasParaExecutar.length === 0) { 
        console.log('📭 Nada para hoje (já processado, sem clientes ou todos com carnê)'); 
        return; 
    }
    
    // =====================================================
    // PERGUNTA AOS ADMINS
    // =====================================================
    let resumo = `📋 *COBRANÇAS HOJE*\n\n`;
    cobrancasParaExecutar.forEach(c => {
        const ignorados = c.total_original - c.clientes;
        resumo += `📅 Data ${c.data} - ${c.tipo}\n`;
        resumo += `   👥 ${c.clientes} clientes (${ignorados} ignorados por carnê)\n`;
    });
    
    for (const adm of ADMINISTRADORES) {
        await client.sendMessage(adm, resumo).catch(() => {});
    }
    
    const total = cobrancasParaExecutar.reduce((acc, c) => acc + c.clientes, 0);
    const datasStr = cobrancasParaExecutar.map(c => c.data).join(', ');
    
    // Pergunta aos admins
    const autorizado = await perguntarAdmins(
        client, firebaseDb, ADMINISTRADORES,
        datasStr, 'automático', total, hojeStr
    );
    
    if (!autorizado) {
        console.log('❌ Cobrança negada');
        await firebaseDb.collection('config').doc('cobranca_adiada').set({
            valor: { 
                dia, mes, ano, 
                motivoBloqueio: 'negado_admin', 
                entradas: cobrancasParaExecutar.map(c => ({
                    data: c.data,
                    tipo: c.tipo,
                    clientes: c.clientes
                }))
            }
        });
        
        await firebaseDb.collection('config').doc('cobranca_negada').set({
            data: hojeStr,
            motivo: 'negado_admin'
        });
        
        return;
    }
    
    // =====================================================
    // EXECUTA AS COBRANÇAS
    // =====================================================
    console.log('✅ Autorizado, iniciando cobranças...');
    
    for (const c of cobrancasParaExecutar) {
        console.log(`🚀 Disparando: Data ${c.data} - ${c.tipo} (${c.clientes} clientes)`);
        await dispararCobrancaReal(client, firebaseDb, c.data, c.tipo);
        await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log('✅ Todas as cobranças concluídas!');
}

// =====================================================
// EXPORTA AS FUNÇÕES
// =====================================================
module.exports = { 
    perguntarAdmins, 
    verificarCobrancasAutomaticas 
};