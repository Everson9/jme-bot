'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUXO PROMESSA DE PAGAMENTO — VERSÃO FIREBASE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = function criarFluxoPromessa(ctx) {
    const {
        client, db: firebaseDb, banco,
        dbSalvarHistorico, dbIniciarAtendimento,
        state,
        ADMINISTRADORES, P,
        normalizarTexto, buscarStatusCliente,
        utils,
    } = ctx;

    async function iniciar(deQuem, msg) {
        const texto = normalizarTexto(msg.body || '');
        const dataExtraida = await utils.extrairDataPromessa(texto);
        
        let nomeCliente = null;
        try {
            const dados = await buscarStatusCliente(deQuem);
            if (dados) nomeCliente = dados.nome;
        } catch (_) {}

        if (!nomeCliente) {
            nomeCliente = await utils.extrairNomeDaMensagem(texto);
        }

        if (dataExtraida) {
            if (!nomeCliente) {
                state.iniciar(deQuem, 'promessa', 'aguardando_nome', { dataPromessa: dataExtraida });
                await client.sendMessage(deQuem, `${P}Entendi! Antes de registrar, pode me dizer seu *nome completo*? 😊`);
            } else {
                state.iniciar(deQuem, 'promessa', 'aguardando_confirmacao', { nome: nomeCliente, dataPromessa: dataExtraida });
                const prNome = nomeCliente.split(' ')[0];
                await client.sendMessage(deQuem, `${P}Tudo bem, ${prNome}! Entendi que você vai conseguir pagar no dia *${dataExtraida}*. Está correto? (Sim/Não)`);
            }
        } else {
            if (!nomeCliente) {
                state.iniciar(deQuem, 'promessa', 'aguardando_nome', { dataPromessa: null });
                await client.sendMessage(deQuem, `${P}Entendido! Pode me dizer seu *nome completo* primeiro? 😊`);
            } else {
                state.iniciar(deQuem, 'promessa', 'aguardando_data', { nome: nomeCliente });
                const prNome = nomeCliente.split(' ')[0];
                await client.sendMessage(deQuem, `${P}Entendido, ${prNome}! Para qual dia você consegue realizar o pagamento?`);
            }
        }
        
        await dbIniciarAtendimento(deQuem);
        await dbSalvarHistorico(deQuem, 'assistant', 'Iniciou fluxo PROMESSA');
        state.iniciarTimer(deQuem);
    }

    async function handle(deQuem, msg) {
        const etapa = state.getEtapa(deQuem);
        const dados = state.getDados(deQuem);
        const texto = normalizarTexto(msg.body || '');
        const textoLower = texto.toLowerCase();

        state.cancelarTimer(deQuem);
        await dbIniciarAtendimento(deQuem);

        // ─── aguardando_nome ──────────────────────────────
        if (etapa === 'aguardando_nome') {
            const nomeLimpo = await utils.extrairNomeDaMensagem(texto);
            
            if (!nomeLimpo) {
                await client.sendMessage(deQuem, `${P}Não consegui identificar seu nome. Pode digitar só o nome e sobrenome? 😊`);
                state.iniciarTimer(deQuem);
                return;
            }

            const { dataPromessa } = dados;
            if (dataPromessa) {
                state.avancar(deQuem, 'aguardando_confirmacao', { nome: nomeLimpo, dataPromessa });
                await client.sendMessage(deQuem, `${P}Obrigado, ${nomeLimpo.split(' ')[0]}! Confirma que você vai pagar no dia *${dataPromessa}*? (Sim/Não)`);
            } else {
                state.avancar(deQuem, 'aguardando_data', { nome: nomeLimpo });
                await client.sendMessage(deQuem, `${P}Obrigado, ${nomeLimpo.split(' ')[0]}! Para qual dia você consegue realizar o pagamento?`);
            }
            
            state.iniciarTimer(deQuem);
            return;
        }

        // ─── aguardando_data ──────────────────────────────
        if (etapa === 'aguardando_data') {
            const data = await utils.extrairDataPromessa(texto);
            
            if (!data) {
                await client.sendMessage(deQuem, `${P}Pode me dizer a data exata? Ex: "dia 9", "dia 15/04"...`);
                state.iniciarTimer(deQuem);
                return;
            }
            
            state.avancar(deQuem, 'aguardando_confirmacao', { dataPromessa: data });
            await client.sendMessage(deQuem, `${P}Anotei aqui: *${data}*. Está correto? (Sim/Não)`);
            state.iniciarTimer(deQuem);
            return;
        }

        // ─── aguardando_confirmacao ───────────────────────
        if (etapa === 'aguardando_confirmacao') {
            const confirmou = ['sim','s','yes','isso','correto','certo','exato','👍'].some(p => textoLower.includes(p));
            const negou = ['não','nao','n','errado','errada','outro','outra'].some(p => textoLower.includes(p));

            if (negou) {
                state.avancar(deQuem, 'aguardando_data', { dataPromessa: null });
                await client.sendMessage(deQuem, `${P}Tudo bem! Para qual dia você consegue pagar?`);
                state.iniciarTimer(deQuem);
                return;
            }

            if (confirmou) {
                const { dataPromessa, nome } = dados;
                
                state.encerrarFluxo(deQuem);

                // 🔥 FIREBASE: Registra promessa no banco
                await firebaseDb.collection('promessas').add({
                    numero: deQuem,
                    nome: nome || null,
                    data_promessa: dataPromessa,
                    status: 'pendente',
                    notificado: 0,
                    criado_em: new Date().toISOString()
                });

                // 🔥 FIREBASE: Busca cliente pelo nome
                const numLimpo = deQuem.replace('@c.us','').replace(/^55/,'');
                const clientes = await banco.buscarClientePorTelefone(numLimpo);
                const clienteBase = clientes || null;
                
                if (clienteBase) {
                    await firebaseDb.collection('clientes_base').doc(clienteBase.id).update({
                        status: 'promessa',
                        atualizado_em: new Date().toISOString()
                    });
                }

                for (const adm of ADMINISTRADORES) {
                    await client.sendMessage(adm,
                        `🤝 *Promessa de Pagamento Registrada!*\n\n` +
                        `Cliente: ${deQuem.replace('@c.us','')}\n` +
                        `Nome: ${nome || 'não identificado'}\n` +
                        `Pagará em: *${dataPromessa}*`
                    ).catch(() => {});
                }

                const prNome = nome ? nome.split(' ')[0] : null;
                const msgFinal = `Perfeito${prNome ? ', '+prNome : ''}! Registrei sua promessa de pagamento para o dia *${dataPromessa}*. 😊\n\nNão esquece, tá? Se precisar de algo é só chamar!`;
                
                await client.sendMessage(deQuem, `${P}${msgFinal}`);
                await dbSalvarHistorico(deQuem, 'assistant', msgFinal);
                state.iniciarTimer(deQuem);
                return;
            }

            const novaData = await utils.extrairDataPromessa(texto);
            if (novaData) {
                state.avancar(deQuem, 'aguardando_confirmacao', { dataPromessa: novaData });
                await client.sendMessage(deQuem, `${P}Então a data correta é *${novaData}*? (Sim/Não)`);
                state.iniciarTimer(deQuem);
                return;
            }

            await client.sendMessage(deQuem, `${P}Me confirma: você vai pagar no dia *${dados.dataPromessa}*? (Sim/Não)`);
            state.iniciarTimer(deQuem);
            return;
        }
    }

    return { 
        iniciar,
        handle
    };
};