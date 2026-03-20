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
            console.log(`🔄 Sessão expirada para ${deQuem.slice(-8)}`);
            state.encerrarFluxo(deQuem);
            await banco.dbLimparHistorico(deQuem);
        }

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
            
            if (fluxoAtivo === 'aguardando_nome_comprovante') {
                const nomeLimpo = await utils.extrairNomeDaMensagem(msg.body || '');
                const dados = state.getDados(deQuem);
                if (nomeLimpo) {
                    const cliente = await banco.buscarClientePorNome(nomeLimpo);
                    if (cliente?.length > 0) {
                        await darBaixaAutomatica(deQuem, dados.analise);
                        await client.sendMessage(deQuem, `${P}✅ Pagamento confirmado para ${cliente[0].nome}!`);
                    } else {
                        await client.sendMessage(deQuem, `${P}Não encontrei cliente. Vou abrir chamado.`);
                        abrirChamadoComMotivo(deQuem, nomeLimpo, 'Comprovante sem cadastro', { analise: dados.analise });
                    }
                } else {
                    await client.sendMessage(deQuem, `${P}Não consegui identificar o nome. Digite o nome completo.`);
                    return;
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

        const dadosCliente = await banco.buscarStatusCliente(deQuem);
        
        if (!dadosCliente) {
            console.log(`🆔 Cliente não identificado por telefone. Iniciando identificação.`);
            const intencoes = await detectorMultiplas.detectarMultiplasIntencoes(msg.body || '');
            state.iniciar(deQuem, 'identificacao', 'aguardando_nome', { 
                msgOriginal: msg.body, intencoes 
            });
            await client.sendMessage(deQuem, 
                `🤖 *Assistente JMENET*\n\nOlá! Não encontrei seu cadastro pelo telefone. 😊\n\n` +
                `Para melhor atendê-lo, poderia me informar o *nome completo do titular* da internet?`
            );
            await banco.dbIniciarAtendimento(deQuem);
            return;
        }

        console.log(`✅ Cliente identificado: ${dadosCliente.nome} (${dadosCliente.status})`);
        
        const clientesList = await banco.buscarClientePorNome(dadosCliente.nome);
        const cliente = clientesList?.[0] || null;
        
        if (cliente) {
            state.atualizar(deQuem, { 
                clienteIdentificado: true,
                nomeCliente: cliente.nome,
                statusCliente: cliente.status,
                telefoneCliente: cliente.telefone
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
        const diaVencimento = parseInt(dadosCliente.aba.replace('Data ', ''));
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
                console.log(`🆔 Nome extraído da mensagem: "${nomeExtraido}" (original: "${texto.substring(0, 40)}")`);
            }
        }
        
        const clientes = await banco.buscarClientePorNome(nomeBusca);
        
        if (clientes.length === 1) {
            await processarAposIdentificacao(deQuem, clientes[0].nome, dados.msgOriginal, dados.intencoes, ctx);
            return;
        }
        
        if (clientes.length === 0) {
            state.atualizar(deQuem, { etapa: 'aguardando_cpf', tentativasCpf: 1, nomeTentado: nomeBusca });
            await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\nNão encontrei *${nomeBusca}* na minha base. 😕\n\nPode me informar o *CPF* do titular? (só os números)`);
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
        
        await verificarETransferir(deQuem, 'Não identificado após nome, CPF e telefone');
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
    const historico = await banco.dbCarregarHistorico(deQuem);
    const historicoSlice = historico.slice(-10);
    const systemMsg = `Você é o assistente virtual da JMENET Telecom.`;
    try {
        const respostaIA = await groqChatFallback([
            { role: 'system', content: systemMsg },
            ...historicoSlice,
            { role: 'user', content: msg.body }
        ], 0.5);
        
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
    
    const clientes = await banco.buscarClientePorNome(nomeTitular);
    const cliente = clientes?.[0] || null;
    
    if (!cliente) {
        await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\nNão encontrei nenhum cliente com esse nome. 😕\n\nVou te ajudar mesmo assim. Como posso ajudar?`);
        if (intencoes.length > 0) {
            await iniciarFluxoPorIntencao(intencoes[0], deQuem, { body: msgOriginal });
        }
        return;
    }
    
    state.atualizar(deQuem, { 
        clienteIdentificado: true,
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
            if (intencoes.length > 0) {
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
        if (intencoes.length > 0) {
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