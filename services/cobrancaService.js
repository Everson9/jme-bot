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
            const { mensagem: msgTexto, pix: msgPix } = gerarMensagemCobranca(nome, data, tipo);
            
            const numerosParaTentar = telefoneLimpo.length === 12 
                ? [`55${telefoneLimpo.slice(2,4)}9${telefoneLimpo.slice(4)}`, telefoneLimpo]
                : [telefoneLimpo];
            
            let enviado = false;
            for (const numero of numerosParaTentar) {
                const resultado = await enviarMensagemSegura(client, numero + '@c.us', msgTexto);
                if (resultado.sucesso) {
                    // Envia o PIX separado após 1s para facilitar a cópia
                    setTimeout(() => client.sendMessage(resultado.numero, msgPix).catch(() => {}), 1000);
                    await firebaseDb.collection('log_cobrancas').add({
                        numero: resultado.numero, 
                        nome: cliente.nome,
                        data_vencimento: data, 
                        data_envio: hojeStr,
                        tipo: tipo || 'auto',
                        origem: tipo ? 'manual' : 'auto', // 🔥 MARCA SE FOI MANUAL
                        enviado_em: agoraISO, 
                        status: 'enviado'
                    });
                    enviadas++; enviado = true;
                    break;
                }
            }
            
            if (!enviado) {
                falhas++;
                await firebaseDb.collection('log_cobrancas').add({
                    numero: telefoneLimpo + '@c.us', 
                    nome: cliente.nome,
                    data_vencimento: data, 
                    data_envio: hojeStr,
                    tipo: tipo || 'auto',
                    origem: tipo ? 'manual' : 'auto',
                    status: 'falha'
                });
            }
            
            if (enviado) await new Promise(r => setTimeout(r, 2000));
        }
        
        return enviadas;
        
    } catch (error) {
        console.error('❌ Erro no disparo:', error);
        return 0;
    }
}

