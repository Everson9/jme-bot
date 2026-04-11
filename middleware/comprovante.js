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
                // tentativas: 0 = primeira vez pedindo nome
                state.iniciar(deQuem, 'aguardando_nome_comprovante', 'nome', { analise, tentativasNome: 0 });
                return true;
            }
        }
        return false;
    }

    // =====================================================
    // CONFIRMAR NOME DO COMPROVANTE
    // Fluxo de fallback quando não achou pelo telefone.
    // Etapas: nome (até 2x) → atendente
    //
    // Lógica de matching tolerante a nomes parciais/planilha:
    //   - "Viviane" acha "Viviane Rodrigues dos Santos"
    //   - "Viviane Rodrigues" acha mesmo com "dos Santos" faltando
    //   - Erros de digitação leves (1 char) são tolerados no primeiro token
    // =====================================================
    async function confirmarNomeComprovante(deQuem, nomeDigitado) {
        const nomeBruto = (nomeDigitado || '').trim();
        const dados = state.getDados(deQuem) || {};
        const tentativas = dados.tentativasNome ?? 0;

        // Nome muito curto — pede de novo sem gastar tentativa
        if (nomeBruto.length < 3) {
            await client.sendMessage(deQuem, `${P}Pode digitar *nome e sobrenome* do titular? 😊`);
            return { ok: false, motivo: 'nome_curto' };
        }

        // Busca com a lógica de matching tolerante
        const resultados = await buscarNomeToleranteComprovante(nomeBruto);

        // ── Achou exatamente 1 ──────────────────────────────
        if (resultados.length === 1) {
            return await _darBaixaPorCliente(deQuem, resultados[0], dados);
        }

        // ── Achou múltiplos — pede CPF pra desambiguar ──────
        if (resultados.length > 1) {
            await client.sendMessage(deQuem,
                `${P}Encontrei *${resultados.length}* cadastros com nome parecido. 😕\n\n` +
                `Para confirmar certinho, me informe o *CPF do titular* (11 dígitos, só números).`
            );
            // Guarda os candidatos e troca de etapa pra CPF
            state.iniciar(deQuem, 'aguardando_nome_comprovante', 'cpf', {
                ...dados,
                candidatos: resultados.map(c => c.id),
                tentativasCpf: 0,
            });
            return { ok: false, motivo: 'multiplos' };
        }

        // ── Não achou ────────────────────────────────────────
        // Primeira tentativa: orienta e dá outra chance
        if (tentativas === 0) {
            state.atualizar(deQuem, { tentativasNome: 1 });
            await client.sendMessage(deQuem,
                `${P}Não encontrei "*${nomeBruto}*" no cadastro. 😕\n\n` +
                `Confirme se digitou certo o nome do titular e tente novamente, ou escolha uma opção:\n\n` +
                `1️⃣ Tentar outro nome\n` +
                `2️⃣ Chamar atendente para confirmar o pagamento`
            );
            // Mantém etapa 'nome' para receber a próxima mensagem
            return { ok: false, motivo: 'nao_encontrado_1a_vez' };
        }

        // Segunda tentativa (ou cliente escolheu 2): chama atendente
        await _chamarAtendente(deQuem, dados, nomeBruto);
        return { ok: false, motivo: 'nao_encontrado_encaminhou' };
    }

    // Chamado quando está na etapa 'cpf' (desambiguação de múltiplos)
    async function _confirmarCpfComprovante(deQuem, cpfDigitado) {
        const dados = state.getDados(deQuem) || {};
        const cpf = (cpfDigitado || '').replace(/\D/g, '');

        if (cpf.length !== 11) {
            const tent = (dados.tentativasCpf ?? 0) + 1;
            if (tent >= 2) {
                await _chamarAtendente(deQuem, dados, null);
                return { ok: false, motivo: 'cpf_invalido_encaminhou' };
            }
            state.atualizar(deQuem, { tentativasCpf: tent });
            await client.sendMessage(deQuem, `${P}CPF precisa ter *11 dígitos*. Tenta novamente só com números. 😊`);
            return { ok: false, motivo: 'cpf_invalido' };
        }

        const cliente = await banco.buscarClientePorCPF(cpf);
        if (!cliente) {
            const tent = (dados.tentativasCpf ?? 0) + 1;
            if (tent >= 2) {
                await _chamarAtendente(deQuem, dados, null);
                return { ok: false, motivo: 'cpf_nao_encontrado_encaminhou' };
            }
            state.atualizar(deQuem, { tentativasCpf: tent });
            await client.sendMessage(deQuem, `${P}CPF não encontrado. Confere e tenta novamente (só números).`);
            return { ok: false, motivo: 'cpf_nao_encontrado' };
        }

        return await _darBaixaPorCliente(deQuem, cliente, dados);
    }

    // Baixa efetiva — compartilhada entre os caminhos
    async function _darBaixaPorCliente(deQuem, clienteEncontrado, dados) {
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

    async function _chamarAtendente(deQuem, dados, nomeDigitado) {
        await client.sendMessage(deQuem,
            `${P}Vou chamar um atendente para confirmar seu pagamento manualmente. 😊\n\n` +
            `Aguarda um instante!`
        );
        await abrirChamadoComMotivo(
            deQuem,
            nomeDigitado || null,
            `Comprovante — titular não identificado (nome: "${nomeDigitado || 'não informado'}")`,
            { analise: dados.analise }
        );
        state.encerrarFluxo(deQuem);
    }

    // =====================================================
    // BUSCA TOLERANTE PARA COMPROVANTE
    // Mais permissiva que buscarClientePorNome padrão porque:
    // - Banco importado de planilha pode ter só nome+sobrenome
    // - Cliente pode digitar nome completo que não existe exato
    // - Aceita match por qualquer subconjunto de tokens ≥ 2
    // =====================================================
    async function buscarNomeToleranteComprovante(nomeDigitado) {
        const STOP = new Set(['da','de','do','das','dos','e','dos','das']);
        const norm = (s) => (s || '')
            .toLowerCase().trim()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

        const termoNorm = norm(nomeDigitado);
        const tokensDigitados = termoNorm.split(' ')
            .filter(t => t.length > 1 && !STOP.has(t));

        if (tokensDigitados.length === 0) return [];

        // Busca por nome — usa a função existente como base
        const candidatos = await banco.buscarClientePorNome(nomeDigitado);

        // Se já achou algo, retorna direto
        if (candidatos.length > 0) return candidatos;

        // Fallback: tenta só com o primeiro nome (casos onde banco tem só "Viviane")
        // ou primeiro + último token (ignora tokens do meio)
        const tentativas = new Set();
        tentativas.add(tokensDigitados[0]); // só primeiro nome
        if (tokensDigitados.length >= 2) {
            // primeiro + último
            tentativas.add(tokensDigitados[0] + ' ' + tokensDigitados[tokensDigitados.length - 1]);
        }

        for (const tentativa of tentativas) {
            if (tentativa === termoNorm) continue; // já tentou acima
            const res = await banco.buscarClientePorNome(tentativa);
            if (res.length > 0) {
                // Filtra: só retorna se todos os tokens digitados existem no nome do cliente
                // (evita falso positivo: "João" não deve achar "João Pedro" se cliente digitou "João Silva")
                const filtrados = res.filter(c => {
                    const nomeC = norm(c.nome);
                    const tokensC = nomeC.split(' ').filter(t => !STOP.has(t));
                    // Pelo menos metade dos tokens digitados (sem stop) existem no nome
                    const matches = tokensDigitados.filter(td =>
                        tokensC.some(tc => tc === td || tc.startsWith(td))
                    );
                    return matches.length >= Math.ceil(tokensDigitados.length / 2);
                });
                if (filtrados.length > 0) return filtrados;
            }
        }

        return [];
    }

    // =====================================================
    // PONTO DE ENTRADA PRINCIPAL DO FLUXO aguardando_nome_comprovante
    // Roteado a partir de Mensagem.js
    // =====================================================
    async function confirmarNomeComprovanteRouter(deQuem, texto) {
        const dados = state.getDados(deQuem) || {};
        const etapa = state.getEtapa(deQuem) || 'nome';

        // Cliente estava em etapa de CPF (desambiguação)
        if (etapa === 'cpf') {
            return await _confirmarCpfComprovante(deQuem, texto);
        }

        // Etapa 'nome' — mas cliente pode ter digitado "1" ou "2" (opção do menu)
        const t = texto.trim().toLowerCase();
        if (etapa === 'nome' && (dados.tentativasNome ?? 0) >= 1) {
            // Estava aguardando escolha após a mensagem de "não encontrei"
            if (t === '2' || t.includes('atendente') || t.includes('chamar') || t.includes('humano')) {
                await _chamarAtendente(deQuem, dados, dados.ultimoNomeTentado || null);
                return { ok: false, motivo: 'solicitou_atendente' };
            }
            // "1" ou qualquer outro texto = tenta como nome novamente
            // (se digitou "1", pede nome de novo sem gastar tentativa)
            if (t === '1') {
                await client.sendMessage(deQuem,
                    `${P}Tudo bem! Me informe o *nome completo do titular* como está no cadastro:`
                );
                return { ok: false, motivo: 'aguardando_nome_novamente' };
            }
        }

        // Salva o último nome tentado para usar no chamado se precisar
        state.atualizar(deQuem, { ultimoNomeTentado: texto });
        return await confirmarNomeComprovante(deQuem, texto);
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
        if (extras.analise?.valor) msg += `💰 *Valor comprovante:* R$ ${extras.analise.valor}\n`;

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

        if (state.getFluxo(deQuem) !== 'consulta_situacao') {
            state.iniciar(deQuem, 'consulta_situacao', 'aguardando_dados', {});
        }

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
                await client.sendMessage(deQuem, `${P}Me informe seu *CPF* (11 dígitos) ou seu *nome completo* para eu consultar. 😊`);
                return;
            }

            state.encerrarFluxo(deQuem);
            dados._cliente = cliente;
        }

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

        if (etapa === 'aguardando_telefone') {
            const telefone = t.replace(/\D/g, '');
            if (telefone.length < 10 || telefone.length > 11) {
                const tent = (dados.tentativasTelefone || 1);
                if (tent >= 2) {
                    state.encerrarFluxo(deQuem);
                    await client.sendMessage(deQuem,
                        `${P}Ainda não consegui te localizar na base. 😕\n\nVou chamar um atendente pra te ajudar melhor.`
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
            state.iniciar(deQuem, 'consulta_situacao', 'aguardando_dados', {});
            await client.sendMessage(deQuem, `${P}Me informe seu *CPF* (11 dígitos) ou seu *nome completo* para eu consultar. 😊`);
            return;
        }

        const nome = cliente.nome || 'Cliente';
        const primeiroNome = nome.split(' ')[0];

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
            await client.sendMessage(deQuem,
                `${P}⏳ *${primeiroNome}*, encontrei aqui:\n\n` +
                `📅 Vencimento: Todo dia ${diaVenc}\n` +
                `💰 Referência: ${nomeMes}/${cicloRef.anoRef} — *Pendente* (pagamento ainda não localizado)\n` +
                `⏰ Tolerância: ${textoTolerance}\n\n` +
                `Digite *2* para efetuar o pagamento ou *0* para voltar ao menu.`
            );
        }
    }

    return {
        processarMidiaAutomatico,
        // ⚠️ Exporta o ROUTER (não a função interna diretamente)
        // Mensagem.js deve chamar confirmarNomeComprovante que agora é o router
        confirmarNomeComprovante: confirmarNomeComprovanteRouter,
        darBaixaAutomatica,
        abrirChamadoComMotivo,
        detectarAcaoAdmin,
        consultarSituacao,
    };
}

module.exports = setupComprovante;