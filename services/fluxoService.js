// services/fluxoService.js
const { horaLocal, redeNormal, falarSinalAmigavel } = require('./utilsService');

// Imports da raiz do projeto (usando ../)
const { db: firebaseDb } = require('../config/firebase');
const banco = require('../database/funcoes-firebase');
const StateManager = require('../stateManager');

// Imports dos fluxos (usando ../)
const criarFluxoSuporte = require('../fluxos/suporte');
const criarFluxoFinanceiro = require('../fluxos/financeiro');
const criarFluxoPromessa = require('../fluxos/promessa');
const criarFluxoNovoCliente = require('../fluxos/novoCliente');
const criarFluxoCancelamento = require('../fluxos/cancelamento');

async function processarMensagem(deQuem, msg, ctx) {
    // Ignorar mensagens sem texto (áudio não transcrito, mídia sem legenda)
    if (!msg.body?.trim() && msg.hasMedia) return;

    const {
        state, banco, client, utils, classificador, detectorMultiplas,
        verificarETransferir, responderComIA, iniciarFluxoPorIntencao,
        handleIdentificacao, abrirChamadoComMotivo, darBaixaAutomatica,
        processingLock, filaEspera, P, logErro, metrics, processarFila
    } = ctx;

    if (state.isAtendimentoHumano(deQuem)) return;

    if (processingLock.get(deQuem)) {
        const fila = filaEspera.get(deQuem) || [];
        fila.push(msg);
        filaEspera.set(deQuem, fila);
        return;
    }

    processingLock.set(deQuem, true);
    const inicioProcessamento = Date.now();
    
    try {
        const dadosAtuais = state.getDados(deQuem);
        const ultimaAtualizacao = dadosAtuais?.atualizadoEm;
        const agora = Date.now();
        
        if (ultimaAtualizacao && (agora - ultimaAtualizacao > 60 * 60 * 1000)) {
            // Só expira sessão se NÃO estiver em atendimento humano
            if (!state.isAtendimentoHumano(deQuem)) {
                console.log(`🔄 Sessão expirada para ${deQuem.slice(-8)}`);
                state.encerrarFluxo(deQuem);
                await banco.dbLimparHistorico(deQuem);
            }
        }

        // Se está em atendimento humano, não processa — admin está respondendo
        if (state.isAtendimentoHumano(deQuem)) return;

        const fluxoAtivo = state.getFluxo(deQuem);
        
        if (dadosAtuais?.clienteIdentificado) {
            console.log(`✅ Cliente já identificado: ${dadosAtuais.nomeCliente}`);
            
            if (dadosAtuais.aguardandoEscolha === 'promessa_ou_suporte') {
                const texto = msg.body?.toLowerCase() || '';
                if (texto.includes('confirmar') || texto.includes('pagar') || texto.includes('sim')) {
                    await iniciarFluxoPorIntencao('FINANCEIRO', deQuem, msg);
                    return;
                } else {
                    await iniciarFluxoPorIntencao('SUPORTE', deQuem, msg);
                    return;
                }
            }
            
            const multiplas = await detectorMultiplas.detectarMultiplasIntencoes(msg.body || '');
            if (multiplas.length > 0) {
                await iniciarFluxoPorIntencao(multiplas[0], deQuem, msg);
            } else {
                const transferiu = await verificarETransferir(deQuem, 'Não entendeu mensagem');
                if (transferiu) return;
                await responderComIA(deQuem, msg);
            }
            return;
        }

        if (fluxoAtivo) {
            if (fluxoAtivo === 'identificacao') {
                await handleIdentificacao(deQuem, msg);
                return;
            }

            // Menu rápido — aparece quando bot não entendeu 2x seguidas
            if (fluxoAtivo === 'menu_rapido') {
                const t = (msg.body || '').trim().toLowerCase();
                state.atualizar(deQuem, { _naoEntendidos: 0 }); // reset contador
                state.encerrarFluxo(deQuem);
                if (t === '1' || t.includes('internet') || t.includes('suporte') || t.includes('sinal')) {
                    await iniciarFluxoPorIntencao('SUPORTE', deQuem, msg);
                } else if (t === '2' || t.includes('pix') || t.includes('pagamento') || t.includes('pagar')) {
                    await iniciarFluxoPorIntencao('FINANCEIRO', deQuem, msg);
                } else if (t === '3' || t.includes('atendente') || t.includes('humano') || t.includes('pessoa')) {
                    await abrirChamadoComMotivo(deQuem,
                        state.getDados(deQuem)?.nomeCliente || null,
                        'Solicitou atendente pelo menu'
                    );
                    await client.sendMessage(deQuem,
                        `${P}Deixa eu chamar alguém pra te ajudar. 😊 Aguarda um instante!`
                    );
                } else {
                    // Digitou outra coisa — chama atendente direto
                    await abrirChamadoComMotivo(deQuem,
                        state.getDados(deQuem)?.nomeCliente || null,
                        'Mensagem não reconhecida após menu'
                    );
                    await client.sendMessage(deQuem,
                        `${P}Deixa eu chamar alguém pra te ajudar melhor. 😊 Aguarda um instante!`
                    );
                }
                return;
            }
            
            if (fluxoAtivo === 'aguardando_nome_comprovante') {
                const nomeLimpo = await utils.extrairNomeDaMensagem(msg.body || '');
                const dados = state.getDados(deQuem);
                if (!nomeLimpo) {
                    await client.sendMessage(deQuem, `${P}Não consegui identificar o nome. Pode digitar só o nome e sobrenome do titular? 😊`);
                    return;
                }
                const clientes = await banco.buscarClientePorNome(nomeLimpo);
                if (clientes?.length > 0) {
                    const clienteEncontrado = clientes[0];
                    // Dá baixa usando o ID do cliente encontrado pelo nome
                    await firebaseDb.collection('clientes').doc(clienteEncontrado.id).update({
                        status: 'pago',
                        atualizado_em: new Date().toISOString()
                    });
                    const hoje = new Date();
                    const mesRef = `${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}`;
                    await firebaseDb.collection('clientes').doc(clienteEncontrado.id)
                        .collection('historico_pagamentos').doc(mesRef.replace('/','-'))
                        .set({ referencia: mesRef, status: 'pago', forma_pagamento: 'Comprovante',
                               pago_em: hoje.toISOString(), data_vencimento: clienteEncontrado.dia_vencimento || 10,
                               valor: dados.analise?.valor }, { merge: true });
                    await banco.dbLogComprovante(deQuem);
                    await client.sendMessage(deQuem, `${P}Pagamento confirmado para *${clienteEncontrado.nome}*! ✅`);
                    // Notifica admins no WhatsApp
                    for (const adm of ctx.ADMINISTRADORES) {
                        client.sendMessage(adm,
                            `✅ *BAIXA VIA COMPROVANTE (nome confirmado)*\n\n` +
                            `👤 ${clienteEncontrado.nome}\n` +
                            `📱 ${deQuem.replace('@c.us','')}\n` +
                            `💰 R$ ${dados.analise?.valor || 'N/A'}`
                        ).catch(() => {});
                    }
                    // Atualiza o front via SSE
                    if (ctx.sseService) ctx.sseService.broadcast();
                } else {
                    await client.sendMessage(deQuem, `${P}Não encontrei *${nomeLimpo}* na base. Vou chamar um atendente para verificar. 😊`);
                    await abrirChamadoComMotivo(deQuem, nomeLimpo, 'Comprovante — titular não encontrado', { analise: dados.analise });
                }
                state.encerrarFluxo(deQuem);
                return;
            }
            
            const continua = await utils.detectarContinuacaoFluxo(
                fluxoAtivo,
                state.getEtapa(deQuem),
                msg.body || ''
            );
            
            if (continua) {
                // 🔥 CORREÇÃO: Passando ctx como 4º parâmetro
                await delegarParaFluxo(fluxoAtivo, deQuem, msg, ctx);
            } else {
                state.encerrarFluxo(deQuem);
                await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\nEntendi! Vou te ajudar com isso.`);
            }
            return;
        }

        // ✅ CORRIGIDO: buscarStatusCliente já retorna o objeto completo com id.
        // NÃO fazemos buscarClientePorNome logo depois — era um scan redundante.
        const dadosCliente = await banco.buscarStatusCliente(deQuem);
        
        if (!dadosCliente) {
            console.log(`🆔 Cliente não identificado por telefone — processando intenção diretamente`);
            // Não pede nome de cara — classifica a intenção e responde direto
            // O nome só será pedido se o fluxo precisar (financeiro, promessa etc)
            const intencoes = await detectorMultiplas.detectarMultiplasIntencoes(msg.body || '');
            state.atualizar(deQuem, { msgOriginal: msg.body, intencoes });
            await banco.dbIniciarAtendimento(deQuem);

            if (intencoes.length > 0) {
                // Tem intenção clara — vai direto pro fluxo
                await iniciarFluxoPorIntencao(intencoes[0], deQuem, msg);
            } else {
                // Sem intenção clara — sauda e mostra menu
                const hora = new Date(Date.now() - 3 * 60 * 60 * 1000);
                const h = hora.getUTCHours();
                const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
                await client.sendMessage(deQuem,
                    `🤖 *Assistente JMENET*\n\n${saudacao}! Como posso te ajudar? 😊\n\n` +
                    `1️⃣ Problema com a internet\n` +
                    `2️⃣ Pagamento / PIX\n` +
                    `3️⃣ Falar com atendente`
                );
                state.iniciar(deQuem, 'menu_rapido', 'aguardando_escolha', { msgOriginal: msg.body });
            }
            return;
        }

        console.log(`✅ Cliente identificado por telefone: ${dadosCliente.nome} (${dadosCliente.status})`);
        
        // ✅ CORRIGIDO: salva clienteId junto para não precisar re-buscar depois.
        // Antes havia um buscarClientePorNome() aqui que era um scan desnecessário
        // dado que buscarStatusCliente() já retornou nome, status e id.
        if (dadosCliente.id) {
            state.atualizar(deQuem, { 
                clienteIdentificado: true,
                clienteId: dadosCliente.id,
                nomeCliente: dadosCliente.nome,
                statusCliente: dadosCliente.status,
            });
        }
        
        const promessa = await banco.buscarPromessa(dadosCliente.nome);
        
        if (promessa) {
            console.log(`📅 Promessa encontrada: ${promessa.data_promessa}`);
            state.atualizar(deQuem, { promessaCliente: promessa.data_promessa });
            
            let mensagem = `Encontrei o cadastro de *${dadosCliente.nome}*! `;
            mensagem += `Você tem uma *promessa de pagamento* para o dia *${promessa.data_promessa}*. 😊\n\n`;
            
            if (dadosCliente.status === 'pago') {
                mensagem += `Sua internet está em dia! Como posso ajudar?`;
                await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${mensagem}`);
                const multiplas = await detectorMultiplas.detectarMultiplasIntencoes(msg.body || '');
                if (multiplas.length > 0) await iniciarFluxoPorIntencao(multiplas[0], deQuem, msg);
                return;
            }
            
            mensagem += `Quer *confirmar o pagamento* agora ou precisa de ajuda com a internet?`;
            await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${mensagem}`);
            state.atualizar(deQuem, { aguardandoEscolha: 'promessa_ou_suporte' });
            return;
        }
        
        const multiplas = await detectorMultiplas.detectarMultiplasIntencoes(msg.body || '');
        console.log(`🎯 Intenções: ${multiplas.length > 0 ? multiplas.join(', ') : 'nenhuma'}`);
        
        const _sr = ctx?.situacaoRede || 'normal';
        const _pr = ctx?.previsaoRetorno || 'sem previsão';
        if (!redeNormal(_sr)) {
            const sinalMsg = falarSinalAmigavel(_sr, _pr);
            await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${sinalMsg}`);
            if (multiplas.length > 1) {
                state.atualizar(deQuem, { intencoesPendentes: multiplas.slice(1), msgPendente: msg.body });
            }
            await banco.dbIniciarAtendimento(deQuem);
            return;
        }

        const hoje = new Date().getDate();
        const diaVencimento = parseInt((dadosCliente.aba || '').replace('Data ', '')) || 0;
        const estaSuspenso = (dadosCliente.status === 'pendente' && hoje > diaVencimento);
        
        if (estaSuspenso) {
            console.log(`💰 Cliente SUSPENSO. Priorizando financeiro.`);
            if (multiplas.includes('SUPORTE')) {
                state.atualizar(deQuem, { intencoesPendentes: multiplas.filter(i => i !== 'FINANCEIRO' && i !== 'PROMESSA'), msgPendente: msg.body });
            }
            if (multiplas.includes('PROMESSA')) {
                await iniciarFluxoPorIntencao('PROMESSA', deQuem, msg);
            } else {
                await iniciarFluxoPorIntencao('FINANCEIRO', deQuem, msg);
            }
            return;
        }

        if (multiplas.length > 1) {
            const [primeira, ...restantes] = multiplas;
            state.atualizar(deQuem, { intencoesPendentes: restantes, msgPendente: msg.body });
            await iniciarFluxoPorIntencao(primeira, deQuem, msg);
            return;
        }

        const historico = await banco.dbCarregarHistorico(deQuem);
        const intencao = multiplas.length === 1 ? multiplas[0] : 
                        await classificador.classificarIntencaoUnificada(msg.body || '', historico, fluxoAtivo);
        
        await banco.dbLog(deQuem, 'decisao', 'classificacao', msg.body, { intencao });
        await iniciarFluxoPorIntencao(intencao, deQuem, msg);
        
    } catch (error) {
        logErro('processarMensagem', error, { numero: deQuem, msg: msg.body });
    } finally {
        metrics.mensagensProcessadas++;
        metrics.temposResposta.push(Date.now() - inicioProcessamento);
        if (metrics.temposResposta.length > 100) metrics.temposResposta.shift();
        
        processingLock.delete(deQuem);
        processarFila(deQuem);
    }
}

