// services/cobrancaService.js
const { gerarMensagemCobranca, enviarChavesPix } = require('./mensagemService');
const { enviarMensagemSegura } = require('./whatsappService');

async function dispararCobrancaReal(client, firebaseDb, data, tipo = null) {
    console.log(`📬 Iniciando disparo para data ${data}, tipo: ${tipo || 'auto'}`);
    
    try {
        const hoje = new Date();
        const hojeStr = hoje.toISOString().split('T')[0];
        const agoraISO = hoje.toISOString();
        
        // Verifica se já foi cobrado hoje
        const cobrancasHoje = await firebaseDb.collection('log_cobrancas')
            .where('data_vencimento', '==', data)
            .where('tipo', '==', tipo)
            .where('data_envio', '==', hojeStr)
            .get();

        if (!cobrancasHoje.empty) {
            console.log(`⏭️ Data ${data} (${tipo}) já processada hoje`);
            return 0;
        }

        const numerosJaCobrados = new Set();
        cobrancasHoje.forEach(doc => {
            const log = doc.data();
            numerosJaCobrados.add(log.numero.split('@')[0].replace(/\D/g, ''));
        });

        // Busca clientes pendentes
        const clientesSnapshot = await firebaseDb.collection('clientes')
            .where('dia_vencimento', '==', parseInt(data))
            .where('status', '==', 'pendente')
            .get();
        
        if (clientesSnapshot.size === 0) {
            console.log(`📭 Nenhum cliente pendente para dia ${data}`);
            return 0;
        }
        
        // Registra na agenda
        const agendaRef = await firebaseDb.collection('cobrancas_agendadas').add({
            data_disparo: agoraISO, data_vencimento: data,
            tipo: tipo || 'auto', total_clientes: clientesSnapshot.size,
            status: 'iniciado', criado_em: agoraISO
        });
        
        let enviadas = 0, falhas = 0, ignorados = 0;
        
        for (const doc of clientesSnapshot.docs) {
            const cliente = doc.data();
            
            if (!cliente.telefone) { falhas++; continue; }
            
            let telefoneLimpo = cliente.telefone.replace(/\D/g, '');
            if (telefoneLimpo.length < 10) { falhas++; continue; }
            if (telefoneLimpo.length > 11) telefoneLimpo = telefoneLimpo.slice(-11);
            
            if (numerosJaCobrados.has(telefoneLimpo) || numerosJaCobrados.has('55' + telefoneLimpo)) {
                ignorados++; continue;
            }
            
            if (!telefoneLimpo.startsWith('55')) telefoneLimpo = '55' + telefoneLimpo;
            
            const nome = cliente.nome?.split(' ')[0] || '';
            const mensagem = gerarMensagemCobranca(nome, data, tipo);
            const msgCompleta = `🤖 *JMENET TELECOM*\n\n${mensagem}`;
            
            const numerosParaTentar = telefoneLimpo.length === 12 
                ? [`55${telefoneLimpo.slice(2,4)}9${telefoneLimpo.slice(4)}`, telefoneLimpo]
                : [telefoneLimpo];
            
            let enviado = false;
            for (const numero of numerosParaTentar) {
                const resultado = await enviarMensagemSegura(client, numero + '@c.us', msgCompleta);
                if (resultado.sucesso) {
                    await enviarChavesPix(client, resultado.numero, nome);
                    await firebaseDb.collection('log_cobrancas').add({
                        numero: resultado.numero, nome: cliente.nome,
                        data_vencimento: data, data_envio: hojeStr,
                        tipo: tipo || 'auto', enviado_em: agoraISO, status: 'enviado'
                    });
                    enviadas++; enviado = true;
                    break;
                }
            }
            
            if (!enviado) {
                falhas++;
                await firebaseDb.collection('log_cobrancas').add({
                    numero: telefoneLimpo + '@c.us', nome: cliente.nome,
                    data_vencimento: data, data_envio: hojeStr,
                    tipo: tipo || 'auto', status: 'falha'
                });
            }
            
            if (enviado) await new Promise(r => setTimeout(r, 2000));
        }
        
        await agendaRef.update({ status: 'concluido', enviadas, falhas, ignorados });
        return enviadas;
        
    } catch (error) {
        console.error('❌ Erro no disparo:', error);
        return 0;
    }
}

async function obterAgendaDia(firebaseDb, dia, mes, ano) {
    try {
        const dataStr = `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        const snapshot = await firebaseDb.collection('cobrancas_agendadas')
            .where('data_disparo', '>=', dataStr + 'T00:00:00')
            .where('data_disparo', '<=', dataStr + 'T23:59:59')
            .get();
        
        if (snapshot.empty) return [];
        
        const grupos = {};
        snapshot.docs.forEach(doc => {
            const c = doc.data();
            const chave = `${c.data_vencimento}_${c.tipo}`;
            if (!grupos[chave]) grupos[chave] = { data: c.data_vencimento, tipo: c.tipo, total: 0, enviados: 0 };
            grupos[chave].total++;
            if (c.status === 'enviado') grupos[chave].enviados++;
        });
        
        return Object.values(grupos);
    } catch (error) {
        console.error('Erro na agenda:', error);
        return [];
    }
}

module.exports = { dispararCobrancaReal, obterAgendaDia };