'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUXO CANCELAMENTO — VERSÃO REFATORADA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = function criarFluxoCancelamento(ctx) {
    const {
        client, db,
        state, P, ADMINISTRADORES,
        dbSalvarHistorico, dbIniciarAtendimento, dbEncerrarAtendimento,
        buscarStatusCliente, normalizarTexto,
        utils,  // NOVO: utilitários compartilhados
    } = ctx;

    const MOTIVOS = {
        '1': 'Problemas financeiros',
        '2': 'Qualidade do serviço',
        '3': 'Mudança de endereço',
        '4': 'Contratei outro provedor',
        '5': 'Outro motivo',
    };

    async function iniciar(deQuem, msg) {
        const dadosCliente = await buscarStatusCliente(deQuem);
        const nome = dadosCliente?.nome || null;
        const prNome = nome ? nome.split(' ')[0] : null;

        state.iniciar(deQuem, 'cancelamento', 'aguardando_motivo', { nome });
        dbIniciarAtendimento(deQuem);

        const saudacao = prNome ? `Olá, ${prNome}! ` : 'Olá! ';
        await client.sendMessage(deQuem,
            `${P}${saudacao}Recebemos sua solicitação de cancelamento. 😢\n\n` +
            `Para registrar, pode me dizer o *motivo* do cancelamento?\n\n` +
            `1️⃣ Problemas financeiros\n` +
            `2️⃣ Qualidade do serviço\n` +
            `3️⃣ Mudança de endereço\n` +
            `4️⃣ Contratei outro provedor\n` +
            `5️⃣ Outro motivo`
        );
        
        dbSalvarHistorico(deQuem, 'assistant', 'Solicitação de cancelamento iniciada.');
        state.iniciarTimer(deQuem);
    }

    async function handle(deQuem, msg) {
        const etapa = state.getEtapa(deQuem);
        const dados = state.getDados(deQuem);
        const texto = normalizarTexto(msg.body || '');
        const textoL = texto.toLowerCase();

        state.cancelarTimer(deQuem);
        dbIniciarAtendimento(deQuem);

        // ─── aguardando_motivo ────────────────────────────
        if (etapa === 'aguardando_motivo') {
            // Ignora áudio
            if (msg.hasMedia && ['audio','ptt'].includes(msg.type)) {
                await client.sendMessage(deQuem, `${P}Por favor, *digite* o número do motivo (1 a 5) ou escreva o motivo. 😊`);
                state.iniciarTimer(deQuem);
                return;
            }

            const textoNorm = texto.trim().replace(/[.!?]+$/, '');
            let motivo = MOTIVOS[textoNorm] || MOTIVOS[textoNorm.toLowerCase()] || null;

            // Texto livre — normaliza via IA
            if (!motivo && textoNorm.length > 3) {
                motivo = await utils.normalizarMotivoCancelamento(textoNorm);
            }

            if (!motivo) {
                const tentativas = (dados.tentativas || 0) + 1;
                state.atualizar(deQuem, { tentativas });
                
                if (tentativas >= 3) {
                    motivo = 'Outro motivo';
                } else {
                    await client.sendMessage(deQuem, `${P}Não entendi. Por favor escolha uma opção:\n\n1️⃣ Problemas financeiros\n2️⃣ Qualidade do serviço\n3️⃣ Mudança de endereço\n4️⃣ Contratei outro provedor\n5️⃣ Outro motivo`);
                    state.iniciarTimer(deQuem);
                    return;
                }
            }

            state.avancar(deQuem, 'aguardando_confirmacao', { motivo });
            
            const prNome = dados.nome ? dados.nome.split(' ')[0] : null;
            await client.sendMessage(deQuem,
                `${P}Entendido${prNome ? ', ' + prNome : ''}! Registramos o motivo: *${motivo}*.\n\n` +
                `Confirma a solicitação de cancelamento? (Sim/Não)\n\n` +
                `_Após a confirmação, nossa equipe entrará em contato para finalizar o processo._`
            );
            
            state.iniciarTimer(deQuem);
            return;
        }

        // ─── aguardando_confirmacao ───────────────────────
        if (etapa === 'aguardando_confirmacao') {
            const textoConf = textoL.trim().replace(/[.!?]+$/, '');
            const confirmou = /^(sim|s|confirmo|quero|pode|cancela|cancelar|ok|isso|correto|certo|vai|bora)$/.test(textoConf);
            const negou = /^(n[aã]o|nao|n|nop|negativo|desisti|desistir|cancelei|mudei de ideia|nao quero|não quero)$/.test(textoConf);

            if (negou) {
                state.encerrarFluxo(deQuem);
                await client.sendMessage(deQuem, `${P}Que ótimo! Cancelamento descartado. Se precisar de algo é só chamar! 😊`);
                dbSalvarHistorico(deQuem, 'assistant', 'Cancelamento descartado pelo cliente.');
                state.iniciarTimer(deQuem);
                return;
            }

            if (!confirmou) {
                await client.sendMessage(deQuem, `${P}Confirma o cancelamento? Responda *Sim* para confirmar ou *Não* para desistir.`);
                state.iniciarTimer(deQuem);
                return;
            }

            // Busca cliente na base pelo telefone
            const numeroBusca = deQuem.replace('@c.us', '').replace(/^55/, '');
            const clienteBase = db.prepare(`
                SELECT id, nome, telefone, endereco, plano, dia_vencimento, base_id
                FROM clientes_base
                WHERE replace(replace(telefone, '-', ''), ' ', '') LIKE ?
                LIMIT 1
            `).get('%' + numeroBusca.slice(-8));

            const nome = dados.nome || clienteBase?.nome || 'Não identificado';

            // Registra na tabela de cancelamentos
            db.prepare(`
                INSERT INTO cancelamentos
                    (cliente_id, base_id, nome, telefone, numero_whatsapp, endereco, plano, dia_vencimento, motivo, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'solicitado')
            `).run(
                clienteBase?.id || null,
                clienteBase?.base_id || null,
                nome,
                clienteBase?.telefone || deQuem.replace('@c.us', ''),
                deQuem,
                clienteBase?.endereco || null,
                clienteBase?.plano || null,
                clienteBase?.dia_vencimento || null,
                dados.motivo || 'Não informado'
            );

            // Remove da base de clientes
            if (clienteBase?.id) {
                db.prepare('DELETE FROM clientes_base WHERE id = ?').run(clienteBase.id);
            }

            state.encerrarFluxo(deQuem);

            const prNome = nome.split(' ')[0];
            await client.sendMessage(deQuem,
                `${P}Cancelamento registrado${prNome ? ', ' + prNome : ''}. 😢\n\n` +
                `Nossa equipe entrará em contato para confirmar o encerramento do serviço.\n\n` +
                `Se mudar de ideia, é só nos chamar! Obrigado por ter sido nosso cliente. 🙏`
            );
            
            dbSalvarHistorico(deQuem, 'assistant', 'Cancelamento confirmado e registrado.');

            // Notifica ADM
            for (const adm of ADMINISTRADORES) {
                client.sendMessage(adm,
                    `❌ *SOLICITAÇÃO DE CANCELAMENTO*\n\n` +
                    `👤 *Nome:* ${nome}\n` +
                    `📱 *Número:* ${deQuem.replace('@c.us', '')}\n` +
                    `📅 *Vencimento:* Dia ${clienteBase?.dia_vencimento || 'N/A'}\n` +
                    `📦 *Plano:* ${clienteBase?.plano || 'N/A'}\n` +
                    `💬 *Motivo:* ${dados.motivo}\n\n` +
                    `_Acesse o painel para confirmar ou reverter._`
                ).catch(() => {});
            }

            dbEncerrarAtendimento(deQuem, 'cancelamento');
            return;
        }
    }

    // No final do arquivo cancelamento.js
// Verifique os nomes: provavelmente iniciarNovoCliente e handleNovoCliente

return { 
    iniciar,  // ← CERTO! (usa o nome da função que você tem)
    handle     // ← CERTO!
};
};