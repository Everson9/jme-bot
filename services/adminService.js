// services/adminService.js - COMPLETO E CORRIGIDO

const { calcularStatusCliente } = require('./statusService');

// =====================================================
// FUNÇÃO PARA PERGUNTAR AOS ADMINS (COM VOTAÇÃO)
// =====================================================
async function perguntarAdmins(client, firebaseDb, ADMINISTRADORES, datas, tipo, total, hojeStr, listaClientes = []) {
    console.log(`🤔 Perguntando aos admins sobre cobrança dia ${datas}...`);
    
    const votacaoId = `votacao_${Date.now()}`;
    const TIPO_LABEL = {
        lembrete: '📅 Lembrete (D-1)',
        atraso: '⚠️ Atraso (D+3)',
        atraso_final: '🔴 Atraso Final (D+5)',
        reconquista: '💙 Reconquista (D+7)',
        reconquista_final: '💔 Última Chance (D+10)',
    };

    // Monta lista de nomes
    const nomes = listaClientes.slice(0, 30).map((c, i) => `${i+1}. ${c.nome}`).join('\n');
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
    
    // Salva no Firebase para controle
    await firebaseDb.collection('votacoes').doc(votacaoId).set({
        datas,
        tipo,
        total,
        data: hojeStr,
        status: 'aguardando',
        criado_em: new Date().toISOString(),
        resolvido: false
    });

    // Salva último votacaoId ativo para os comandos simplificados !sim e !nao
    await firebaseDb.collection('config').doc('ultima_votacao').set({
        votacaoId,
        criado_em: new Date().toISOString()
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
                    } else if (data.resultado === 'negado') {
                        console.log('❌ Votação negada pelo admin');
                        resolve(false);
                    } else {
                        // expirado ou outro — não bloqueia
                        resolve(null);
                    }
                }
            });
        
        // Timeout de 5 minutos — expira silenciosamente (não salva cobranca_negada para não bloquear o dia)
        setTimeout(() => {
            unsubscribe();
            console.log('⏰ Votação expirada sem resposta — será tentada novamente no próximo ciclo');
            firebaseDb.collection('votacoes').doc(votacaoId).update({
                status: 'expirado',
                resolvido: true,
                resultado: 'expirado'  // diferente de 'negado' — não bloqueia o dia
            }).catch(() => {});
            resolve(null);  // null = expirou, não negou
        }, 5 * 60 * 1000);
    });
}