async function handleIdentificacao(deQuem, msg, ctx) {
    const { state, banco, client, utils, verificarETransferir, processarAposIdentificacao } = ctx;
    const etapa = state.getEtapa(deQuem);
    const dados = state.getDados(deQuem);
    const texto = msg.body?.trim() || '';
    
    console.log(`🆔 Fluxo de identificação - etapa: ${etapa}`);
    
    if (etapa === 'aguardando_nome') {
        if (!texto || texto.length < 3) {
            await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\nPor favor, me informe o *nome completo do titular* da internet. 😊`);
            state.iniciarTimer(deQuem);
            return;
        }
        
        // Extrai só o nome da mensagem (cliente pode mandar "sou o João Silva, vencimento dia 20...")
        let nomeBusca = texto;
        if (ctx?.utils?.extrairNomeDaMensagem) {
            const nomeExtraido = await ctx.utils.extrairNomeDaMensagem(texto);
            if (nomeExtraido) {
                nomeBusca = nomeExtraido;
                console.log(`🆔 Nome extraído: "${nomeExtraido}"`);
            }
        }
        
        const clientes = await banco.buscarClientePorNome(nomeBusca);
        
        if (clientes.length === 1) {
            await processarAposIdentificacao(deQuem, clientes[0].nome, dados.msgOriginal, dados.intencoes, ctx);
            return;
        }
        
        if (clientes.length === 0) {
            state.atualizar(deQuem, { etapa: 'aguardando_cpf', tentativasCpf: 1, nomeTentado: nomeBusca });
            await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\nPode me informar o *CPF* do titular? (só os números) 😊`);
            state.iniciarTimer(deQuem);
            return;
        }
        
        if (clientes.length > 1) {
            state.atualizar(deQuem, { etapa: 'aguardando_cpf', tentativasCpf: 1, nomeTentado: nomeBusca, multiplosClientes: clientes });
            await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\nEncontrei *${clientes.length}* clientes com nome parecido. Para identificar corretamente, pode me informar o *CPF* do titular? (só os números)`);
            state.iniciarTimer(deQuem);
            return;
        }
    }
    
    if (etapa === 'aguardando_cpf') {
        const cpf = texto.replace(/\D/g, '');
        
        if (cpf.length !== 11) {
            const tentativas = (dados.tentativasCpf || 1);
            if (tentativas >= 3) {
                state.atualizar(deQuem, { etapa: 'aguardando_telefone', tentativasTelefone: 1 });
                await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\nVamos tentar de outra forma. Poderia me informar o *telefone de contato* do titular? (com DDD, apenas números)`);
                return;
            }
            await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\nCPF deve ter 11 dígitos. Você informou ${cpf.length}. Digite apenas números.`);
            state.atualizar(deQuem, { tentativasCpf: tentativas + 1 });
            return;
        }
        
        const cliente = await banco.buscarClientePorCPF(cpf);
        if (cliente) {
            await processarAposIdentificacao(deQuem, cliente.nome, dados.msgOriginal, dados.intencoes, ctx);
            return;
        }
        
        state.atualizar(deQuem, { etapa: 'aguardando_telefone', tentativasTelefone: 1 });
        await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\nNão encontrei o CPF na base. 😕\n\nÚltima tentativa: poderia me informar o *telefone de contato* do titular? (com DDD, apenas números)`);
        return;
    }
    
    if (etapa === 'aguardando_telefone') {
        const telefone = texto.replace(/\D/g, '');
        
        if (telefone.length < 10 || telefone.length > 11) {
            const tentativas = (dados.tentativasTelefone || 1);
            if (tentativas >= 2) {
                await verificarETransferir(deQuem, 'Não identificado após nome, CPF e telefone');
                return;
            }
            await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\nTelefone deve ter 10 ou 11 dígitos (com DDD). Digite apenas números.`);
            state.atualizar(deQuem, { tentativasTelefone: tentativas + 1 });
            return;
        }
        
        const cliente = await banco.buscarClientePorTelefone(telefone);
        if (cliente) {
            await processarAposIdentificacao(deQuem, cliente.nome, dados.msgOriginal, dados.intencoes, ctx);
            return;
        }
        
        state.encerrarFluxo(deQuem);
        state.setAtendimentoHumano(deQuem, true);
        await banco.dbSalvarAtendimentoHumano(deQuem).catch(() => {});
        await banco.dbAbrirChamado(deQuem, null, 'Não identificado — número não cadastrado').catch(() => {});
        await client.sendMessage(deQuem,
            `🤖 *Assistente JMENET*\n\nNão consegui te identificar na minha base. Deixa eu chamar alguém pra te ajudar melhor. 😊 Aguarda um instante!`
        );
        return;
    }
}

async function delegarParaFluxo(fluxo, deQuem, msg, ctx) {
    const { _fluxoSuporte, _fluxoFinanceiro, _fluxoPromessa, _fluxoNovoCliente, _fluxoCancelamento, handleIdentificacao } = ctx;
    const fluxos = {
        'suporte': _fluxoSuporte,
        'financeiro': _fluxoFinanceiro,
        'promessa': _fluxoPromessa,
        'novoCliente': _fluxoNovoCliente,
        'cancelamento': _fluxoCancelamento,
        'identificacao': { handle: handleIdentificacao }
    };
    
    const fluxoHandler = fluxos[fluxo];
    if (!fluxoHandler) {
        console.error(`Fluxo desconhecido: ${fluxo}`);
        return false;
    }
    
    await fluxoHandler.handle(deQuem, msg);
    return true;
}

async function responderComIA(deQuem, msg, ctx) {
    const { banco, client, groqChatFallback } = ctx;
    const texto = (msg.body || '').trim();

    // Não responde mensagens muito curtas sem sinal de pergunta
    const palavras = texto.split(/\s+/).length;
    const temPergunta = texto.includes('?') || /como|quando|onde|qual|quanto|por que|porque|preciso|quero|pode/i.test(texto);
    if (palavras <= 2 && !temPergunta) {
        await client.sendMessage(deQuem,
            `🤖 *Assistente JMENET*\n\nComo posso te ajudar? 😊\n\n1️⃣ Problema com a internet\n2️⃣ Pagamento / PIX\n3️⃣ Falar com atendente`
        );
        state.iniciar(deQuem, 'menu_rapido', 'aguardando_escolha', {});
        return;
    }

    const historico = await banco.dbCarregarHistorico(deQuem);
    const historicoSlice = historico.slice(-10);
    const systemMsg =
        `Você é o assistente virtual da JMENET Telecom, um provedor de internet em Recife/PE.\n` +
        `Responda APENAS sobre: pagamentos, internet, suporte técnico, planos da JMENET.\n` +
        `Se perguntarem sobre qualquer outro assunto (cidades, pessoas famosas, receitas, etc), ` +
        `responda educadamente que só pode ajudar com assuntos relacionados à JMENET Telecom.\n` +
        `Seja breve e direto. Nunca invente informações sobre a empresa.`;
    try {
        const respostaIA = await groqChatFallback([
            { role: 'system', content: systemMsg },
            ...historicoSlice,
            { role: 'user', content: texto }
        ], 0.3);
        
        if (respostaIA) {
            await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${respostaIA}`);
            await banco.dbSalvarHistorico(deQuem, 'assistant', respostaIA);
        }
    } catch (error) {
        console.error("Erro no Groq:", error);
    }
}

