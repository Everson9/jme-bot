'use strict';

// =====================================================
// COMPROVANTES E CONSULTA
// Processamento de mídia, baixa automática, abertura de chamado,
// detecção de ações admin e consulta de situação do cliente.
// =====================================================
const { calcularStatusCliente, getCicloAtual } = require('../services/statusService');

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

    // Confirma o titular via nome digitado (fallback quando não consegue localizar pelo telefone)
    async function confirmarNomeComprovante(deQuem, nomeDigitado) {
        const nomeBruto = (nomeDigitado || '').trim();
        if (nomeBruto.length < 3) {
            await client.sendMessage(deQuem, `${P}Pode digitar *nome e sobrenome* do titular? 😊`);
            return { ok: false, motivo: 'nome_curto' };
        }

        const resultados = await banco.buscarClientePorNome(nomeBruto);
        if (!resultados?.length) {
            await client.sendMessage(deQuem,
                `${P}Não encontrei esse nome na base. 😕\n\n` +
                `Pode tentar novamente com *nome e sobrenome* (como está no cadastro) ou me informar o *CPF* do titular?`
            );
            return { ok: false, motivo: 'nao_encontrado' };
        }

        if (resultados.length > 1) {
            await client.sendMessage(deQuem,
                `${P}Encontrei *${resultados.length}* cadastros parecidos. 😕\n\n` +
                `Para confirmar certinho, me informe o *CPF* do titular (11 dígitos).`
            );
            return { ok: false, motivo: 'multiplos' };
        }

        const clienteEncontrado = resultados[0];
        const dados = state.getDados(deQuem) || {};

        await firebaseDb.collection('clientes').doc(clienteEncontrado.id).update({
            status: 'pago',
            atualizado_em: new Date().toISOString()
        });

        const hoje = new Date();
        const mesRef = `${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
        await firebaseDb.collection('clientes').doc(clienteEncontrado.id)
            .collection('historico_pagamentos').doc(mesRef.replace('/', '-'))
            .set({
                referencia: mesRef,
                status: 'pago',
                forma_pagamento: 'Comprovante',
                pago_em: hoje.toISOString(),
                data_vencimento: clienteEncontrado.dia_vencimento || 10,
                valor: dados.analise?.valor || null,
            }, { merge: true });

        await registrarPagamentoHoje(clienteEncontrado.id, clienteEncontrado, 'Comprovante', dados.analise?.valor || null);
        await banco.dbLogComprovante(deQuem).catch(() => {});

        await client.sendMessage(deQuem, `${P}Pagamento confirmado para *${clienteEncontrado.nome}*! ✅`);

        await notificarAdmins(
            `✅ *BAIXA VIA COMPROVANTE (nome confirmado)*\n\n` +
            `👤 ${clienteEncontrado.nome}\n` +
            `📱 ${deQuem.replace('@c.us', '')}\n` +
            `💰 R$ ${dados.analise?.valor || 'N/A'}`
        );

        sseService.broadcast();
        sseService.notificar('clientes');

        state.encerrarFluxo(deQuem);
        return { ok: true, cliente: clienteEncontrado };
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
        const t = (textoCliente || '').trim();
        const etapa = state.getEtapa(deQuem) || 'aguardando_dados';
        const dados = state.getDados(deQuem) || {};

        // Se por algum motivo a etapa não estiver setada, garante o fluxo.
        if (state.getFluxo(deQuem) !== 'consulta_situacao') {
            state.iniciar(deQuem, 'consulta_situacao', 'aguardando_dados', {});
        }

        // 1) Primeira etapa: aceita CPF ou Nome; tenta também pelo telefone do WhatsApp como fallback.
        if (etapa === 'aguardando_dados') {
            let cliente = null;
            const cpfLimpo = t.replace(/\D/g, '');

            if (cpfLimpo.length === 11) {
                cliente = await banco.buscarClientePorCPF(cpfLimpo);
                if (!cliente) {
                    state.avancar(deQuem, 'aguardando_telefone', { tentativasTelefone: 1 });
                    await client.sendMessage(deQuem, `${P}Não encontrei esse CPF na base. 😕\n\nPode me informar o *telefone do titular* (com DDD, só números)?`);
                    return;
                }
            }

            if (!cliente && t.length >= 3) {
                const resultados = await banco.buscarClientePorNome(t);
                if (resultados?.length === 1) {
                    cliente = resultados[0];
                } else if (resultados?.length > 1) {
                    state.avancar(deQuem, 'aguardando_cpf', { nomeTentado: t, tentativasCpf: 1 });
                    await client.sendMessage(deQuem,
                        `${P}Encontrei *${resultados.length}* clientes com esse nome. 😕\n\nPara confirmar certinho, me informe o *CPF completo* (11 dígitos):`
                    );
                    return;
                } else {
                    // Não achou por nome -> tenta pelo telefone do WhatsApp
                    const numTel = deQuem.replace('@c.us', '').replace(/^55/, '');
                    cliente = await banco.buscarClientePorTelefone(numTel);
                    if (!cliente) {
                        state.avancar(deQuem, 'aguardando_cpf', { nomeTentado: t, tentativasCpf: 1 });
                        await client.sendMessage(deQuem,
                            `${P}Não encontrei esse nome no cadastro. 😕\n\n` +
                            `Pode tentar com o *CPF do titular* (11 dígitos)?\n` +
                            `Se preferir, você também pode informar o *telefone do titular* com DDD.`
                        );
                        return;
                    }
                }
            }

            if (!cliente) {
                // Mensagem curta / vazia etc.
                await client.sendMessage(deQuem, `${P}Me informe seu *CPF* (11 dígitos) ou seu *nome completo* para eu consultar. 😊`);
                return;
            }

            // Achou cliente -> encerra fluxo e responde abaixo.
            state.encerrarFluxo(deQuem);
            dados._cliente = cliente;
        }

        // 2) Etapa CPF (quando houve múltiplos ou nome não encontrado)
        if (etapa === 'aguardando_cpf') {
            const cpf = t.replace(/\D/g, '');
            if (cpf.length !== 11) {
                const tent = (dados.tentativasCpf || 1);
                if (tent >= 2) {
                    state.avancar(deQuem, 'aguardando_telefone', { tentativasTelefone: 1 });
                    await client.sendMessage(deQuem, `${P}Sem problema. Pode me informar o *telefone do titular* (com DDD, só números)?`);
                    return;
                }
                state.atualizar(deQuem, { tentativasCpf: tent + 1 });
                await client.sendMessage(deQuem, `${P}CPF precisa ter *11 dígitos*. Tenta novamente só com números. 😊`);
                return;
            }

            const cliente = await banco.buscarClientePorCPF(cpf);
            if (!cliente) {
                const tent = (dados.tentativasCpf || 1);
                if (tent >= 2) {
                    state.avancar(deQuem, 'aguardando_telefone', { tentativasTelefone: 1 });
                    await client.sendMessage(deQuem, `${P}Não encontrei esse CPF. 😕\n\nPode me informar o *telefone do titular* (com DDD, só números)?`);
                    return;
                }
                state.atualizar(deQuem, { tentativasCpf: tent + 1 });
                await client.sendMessage(deQuem, `${P}Não encontrei esse CPF na base. Confere e tenta novamente (só números).`);
                return;
            }

            state.encerrarFluxo(deQuem);
            dados._cliente = cliente;
        }

        // 3) Etapa telefone
        if (etapa === 'aguardando_telefone') {
            const telefone = t.replace(/\D/g, '');
            if (telefone.length < 10 || telefone.length > 11) {
                const tent = (dados.tentativasTelefone || 1);
                if (tent >= 2) {
                    state.encerrarFluxo(deQuem);
                    await client.sendMessage(deQuem,
                        `${P}Ainda não consegui te localizar na base. 😕\n\n` +
                        `Vou chamar um atendente pra te ajudar melhor.`
                    );
                    await abrirChamadoComMotivo(deQuem, null, 'Consulta situação — não identificado');
                    return;
                }
                state.atualizar(deQuem, { tentativasTelefone: tent + 1 });
                await client.sendMessage(deQuem, `${P}Telefone deve ter 10 ou 11 dígitos (com DDD). Digite só números. 😊`);
                return;
            }

            const cliente = await banco.buscarClientePorTelefone(telefone);
            if (!cliente) {
                const tent = (dados.tentativasTelefone || 1);
                if (tent >= 2) {
                    state.encerrarFluxo(deQuem);
                    await client.sendMessage(deQuem,
                        `${P}Não encontrei esse telefone na base. 😕\n\nVou chamar um atendente pra te ajudar.`
                    );
                    await abrirChamadoComMotivo(deQuem, null, 'Consulta situação — telefone não encontrado');
                    return;
                }
                state.atualizar(deQuem, { tentativasTelefone: tent + 1 });
                await client.sendMessage(deQuem, `${P}Não encontrei esse telefone. Confere e tenta novamente (com DDD, só números).`);
                return;
            }

            state.encerrarFluxo(deQuem);
            dados._cliente = cliente;
        }

        const cliente = dados._cliente || null;
        if (!cliente) {
            // Se chegou aqui sem cliente (por alguma inconsistência), reinicia.
            state.iniciar(deQuem, 'consulta_situacao', 'aguardando_dados', {});
            await client.sendMessage(deQuem, `${P}Me informe seu *CPF* (11 dígitos) ou seu *nome completo* para eu consultar. 😊`);
            return;
        }

        const nome = cliente.nome || 'Cliente';
        const primeiroNome = nome.split(' ')[0];

        // Se existir promessa pendente, prioriza informar a promessa (não retornar "em dia")
        try {
            const promessa = await banco.buscarPromessa(nome);
            if (promessa?.data_promessa) {
                await client.sendMessage(deQuem,
                    `${P}🤝 *${primeiroNome}*, encontrei uma *promessa de pagamento* para o dia *${promessa.data_promessa}*.\n\n` +
                    `Se você já pagou, pode me enviar o comprovante aqui (foto ou PDF).`
                );
                return;
            }
        } catch (_) {}

        const diaVenc = parseInt(cliente.dia_vencimento) || 10;
        const cicloRef = getCicloAtual(diaVenc, agoraBR());

        // Busca historico do ciclo
        const histDoc = await firebaseDb.collection('clientes').doc(cliente.id)
            .collection('historico_pagamentos').doc(cicloRef.docId).get().catch(() => null);
        const histReg = histDoc?.exists ? histDoc.data() : null;
        const statusCalc = calcularStatusCliente(cliente, { [cicloRef.docId]: histReg });

        const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        const nomeMes = meses[cicloRef.mesRef - 1] || `${String(cicloRef.mesRef).padStart(2,'0')}`;

        const tolerancia = diaVenc === 10 ? 15 : diaVenc === 20 ? 25 : 5;
        const textoTolerance = diaVenc === 30
            ? `até dia ${tolerancia}/${cicloRef.mesRef === 12 ? '01/' + (cicloRef.anoRef + 1) : String(cicloRef.mesRef).padStart(2,'0') + '/' + cicloRef.anoRef}`
            : `até dia ${tolerancia}/${String(cicloRef.mesRef).padStart(2,'0')}`;

        if (statusCalc === 'pago') {
            await client.sendMessage(deQuem,
                `${P}✅ *${primeiroNome}*, sua situação está em dia!\n\n` +
                `📅 Vencimento: Todo dia ${diaVenc}\n` +
                `💰 Referência: ${nomeMes}/${cicloRef.anoRef} — *Pago*\n\n` +
                `Seu acesso está normal. Se estiver com problema de internet, é algo técnico.\n\n` +
                `Digite *0* para voltar ao menu ou diga o que precisa! 😊`
            );
        } else if (statusCalc === 'inadimplente') {
            await client.sendMessage(deQuem,
                `${P}⚠️ *${primeiroNome}*, encontrei aqui:\n\n` +
                `📅 Vencimento: Todo dia ${diaVenc}\n` +
                `💰 Referência: ${nomeMes}/${cicloRef.anoRef} — *Inadimplente*\n` +
                `⏰ Tolerância expirou em ${textoTolerance}\n\n` +
                `Sua internet pode estar suspensa por falta de pagamento.\n\n` +
                `Para reativar, digite *2* para efetuar o pagamento ou *0* para voltar ao menu.`
            );
        } else {
            // pendente / em_dia
            await client.sendMessage(deQuem,
                `${P}⏳ *${primeiroNome}*, encontrei aqui:\n\n` +
                `📅 Vencimento: Todo dia ${diaVenc}\n` +
                `💰 Referência: ${nomeMes}/${cicloRef.anoRef} — *Pendente* (pagamento ainda não localizado)\n` +
                `⏰ Tolerância: ${textoTolerance}\n\n` +
                `Digite *2* para efetuar o pagamento ou *0* para voltar ao menu.`
            );
        }
    }

    return { processarMidiaAutomatico, confirmarNomeComprovante, darBaixaAutomatica, abrirChamadoComMotivo, detectarAcaoAdmin, consultarSituacao };
}

module.exports = setupComprovante;
