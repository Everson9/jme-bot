'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUXO PROMESSA DE PAGAMENTO — VERSÃO REFATORADA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = function criarFluxoPromessa(ctx) {
    const {
        client, db,
        dbSalvarHistorico, dbIniciarAtendimento,
        state,
        ADMINISTRADORES, P,
        normalizarTexto, buscarStatusCliente,
        utils,  // NOVO: utilitários compartilhados
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
        
        dbIniciarAtendimento(deQuem);
        dbSalvarHistorico(deQuem, 'assistant', 'Iniciou fluxo PROMESSA');
        state.iniciarTimer(deQuem);
    }

    async function handle(deQuem, msg) {
        const etapa = state.getEtapa(deQuem);
        const dados = state.getDados(deQuem);
        const texto = normalizarTexto(msg.body || '');
        const textoLower = texto.toLowerCase();

        state.cancelarTimer(deQuem);
        dbIniciarAtendimento(deQuem);

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

                // Registra promessa no banco
                db.prepare(`INSERT INTO promessas (numero, nome, data_promessa, status) VALUES (?, ?, ?, 'pendente')`)
                  .run(deQuem, nome || null, dataPromessa);

                // Atualiza cliente na base
                const numLimpo = deQuem.replace('@c.us','').replace(/^55/,'');
                const clienteBase = db.prepare(`
                    SELECT id FROM clientes_base
                    WHERE REPLACE(REPLACE(REPLACE(telefone,'-',''),' ',''),'()','') LIKE ?
                    LIMIT 1
                `).get('%' + numLimpo.slice(-8) + '%');
                
                if (clienteBase) {
                    db.prepare(`UPDATE clientes_base SET status = 'promessa', atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pendente'`).run(clienteBase.id);
                }

                // Notifica admins
                for (const adm of ADMINISTRADORES) {
                    client.sendMessage(adm,
                        `🤝 *Promessa de Pagamento Registrada!*\n\n` +
                        `Cliente: ${deQuem.replace('@c.us','')}\n` +
                        `Nome: ${nome || 'não identificado'}\n` +
                        `Pagará em: *${dataPromessa}*`
                    ).catch(() => {});
                }

                const prNome = nome ? nome.split(' ')[0] : null;
                const msgFinal = `Perfeito${prNome ? ', '+prNome : ''}! Registrei sua promessa de pagamento para o dia *${dataPromessa}*. 😊\n\nNão esquece, tá? Se precisar de algo é só chamar!`;
                
                await client.sendMessage(deQuem, `${P}${msgFinal}`);
                dbSalvarHistorico(deQuem, 'assistant', msgFinal);
                state.iniciarTimer(deQuem);
                return;
            }

            // Resposta ambígua - tenta extrair nova data
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

    // No final do arquivo promessa.js
// Verifique os nomes das funções no início do arquivo
// Provavelmente tem: async function iniciarPromessa(...) e async function handlePromessa(...)

// No final:
// No final do arquivo promessa.js
return { 
    iniciar,                       // ← função iniciar do próprio fluxo
    handle,                         // ← função handle do próprio fluxo
    extrairDataPromessa: utils.extrairDataPromessa  // ← função do utils
};
};