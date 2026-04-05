'use strict';

// =====================================================
// COMPROVANTES E CONSULTA
// Processamento de mídia, baixa automática, abertura de chamado,
// detecção de ações admin e consulta de situação do cliente.
// =====================================================

function setupComprovante(client, firebaseDb, banco, state, ADMINISTRADORES, sseService, P, criarUtils, groqChatFallback, analisarImagem) {
    const utils = criarUtils(groqChatFallback);
    const agoraBR = () => new Date(Date.now() - 3 * 60 * 60 * 1000);
    const notificarAdmins = async (msg) => { for (const adm of ADMINISTRADORES) await client.sendMessage(adm, msg).catch(() => {}); };

    async function registrarPagamentoHoje(clienteId, clienteData, formaBaixa, valor) {
        try {
            const hoje = agoraBR().toISOString().split('T')[0];
            const planoLower = (clienteData.plano || '').toLowerCase();
            let valor_plano = null;
            if (planoLower.includes('iptv') || planoLower.includes('70')) valor_plano = 70;
            else if (planoLower.includes('200') || planoLower.includes('fibra')) valor_plano = 60;
            else if (planoLower.includes('50') || planoLower.includes('cabo')) valor_plano = 50;

            await firebaseDb.collection('pagamentos_hoje').doc(clienteId + '_' + hoje).set({
                data: hoje, cliente_id: clienteId, nome: clienteData.nome || '—',
                plano: clienteData.plano, forma_pagamento: clienteData.forma_pagamento,
                forma_baixa: formaBaixa || 'Comprovante', pago_em: new Date().toISOString(),
                valor_plano, valor: valor || null
            });
        } catch(e) { console.error('Erro ao registrar pagamento_hoje:', e.message); }
    }

    async function darBaixaAutomatica(numeroWhatsapp, analise) {
        try {
            const numeroBusca = numeroWhatsapp.replace('@c.us', '').replace(/^55/, '');
            const cliente = await banco.buscarClientePorTelefone(numeroBusca);
            if (!cliente) return { sucesso: false, nomeCliente: null, valido: false };

            await firebaseDb.collection('clientes').doc(cliente.id).update({
                status: 'pago', atualizado_em: new Date().toISOString()
            });

            const hoje = new Date();
            const mesRef = `${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
            const docId = mesRef.replace('/', '-');

            await firebaseDb.collection('clientes').doc(cliente.id)
                .collection('historico_pagamentos').doc(docId)
                .set({
                    referencia: mesRef, status: 'pago', forma_pagamento: 'Comprovante',
                    pago_em: new Date().toISOString(), data_vencimento: cliente.dia_vencimento || 10,
                    valor: analise.valor
                }, { merge: true });

            await registrarPagamentoHoje(cliente.id, cliente, 'Comprovante', analise.valor);
            return { sucesso: true, nomeCliente: cliente.nome, valido: analise.valido };
        } catch(e) {
            console.error('Erro em darBaixaAutomatica:', e);
            return { sucesso: false, nomeCliente: null, valido: false };
        }
    }

    async function processarMidiaAutomatico(deQuem, msg, fotosPendentes) {
        console.log(`📷 Processando mídia automaticamente: ${msg.type}`);
        const analise = await analisarImagem(msg, groqChatFallback);
        if (!analise) {
            if (!fotosPendentes.has(deQuem)) fotosPendentes.set(deQuem, []);
            fotosPendentes.get(deQuem).push(msg);
            return false;
        }
        if (analise.categoria === 'comprovante') {
            const baixa = await darBaixaAutomatica(deQuem, analise);
            if (baixa.sucesso) {
                await client.sendMessage(deQuem,
                    `${P}Comprovante recebido e pagamento confirmado! ✅\n\n` +
                    `Obrigado, *${baixa.nomeCliente.split(' ')[0]}*! Sua internet já está em dia. 😊`
                );
                await banco.dbLogComprovante(deQuem);
                await notificarAdmins(
                    `✅ *BAIXA AUTOMÁTICA VIA COMPROVANTE*\n\n👤 ${baixa.nomeCliente}\n📱 ${deQuem.replace('@c.us','')}\n💰 R$ ${analise.valor || 'N/A'}`
                );
                sseService.broadcast();
                sseService.notificar('clientes');
                return true;
            } else {
                await client.sendMessage(deQuem,
                    `${P}Recebi seu comprovante! 😊\n\nPara dar baixa no sistema, me informe o *nome completo do titular* da internet.`
                );
                state.iniciar(deQuem, 'aguardando_nome_comprovante', 'nome', { analise });
                return true;
            }
        }
        return false;
    }

    async function abrirChamadoComMotivo(deQuem, nome, motivo, extras = {}) {
        state.setAtendimentoHumano(deQuem, true);
        await banco.dbSalvarAtendimentoHumano(deQuem).catch(() => {});
        await banco.dbAbrirChamado(deQuem, nome || null, motivo).catch(() => {});

        let msg = `🔔 *Novo chamado!*\n\n📱 *Número:* ${deQuem.replace('@c.us','')}\n👤 *Nome:* ${nome || 'não informado'}\n🔧 *Motivo:* ${motivo}\n`;
        if (extras.endereco) msg += `📍 *Endereço:* ${extras.endereco}\n`;
        if (extras.disponibilidade) msg += `📅 *Disponibilidade:* ${extras.disponibilidade}\n`;
        if (extras.fotoEnviada) msg += `📷 *Foto do roteador:* enviada\n`;
        if (extras.descricaoRoteador) msg += `💡 *Luzes:* ${extras.descricaoRoteador}\n`;

        await notificarAdmins(msg);
    }

    async function detectarAcaoAdmin(para, textoAdmin) {
        const t = textoAdmin.toLowerCase();

        const padroesPromessa = [
            /promete[uo]u?\s+pagar/i, /vai\s+pagar/i, /paga\s+(dia|amanhã|hoje)/i,
            /prometeu\s+(dia|até)/i, /pagamento\s+(dia|até|amanhã)/i
        ];
        if (padroesPromessa.some(r => r.test(t))) {
            try {
                const dataExtraida = await utils.extrairDataPromessa(textoAdmin);
                if (dataExtraida) {
                    const clienteDoc = await banco.buscarClientePorTelefone(para.replace('@c.us','').replace(/^55/,''));
                    await firebaseDb.collection('promessas').add({
                        numero: para, nome: clienteDoc?.nome || null, data_promessa: dataExtraida,
                        status: 'pendente', notificado: 0, criado_em: new Date().toISOString(), origem: 'admin'
                    });
                    if (clienteDoc?.id) {
                        await firebaseDb.collection('clientes').doc(clienteDoc.id).update({
                            status: 'promessa', atualizado_em: new Date().toISOString()
                        });
                    }
                    sseService.notificar('clientes');
                    console.log(`🤝 Promessa registrada automaticamente: ${para.slice(-8)} — ${dataExtraida}`);
                    await notificarAdmins(
                        `🤝 *Promessa registrada automaticamente*\n👤 ${clienteDoc?.nome || para.replace('@c.us','')}\n📅 Dia: ${dataExtraida}`
                    );
                }
            } catch(e) { console.error('Erro ao registrar promessa do admin:', e.message); }
        }

        const padroesVisita = [
            /agendei\s+(visita|técnico|instalação)/i, /vou\s+(passar|mandar)\s+(técnico|lá)/i,
            /técnico\s+(vai|passa)\s+(dia|amanhã|hoje)/i, /visita\s+(dia|amanhã|hoje|marcada)/i
        ];
        if (padroesVisita.some(r => r.test(t))) {
            try {
                const dataExtraida = await utils.extrairDataPromessa(textoAdmin);
                const clienteDoc = await banco.buscarClientePorTelefone(para.replace('@c.us','').replace(/^55/,''));
                await firebaseDb.collection('agendamentos').add({
                    numero: para, nome: clienteDoc?.nome || null, data: dataExtraida || null,
                    tipo: 'visita_tecnica', status: 'agendado', origem: 'admin', criado_em: new Date().toISOString()
                });
                sseService.notificar('chamados');
                console.log(`📅 Visita técnica registrada automaticamente: ${para.slice(-8)}`);
            } catch(e) { console.error('Erro ao registrar visita:', e.message); }
        }
    }

    async function consultarSituacao(deQuem, textoCliente) {
        const t = textoCliente.trim();
        const cpfLimpo = t.replace(/\D/g, '');
        let cliente = null;

        if (cpfLimpo.length === 11) cliente = await banco.buscarClientePorCPF(cpfLimpo);

        if (!cliente && t.length >= 3) {
            const resultados = await banco.buscarClientePorNome(t);
            if (resultados && resultados.length === 1) {
                cliente = resultados[0];
            } else if (resultados && resultados.length > 1) {
                await client.sendMessage(deQuem,
                    `${P}Encontrei vários clientes com esse nome. 😕\n\nPor favor me informe o *CPF completo* (11 dígitos):`
                );
                state.iniciar(deQuem, 'consulta_situacao', 'aguardando_cpf', {});
                return;
            }
        }

        if (!cliente) {
            const numTel = deQuem.replace('@c.us', '').replace(/^55/, '');
            cliente = await banco.buscarClientePorTelefone(numTel);
        }

        if (!cliente) {
            await client.sendMessage(deQuem,
                `${P}Não encontrei nenhum cadastro com esses dados. 😕\n\nVerifique se digitou corretamente ou fale com um atendente.\n\nDigite *0* para voltar ao menu.`
            );
            return;
        }

        const nome = cliente.nome || 'Cliente';
        const primeiroNome = nome.split(' ')[0];
        const status = cliente.status || 'pendente';
        const plano = cliente.plano || 'Não informado';
        const diaVenc = parseInt(cliente.dia_vencimento) || 10;

        const agora = agoraBR();
        const diaHoje = agora.getUTCDate();
        const diasDoMesAnterior = new Date(agora.getUTCFullYear(), agora.getUTCMonth(), 0).getDate();
        let diasAtraso = 0;
        if (diaHoje >= diaVenc) {
            diasAtraso = diaHoje - diaVenc;
        } else {
            diasAtraso = (diasDoMesAnterior - diaVenc) + diaHoje;
            if (diasAtraso < 0) diasAtraso = 0;
        }

        const inadimplente = diasAtraso >= 5;

        if (status === 'pago') {
            await client.sendMessage(deQuem,
                `${P}✅ *${primeiroNome}*, sua situação está em dia!\n\n📡 Plano: ${plano}\n📅 Vencimento: Todo dia ${diaVenc}\n\nSeu acesso está normal. Se estiver com problema de internet, é algo técnico.\n\nDigite *0* para voltar ao menu ou diga o que precisa! 😊`
            );
        } else if (inadimplente) {
            await client.sendMessage(deQuem,
                `${P}⚠️ *${primeiroNome}*, encontrei aqui:\n\n📡 Plano: ${plano}\n📅 Vencimento: Todo dia ${diaVenc}\n💰 Situação: *Inadimplente* — ${diasAtraso} dias em atraso\n\nSua internet pode estar suspensa por falta de pagamento.\n\nPara reativar, digite *2* para efetuar o pagamento ou *0* para voltar ao menu.`
            );
        } else {
            await client.sendMessage(deQuem,
                `${P}⏳ *${primeiroNome}*, encontrei aqui:\n\n📡 Plano: ${plano}\n📅 Vencimento: Todo dia ${diaVenc}\n💰 Situação: *Pendente* — pagamento ainda não localizado\n\nSeu dia de vencimento é *${diaVenc}*. Após ${diaVenc + 5} de atraso o serviço é suspenso automaticamente.\n\nDigite *2* para efetuar o pagamento ou *0* para voltar ao menu.`
            );
        }
    }

    return { processarMidiaAutomatico, darBaixaAutomatica, abrirChamadoComMotivo, detectarAcaoAdmin, consultarSituacao };
}

module.exports = setupComprovante;
