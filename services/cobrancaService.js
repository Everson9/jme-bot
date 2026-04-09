// services/cobrancaService.js
const { gerarMensagemCobranca } = require('./mensagemService');
const { enviarMensagemSegura }  = require('./whatsappService');
const { getCicloAtual }         = require('./statusService');

/**
 * Dispara cobranças para uma lista de clientes já filtrada.
 * Aceita a lista de clientes diretamente (já filtrados pelo adminService).
 *
 * @param {Object}   client      - Cliente WhatsApp
 * @param {Object}   firebaseDb  - Instância do Firestore
 * @param {string}   data        - Dia de vencimento ('10', '20', '30')
 * @param {string}   tipo        - Tipo da cobrança ('lembrete', 'atraso', etc.)
 * @param {Array}    clientesFiltrados - Clientes já verificados pelo adminService
 */
async function dispararCobrancaReal(client, firebaseDb, data, tipo = null, clientesFiltrados = null) {
    console.log(`📬 Iniciando disparo dia ${data}, tipo: ${tipo || 'auto'}`);
    console.log(`📬 clientesFiltrados recebido: ${clientesFiltrados ? clientesFiltrados.length : 'NENHUM'}`);

    try {
        const hoje    = new Date();
        const hojeStr = new Date(hoje.getTime() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
        const agoraISO = hoje.toISOString();

        // Se não recebeu lista filtrada, busca e filtra aqui
        let clientes = clientesFiltrados;
        if (!clientes) {
            console.log(`📬 Modo: BUSCANDO DO BANCO (sem lista filtrada)`);
            const dataNum = parseInt(data);

            // Consulta ambos os formatos (número e string) — alguns clientes foram salvos como string
            const [snapNum, snapStr] = await Promise.all([
                firebaseDb.collection('clientes').where('dia_vencimento', '==', dataNum).get(),
                firebaseDb.collection('clientes').where('dia_vencimento', '==', String(dataNum)).get(),
            ]);

            // Deduplicar por doc ID
            const vistos = new Set();
            const docs = [...snapNum.docs, ...snapStr.docs].filter(d => {
                if (vistos.has(d.id)) return false;
                vistos.add(d.id); return true;
            });

            console.log(`📬 Encontrados ${docs.length} clientes com vencimento dia ${data}`);

            const cicloRef = getCicloAtual(dataNum);
            console.log(`📬 Ciclo de referência: ${cicloRef.docId}`);
            
            clientes = [];

            for (const doc of docs) {
                const cliente = { id: doc.id, ...doc.data() };
                if (cliente.status === 'cancelado') {
                    console.log(`   ❌ ${cliente.nome} - cancelado`);
                    continue;
                }

                const historicoDoc = await firebaseDb.collection('clientes').doc(doc.id)
                    .collection('historico_pagamentos').doc(cicloRef.docId).get();

                if (historicoDoc.exists) {
                    const registro = historicoDoc.data();
                    if (registro.status === 'pago' || registro.status === 'isento') {
                        console.log(`   ✅ ${cliente.nome} - já pagou ${cicloRef.docId}`);
                        continue;
                    }
                }

                // Verifica carnê
                const carneSnap = await firebaseDb.collection('carne_solicitacoes')
                    .where('cliente_id', '==', doc.id)
                    .where('status', 'in', ['solicitado', 'impresso'])
                    .limit(1).get();
                if (!carneSnap.empty) {
                    console.log(`   📋 ${cliente.nome} - tem carnê pendente`);
                    continue;
                }

                console.log(`   ⏳ ${cliente.nome} - PENDENTE (será cobrado)`);
                clientes.push(cliente);
            }
        } else {
            console.log(`📬 Modo: LISTA APROVADA (${clientesFiltrados.length} clientes)`);
            console.log(`📬 NOMES NA LISTA: ${clientesFiltrados.map(c => c.nome).join(', ')}`);
            
            // Apenas verifica telefone
            const clientesValidos = [];
            
            for (const cliente of clientesFiltrados) {
                if (!cliente.telefone) {
                    console.log(`   ⚠️ ${cliente.nome} - SEM TELEFONE`);
                    continue;
                }
                console.log(`   ✅ ${cliente.nome} - TELEFONE OK: ${cliente.telefone}`);
                clientesValidos.push(cliente);
            }
            
            clientes = clientesValidos;
            console.log(`📬 Após filtrar telefones: ${clientes.length} clientes válidos`);
        }

        if (clientes.length === 0) {
            console.log(`📭 NENHUM CLIENTE PARA COBRAR (dia ${data})`);
            return 0;
        }

        console.log(`📬 INICIANDO ENVIO para ${clientes.length} clientes`);

        // Verifica duplicatas no log (APENAS para modo automático sem lista)
        if (!clientesFiltrados) {
            console.log(`📬 Verificando duplicatas no log...`);
            const jaCobradasSnap = await firebaseDb.collection('log_cobrancas')
                .where('data_vencimento', '==', data)
                .where('tipo', '==', tipo || 'auto')
                .where('data_envio', '==', hojeStr)
                .get();

            const numerosJaCobrados = new Set();
            jaCobradasSnap.docs.forEach(doc => {
                const num = (doc.data().numero || '').replace('@c.us', '').replace(/\D/g, '').slice(-8);
                if (num) numerosJaCobrados.add(num);
            });

            console.log(`📬 ${numerosJaCobrados.size} números já cobrados hoje`);

            // Filtra os já cobrados
            const antes = clientes.length;
            clientes = clientes.filter(cliente => {
                if (!cliente.telefone) return false;
                let tel = cliente.telefone.replace(/\D/g, '');
                if (tel.length > 11) tel = tel.slice(-11);
                const jaCobrado = numerosJaCobrados.has(tel.slice(-8));
                if (jaCobrado) {
                    console.log(`   🔄 ${cliente.nome} - já cobrado hoje`);
                }
                return !jaCobrado;
            });
            console.log(`📬 Após filtrar duplicatas: ${clientes.length} clientes (eram ${antes})`);
        }

        if (clientes.length === 0) {
            console.log(`📭 Todos já foram cobrados hoje (dia ${data})`);
            return 0;
        }

        let enviadas = 0, falhas = 0;

        for (const cliente of clientes) {
            console.log(`📤 Enviando para: ${cliente.nome} - ${cliente.telefone}`);

            let tel = cliente.telefone.replace(/\D/g, '');
            if (!tel.startsWith('55')) tel = '55' + tel;

            const nome = cliente.nome?.split(' ')[0] || '';
            const { mensagem: msgTexto, pix: msgPix } = gerarMensagemCobranca(nome, data, tipo);

            // Tenta com e sem nono dígito
            const numerosParaTentar = tel.length === 12
                ? [`55${tel.slice(2, 4)}9${tel.slice(4)}`, tel]
                : [tel];

            let enviado = false;
            for (const numero of numerosParaTentar) {
                console.log(`   📞 Tentando: ${numero}`);
                const resultado = await enviarMensagemSegura(client, numero + '@c.us', msgTexto);
                if (resultado.sucesso) {
                    console.log(`   ✅ ENVIADO para ${numero}`);
                    // Envia PIX separado após 1s
                    setTimeout(() => client.sendMessage(resultado.numero, msgPix).catch(() => {}), 1000);

                    await firebaseDb.collection('log_cobrancas').add({
                        numero: resultado.numero,
                        nome: cliente.nome,
                        data_vencimento: data,
                        data_envio: hojeStr,
                        tipo: tipo || 'auto',
                        origem: clientesFiltrados ? 'auto' : 'manual',
                        enviado_em: agoraISO,
                        status: 'enviado'
                    });
                    enviadas++;
                    enviado = true;
                    break;
                } else {
                    console.log(`   ❌ FALHA para ${numero}: ${resultado.erro || 'desconhecido'}`);
                }
            }

            if (!enviado) {
                falhas++;
                console.log(`   ❌❌ FALHA TOTAL para ${cliente.nome}`);
                await firebaseDb.collection('log_cobrancas').add({
                    numero: tel + '@c.us',
                    nome: cliente.nome,
                    data_vencimento: data,
                    data_envio: hojeStr,
                    tipo: tipo || 'auto',
                    origem: clientesFiltrados ? 'auto' : 'manual',
                    status: 'falha'
                });
            }

            if (enviado) await new Promise(r => setTimeout(r, 2000));
        }

        console.log(`✅ DISPARO CONCLUÍDO dia ${data} (${tipo}): ${enviadas} enviadas, ${falhas} falhas`);
        return enviadas;

    } catch (error) {
        console.error('❌ ERRO NO DISPARO:', error);
        return 0;
    }
}

async function obterAgendaDia(firebaseDb, dia, mes, ano) {
    try {
        const diaStr = String(dia).padStart(2, '0');
        const mesStr = String(mes).padStart(2, '0');
        const dataBusca = `${ano}-${mesStr}-${diaStr}`;

        const enviadasSnapshot = await firebaseDb.collection('log_cobrancas')
            .where('data_envio', '==', dataBusca)
            .get();

        const grupos = {};
        enviadasSnapshot.docs.forEach(doc => {
            const c = doc.data();
            const chave = `${c.data_vencimento}_${c.tipo || 'auto'}`;
            if (grupos[chave]) { grupos[chave].clientes++; }
            else grupos[chave] = { data: c.data_vencimento, tipo: c.tipo || 'auto', clientes: 1, status: 'realizado', origem: c.origem || 'auto' };
        });

        return Object.values(grupos);
    } catch (error) {
        console.error('❌ Erro na agenda:', error);
        return [];
    }
}

module.exports = { dispararCobrancaReal, obterAgendaDia };