// =====================================================
// FUNÇÃO PARA VERIFICAR COBRANÇAS AUTOMÁTICAS
// =====================================================
async function verificarCobrancasAutomaticas(client, firebaseDb, ADMINISTRADORES, situacaoRede, previsaoRetorno, redeNormal, dispararCobrancaReal) {
    console.log('⏰ Verificando cobranças automáticas...');

    const agora = new Date();
    // Ajuste para horário de Brasília (UTC-3)
    const agoraBR = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
    const hora = agoraBR.getUTCHours();
    const dia = agoraBR.getUTCDate();
    const mes = agoraBR.getUTCMonth() + 1;
    const ano = agoraBR.getUTCFullYear();
    const diaSemana = agoraBR.getUTCDay();
    // hojeStr no horário de Brasília
    const hojeStr = `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
    
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
    
    // Sem bloqueio por negação — admin pode negar e ser perguntado novamente no próximo ciclo
    
    // =====================================================
    // VERIFICAR DIAS DE VENCIMENTO
    // =====================================================
    const diasVenc = [10, 20, 30];
    const cobrancasParaExecutar = [];

    // Se hoje é segunda (diaSemana=1), também verifica o domingo que passou
    // pois cobranças de domingo são puladas e devem ser feitas na segunda
    const diasParaVerificar = [dia];
    if (diaSemana === 1) {
        diasParaVerificar.push(dia - 1); // ontem = domingo
    }
    
    for (const venc of diasVenc) {
        let tipo = null;

        for (const diaVerif of diasParaVerificar) {
            // Verificar lembrete ANTES de calcular atraso de virada
            // dia 9 → venc 10, dia 19 → venc 20, dia 29 → venc 30
            if (diaVerif === venc - 1) {
                tipo = 'lembrete';
                break;
            } else {
                // Calcula atraso considerando virada de mês
                let atraso;
                if (diaVerif >= venc) {
                    atraso = diaVerif - venc; // mesmo mês
                } else {
                    // Dia atual < venc → estamos no mês seguinte ao vencimento
                    const diasNoMesAnterior = new Date(ano, mes - 1, 0).getDate();
                    atraso = (diasNoMesAnterior - venc) + diaVerif;
                }

                if (atraso === 3)  { tipo = 'atraso'; break; }
                else if (atraso === 5)  { tipo = 'atraso_final'; break; }
                else if (atraso === 7)  { tipo = 'reconquista'; break; }
                else if (atraso === 10) { tipo = 'reconquista_final'; break; }
            }
        }
        
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
            
            // 🔥 BUSCA CLIENTES COM VENCIMENTO NESTE DIA (sem filtrar por status)
            const clientesSnapshot = await firebaseDb.collection('clientes')
                .where('dia_vencimento', '==', venc)
                .get();
            
            if (clientesSnapshot.size > 0) {
                // 🔥 FILTRA CLIENTES QUE REALMENTE PRECISAM SER COBRADOS
                const clientesValidos = [];
                
                for (const doc of clientesSnapshot.docs) {
                    const cliente = doc.data();
                    
                    // 🔥 VERIFICA STATUS REAL (baseado no histórico)
                    const statusReal = calcularStatusCliente(cliente);
                    
                    // Só cobra se NÃO pagou este mês
                    if (statusReal === 'pago') {
                        console.log(`   ✅ Cliente ${cliente.nome} já pagou este mês - não cobrar`);
                        continue;
                    }
                    
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
                        total_original: clientesSnapshot.size,
                        lista: clientesValidos  // passa os objetos para exibir nomes
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
    // PERGUNTA AOS ADMINS (uma mensagem com tudo)
    // =====================================================
    // Para cada grupo separado, manda uma mensagem/votação
    let algumAutorizado = false;
    for (const c of cobrancasParaExecutar) {
        const autorizado = await perguntarAdmins(
            client, firebaseDb, ADMINISTRADORES,
            c.data, c.tipo, c.clientes, hojeStr, c.lista || []
        );
        if (autorizado === true) algumAutorizado = true;
        if (autorizado === false) {
            console.log(`❌ Admin negou cobrança dia ${c.data} (${c.tipo})`);
            continue;
        }
        if (autorizado === null) {
            console.log(`⏰ Votação expirou para dia ${c.data} (${c.tipo}) — próximo ciclo`);
            continue;
        }
        // Executa imediatamente após aprovação
        console.log(`✅ Autorizado! Disparando: Data ${c.data} — ${c.tipo}`);
        await dispararCobrancaReal(c.data, c.tipo); // wrapper já tem client+firebaseDb
        await new Promise(r => setTimeout(r, 2000));
    }
    
    if (!algumAutorizado) return;
    // Cobranças já disparadas no loop acima
    const autorizado = true; // dummy para não quebrar o bloco abaixo
    
    if (autorizado === null) {
        console.log('⏰ Votação expirou sem resposta — tentará novamente no próximo ciclo');
        return;
    }

    if (!autorizado) {
        console.log('❌ Cobrança negada pelo admin');
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
        
        // Não salva bloqueio — será perguntado novamente no próximo ciclo (2h)
        return;
    }
    
    console.log('✅ Todas as cobranças processadas!');
}

// =====================================================
// EXPORTA AS FUNÇÕES
// =====================================================
module.exports = { 
    perguntarAdmins, 
    verificarCobrancasAutomaticas 
};