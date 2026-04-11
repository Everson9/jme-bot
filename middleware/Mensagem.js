'use strict';

// =====================================================
// HANDLERS DE MENSAGEM DO WHATSAPP
// message_create (admin replies) e message (clientes)
// =====================================================

const MENU_PRINCIPAL = `🤖 *Assistente JMENET*

Olá! Como posso te ajudar? 😊

1️⃣ Problema com a internet
2️⃣ Pagamento / Financeiro
3️⃣ Cancelamento
4️⃣ Consultar minha situação
5️⃣ Falar com atendente`;

const MENU_FINANCEIRO = `🤖 *Assistente JMENET*

Como prefere pagar? 💰

1️⃣ PIX
2️⃣ Boleto bancário
3️⃣ Carnê físico
4️⃣ Dinheiro (cobrador)
5️⃣ Já efetuei o pagamento`;

let mensagensConfiguradas = false;
function configurarMensagens(client, ctx, handlers) {
    if (mensagensConfiguradas) return;
    mensagensConfiguradas = true;
    const { state, banco, sseService, ADMINISTRADORES, FUNCIONARIOS, P,
            situacaoRede, previsaoRetorno, motivoRede, redeNormal, falarSinalAmigavel } = ctx;
    const { processarMidiaAutomatico, detectarAcaoAdmin, consultarSituacao, abrirChamadoComMotivo, confirmarNomeComprovante } = handlers;
    const { obterFluxo } = { obterFluxo: () => handlers }; // acesso via getter para não cache undefined
    const { dispararCobrancaReal, firebaseDb, groqChatFallback } = ctx;

    const fotosPendentes = new Map();
    const debounceMensagens = new Map(); // deQuem => { timer, textos: [], midias: [] }

    // ── Roteamento de texto do cliente (extraído para debounce) ──
    async function processarTexto(deQuem, texto, midias = []) {
        const t = texto.toLowerCase();
        const fluxoAtivo = state.getFluxo(deQuem);
        const temFoto = midias.length > 0 && midias.some(m => m.type === 'image');
        const msgSintetica = { body: texto, hasMedia: temFoto, type: 'chat' };

        if (texto) console.log(`\n📨 ${deQuem.slice(-8)}: "${texto}"`);
        else if (temFoto) console.log(`\n📨 ${deQuem.slice(-8)}: [foto/áudio]`);

        // Se tem foto/áudio do roteador e não está em fluxo específico, armazena e segue
        if (temFoto && !fluxoAtivo) {
            fotosPendentes.set(deQuem, midias[midias.length - 1]);
        }

        // Voltar ao menu
        if (fluxoAtivo && (t === '0' || t === 'menu' || t === 'voltar' || t === 'início' || t === 'inicio' || t === 'sair' || t === 'principal')) {
            state.encerrarFluxo(deQuem);
            await client.sendMessage(deQuem, `${P}Voltando ao menu! 😊\n\n${MENU_PRINCIPAL}`);
            state.iniciar(deQuem, 'menu', 'aguardando_escolha', {});
            return;
        }

        // Em fluxo ativo mas sem texto (mídia sem legenda, pdf sem texto, etc)
        // Não deve quebrar o fluxo nem resetar menu.
        if (fluxoAtivo && !texto.trim()) {
            return;
        }

        // Consulta situação
        if (fluxoAtivo === 'consulta_situacao') {
            await consultarSituacao(deQuem, texto);
            return;
        }

        // Fluxo: aguardando nome do comprovante (PDF / imagem que não deu match por telefone)
        if (fluxoAtivo === 'aguardando_nome_comprovante') {
            // Não encerra o fluxo aqui: a confirmação pode pedir CPF/novo nome e continuar esperando.
            try {
                await confirmarNomeComprovante(deQuem, texto);
            } catch (e) {
                console.error('Erro confirmarNomeComprovante:', e);
                await client.sendMessage(deQuem, `${P}Tive um erro ao validar seu nome. Pode tentar novamente?`);
            }
            return;
        }

        // Fluxo ativo → delega (ler via getter para não cache undefined)
        const fluxos = {
            suporte:      handlers._fluxoSuporte,
            financeiro:   handlers._fluxoFinanceiro,
            promessa:     handlers._fluxoPromessa,
            cancelamento: handlers._fluxoCancelamento,
            novoCliente:  handlers._fluxoNovoCliente,
        };
        if (fluxos[fluxoAtivo]?.handle) {
            await fluxos[fluxoAtivo].handle(deQuem, msgSintetica);
            return;
        }

        // Sub-menu financeiro
        if (fluxoAtivo === 'menu_financeiro') {
            const $fin = handlers._fluxoFinanceiro;
            if (t === '1' || t.includes('pix') || t.includes('transferência') || t.includes('transferencia')) {
                state.encerrarFluxo(deQuem);
                await $fin.iniciar(deQuem, msgSintetica, 'PIX'); return;
            }
            if (t === '2' || t.includes('boleto')) {
                state.encerrarFluxo(deQuem);
                await $fin.iniciar(deQuem, msgSintetica, 'BOLETO'); return;
            }
            if (t === '3' || t.includes('carnê') || t.includes('carne') || t.includes('físico') || t.includes('fisico')) {
                state.encerrarFluxo(deQuem);
                await $fin.iniciar(deQuem, msgSintetica, 'CARNE'); return;
            }
            if (t === '4' || t.includes('dinheiro') || t.includes('cobrador') || t.includes('espécie') || t.includes('especie')) {
                state.encerrarFluxo(deQuem);
                await $fin.iniciar(deQuem, msgSintetica, 'DINHEIRO'); return;
            }
            if (t === '5' || t.includes('paguei') || t.includes('já paguei') || t.includes('feito') || t.includes('efetuei')) {
                state.encerrarFluxo(deQuem);
                await $fin.iniciar(deQuem, msgSintetica, 'PAGO'); return;
            }
            // Texto não reconhecido no menu financeiro — re-envia sem recriar estado
            await client.sendMessage(deQuem, MENU_FINANCEIRO);
            return;
        }

        // Menu principal
        if (fluxoAtivo === 'menu') {
            if (t === '1' || t.includes('internet') || t.includes('caiu') || t.includes('lento') ||
                t.includes('sinal') || t.includes('suporte') || t.includes('técnico') || t.includes('tecnico')) {
                state.encerrarFluxo(deQuem);
                if (!redeNormal()) {
                    const infoRede = falarSinalAmigavel();
                    const hora = new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCHours();
                    const fora = hora < 8 || hora >= 20;
                    await client.sendMessage(deQuem,
                        `${P}${infoRede}\n\n` + (fora
                            ? `Sabemos do problema. Nossa equipe vai entrar em contato no início do expediente. 🙏`
                            : `Nossa equipe já está trabalhando para resolver. 🙏`)
                    );
                    await abrirChamadoComMotivo(deQuem, null, `Reclamação — rede ${ctx.situacaoRede}`);
                    return;
                }
                await handlers._fluxoSuporte.iniciar(deQuem, msgSintetica);
                return;
            }
            if (t === '2' || t.includes('pagar') || t.includes('pagamento') || t.includes('pix') ||
                t.includes('boleto') || t.includes('carnê') || t.includes('carne') || t.includes('financeiro')) {
                state.encerrarFluxo(deQuem);
                await client.sendMessage(deQuem, MENU_FINANCEIRO);
                state.iniciar(deQuem, 'menu_financeiro', 'aguardando_escolha', {});
                return;
            }
            if (t === '3' || t.includes('cancelar') || t.includes('cancelamento') || t.includes('encerrar')) {
                state.encerrarFluxo(deQuem);
                await handlers._fluxoCancelamento.iniciar(deQuem, msgSintetica);
                return;
            }
            if (t === '4' || t.includes('situacao') || t.includes('situação') || t.includes('status') || t.includes('consultar') || t.includes('verificar')) {
                state.encerrarFluxo(deQuem);
                await client.sendMessage(deQuem,
                    `${P}Vou consultar para você! 📋\n\nMe informe seu *CPF* (somente números) ou seu *nome completo*:`
                );
                state.iniciar(deQuem, 'consulta_situacao', 'aguardando_dados', {});
                return;
            }
            if (t === '5' || t.includes('atendente') || t.includes('humano') || t.includes('pessoa') || t.includes('falar')) {
                state.encerrarFluxo(deQuem);
                await client.sendMessage(deQuem, `${P}Vou chamar um atendente! Aguarda um instante. 😊`);
                await abrirChamadoComMotivo(deQuem, null, 'Cliente solicitou atendente');
                return;
            }
            // Texto não reconhecido no menu principal — re-envia sem recriar estado
            // (NÃO chama encerrarFluxo + iniciar aqui para evitar o menu duplicado)
            await client.sendMessage(deQuem, MENU_PRINCIPAL);
            return;
        }

        // Sem fluxo → mostra menu e inicia estado
        await client.sendMessage(deQuem, MENU_PRINCIPAL);
        state.iniciar(deQuem, 'menu', 'aguardando_escolha', {});
    }

    // ── Admin envia mensagem no chat do cliente ──
    client.on('message_create', async (msg) => {
        if (!msg.fromMe) return;
        const para = msg.to;
        if (!para || para.includes('@g.us') || para === 'status@broadcast') return;
        if (ADMINISTRADORES.includes(para)) return;

        const corpo = msg.body || '';
        if (corpo.startsWith('🤖') || corpo.startsWith('💳') || corpo.startsWith('✅') || corpo === '') return;

        if (!state.isAtendimentoHumano(para)) {
            state.setAtendimentoHumano(para, true);
            await banco.dbSalvarAtendimentoHumano(para).catch(() => {});
            sseService.notificar('estados');
            console.log(`👤 Admin assumiu ${para.replace('@c.us','')}`);
        }

        if (corpo.length > 10) detectarAcaoAdmin(para, corpo).catch(() => {});

        state.iniciarTimer(para, async (numero) => {
            state.setAtendimentoHumano(numero, false);
            state.encerrarFluxo(numero);
            await banco.dbRemoverAtendimentoHumano(numero).catch(() => {});
            console.log(`⏰ Atendimento humano expirado: ${numero.replace('@c.us','')}`);
        }, 2 * 60 * 60 * 1000);
    });

    // ── Mensagem recebida ──
    client.on('message', async (msg) => {
        if (msg.from === 'status@broadcast' || msg.from.includes('@g.us')) return;
        const deQuem = msg.from;
        if (FUNCIONARIOS.includes(deQuem)) return;
        if (!ctx.botIniciadoEm || (msg.timestamp * 1000) < ctx.botIniciadoEm) return;
        if (!ctx.botAtivo && !ADMINISTRADORES.includes(deQuem)) return;

        // Comandos admin
        if (ADMINISTRADORES.includes(deQuem)) {
            const texto = msg.body || '';
            const args = texto.split(' ');
            const comando = args[0].toLowerCase();

            if (comando === '!sim' || comando === '!nao' || comando === '!cobrar-sim' || comando === '!cobrar-nao') {
                const resposta = (comando === '!sim' || comando === '!cobrar-sim') ? 'aprovado' : 'negado';
                let votacaoId = args[1] || null;
                if (!votacaoId) {
                    const doc = await firebaseDb.collection('config').doc('ultima_votacao').get();
                    votacaoId = doc.exists ? doc.data().votacaoId : null;
                }
                if (!votacaoId) return msg.reply('❌ Nenhuma votação ativa.');
                const vDoc = await firebaseDb.collection('votacoes').doc(votacaoId).get();
                if (!vDoc.exists || vDoc.data().resolvido) return msg.reply('❌ Votação não encontrada.');
                await firebaseDb.collection('votacoes').doc(votacaoId).update({
                    status: 'respondido', resolvido: true, resultado: resposta,
                    respondido_por: deQuem, respondido_em: new Date().toISOString()
                });
                return msg.reply(resposta === 'aprovado' ? '✅ Cobrança autorizada!' : '❌ Cobrança pulada.');
            }
            if (comando === '!bot') {
                if (args[1] === 'off') { ctx.botAtivo = false; sseService.broadcast(); return msg.reply('🔴 Bot desativado.'); }
                if (args[1] === 'on')  { ctx.botAtivo = true;  sseService.broadcast(); return msg.reply('🟢 Bot ativado.'); }
            }
            if (comando === '!status') return msg.reply(`📊 Bot: ${ctx.botAtivo ? '✅' : '❌'} | Rede: ${ctx.situacaoRede} | Atendimentos: ${state?.stats()?.atendimentoHumano || 0}`);
            if (comando === '!rede') {
                const novoStatus = args[1];
                if (!['normal','instavel','manutencao','fibra_rompida'].includes(novoStatus))
                    return msg.reply('❌ Use: !rede normal | instavel | manutencao | fibra_rompida');
                ctx.situacaoRede = novoStatus;
                ctx.previsaoRetorno = args.slice(2).join(' ').replace(/["']/g,'') || 'sem previsão';
                sseService.broadcast();
                return msg.reply(`✅ Rede: ${novoStatus}`);
            }
            if (comando === '!cobrar') {
                const data = args[1];
                if (!['10','20','30'].includes(data)) return msg.reply('❌ Use: !cobrar 10|20|30');
                msg.reply('⏳ Iniciando cobrança...');
                setTimeout(async () => {
                    // ✅ CORRIGIDO: passa ADMINISTRADORES para que o relatório
                    // pós-cobrança seja enviado via WhatsApp para os admins
                    await dispararCobrancaReal(client, firebaseDb, data, args[2] || null, null, ADMINISTRADORES);
                }, 100);
                return;
            }
            if (comando === '!assumir') {
                const num = args[1]?.replace(/\D/g,'');
                if (!num) return msg.reply('❌ Use: !assumir 819xxxxxxx');
                const numWpp = (num.startsWith('55') ? num : '55' + num) + '@c.us';
                state.setAtendimentoHumano(numWpp, true);
                await banco.dbSalvarAtendimentoHumano(numWpp).catch(() => {});
                return msg.reply(`✅ Assumido ${num}. Use !liberar ${num} para devolver.`);
            }
            if (comando === '!liberar') {
                const num = args[1]?.replace(/\D/g,'');
                if (!num) return msg.reply('❌ Use: !liberar 819xxxxxxx');
                const numWpp = (num.startsWith('55') ? num : '55' + num) + '@c.us';
                state.setAtendimentoHumano(numWpp, false);
                state.encerrarFluxo(numWpp);
                await banco.dbRemoverAtendimentoHumano(numWpp).catch(() => {});
                await client.sendMessage(numWpp, `${P}Olá! Se precisar de algo é só chamar! 😊`).catch(() => {});
                return msg.reply(`✅ ${num} devolvido ao bot.`);
            }
            if (comando === '!listar') {
                const humanos = Object.entries(state.todos?.() || {})
                    .filter(([,v]) => v.atendimentoHumano)
                    .map(([n]) => n.replace('@c.us','').replace(/^55/,''));
                return msg.reply(humanos.length ? `👤 Em atendimento:\n${humanos.join('\n')}` : '✅ Nenhum em atendimento.');
            }
            if (comando === '!ajuda') {
                return msg.reply(`📚 *COMANDOS*\n!bot on/off | !status | !rede | !cobrar 10|20|30 | !assumir N | !liberar N | !listar`);
            }
            return;
        }

        // Clientes
        if (msg.type === 'sticker') return;

        // Mídia é processada IMEDIATAMENTE (comprovante PIX → baixa automática)
        let midiaRecebida = false;
        if (msg.hasMedia && ['image','document'].includes(msg.type)) {
            const baixaFeita = await processarMidiaAutomatico(deQuem, msg, fotosPendentes);
            if (baixaFeita) return; // comprovante PIX processado com sucesso
            // Não é comprovante — armazena foto e entra no debounce
            midiaRecebida = true;
        }

        if (state.isAtendimentoHumano(deQuem)) return;

        // ── Debounce universal: acumula texto/mídia do mesmo remetente por 3s ──
        // (reduzido de 12s para 3s — evita delay perceptível na resposta)
        const texto = (msg.hasMedia && ['image','document'].includes(msg.type))
            ? (msg.body?.trim() || '')
            : (msg.body?.trim() || '');

        let pendente = debounceMensagens.get(deQuem);
        if (pendente) {
            clearTimeout(pendente.timer);
            pendente.textos.push(texto);
            if (midiaRecebida) pendente.hasMidia = true;
        } else {
            pendente = { textos: [texto], hasMidia: midiaRecebida };
            debounceMensagens.set(deQuem, pendente);
        }

        pendente.timer = setTimeout(() => {
            debounceMensagens.delete(deQuem);
            const textoCompleto = pendente.textos.join('\n').trim();
            const midias = pendente.hasMidia && fotosPendentes.has(deQuem) ? [fotosPendentes.get(deQuem)] : [];
            processarTexto(deQuem, textoCompleto, midias).catch(err => {
                console.error('Erro ao processar mensagem debounce:', err);
            });
        }, 12000); // 12s — acumula mensagens consecutivas do mesmo remetente

        return;
    });
}

module.exports = { configurarMensagens };