async function obterAgendaDia(firebaseDb, dia, mes, ano) {
    try {
        const diaStr = String(dia).padStart(2, '0');
        const mesStr = String(mes).padStart(2, '0');
        const dataBusca = `${ano}-${mesStr}-${diaStr}`;
        const hoje = new Date();
        const hojeDia = hoje.getDate();
        const hojeMes = hoje.getMonth() + 1;
        const hojeAno = hoje.getFullYear();
        
        console.log(`🔍 Buscando agenda para: ${dataBusca}`);
        
        // =====================================================
        // 1️⃣ BUSCA COBRANÇAS JÁ REALIZADAS (HISTÓRICO)
        // =====================================================
        const enviadasSnapshot = await firebaseDb.collection('log_cobrancas')
            .where('data_envio', '==', dataBusca)
            .get();
        
        console.log(`   📤 Cobranças realizadas: ${enviadasSnapshot.size} registros`);
        
        // =====================================================
        // 2️⃣ BUSCA PENDÊNCIA (COBRANÇA ADIADA/NEGADA)
        // =====================================================
        const pendenciaDoc = await firebaseDb.collection('config').doc('cobranca_adiada').get();
        const pendencia = pendenciaDoc.exists ? pendenciaDoc.data().valor : null;
        
        const temPendenciaHoje = pendencia && 
            pendencia.dia === dia && 
            pendencia.mes === mes && 
            pendencia.ano === ano;
        
        // =====================================================
        // 3️⃣ DIAS DE VENCIMENTO (10, 20, 30)
        // =====================================================
        const diasVencimento = [10, 20, 30];
        const isDiaVencimento = diasVencimento.includes(dia);
        
        // =====================================================
        // 4️⃣ MAPA DE RESULTADOS
        // =====================================================
        const grupos = {};
        
        // 🔥 PRIMEIRO: Adiciona cobranças que JÁ FORAM FEITAS (histórico)
        enviadasSnapshot.docs.forEach(doc => {
            const c = doc.data();
            const chave = `${c.data_vencimento}_${c.tipo || 'auto'}`;
            
            grupos[chave] = {
                data: c.data_vencimento,
                tipo: c.tipo || 'auto',
                clientes: 1, // Cada registro é um cliente
                status: 'realizado',
                origem: c.origem || 'auto', // 'manual' ou 'auto'
                enviado_em: c.enviado_em
            };
        });
        
        // 🔥 SEGUNDO: Adiciona pendência de hoje (se existir)
        if (temPendenciaHoje && pendencia.entradas) {
            pendencia.entradas.forEach(entrada => {
                const chave = `${entrada.data}_${entrada.tipo}_pendente`;
                
                grupos[chave] = {
                    data: entrada.data,
                    tipo: entrada.tipo,
                    clientes: entrada.clientes || 0,
                    status: 'pendente',
                    motivo: pendencia.motivoBloqueio
                };
            });
        }
        
        // 🔥 TERCEIRO: Para dias de vencimento, calcula TODAS as etapas
        if (isDiaVencimento) {
            // Busca clientes deste dia
            const clientesSnapshot = await firebaseDb.collection('clientes')
                .where('dia_vencimento', '==', dia)
                .get();
            
            const totalClientes = clientesSnapshot.size;
            const pendentes = clientesSnapshot.docs.filter(doc => 
                doc.data().status === 'pendente'
            ).length;
            
            if (totalClientes > 0) {
                // Calcula TODAS as datas de cobrança para este dia de vencimento
                const datasCobranca = [
                    { dia: dia - 1, tipo: 'lembrete', desc: 'Lembrete (D-1)' },
                    { dia: dia + 3, tipo: 'atraso', desc: 'Atraso (D+3)' },
                    { dia: dia + 5, tipo: 'atraso_final', desc: 'Atraso Final (D+5)' },
                    { dia: dia + 7, tipo: 'reconquista', desc: 'Reconquista (D+7)' },
                    { dia: dia + 10, tipo: 'reconquista_final', desc: 'Reconquista Final (D+10)' }
                ];
                
                // Ajusta para próximo mês se passar de 31
                datasCobranca.forEach(item => {
                    let diaCobranca = item.dia;
                    let mesCobranca = mes;
                    let anoCobranca = ano;
                    
                    if (diaCobranca > 31) {
                        diaCobranca = diaCobranca - 31;
                        mesCobranca = mes + 1;
                        if (mesCobranca > 12) {
                            mesCobranca = 1;
                            anoCobranca = ano + 1;
                        }
                    }
                    
                    // Só mostra se for o dia que estamos consultando
                    if (diaCobranca === dia && mesCobranca === mes && anoCobranca === ano) {
                        // Verifica se já foi realizado
                        const jaRealizado = Object.values(grupos).some(g => 
                            g.data === String(dia) && g.tipo === item.tipo
                        );
                        
                        if (!jaRealizado) {
                            // Verifica se é passado, presente ou futuro
                            const dataCobranca = new Date(anoCobranca, mesCobranca - 1, diaCobranca);
                            const hojeDate = new Date(hojeAno, hojeMes - 1, hojeDia);
                            
                            let status = 'futuro';
                            if (dataCobranca < hojeDate) status = 'passado';
                            if (dataCobranca.toDateString() === hojeDate.toDateString()) status = 'hoje';
                            
                            const chave = `${dia}_${item.tipo}_previsto`;
                            grupos[chave] = {
                                data: String(dia),
                                tipo: item.tipo,
                                descricao: item.desc,
                                clientes: pendentes,
                                total_clientes: totalClientes,
                                status: status,
                                data_prevista: `${diaCobranca}/${mesCobranca}/${anoCobranca}`
                            };
                        }
                    }
                });
            }
        }
        
        const resultado = Object.values(grupos);
        console.log(`   ✅ Total na agenda: ${resultado.length} itens`);
        
        return resultado;
        
    } catch (error) {
        console.error('❌ Erro na agenda:', error);
        return [];
    }
}

module.exports = { dispararCobrancaReal, obterAgendaDia };