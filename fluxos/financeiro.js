'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUXO FINANCEIRO / PAGAMENTO — VERSÃO FIREBASE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = function criarFluxoFinanceiro(ctx) {
    const {
        client, db: firebaseDb, banco,
        dbSalvarHistorico, dbIniciarAtendimento,
        state,
        ADMINISTRADORES, P,
        chavePixExibicao,
        atendenteDisponivel, proximoAtendimento,
        buscarStatusCliente, analisarImagem,
        darBaixaAutomatica,
        groqChatFallback, normalizarTexto,
        utils,
        abrirChamadoComMotivo,
    } = ctx;


    const _fotosPendentes = ctx.fotosPendentes;

    const FORMAS_PAGAMENTO = {
        '1': 'PIX',
        '2': 'BOLETO',
        '3': 'DINHEIRO',
        '4': 'CARNE'
    };

    async function iniciar(deQuem, msg, intencaoEspecifica = null) {
        const dadosCliente = await buscarStatusCliente(deQuem);
        
        if (intencaoEspecifica) {
            switch(intencaoEspecifica) {
                case 'PIX':
                    return await iniciarPix(deQuem, dadosCliente);
                case 'BOLETO':
                    return await iniciarBoleto(deQuem, dadosCliente);
                case 'CARNE':
                    return await iniciarCarne(deQuem, dadosCliente);
                case 'DINHEIRO':
                    return await iniciarDinheiro(deQuem, dadosCliente);
            }
        }

        if (dadosCliente && dadosCliente.status === 'pago') {
            const prNome = dadosCliente.nome ? dadosCliente.nome.split(' ')[0] : null;
            const msgStatus = prNome
                ? `${P}Boa notícia, ${prNome}! Aqui no sistema consta que sua fatura está em dia. ✅`
                : `${P}Boa notícia! Aqui no sistema consta que sua fatura está em dia. ✅`;
            await client.sendMessage(deQuem, msgStatus);
            await dbSalvarHistorico(deQuem, 'assistant', msgStatus);
            await dbIniciarAtendimento(deQuem);
            state.iniciarTimer(deQuem);
            return;
        }

            const aba = dadosCliente.aba?.replace('Data ','') || 'não informada';
            const msgStatus = dadosCliente
                ? (dadosCliente.nome
                    ? `${P}${dadosCliente.nome.split(' ')[0]}, encontrei seu cadastro! 😊\n\nConsta uma fatura com vencimento no dia *${aba}* ainda em aberto.\n\nQuer efetuar o pagamento agora? Escolha a forma que preferir:`
                    : `${P}Encontrei seu cadastro! 😊\n\nConsta uma fatura com vencimento no dia *${aba}* ainda em aberto.\n\nQuer efetuar o pagamento agora? Escolha a forma que preferir:`)
                : `${P}Claro! Vou te ajudar com o pagamento. 😊\n\nTemos algumas formas disponíveis — qual funciona melhor pra você?`;

        await client.sendMessage(deQuem, msgStatus);
        await new Promise(r => setTimeout(r, 1200));
        await client.sendMessage(deQuem,
            `1️⃣ *PIX*\n_Transfira via Pix — te mando a chave na hora_\n\n` +
            `2️⃣ *Boleto*\n_O atendente gera e te envia o código de barras_\n\n` +
            `3️⃣ *Dinheiro / Espécie*\n_A gente agenda pra passar aí no seu endereço_\n\n` +
            `4️⃣ *Carnê físico*\n_Solicitamos a emissão e entregamos pra você_\n\n` +
            `💬 _É só digitar o número ou o nome da forma que preferir!_`
        );

        state.iniciar(deQuem, 'financeiro', 'aguardando_escolha', { 
            nome: dadosCliente?.nome || null,
            dadosCliente 
        });
        
        await dbSalvarHistorico(deQuem, 'assistant', 'Opções de pagamento apresentadas.');
        await dbIniciarAtendimento(deQuem);
        state.iniciarTimer(deQuem);
    }

    async function iniciarPix(deQuem, dadosCliente) {
        state.avancar(deQuem, 'pix_enviado', { nome: dadosCliente?.nome || null });
        await client.sendMessage(deQuem, `${P}Ótimo! Segue nossas chaves Pix. Assim que pagar, pode me enviar o comprovante por aqui! 😊`);
        await new Promise(r => setTimeout(r, 1500));
        await client.sendMessage(deQuem, `💳 *Chaves PIX:*\n\n\`\`\`jmetelecomnt@gmail.com\`\`\`\n\`\`\`+5581987500456\`\`\`\n\n👤 *Titular:* ERIVALDO CLEMENTINO DA SILVA\n\n💡 _Toque no código para copiar (cole como email ou telefone)_`);
        await dbSalvarHistorico(deQuem, 'assistant', 'Chave PIX enviada.');
        state.iniciarTimer(deQuem);
    }

    async function iniciarBoleto(deQuem, dadosCliente) {
        state.encerrarFluxo(deQuem);
        await abrirChamadoComMotivo(deQuem, dadosCliente?.nome || null, 'Financeiro — boleto');
        await client.sendMessage(deQuem, `${P}Certo! Vou chamar o atendente para gerar e te enviar o boleto. Aguarda um instante! 😊`);
        await dbSalvarHistorico(deQuem, 'assistant', 'Boleto solicitado.');
    }

    async function iniciarCarne(deQuem, dadosCliente) {
        const nome = dadosCliente?.nome || null;
        
        if (!nome) {
            state.avancar(deQuem, 'carne_nome');
            await client.sendMessage(deQuem, `${P}Claro! Para solicitar o carnê, pode me dizer seu *nome completo* primeiro? 😊`);
        } else {
            // 🔥 FIREBASE: Deleta solicitações anteriores
            const anteriores = await firebaseDb.collection('carne_solicitacoes')
                .where('numero', '==', deQuem)
                .where('status', '==', 'solicitado')
                .get();
            
            const batch = firebaseDb.batch();
            anteriores.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            // 🔥 FIREBASE: Cria nova solicitação
            await firebaseDb.collection('carne_solicitacoes').add({
                numero: deQuem,
                nome: nome,
                status: 'solicitado',
                origem: 'whatsapp',
                solicitado_em: new Date().toISOString()
            });

            state.avancar(deQuem, 'carne_endereco', { nome });
            await client.sendMessage(deQuem, `${P}Certo, ${nome.split(' ')[0]}! Pode me confirmar seu endereço para entrega? (Rua, número, bairro)`);
        }
        await dbSalvarHistorico(deQuem, 'assistant', 'Iniciou solicitação de carnê.');
        state.iniciarTimer(deQuem);
    }

    async function iniciarDinheiro(deQuem, dadosCliente) {
        const nome = dadosCliente?.nome || null;
        
        if (nome) {
            state.avancar(deQuem, 'dinheiro_endereco', { nome });
            await client.sendMessage(deQuem, `${P}Combinado! Pode me confirmar seu endereço completo para o atendente passar aí? (Rua, número, bairro)`);
        } else {
            state.avancar(deQuem, 'dinheiro_nome');
            await client.sendMessage(deQuem, `${P}Combinado! Pode me dizer seu nome completo?`);
        }
        await dbSalvarHistorico(deQuem, 'assistant', 'Iniciou coleta em dinheiro.');
        state.iniciarTimer(deQuem);
    }

    // ── Escape: volta ao menu ou chama atendente ──
    async function tentarRetorno(deQuem, t) {
        if (t === '0' || t === 'menu' || t === 'voltar' || t === 'início' || t === 'inicio' || t === 'sair' || t === 'principal') {
            state.encerrarFluxo(deQuem);
            await client.sendMessage(deQuem, `${P}Voltando ao menu! 😊\n\n1️⃣ Problema com a internet\n2️⃣ Pagamento / Financeiro\n3️⃣ Cancelamento\n4️⃣ Consultar minha situação\n5️⃣ Falar com atendente`);
            state.iniciar(deQuem, 'menu', 'aguardando_escolha', {});
            return true;
        }
        if (t.includes('3') && (t.includes('atendente') || t.includes('humano') || t.includes('pessoa') || t.includes('falar'))) {
            state.encerrarFluxo(deQuem);
            await abrirChamadoComMotivo(deQuem, state.getDados(deQuem)?.nome, 'Financeiro — pedido de atendente');
            await client.sendMessage(deQuem, `${P}Vou chamar um atendente! Aguarda um instante. 😊`);
            return true;
        }
        return false;
    }

    async function handle(deQuem, msg) {
        const etapa = state.getEtapa(deQuem);
        const dados = state.getDados(deQuem);
        const texto = normalizarTexto(msg.body || '');
        const textoOriginal = msg.body || '';
        const temFoto = msg.hasMedia && msg.type === 'image';

        state.cancelarTimer(deQuem);
        await dbIniciarAtendimento(deQuem);

        // Escape em todos os estágios
        if (await tentarRetorno(deQuem, texto.toLowerCase())) return;

        // ─── aguardando_escolha ──────────────────────────
        if (etapa === 'aguardando_escolha') {
            const t = texto.toLowerCase();

            if (t.includes('feito') || t.includes('paguei') || t.includes('pagamento realizado') || 
                t.includes('já paguei') || t.includes('pago') || t.includes('efetuei') ||
                t.includes('comprovante') || t.includes('enviei')) {

                // Dá baixa direto — admin confere pelo painel depois
                const nomeCliente = dados.nome || dados.dadosCliente?.nome || null;
                const baixa = await darBaixaAutomatica(deQuem, {});
                const nomeExibir = (baixa.sucesso ? baixa.nomeCliente : nomeCliente)?.split(' ')[0] || null;
                const saudacao = nomeExibir ? `Obrigado, *${nomeExibir}*!` : 'Obrigado!';

                state.encerrarFluxo(deQuem);
                await client.sendMessage(deQuem,
                    `${P}${saudacao} Anotamos o pagamento. ✅\n\nQualquer dúvida é só chamar! 😊`
                );

                // Notifica admin para conferir depois
                for (const adm of ADMINISTRADORES) {
                    await client.sendMessage(adm,
                        `💬 *CLIENTE INFORMOU PAGAMENTO*\n\n` +
                        `👤 ${baixa.nomeCliente || nomeCliente || 'não identificado'}\n` +
                        `📱 ${deQuem.replace('@c.us','')}\n` +
                        `⚠️ Sem comprovante — conferir pelo painel.`
                    ).catch(() => {});
                }
                return;

                // ── código morto abaixo mantido por segurança ──
                state.avancar(deQuem, 'pix_enviado', { 
                    ...dados,
                    aguardandoComprovante: true 
                });
                return;
            }

            const escolhaNum = FORMAS_PAGAMENTO[texto.trim()];
            let escolha = escolhaNum || null;

            if (!escolha) {
                try {
                    const prompt = `Classifique a forma de pagamento escolhida. Responda só: PIX | BOLETO | DINHEIRO | CARNE | OUTRO\nMensagem: "${textoOriginal}"`;
                    const r = (await groqChatFallback([{ role:'user', content: prompt }], 0.1) || '').trim().toUpperCase();
                    if (['PIX','BOLETO','DINHEIRO','CARNE'].includes(r)) escolha = r;
                } catch (_) {}
            }

            if (escolha === 'PIX') {
                await iniciarPix(deQuem, dados.dadosCliente);
                return;
            }
            if (escolha === 'BOLETO') {
                await iniciarBoleto(deQuem, dados.dadosCliente);
                return;
            }
            if (escolha === 'DINHEIRO') {
                await iniciarDinheiro(deQuem, dados.dadosCliente);
                return;
            }
            if (escolha === 'CARNE') {
                await iniciarCarne(deQuem, dados.dadosCliente);
                return;
            }

            const tentativas = (dados.tentativasEscolha || 0) + 1;
            state.atualizar(deQuem, { tentativasEscolha: tentativas });
            
            if (tentativas >= 3) {
                state.encerrarFluxo(deQuem);
                await abrirChamadoComMotivo(deQuem, dados.nome, 'Financeiro — cliente não conseguiu escolher');
                await client.sendMessage(deQuem, `${P}Deixa eu chamar alguém pra te ajudar melhor. 😊 Aguarda um instante!`);
                return;
            }
            
            await client.sendMessage(deQuem, `${P}Digite *1* para PIX, *2* para Boleto, *3* para Dinheiro ou *4* para Carnê físico. Qual prefere?`);
            state.iniciarTimer(deQuem);
            return;
        }

        // ─── pix_enviado ─────────────────────────────────
        if (etapa === 'pix_enviado') {
            if (temFoto) {
                const analise = await analisarImagem(msg);
                if (analise && analise.categoria === 'comprovante') {
                    const baixa = await darBaixaAutomatica(deQuem, analise);
                    
                    if (analise.valido) {
                        state.encerrarFluxo(deQuem);
                        await client.sendMessage(deQuem, `${P}Comprovante recebido e pagamento confirmado! ✅ Já dei baixa no sistema. Obrigado! 😊`);

                        // Notifica o front
                        if (ctx.sseService) {
                            ctx.sseService.notificar('clientes');
                        }

                        // 🔥 FIREBASE: Log de comprovante
                        await firebaseDb.collection('log_comprovantes').add({
                            numero: deQuem,
                            recebido_em: new Date().toISOString()
                        });
                        
                        for (const adm of ADMINISTRADORES) {
                            await client.sendMessage(adm,
                                `✅ *BAIXA VIA PIX*\n\n👤 ${baixa?.nomeCliente || dados.nome || 'N/A'}\n📱 ${deQuem.replace('@c.us','')}\n💰 R$ ${analise.valor || 'N/A'}\n📅 ${analise.data || 'N/A'}`
                            ).catch(() => {});
                        }
                    } else {
                        state.encerrarFluxo(deQuem);
                        await client.sendMessage(deQuem, `${P}Recebi o comprovante, mas não consegui validar automaticamente. Vou encaminhar para o atendente verificar! 😊`);
                        await abrirChamadoComMotivo(deQuem, dados.nome, 'Financeiro — comprovante suspeito');
                    }
                } else {
                    await client.sendMessage(deQuem, `${P}Não consegui identificar o comprovante nessa imagem. Pode me enviar o comprovante de pagamento?`);
                }
                return;
            }
            
            await client.sendMessage(deQuem, `${P}Assim que realizar o pagamento, pode me enviar o comprovante por aqui para eu dar baixa! 😊`);
            state.iniciarTimer(deQuem);
            return;
        }

        // ─── carne_nome ──────────────────────────────────
        if (etapa === 'carne_nome') {
            const nomeLimpo = await utils.extrairNomeDaMensagem(textoOriginal);
            
            if (!nomeLimpo) {
                await client.sendMessage(deQuem, `${P}Não consegui identificar seu nome. Pode digitar só o nome e sobrenome, por favor?`);
                state.iniciarTimer(deQuem);
                return;
            }
            
            // 🔥 FIREBASE: Deleta solicitações anteriores
            const anteriores = await firebaseDb.collection('carne_solicitacoes')
                .where('numero', '==', deQuem)
                .where('status', '==', 'solicitado')
                .get();
            
            const batch = firebaseDb.batch();
            anteriores.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            // 🔥 FIREBASE: Cria nova solicitação
            await firebaseDb.collection('carne_solicitacoes').add({
                numero: deQuem,
                nome: nomeLimpo,
                status: 'solicitado',
                origem: 'whatsapp',
                solicitado_em: new Date().toISOString()
            });
            
            state.avancar(deQuem, 'carne_endereco', { nome: nomeLimpo });
            await client.sendMessage(deQuem, `${P}Obrigado, ${nomeLimpo.split(' ')[0]}! Agora pode me informar seu *endereço completo* para entrega? 😊`);
            state.iniciarTimer(deQuem);
            return;
        }

        // ─── carne_endereco ──────────────────────────────
        if (etapa === 'carne_endereco') {
            const endereco = (msg.body || '').trim();
            if (!endereco || endereco.length < 3) {
                await client.sendMessage(deQuem, `${P}Pode me dizer seu endereço completo? (Rua, número, bairro)`);
                state.iniciarTimer(deQuem);
                return;
            }
            
            // 🔥 FIREBASE: Atualiza endereço na solicitação mais recente
            const solicitacoes = await firebaseDb.collection('carne_solicitacoes')
                .where('numero', '==', deQuem)
                .where('status', '==', 'solicitado')
                .orderBy('solicitado_em', 'desc')
                .limit(1)
                .get();
            
            if (!solicitacoes.empty) {
                await solicitacoes.docs[0].ref.update({
                    endereco: endereco
                });
            }
            
            state.encerrarFluxo(deQuem);

            // Notifica o front
            if (ctx.sseService) {
                ctx.sseService.notificar('carne');
            }

            for (const adm of ADMINISTRADORES) {
                await client.sendMessage(adm,
                    `📋 *SOLICITAÇÃO DE CARNÊ FÍSICO*\n\n` +
                    `👤 ${dados.nome || deQuem.replace('@c.us','')}\n` +
                    `📱 ${deQuem.replace('@c.us','')}\n` +
                    `📍 ${endereco}\n\n_Acesse o painel para marcar como impresso e entregue._`
                ).catch(() => {});
            }
            
            const msgFinal = `Perfeito${dados.nome ? ', '+dados.nome.split(' ')[0] : ''}! Sua solicitação de carnê físico foi registrada. ✅\n\nAssim que estiver pronto, entraremos em contato! 😊`;
            await client.sendMessage(deQuem, `${P}${msgFinal}`);
            await dbSalvarHistorico(deQuem, 'assistant', msgFinal);
            return;
        }

        // ─── dinheiro_nome ───────────────────────────────
        if (etapa === 'dinheiro_nome') {
            const nomeLimpo = await utils.extrairNomeDaMensagem(textoOriginal);
            
            if (!nomeLimpo) {
                await client.sendMessage(deQuem, `${P}Não consegui identificar seu nome. Pode digitar só o nome e sobrenome?`);
                state.iniciarTimer(deQuem);
                return;
            }
            
            state.avancar(deQuem, 'dinheiro_endereco', { nome: nomeLimpo });
            await client.sendMessage(deQuem, `${P}Obrigado, ${nomeLimpo.split(' ')[0]}! E seu endereço completo para o atendente passar aí? (Rua, número, bairro)`);
            state.iniciarTimer(deQuem);
            return;
        }

        // ─── dinheiro_endereco ───────────────────────────
        if (etapa === 'dinheiro_endereco') {
            const endereco = (msg.body || '').trim();
            if (!endereco || endereco.length < 3) {
                await client.sendMessage(deQuem, `${P}Pode me dizer seu endereço completo? (Rua, número, bairro)`);
                state.iniciarTimer(deQuem);
                return;
            }
            
            const nome = dados.nome;
            state.encerrarFluxo(deQuem);
            
            await abrirChamadoComMotivo(deQuem, nome, 'Financeiro — coleta em dinheiro', { endereco });
            
            const msgFinal = atendenteDisponivel()
                ? `Perfeito${nome ? ', '+nome.split(' ')[0] : ''}! Registrei tudo. O atendente vai confirmar o horário de passagem em breve! 😊`
                : `Perfeito${nome ? ', '+nome.split(' ')[0] : ''}! Registrei tudo. O atendente confirma o horário ${proximoAtendimento()}. 😊`;
            
            await client.sendMessage(deQuem, `${P}${msgFinal}`);
            await dbSalvarHistorico(deQuem, 'assistant', msgFinal);
            return;
        }

        // ─── dinheiro_acertado_nome ──────────────────────
        if (etapa === 'dinheiro_acertado_nome') {
            const nomeLimpo = await utils.extrairNomeDaMensagem(textoOriginal);
            
            if (!nomeLimpo) {
                await client.sendMessage(deQuem, `${P}Não consegui identificar seu nome. Pode digitar só o nome e sobrenome?`);
                state.iniciarTimer(deQuem);
                return;
            }
            
            state.encerrarFluxo(deQuem);
            await abrirChamadoComMotivo(deQuem, nomeLimpo, 'Pagamento em dinheiro — já acertado com cliente');
            
            const msgFinal = `Perfeito, ${nomeLimpo.split(' ')[0]}! 😊 Avisamos o atendente para passar aí e buscar o pagamento. Qualquer dúvida é só chamar!`;
            await client.sendMessage(deQuem, `${P}${msgFinal}`);
            await dbSalvarHistorico(deQuem, 'assistant', msgFinal);
            return;
        }
    }

    return { 
        iniciar, 
        handle,
        iniciarPix,
        iniciarBoleto,
        iniciarCarne,
        iniciarDinheiro
    };
};