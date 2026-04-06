'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUXO CANCELAMENTO — VERSÃO FIREBASE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = function criarFluxoCancelamento(ctx) {
    const {
        client, db: firebaseDb, banco,
        state, P, ADMINISTRADORES,
        dbSalvarHistorico, dbIniciarAtendimento, dbEncerrarAtendimento,
        buscarStatusCliente, normalizarTexto,
        utils,
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
        await dbIniciarAtendimento(deQuem);

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
        
        await dbSalvarHistorico(deQuem, 'assistant', 'Solicitação de cancelamento iniciada.');
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
            await ctx.abrirChamadoComMotivo(deQuem, state.getDados(deQuem)?.nome, 'Cancelamento — pediu atendente');
            await client.sendMessage(deQuem, `${P}Vou chamar um atendente! Aguarda um instante. 😊`);
            return true;
        }
        return false;
    }

    async function handle(deQuem, msg) {
        const etapa = state.getEtapa(deQuem);
        const dados = state.getDados(deQuem);
        const texto = normalizarTexto(msg.body || '');
        const textoL = texto.toLowerCase();

        state.cancelarTimer(deQuem);
        await dbIniciarAtendimento(deQuem);

        // Escape em todos os estágios
        if (await tentarRetorno(deQuem, textoL)) return;

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
                    // Após 3 tentativas, chama atendente
                    state.encerrarFluxo(deQuem);
                    await dbIniciarAtendimento(deQuem);
                    await client.sendMessage(deQuem, `${P}Deixa eu chamar alguém pra te ajudar melhor. 😊 Aguarda um instante!`);
                    return;
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
                await dbSalvarHistorico(deQuem, 'assistant', 'Cancelamento descartado pelo cliente.');
                state.iniciarTimer(deQuem);
                return;
            }

            if (!confirmou) {
                await client.sendMessage(deQuem, `${P}Confirma o cancelamento? Responda *Sim* para confirmar ou *Não* para desistir.`);
                state.iniciarTimer(deQuem);
                return;
            }

            // 🔥 FIREBASE: Busca cliente na base pelo telefone
            const numeroBusca = deQuem.replace('@c.us', '').replace(/^55/, '');
            
            // Usa a função do banco para buscar cliente por telefone
            const clienteBase = await banco.buscarClientePorTelefone(numeroBusca);

            const nome = dados.nome || clienteBase?.nome || 'Não identificado';

            // 🔥 FIREBASE: Registra na tabela de cancelamentos
            await firebaseDb.collection('cancelamentos').add({
                cliente_id: clienteBase?.id || null,
                base_id: clienteBase?.base_id || null,
                nome: nome,
                telefone: clienteBase?.telefone || deQuem.replace('@c.us', ''),
                numero_whatsapp: deQuem,
                endereco: clienteBase?.endereco || null,
                plano: clienteBase?.plano || null,
                dia_vencimento: clienteBase?.dia_vencimento || null,
                motivo: dados.motivo || 'Não informado',
                status: 'solicitado',
                solicitado_em: new Date().toISOString()
            });

            // 🔥 FIREBASE: Remove da base de clientes
            if (clienteBase?.id) {
                await firebaseDb.collection('clientes').doc(clienteBase.id).delete();
                console.log(`🗑️ Cliente ${nome} removido da base (cancelamento)`);
            }

            state.encerrarFluxo(deQuem);

            const prNome = nome.split(' ')[0];
            await client.sendMessage(deQuem,
                `${P}Cancelamento registrado${prNome ? ', ' + prNome : ''}. 😢\n\n` +
                `Nossa equipe entrará em contato para confirmar o encerramento do serviço.\n\n` +
                `Se mudar de ideia, é só nos chamar! Obrigado por ter sido nosso cliente. 🙏`
            );
            
            await dbSalvarHistorico(deQuem, 'assistant', 'Cancelamento confirmado e registrado.');

            // Notifica o front
            if (ctx.sseService) {
                ctx.sseService.notificar('cancelamentos');
            }

            // Notifica ADM
            for (const adm of ADMINISTRADORES) {
                await client.sendMessage(adm,
                    `❌ *SOLICITAÇÃO DE CANCELAMENTO*\n\n` +
                    `👤 *Nome:* ${nome}\n` +
                    `📱 *Número:* ${deQuem.replace('@c.us', '')}\n` +
                    `📅 *Vencimento:* Dia ${clienteBase?.dia_vencimento || 'N/A'}\n` +
                    `📦 *Plano:* ${clienteBase?.plano || 'N/A'}\n` +
                    `💬 *Motivo:* ${dados.motivo}\n\n` +
                    `_Acesse o painel para confirmar ou reverter._`
                ).catch(() => {});
            }

            await dbEncerrarAtendimento(deQuem, 'cancelamento');
            return;
        }
    }

    return { 
        iniciar,
        handle
    };
};