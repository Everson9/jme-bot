'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUXO SUPORTE TÉCNICO — COM AGENDAMENTO INTELIGENTE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PALAVRAS_REINICIOU = [
    'reiniciei','reiniciar','reiniciou','desliguei','desligou','desligado','desligue','desliga','desliguei',
    'liguei de novo','liguei novamente','liguei e nada','liguei e não','liguei e nao',
    'tirei da tomada','puxei o fio','tirei o fio','fiz isso','já fiz','ja fiz',
    'tentei','ja tentei','já tentei','não funcionou','nao funcionou','nao funconou',
    'não voltou','nao voltou','não resolveu','nao resolveu',
    'continua','mesmo assim','ainda sem','ainda não voltou','ainda nao voltou',
    'piorou','não melhorou','nao melhorou','continua igual','nada mudou',
    'sem internet ainda','ainda sem internet','continua sem','persistindo',
    'fiz e nao','fiz e não','ja desliguei','já desliguei',
    'sim','fiz','feito','ok','pronto',
];

const PALAVRAS_NAO_SABE = [
    'não sei','nao sei','não consigo','nao consigo',
    'não posso','nao posso','não tenho como','nao tenho como',
    'como faz','como faço','como faco','me explica','me explique',
    'pode explicar','onde fica','qual fio','que fio',
    'sozinho nao','sozinho não','nunca fiz','nunca fiz isso',
];

const PALAVRAS_SEM_FOTO = [
    'não consigo foto','nao consigo foto','sem foto','não tem como',
    'nao tem como','sem câmera','sem camera','não consigo tirar','nao consigo tirar',
    'não posso tirar','nao posso tirar','foto não','foto nao',
    'sem celular com câmera','foto depois','nao consigo','não consigo',
    'tá longe','ta longe','fica longe','está longe',
    'não tô em casa','nao to em casa','não estou em casa','nao estou em casa',
    'tô fora','to fora','estou fora','tô no trabalho','to no trabalho',
    'sem acesso','não tenho acesso','nao tenho acesso',
];

// Configurações de agendamento
const AGENDAMENTO_CONFIG = {
    MAX_DIAS_FRENTE: 14,
    DIAS_BLOQUEADOS: [0], // 0 = domingo
    HORARIO_TECNICO: { inicio: 8, fim: 17 },
    PULAR_DIA_LOTADO: true,
    MAX_DIAS_MOSTRAR: 5
};