async function processarAposIdentificacao(deQuem, nomeTitular, msgOriginal, intencoes, ctx) {
    const { banco, state, client, iniciarFluxoPorIntencao, redeNormal, falarSinalAmigavel } = ctx;
    
    // ✅ CORRIGIDO: busca o cliente pelo nome (necessário aqui pois vem do fluxo de identificação
    // onde o usuário digitou o nome — não temos o id ainda neste ponto)
    const clientes = await banco.buscarClientePorNome(nomeTitular);
    const cliente = clientes?.[0] || null;
    
    if (!cliente) {
        await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\nNão encontrei nenhum cliente com esse nome. 😕\n\nVou te ajudar mesmo assim. Como posso ajudar?`);
        if (intencoes?.length > 0) {
            await iniciarFluxoPorIntencao(intencoes[0], deQuem, { body: msgOriginal });
        }
        return;
    }
    
    state.atualizar(deQuem, { 
        clienteIdentificado: true,
        clienteId: cliente.id,
        nomeCliente: cliente.nome,
        statusCliente: cliente.status,
        telefoneCliente: cliente.telefone,
        cpfCliente: cliente.cpf
    });
    
    const promessa = await banco.buscarPromessa(cliente.nome);
    
    if (promessa) {
        state.atualizar(deQuem, { promessaCliente: promessa.data_promessa });
        
        let mensagem = `Encontrei o cadastro de *${cliente.nome}*! `;
        mensagem += `Você tem uma *promessa de pagamento* para o dia *${promessa.data_promessa}*. 😊\n\n`;
        
        if (cliente.status === 'pago') {
            mensagem += `Sua internet está em dia! Como posso ajudar?`;
            await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${mensagem}`);
            if (intencoes?.length > 0) {
                await iniciarFluxoPorIntencao(intencoes[0], deQuem, { body: msgOriginal });
            }
            return;
        }
        
        mensagem += `Quer *confirmar o pagamento* agora ou precisa de ajuda com a internet?`;
        await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${mensagem}`);
        state.atualizar(deQuem, { aguardandoEscolha: 'promessa_ou_suporte' });
        return;
    }
    
    const hoje = new Date().getDate();
    const diaVenc = cliente.dia_vencimento;
    const status = cliente.status;
    
    let mensagem = `Encontrei o cadastro de *${cliente.nome}*! `;
    
    if (status === 'pendente' && hoje > diaVenc) {
        mensagem += `A internet está *suspensa* por falta de pagamento do dia ${diaVenc}. 😕\n\nGostaria de regularizar agora?`;
        await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${mensagem}`);
        await iniciarFluxoPorIntencao('FINANCEIRO', deQuem, { body: msgOriginal });
    }
    else if (!redeNormal(ctx?.situacaoRede || 'normal')) {
        mensagem += falarSinalAmigavel(ctx?.situacaoRede || 'normal', ctx?.previsaoRetorno || 'sem previsão');
        await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${mensagem}`);
    }
    else {
        if (status === 'pago') {
            mensagem += `Tudo em dia! 😊 Vou verificar seu problema.`;
        } else if (status === 'pendente') {
            mensagem += `Você está com o pagamento *pendente* do dia ${diaVenc}, mas ainda dentro do prazo. 😊\n\nQuer aproveitar para *regularizar* agora?`;
        } else {
            mensagem += `Como posso ajudar?`;
        }
        await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${mensagem}`);
        if (intencoes?.length > 0) {
            await iniciarFluxoPorIntencao(intencoes[0], deQuem, { body: msgOriginal });
        }
    }
}

module.exports = {
    processarMensagem,
    handleIdentificacao,
    delegarParaFluxo,
    responderComIA,
    processarAposIdentificacao
};