module.exports = function criarFluxoSuporte(ctx) {
    const {
        client, db, banco,
        state,
        ADMINISTRADORES, P,
        falarSinalAmigavel, redeNormal, previsaoRetorno,
        horaLocal, atendenteDisponivel, proximoAtendimento,
        buscarStatusCliente, analisarImagem,
        groqChatFallback, normalizarTexto,
        utils,
        processarResposta
    } = ctx;

    const _fotosPendentes = new Map();

    // =====================================================
    // FUNÇÕES DE AGENDAMENTO
    // =====================================================
    
    function ordenarDatasPorUrgencia(datas, clienteInfo) {
        return datas.sort((a, b) => a.dataObj - b.dataObj);
    }

    function gerarDatasDisponiveis() {
    const datas = [];
    const hoje = new Date();
    const horaBrasil = horaLocal();
    
    console.log(`📅 Gerando datas - Hora local: ${horaBrasil}h`);
    
    // =====================================================
    // 1. VERIFICA SE PODE AGENDAR PARA HOJE (mesmo dia)
    // =====================================================
    const hojeStr = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth()+1).padStart(2, '0')}`;
    const hojeBanco = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    
    // Verifica disponibilidade para hoje
    const manhaHoje = banco.agendamentos.verificarDisponibilidade(hojeBanco, 'manha');
    const tardeHoje = banco.agendamentos.verificarDisponibilidade(hojeBanco, 'tarde');
    
    // Só permite hoje à tarde se for antes das 10h
    if (horaBrasil < 10 && tardeHoje.disponivel) {
        const semana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][hoje.getDay()];
        if (!AGENDAMENTO_CONFIG.DIAS_BLOQUEADOS.includes(hoje.getDay())) {
            datas.push({
                numero: datas.length + 1,
                valor: hojeStr,
                dataBanco: hojeBanco,
                label: `${semana} ${hojeStr}`,
                diaSemana: hoje.getDay(),
                diaExtenso: semana,
                dataObj: hoje,
                vagas: {
                    manha: 0,
                    tarde: tardeHoje.vagas
                }
            });
            console.log(`   ✅ HOJE ${semana} ${hojeStr} - Tarde disponível`);
        }
    }
    
    // =====================================================
    // 2. VERIFICA DIAS FUTUROS (amanhã em diante)
    // =====================================================
    let diasTestados = 0;
    let diasAdicionados = datas.length; // Começa com os dias já adicionados (hoje)
    
    while (diasAdicionados < AGENDAMENTO_CONFIG.MAX_DIAS_MOSTRAR && 
           diasTestados < AGENDAMENTO_CONFIG.MAX_DIAS_FRENTE) {
        diasTestados++;
        
        const data = new Date(hoje);
        data.setDate(hoje.getDate() + diasTestados); // +1 = amanhã, +2 = depois de amanhã...
        
        // Pula domingos
        if (AGENDAMENTO_CONFIG.DIAS_BLOQUEADOS.includes(data.getDay())) continue;
        
        const dia = String(data.getDate()).padStart(2, '0');
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const ano = data.getFullYear();
        const dataBanco = `${ano}-${mes}-${dia}`;
        
        // Verifica disponibilidade no banco
        const manha = banco.agendamentos.verificarDisponibilidade(dataBanco, 'manha');
        const tarde = banco.agendamentos.verificarDisponibilidade(dataBanco, 'tarde');
        
        // =====================================================
        // REGRAS PARA AMANHÃ (diasTestados === 1)
        // =====================================================
        let mostrarManha = manha.disponivel;
        let mostrarTarde = tarde.disponivel;
        
        if (diasTestados === 1) { // É AMANHÃ
            // Se passou das 21h, bloqueia manhã de amanhã
            if (horaBrasil >= 21) {
                mostrarManha = false;
                console.log(`   ⏰ Após 21h, bloqueado manhã de amanhã`);
            }
        }
        
        // Se não tiver vaga disponível (considerando as regras), pula
        if (!mostrarManha && !mostrarTarde) {
            continue;
        }
        
        const semana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][data.getDay()];
        
        datas.push({
            numero: datas.length + 1,
            valor: `${dia}/${mes}`,
            dataBanco: dataBanco,
            label: `${semana} ${dia}/${mes}`,
            diaSemana: data.getDay(),
            diaExtenso: semana,
            dataObj: data,
            vagas: {
                manha: mostrarManha ? manha.vagas : 0,
                tarde: mostrarTarde ? tarde.vagas : 0
            }
        });
        
        diasAdicionados++;
        console.log(`   ✅ ${semana} ${dia}/${mes} - Manhã: ${mostrarManha}, Tarde: ${mostrarTarde}`);
    }
    
    return ordenarDatasPorUrgencia(datas, {});
}

    function formatarMensagemDias(datas) {
    let msg = `📅 *Escolha o dia para a visita técnica:*\n\n`;
    
    datas.forEach((data, index) => {
        // Mostra só o número e o dia da semana + data
        msg += `${data.numero}️⃣ ${data.label}\n`;
    });
    
    msg += `\n💡 *Disponível apenas nos períodos com vaga (manhã ou tarde).`;
    
    return msg;
}

    async function extrairNomeDaMensagem(texto) {
        if (utils?.extrairNomeDaMensagem) {
            return await utils.extrairNomeDaMensagem(texto);
        }
        
        const palavras = texto.trim().split(/\s+/);
        if (palavras.length <= 4 && /^[A-Za-zÀ-ÿ\s]+$/.test(texto)) {
            return texto.split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
        }
        return null;
    }

    async function abrirChamadoComMotivo(deQuem, nome, motivo, extras = {}) {
        state.setAtendimentoHumano(deQuem, true);
        
        const chamadoId = banco.dbAbrirChamado(deQuem, nome || null, motivo);

        let msg = `🔔 *Novo chamado!*\n\n`;
        msg += `📱 *Número:* ${deQuem.replace('@c.us','')}\n`;
        msg += `👤 *Nome:* ${nome || 'não informado'}\n`;
        msg += `🔧 *Motivo:* ${motivo}\n`;
        if (extras.endereco) msg += `📍 *Endereço:* ${extras.endereco}\n`;
        if (extras.disponibilidade) msg += `📅 *Disponibilidade:* ${extras.disponibilidade}\n`;
        if (extras.fotoEnviada) msg += `📷 *Foto do roteador:* enviada\n`;
        if (extras.descricaoRoteador) msg += `💡 *Luzes:* ${extras.descricaoRoteador}\n`;

        for (const adm of ADMINISTRADORES) {
            await client.sendMessage(adm, msg).catch(() => {});
            
            const fotoMsg = _fotosPendentes.get(deQuem);
            if (fotoMsg) {
                try {
                    const media = await fotoMsg.downloadMedia();
                    if (media) await client.sendMessage(adm, media, { caption: `📷 Roteador — ${nome || deQuem}` });
                } catch (_) {}
            }
        }
        
        _fotosPendentes.delete(deQuem);
        console.log(`🎫 Chamado #${chamadoId} aberto: ${deQuem} — ${motivo}`);
    }

    function msgConfirmacaoSuporte(nome, dataAgendamento = null) {
        const prNome = nome ? nome.split(' ')[0] : null;
        const saudacao = prNome ? `Perfeito, ${prNome}!` : 'Perfeito!';
        
        if (dataAgendamento) {
            return `${saudacao} Agendamento confirmado para *${dataAgendamento}*. Nosso técnico estará aí nesse horário! 🔧`;
        }
        
        if (atendenteDisponivel()) {
            const h = horaLocal();
            if (h < 14) return `${saudacao} Anotei tudo! Nosso técnico vai entrar em contato em breve. 🔧`;
            return `${saudacao} Anotei tudo! Como já passa das 14h, a visita será amanhã. O técnico confirma com você! 🔧`;
        }
        return `${saudacao} Anotei tudo! O técnico confirma a visita ${proximoAtendimento()}. 🔧`;
    }

    async function iniciar(deQuem, msg, motivo = null) {
        const sinalMsg = falarSinalAmigavel();

        if (motivo === 'troca_senha') {
            const dadosCliente = buscarStatusCliente(deQuem);
            const nome = dadosCliente?.nome || null;
            
            state.iniciar(deQuem, 'suporte', 'aguardando_nome', { motivo: 'Troca de senha Wi-Fi' });
            banco.dbIniciarAtendimento(deQuem);

            if (nome) {
                state.atualizar(deQuem, { nome });
                await client.sendMessage(deQuem, `${P}Entendido! Para agendar a troca de senha, preciso do seu *endereço completo* (rua, número, bairro). 😊`);
            } else {
                await client.sendMessage(deQuem, `${P}Entendido! Para registrar o atendimento, pode me dizer seu *nome completo*? 😊`);
            }
            
            banco.dbSalvarHistorico(deQuem, 'assistant', 'Iniciou fluxo troca de senha.');
            state.iniciarTimer(deQuem);
            return;
        }

        // =====================================================
        // REDE COM PROBLEMA - VERSÃO MELHORADA
        // =====================================================
        if (!redeNormal()) {
            const sinalMsg = falarSinalAmigavel();
            const semPrevisao = !previsaoRetorno || previsaoRetorno() === 'sem previsão';
            
            // 1. SALVA O CONTEXTO da reclamação
            state.iniciar(deQuem, 'rede_problema', 'aguardando_notificacao', { 
                reclamacaoOriginal: msg?.body || '',
                situacaoRede: ctx.situacaoRede,
                timestamp: Date.now()
            });
            
            // 2. Mensagem personalizada
            let msgCliente = `${sinalMsg}\n\n`;
            msgCliente += `Entendemos o transtorno e pedimos desculpas! 🙏 Nossa equipe já está trabalhando para resolver.${
                semPrevisao ? '\n\nAssim que normalizar, a conexão retorna automaticamente.' : ''
            }\n\n`;
            
            await client.sendMessage(deQuem, `${P}${msgCliente}`);
            
            // 3. Oferece opção de ser notificado
            await new Promise(r => setTimeout(r, 1500));
            await client.sendMessage(deQuem, 
                `${P}Quer que eu te avise quando a internet voltar?\n\n` +
                `1️⃣ Sim, me avise 🔔\n` +
                `2️⃣ Não, depois eu vejo`
            );
            
            state.avancar(deQuem, 'aguardando_escolha_notificacao');
            banco.dbIniciarAtendimento(deQuem);
            state.iniciarTimer(deQuem);
            return;
        }

        state.iniciar(deQuem, 'suporte', 'aguardando_reinicio', {});
        state.setClienteEmSuporte(deQuem, true);
        banco.dbIniciarAtendimento(deQuem);

        const dadosCliente = buscarStatusCliente(deQuem);
        const nomeJaConhecido = dadosCliente?.nome || null;
        const saudacao = nomeJaConhecido ? `Que chato, ${nomeJaConhecido.split(' ')[0]}!` : 'Que chato!';

        await client.sendMessage(deQuem, `${P}${sinalMsg} — isso significa que o problema é pontual aí na sua casa. 😊`);
        await new Promise(r => setTimeout(r, 1200));
        await client.sendMessage(deQuem, `${P}${saudacao} Antes de qualquer coisa, vamos tentar uma solução rápida: pode *desligar o roteador da tomada por 30 segundos* e ligar de novo? 🔌`);
        
        banco.dbSalvarHistorico(deQuem, 'assistant', 'Sinal OK. Iniciou fluxo suporte.');
        state.iniciarTimer(deQuem);
    }

    async function handle(deQuem, msg) {
    const etapa = state.getEtapa(deQuem);
    const dados = state.getDados(deQuem);
    const texto = normalizarTexto(msg.body || '');
    const temFoto = msg.hasMedia && msg.type === 'image';
    const temVideo = msg.hasMedia && (msg.type === 'video' || msg.type === 'document');

    // =====================================================
    // ✅ PEGA O NOME DO CLIENTE (se já tiver sido identificado)
    // =====================================================
    const nomeCliente = dados?.nomeCliente || dados?.dados?.nome || null;
    
    // Se tiver nome, já guarda nos dados do fluxo
    if (nomeCliente && !dados?.dados?.nome) {
        state.atualizar(deQuem, { dados: { ...dados.dados, nome: nomeCliente } });
        console.log(`📝 Nome recuperado do estado: ${nomeCliente}`);
    }

    state.cancelarTimer(deQuem);
    banco.dbIniciarAtendimento(deQuem);

    // =====================================================
    // TRATAMENTO PARA QUEM ESCOLHEU SER NOTIFICADO
    // =====================================================
    if (etapa === 'aguardando_escolha_notificacao') {
        const t = texto.toLowerCase();
        
        if (t.includes('1') || t.includes('sim') || t.includes('quero') || t.includes('avise')) {
            // Registra para notificar
            try {
                // Cria tabela se não existir
                db.exec(`
                    CREATE TABLE IF NOT EXISTS notificacoes_rede (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        numero TEXT NOT NULL,
                        situacao_rede TEXT,
                        notificado INTEGER DEFAULT 0,
                        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(numero, situacao_rede)
                    )
                `);
                
                db.prepare(`
                    INSERT OR REPLACE INTO notificacoes_rede (numero, situacao_rede, notificado)
                    VALUES (?, ?, 0)
                `).run(deQuem, ctx.situacaoRede || 'desconhecido');
                
                await client.sendMessage(deQuem, 
                    `${P}Perfeito! Vou te avisar assim que a internet voltar! 🔔\n\n` +
                    `Se quiser cancelar o aviso, é só falar "cancelar notificação".`
                );
            } catch (e) {
                console.error('Erro ao registrar notificação:', e);
                await client.sendMessage(deQuem, 
                    `${P}Anotei! Mas tive um problema no registro. Pode tentar novamente?`
                );
            }
        } else {
            await client.sendMessage(deQuem, 
                `${P}Tudo bem! Se mudar de ideia, é só pedir pra te avisar quando voltar. 😊`
            );
        }
        
        state.encerrarFluxo(deQuem);
        return;
    }

    // =====================================================
    // TRATAMENTO PARA QUANDO A REDE VOLTOU
    // =====================================================
    if (etapa === 'rede_voltou_aguardando') {
        const t = texto.toLowerCase();
        
        if (t.includes('sim') || t.includes('voltou') || t.includes('ok') || t.includes('funcionou') || t.includes('obrigado')) {
            await client.sendMessage(deQuem, 
                `${P}Que bom! Fico feliz que está tudo funcionando! 😊\n\n` +
                `Precisa de mais alguma coisa?`
            );
            state.encerrarFluxo(deQuem);
            return;
        }
        
        if (t.includes('não') || t.includes('nao') || t.includes('ainda')) {
            // Se não voltou, inicia fluxo de suporte normal
            await client.sendMessage(deQuem, 
                `${P}Entendi, ainda está sem internet. Vamos verificar! 🔧`
            );
            
            // Joga pro fluxo normal de suporte
            state.iniciar(deQuem, 'suporte', 'aguardando_reinicio', {});
            state.setClienteEmSuporte(deQuem, true);
            
            await client.sendMessage(deQuem, 
                `${P}Antes de qualquer coisa, pode *desligar o roteador da tomada por 30 segundos* e ligar de novo? 🔌`
            );
            return;
        }
        
        await client.sendMessage(deQuem, 
            `${P}A internet voltou aí? Responde com Sim ou Não 😊`
        );
        return;
    }

    // =====================================================
    // FLUXO NORMAL DE SUPORTE
    // =====================================================
    
    if (etapa === 'aguardando_reinicio') {
        const naoSabe = PALAVRAS_NAO_SABE.some(p => texto.includes(p));
        const respostaNegativaSimples = /^(não|nao|nop|nope|negativo|n)\.?!?$/.test(texto.trim());
        let reiniciou = respostaNegativaSimples || PALAVRAS_REINICIOU.some(p => texto.includes(p));

        if (!reiniciou && !naoSabe && texto.length > 3 && texto.length < 60) {
            try {
                const prompt = `O cliente respondeu sobre reiniciar o roteador: "${texto}". Ele já reiniciou e não voltou? Responda só: SIM ou NAO`;
                const resp = (await groqChatFallback([{ role: 'user', content: prompt }], 0.0) || '').trim().toUpperCase();
                if (resp === 'SIM') reiniciou = true;
            } catch(_) {}
        }

        if (naoSabe) {
            state.atualizar(deQuem, { tentativas: 0 });
            await client.sendMessage(deQuem, `${P}Sem problema! É só puxar o fio de energia do roteador da tomada, contar 30 segundos e colocar de volta. Consegue tentar assim?`);
            state.iniciarTimer(deQuem);
            return;
        }

        if (reiniciou) {
            state.atualizar(deQuem, { tentativas: 0 });
            
            // =====================================================
            // ✅ CORREÇÃO: TENTA PEGAR O NOME DE QUALQUER LUGAR
            // =====================================================
            const dadosCliente = buscarStatusCliente(deQuem);
            const nome = dados?.dados?.nome || dados?.nomeCliente || dadosCliente?.nome || null;
            
            if (!nome) {
                state.avancar(deQuem, 'aguardando_nome', { jaReiniciou: true });
                await client.sendMessage(deQuem, `${P}Entendido, infelizmente não resolveu. 😕 Vamos acionar o técnico!`);
                await new Promise(r => setTimeout(r, 1000));
                await client.sendMessage(deQuem, `${P}Para eu registrar o atendimento, pode me dizer seu *nome completo*?`);
            } else {
                // ✅ SE JÁ TEM NOME, PULA DIRETO PARA A FOTO!
                state.avancar(deQuem, 'aguardando_foto', { nome, jaReiniciou: true });
                await client.sendMessage(deQuem, `${P}Entendido, infelizmente não resolveu. 😕 Vamos acionar o técnico!`);
                await new Promise(r => setTimeout(r, 1500));
                await client.sendMessage(deQuem, `${P}Consegue tirar uma foto das luzes do roteador pra mim? Ajuda o técnico a já chegar preparado 📷`);
            }
            state.iniciarTimer(deQuem);
            return;
        }

        const tentativas = (dados.tentativas || 0) + 1;
        state.atualizar(deQuem, { tentativas });
        
        if (tentativas >= 3) {
            state.encerrarFluxo(deQuem);
            state.setClienteEmSuporte(deQuem, false);
            await abrirChamadoComMotivo(deQuem, dados.nome || null, 'Suporte técnico');
            await client.sendMessage(deQuem, `${P}Não consegui entender bem, mas não se preocupe! Vou chamar o atendente pra te ajudar pessoalmente. 😊`);
            return;
        }
        
        await client.sendMessage(deQuem, `${P}Conseguiu desligar o roteador da tomada e ligar de novo? A internet voltou?`);
        state.iniciarTimer(deQuem);
        return;
    }

    if (etapa === 'aguardando_nome') {
        const textoNome = msg.body || '';
        if (textoNome.trim().length < 2) {
            await client.sendMessage(deQuem, `${P}Pode me dizer seu nome completo?`);
            state.iniciarTimer(deQuem);
            return;
        }
        
        const nomeLimpo = await extrairNomeDaMensagem(textoNome);
        if (!nomeLimpo) {
            await client.sendMessage(deQuem, `${P}Não consegui identificar seu nome. Pode digitar só o nome e sobrenome, por favor?`);
            state.iniciarTimer(deQuem);
            return;
        }
        
        state.avancar(deQuem, 'aguardando_endereco', { nome: nomeLimpo });
        await client.sendMessage(deQuem, `${P}Obrigado, ${nomeLimpo.split(' ')[0]}! Agora preciso do seu *endereço completo* (rua, número, bairro). 😊`);
        state.iniciarTimer(deQuem);
        return;
    }

    if (etapa === 'aguardando_foto') {
        const semFoto = PALAVRAS_SEM_FOTO.some(p => texto.includes(p));
        const simulouFoto = texto.includes('foto') && ['enviei','mandei','segue','aqui'].some(p => texto.includes(p));

        if (temFoto || temVideo || simulouFoto) {
            if (temFoto || temVideo) {
                _fotosPendentes.set(deQuem, msg);
                if (temFoto) analisarImagem(msg).catch(() => {});
            }
            
            state.avancar(deQuem, 'aguardando_endereco', { fotoEnviada: true });
            await client.sendMessage(deQuem, `${P}${temVideo ? 'Vídeo' : 'Foto'} recebido! 👍 Agora preciso do seu *endereço completo* (rua, número, bairro).`);
            state.iniciarTimer(deQuem);
            return;
        }
        
        if (semFoto) {
            state.avancar(deQuem, 'aguardando_descricao_roteador', { semFoto: true });
            await client.sendMessage(deQuem, `${P}Sem problema! 😊 Pode me descrever as luzes do roteador? (ex: luz vermelha piscando, luz apagada, tudo verde...)`);
            state.iniciarTimer(deQuem);
            return;
        }
        
        const tentativas = (dados.tentativas || 0) + 1;
        state.atualizar(deQuem, { tentativas });
        
        if (tentativas >= 3) {
            state.avancar(deQuem, 'aguardando_endereco');
            await client.sendMessage(deQuem, `${P}Tudo bem, vamos continuar sem a foto! Agora preciso do seu *endereço completo* (rua, número, bairro).`);
            state.iniciarTimer(deQuem);
            return;
        }
        
        await client.sendMessage(deQuem, `${P}Consegue tirar uma foto das luzes do roteador? Se não conseguir, é só falar "não consigo" que a gente continua! 📷`);
        state.iniciarTimer(deQuem);
        return;
    }

    if (etapa === 'aguardando_descricao_roteador') {
        const descricao = (msg.body || '').trim();
        if (descricao.length < 3) {
            await client.sendMessage(deQuem, `${P}Pode descrever como estão as luzes do roteador? Isso ajuda o técnico a chegar preparado! 😊`);
            state.iniciarTimer(deQuem);
            return;
        }
        
        state.avancar(deQuem, 'aguardando_endereco', { descricaoRoteador: descricao });
        await client.sendMessage(deQuem, `${P}Anotado! Agora preciso do seu *endereço completo* (rua, número, bairro).`);
        state.iniciarTimer(deQuem);
        return;
    }

    if (etapa === 'aguardando_endereco') {
        const endereco = (msg.body || '').trim();
        const enderecoInvalido = !endereco || endereco.length < 8 ||
            /^(aqui|casa|minha casa|recife|olinda|meu endereço|meu endereco|não sei|nao sei)$/i.test(endereco);
        
        if (enderecoInvalido) {
            const tentEnd = (dados.tentativasEndereco || 0) + 1;
            state.atualizar(deQuem, { tentativasEndereco: tentEnd });
            
            if (tentEnd >= 2) {
                state.avancar(deQuem, 'aguardando_agendamento_dia', { endereco: endereco || 'não informado' });
                await client.sendMessage(deQuem, `${P}Tudo bem! Vamos agendar a visita.`);
                
                const datas = gerarDatasDisponiveis();
                state.atualizar(deQuem, { datasDisponiveis: datas });
                await client.sendMessage(deQuem, `${P}${formatarMensagemDias(datas)}`);
            } else {
                await client.sendMessage(deQuem, `${P}Preciso do endereço completo para o técnico chegar certinho. 😊 Pode informar rua, número e bairro?`);
            }
            state.iniciarTimer(deQuem);
            return;
        }
        
        state.avancar(deQuem, 'aguardando_agendamento_dia', { endereco });
        
        const datas = gerarDatasDisponiveis();
        state.atualizar(deQuem, { datasDisponiveis: datas });
        await client.sendMessage(deQuem, `${P}${formatarMensagemDias(datas)}`);
        state.iniciarTimer(deQuem);
        return;
    }

    if (etapa === 'aguardando_agendamento_dia') {
    const escolha = texto.trim();
    const datas = dados.datasDisponiveis || [];
    
    if (/^[1-5]$/.test(escolha)) {
        const index = parseInt(escolha) - 1;
        if (index >= 0 && index < datas.length) {
            const dataEscolhida = datas[index];
            
            // Verifica disponibilidade AGORA (pode ter mudado desde que gerou)
            const manha = banco.agendamentos.verificarDisponibilidade(dataEscolhida.dataBanco, 'manha');
            const tarde = banco.agendamentos.verificarDisponibilidade(dataEscolhida.dataBanco, 'tarde');
            
            const periodosDisponiveis = [];
            
            if (manha.disponivel) {
                periodosDisponiveis.push({
                    opcao: 1,
                    periodo: 'manha',
                    label: '🌅 Manhã (8h às 12h)',
                    vagas: manha.vagas
                });
            }
            
            if (tarde.disponivel) {
                periodosDisponiveis.push({
                    opcao: 2,
                    periodo: 'tarde',
                    label: '☀️ Tarde (13h às 17h)',
                    vagas: tarde.vagas
                });
            }
            
            if (periodosDisponiveis.length === 0) {
                // Se lotou entre a listagem e a escolha
                await client.sendMessage(deQuem, 
                    `${P}😕 Infelizmente este dia acabou de lotar. Vou mostrar outras opções.`
                );
                // Regenera datas
                const novasDatas = gerarDatasDisponiveis();
                state.atualizar(deQuem, { datasDisponiveis: novasDatas });
                await client.sendMessage(deQuem, formatarMensagemDias(novasDatas));
                return;
            }
            
            // Salva os períodos disponíveis
            state.avancar(deQuem, 'aguardando_agendamento_periodo', { 
                dataAgendamento: dataEscolhida.valor,
                dataBanco: dataEscolhida.dataBanco,
                diaEscolhido: dataEscolhida.diaExtenso,
                periodosDisponiveis: periodosDisponiveis,
                endereco: dados.endereco,
                nome: dados.nome
            });
            
            // Mostra MENU DE PERÍODOS (SÓ OS DISPONÍVEIS)
            let msg = `⏰ *Horários disponíveis para ${dataEscolhida.diaExtenso} ${dataEscolhida.valor}:*\n\n`;
            
            periodosDisponiveis.forEach(p => {
                msg += `${p.opcao}️⃣ ${p.label}\n`;  // ← SEM mostrar vagas
            });
            
            msg += `\n💡 Digite o número do período desejado.`;
            
            await client.sendMessage(deQuem, `${P}${msg}`);
            return;
        }
    }

        
        await client.sendMessage(deQuem, 
            `${P}Por favor, escolha um número de 1 a ${datas.length} para o dia da visita.`
        );
        return;
    }

    if (etapa === 'aguardando_agendamento_periodo') {
        const escolha = texto.trim();
        const periodos = dados.periodosDisponiveis || [];
        
        const opcaoEscolhida = periodos.find(p => p.opcao === parseInt(escolha));
        
        if (opcaoEscolhida) {
            const periodo = opcaoEscolhida.periodo;
            
            const disponibilidade = banco.agendamentos.verificarDisponibilidade(dados.dataBanco, periodo);
            
            if (!disponibilidade.disponivel) {
                const manha = banco.agendamentos.verificarDisponibilidade(dados.dataBanco, 'manha');
                const tarde = banco.agendamentos.verificarDisponibilidade(dados.dataBanco, 'tarde');
                
                const novosPeriodos = [];
                let opcao = 1;
                
                if (manha.disponivel) novosPeriodos.push({ opcao: opcao++, periodo: 'manha', label: '🌅 Manhã', vagas: manha.vagas });
                if (tarde.disponivel) novosPeriodos.push({ opcao: opcao++, periodo: 'tarde', label: '☀️ Tarde', vagas: tarde.vagas });
                
                state.atualizar(deQuem, { periodosDisponiveis: novosPeriodos });
                
                let msg = `😕 Infelizmente o período escolhido acabou de ser preenchido.\n\n`;
                msg += `Períodos ainda disponíveis:\n`;
                novosPeriodos.forEach(p => {
                    msg += `${p.opcao}️⃣ ${p.label} (${p.vagas} vaga${p.vagas > 1 ? 's' : ''})\n`;
                });
                
                await client.sendMessage(deQuem, `${P}${msg}`);
                return;
            }
            
            const resultado = banco.agendamentos.criarAgendamento(
                dados.dataBanco,
                periodo,
                dados.nome,
                deQuem,
                dados.endereco
            );
            
            if (!resultado.sucesso) {
                await client.sendMessage(deQuem, `${P}Ocorreu um erro no agendamento. Tente novamente.`);
                return;
            }
            
            const nome = dados.nome;
            const motivoChamado = dados.motivo || 'Sem internet — visita técnica';
            const periodoLabel = periodo === 'manha' ? 'manhã' : 'tarde';
            const dataCompleta = `${dados.diaEscolhido} ${dados.dataAgendamento} (${periodoLabel})`;
            
            state.encerrarFluxo(deQuem);
            state.setClienteEmSuporte(deQuem, false);
            
            await abrirChamadoComMotivo(deQuem, nome, motivoChamado, {
                endereco: dados.endereco,
                disponibilidade: dataCompleta,
                fotoEnviada: dados.fotoEnviada || false,
                descricaoRoteador: dados.descricaoRoteador || null,
            });
            
            const msgFinal = msgConfirmacaoSuporte(nome, dataCompleta);
            await client.sendMessage(deQuem, `${P}${msgFinal}`);
            banco.dbSalvarHistorico(deQuem, 'assistant', msgFinal);
            
            for (const adm of ADMINISTRADORES) {
                client.sendMessage(adm,
                    `📅 *NOVO AGENDAMENTO*\n\n` +
                    `👤 Cliente: ${nome}\n` +
                    `📱 Número: ${deQuem.replace('@c.us', '')}\n` +
                    `📍 Endereço: ${dados.endereco}\n` +
                    `📆 Data: ${dataCompleta}\n` +
                    `🎫 Chamado: #${resultado.id}`
                ).catch(() => {});
            }
            
            // Verifica se há intenções pendentes (como promessa)
            const dadosAtuais = state.getDados(deQuem);
            if (dadosAtuais?.intencoesPendentes?.length > 0) {
                const [proxima, ...restantes] = dadosAtuais.intencoesPendentes;
                state.atualizar(deQuem, { intencoesPendentes: restantes });
                
                await new Promise(r => setTimeout(r, 2000));
                
                let mensagem = '';
                if (proxima === 'PROMESSA') {
                    mensagem = `🤖 *Assistente JMENET*\n\nAgora sobre a promessa de pagamento, como posso ajudar? 😊`;
                } else if (proxima === 'FINANCEIRO') {
                    mensagem = `🤖 *Assistente JMENET*\n\nAgora sobre o financeiro, como posso ajudar? 😊`;
                }
                
                if (mensagem) {
                    await client.sendMessage(deQuem, mensagem);
                }
            }
            
            return;
        }
        
        await client.sendMessage(deQuem, 
            `${P}Por favor, escolha o período digitando o número correspondente.`
        );
        return;
    }

    const dadosAtuais = state.getDados(deQuem);
    const intencoesPendentes = dadosAtuais?.intencoesPendentes || [];

    if (intencoesPendentes.length > 0) {
        const [proxima, ...restantes] = intencoesPendentes;
        state.atualizar(deQuem, { intencoesPendentes: restantes });
        
        await new Promise(r => setTimeout(r, 1500));
        
        let mensagem = '';
        if (proxima === 'PROMESSA') {
            mensagem = `🤖 *Assistente JMENET*\n\nAgora sobre a promessa de pagamento, como posso ajudar? 😊`;
        } else if (proxima === 'FINANCEIRO') {
            mensagem = `🤖 *Assistente JMENET*\n\nAgora sobre o financeiro, como posso ajudar? 😊`;
        } else if (proxima === 'NOVO_CLIENTE') {
            mensagem = `🤖 *Assistente JMENET*\n\nAgora sobre a contratação, como posso ajudar? 😊`;
        } else {
            mensagem = `🤖 *Assistente JMENET*\n\nAgora sobre ${proxima.toLowerCase()}, como posso ajudar? 😊`;
        }
        
        await client.sendMessage(deQuem, mensagem);
        
        if (processarResposta) {
            await processarResposta(deQuem, { body: dadosAtuais.msgPendente });
        }
        return;
    }
}

    return { 
        iniciar, 
        handle,
        abrirChamadoComMotivo 
    };
};