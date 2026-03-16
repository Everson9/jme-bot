'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUXO NOVO CLIENTE / INSTALAÇÃO — COM AGENDAMENTO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = function criarFluxoNovoCliente(ctx) {
    const {
        client, db, banco,
        dbSalvarHistorico, dbIniciarAtendimento,
        dbSalvarNovoCliente,
        state,
        ADMINISTRADORES, P,
        atendenteDisponivel, proximoAtendimento,
        horaLocal,
        normalizarTexto,
        utils,
        abrirChamadoComMotivo,
    } = ctx;

    // =====================================================
    // FUNÇÕES DE AGENDAMENTO DE INSTALAÇÃO
    // =====================================================
    
    function gerarDiasInstalacao() {
        const dias = [];
        const hoje = new Date();
        const horaBrasil = horaLocal();
        
        let diasTestados = 0;
        let diasAdicionados = 0;
        
        while (diasAdicionados < 5 && diasTestados < 14) {
            diasTestados++;
            
            const data = new Date(hoje);
            data.setDate(hoje.getDate() + diasTestados);
            
            // Pula domingos
            if (data.getDay() === 0) continue;
            
            const dia = String(data.getDate()).padStart(2, '0');
            const mes = String(data.getMonth() + 1).padStart(2, '0');
            const ano = data.getFullYear();
            const dataBanco = `${ano}-${mes}-${dia}`;
            
            // Verifica quantas instalações já tem nesse dia
            const count = db.prepare(`
                SELECT COUNT(*) as total FROM instalacoes_agendadas 
                WHERE data = ? AND status IN ('agendado', 'confirmado')
            `).get(dataBanco).total;
            
            // Máximo 1 instalação por dia
            if (count >= 1) continue;
            
            const semana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][data.getDay()];
            
            dias.push({
                numero: diasAdicionados + 1,
                valor: `${dia}/${mes}`,
                dataBanco: dataBanco,
                label: `${semana} ${dia}/${mes}`,
                dataObj: data
            });
            
            diasAdicionados++;
        }
        
        return dias;
    }

    function formatarMensagemDiasInstalacao(dias) {
        if (dias.length === 0) {
            return `😕 Infelizmente não há dias disponíveis para instalação nesta semana. Por favor, tente novamente mais tarde.`;
        }
        
        let msg = `📅 *Escolha o dia para a instalação:*\n\n`;
        dias.forEach(d => {
            msg += `${d.numero}️⃣ ${d.label}\n`;
        });
        msg += `\n💡 *A instalação é agendada para o dia seguinte (máx 1 por dia)*`;
        
        return msg;
    }

    async function iniciar(deQuem) {
        state.iniciar(deQuem, 'novoCliente', 'plano', {});
        dbIniciarAtendimento(deQuem);
        
        await client.sendMessage(deQuem,
            `${P}Ficamos felizes com seu interesse! 🎉\n\n` +
            `Temos dois planos disponíveis:\n\n` +
            `1️⃣ *Cabo 50MB* — R$ 50/mês\n` +
            `2️⃣ *Fibra 200MB* — R$ 60/mês\n\n` +
            `Instalação: R$ 50 sem roteador | R$ 80 com roteador.\n\nQual plano te interessa?`
        );
        
        dbSalvarHistorico(deQuem, 'assistant', 'Iniciou fluxo NOVO_CLIENTE');
        state.iniciarTimer(deQuem);
    }

    async function handle(deQuem, msg) {
        const etapa = state.getEtapa(deQuem);
        const dados = state.getDados(deQuem);
        const texto = normalizarTexto(msg.body || '');
        const t = texto.toLowerCase();

        if (!etapa) {
            state.iniciar(deQuem, 'novoCliente', 'plano', {});
            await client.sendMessage(deQuem, `${P}Qual plano você prefere?\n\n1️⃣ *Cabo 50MB* — R$ 50/mês\n2️⃣ *Fibra 200MB* — R$ 60/mês`);
            state.iniciarTimer(deQuem);
            return;
        }

        state.cancelarTimer(deQuem);
        dbIniciarAtendimento(deQuem);

        // ─── plano ────────────────────────────────────────
        if (etapa === 'plano') {
            let plano = null;
            if (t.includes('cabo') || (t.includes('50') && !t.includes('150') && !t.includes('60'))) {
                plano = 'Cabo 50MB — R$50/mês';
            } else if (t.includes('fibra') || t.includes('200') || t.includes('60') || t === '2') {
                plano = 'Fibra 200MB — R$60/mês';
            } else if (t === '1') {
                plano = 'Cabo 50MB — R$50/mês';
            }

            if (!plano) {
                await client.sendMessage(deQuem, `${P}Pode escolher uma das opções?\n\n1️⃣ *Cabo 50MB* — R$ 50/mês\n2️⃣ *Fibra 200MB* — R$ 60/mês`);
                state.iniciarTimer(deQuem);
                return;
            }
            
            state.avancar(deQuem, 'roteador', { plano });
            await client.sendMessage(deQuem,
                `${P}Boa escolha! 👍\n\nVai precisar de roteador Wi-Fi?\n\n` +
                `1️⃣ *Sim* — Instalação R$ 80\n` +
                `2️⃣ *Não, já tenho* — Instalação R$ 50`
            );
            state.iniciarTimer(deQuem);
            return;
        }

        // ─── roteador ─────────────────────────────────────
        if (etapa === 'roteador') {
            let roteador = null;
            if (['1','sim','quero','preciso','não tenho','nao tenho','80'].some(p => t.includes(p))) {
                roteador = 'Sim — R$80';
            } else if (['2','não','nao','já tenho','ja tenho','50','tenho'].some(p => t.includes(p))) {
                roteador = 'Não — R$50';
            }

            if (!roteador) {
                await client.sendMessage(deQuem, `${P}Vai precisar de roteador?\n\n1️⃣ *Sim* — Instalação R$ 80\n2️⃣ *Não, já tenho* — Instalação R$ 50`);
                state.iniciarTimer(deQuem);
                return;
            }
            
            state.avancar(deQuem, 'nome', { roteador });
            await client.sendMessage(deQuem, `${P}Ótimo! Agora vou precisar de alguns dados para o cadastro. 📋\n\nQual é o seu *nome completo*?`);
            state.iniciarTimer(deQuem);
            return;
        }

        // ─── nome ─────────────────────────────────────────
        if (etapa === 'nome') {
            const nomeLimpo = await utils.extrairNomeDaMensagem(texto);
            
            if (!nomeLimpo) {
                await client.sendMessage(deQuem, `${P}Não consegui identificar seu nome. Pode digitar só o seu nome e sobrenome? 😊`);
                state.iniciarTimer(deQuem);
                return;
            }
            
            state.avancar(deQuem, 'cpf', { nome: nomeLimpo });
            await client.sendMessage(deQuem, `${P}Prazer, ${nomeLimpo.split(' ')[0]}! 😊\n\nAgora preciso do seu *CPF*:`);
            state.iniciarTimer(deQuem);
            return;
        }

        // ─── cpf ──────────────────────────────────────────
        if (etapa === 'cpf') {
            const cpfLimpo = texto.replace(/\D/g, '');
            if (cpfLimpo.length < 11) {
                await client.sendMessage(deQuem, `${P}Preciso do *CPF* completo (11 dígitos). Pode enviar só os números:`);
                state.iniciarTimer(deQuem);
                return;
            }
            
            state.avancar(deQuem, 'endereco', { cpf: cpfLimpo });
            await client.sendMessage(deQuem, `${P}Ótimo! E seu *endereço completo*? 📍\n\n_Rua, número e bairro_`);
            state.iniciarTimer(deQuem);
            return;
        }

        // ─── endereco ─────────────────────────────────────
        if (etapa === 'endereco') {
            if (texto.length < 5) {
                await client.sendMessage(deQuem, `${P}Pode me dizer o endereço completo? 📍\n\n_Rua, número e bairro_`);
                state.iniciarTimer(deQuem);
                return;
            }
            
            state.avancar(deQuem, 'data_vencimento', { endereco: texto });
            await client.sendMessage(deQuem,
                `${P}Ótimo! Agora preciso saber a *data de vencimento* da sua fatura.\n\n` +
                `1️⃣ *Dia 10*\n2️⃣ *Dia 20*\n3️⃣ *Dia 30*\n\n` +
                `_Obs: a fatura é suspensa após 5 dias de atraso._`
            );
            state.iniciarTimer(deQuem);
            return;
        }

        // ─── data_vencimento ──────────────────────────────
        if (etapa === 'data_vencimento') {
            const numVenc = parseInt(texto.replace(/\D/g, ''));
            if (![10, 20, 30].includes(numVenc)) {
                await client.sendMessage(deQuem, `${P}Pode escolher uma das datas disponíveis?\n\n1️⃣ *Dia 10*\n2️⃣ *Dia 20*\n3️⃣ *Dia 30*`);
                state.iniciarTimer(deQuem);
                return;
            }
            
            state.avancar(deQuem, 'disponibilidade', { data_vencimento: numVenc });
            await client.sendMessage(deQuem, `${P}Perfeito, dia *${numVenc}* anotado! 📅\n\nE quais *dias e horários* você tem disponibilidade para receber o técnico?\n\n_Atendemos de segunda a sábado — agendamentos a partir de amanhã_ 😊`);
            state.iniciarTimer(deQuem);
            return;
        }

        // ─── disponibilidade ──────────────────────────────
        if (etapa === 'disponibilidade') {
            if (texto.length < 3) {
                await client.sendMessage(deQuem, `${P}Pode me dizer sua disponibilidade? 😊`);
                state.iniciarTimer(deQuem);
                return;
            }
            
            state.avancar(deQuem, 'aguardando_confirmacao', { disponibilidade: texto });
            
            const d = state.getDados(deQuem);
            await client.sendMessage(deQuem,
                `${P}Ótimo! Vou confirmar seus dados:\n\n` +
                `👤 *Nome:* ${d.nome}\n` +
                `🪪 *CPF:* ${d.cpf}\n` +
                `📍 *Endereço:* ${d.endereco}\n` +
                `📡 *Plano:* ${d.plano}\n` +
                `📶 *Roteador:* ${d.roteador}\n` +
                `📅 *Vencimento:* Todo dia ${d.data_vencimento}\n` +
                `🗓️ *Disponibilidade:* ${d.disponibilidade}\n\n` +
                `Está tudo certo? Digite *sim* para confirmar ou *não* para corrigir`
            );
            state.iniciarTimer(deQuem);
            return;
        }

        // ─── confirmacao ──────────────────────────────────
        if (etapa === 'aguardando_confirmacao') {
            const confirmou = ['sim','s','yes','tá','ta','certo','correto','ok','isso','confirmo','pode'].some(p => t.includes(p));
            const corrigiu = ['não','nao','errado','corrigir','mudar','alterar','errei'].some(p => t.includes(p));

            if (confirmou) {
                // Dados completos
                const dadosSalvar = {
                    nome: dados.nome,
                    cpf: dados.cpf,
                    endereco: dados.endereco,
                    plano: dados.plano,
                    roteador: dados.roteador,
                    data_vencimento: dados.data_vencimento,
                    disponibilidade: dados.disponibilidade,
                    telefone: deQuem.replace('@c.us','').replace(/^55/,''),
                };
                
                dbSalvarNovoCliente(deQuem, dadosSalvar);
                
                // =====================================================
                // AGENDAMENTO DA INSTALAÇÃO
                // =====================================================
                const dias = gerarDiasInstalacao();
                
                if (dias.length === 0) {
                    // Se não tiver dias, cria chamado normal
                    abrirChamadoComMotivo(deQuem, dados.nome, 'Nova instalação (sem data disponível)');
                    
                    const previsao = atendenteDisponivel() ? 'em breve' : proximoAtendimento();
                    await client.sendMessage(deQuem,
                        `${P}Tudo certo, ${dados.nome.split(' ')[0]}! ✅\n\n` +
                        `Seus dados foram registrados. Não conseguimos agendar automaticamente, ` +
                        `mas o atendente entrará em contato *${previsao}* para marcar a instalação.\n\n` +
                        `Bem-vindo à JMENET! 🎉`
                    );
                } else {
                    // Mostra opções de dia para instalação
                    state.avancar(deQuem, 'aguardando_dia_instalacao', { 
                        dadosSalvar,
                        diasDisponiveis: dias 
                    });
                    
                    await client.sendMessage(deQuem, formatarMensagemDiasInstalacao(dias));
                }
                
                dbSalvarHistorico(deQuem, 'assistant', 'Novo cliente cadastrado com sucesso.');
                
            } else if (corrigiu) {
                state.iniciar(deQuem, 'novoCliente', 'plano', {});
                await client.sendMessage(deQuem,
                    `${P}Sem problema! Vamos recomeçar. 😊\n\n` +
                    `Qual plano você prefere?\n\n` +
                    `1️⃣ *Cabo 50MB* — R$ 50/mês\n2️⃣ *Fibra 200MB* — R$ 60/mês`
                );
            } else {
                await client.sendMessage(deQuem, `${P}Os dados estão corretos? Digite *sim* para confirmar ou *não* para corrigir.`);
            }
            state.iniciarTimer(deQuem);
            return;
        }

        // =====================================================
        // AGENDAMENTO DO DIA DA INSTALAÇÃO
        // =====================================================
        if (etapa === 'aguardando_dia_instalacao') {
            const escolha = texto.trim();
            const dias = dados.diasDisponiveis || [];
            
            if (/^[1-5]$/.test(escolha)) {
                const index = parseInt(escolha) - 1;
                if (index >= 0 && index < dias.length) {
                    const diaEscolhido = dias[index];
                    
                    // Agenda a instalação
                    db.prepare(`
                        INSERT INTO instalacoes_agendadas 
                            (numero, nome, data, endereco, status)
                        VALUES (?, ?, ?, ?, 'agendado')
                    `).run(
                        deQuem, 
                        dados.dadosSalvar.nome, 
                        diaEscolhido.dataBanco, 
                        dados.dadosSalvar.endereco
                    );
                    
                    state.encerrarFluxo(deQuem);
                    
                    await client.sendMessage(deQuem,
                        `${P}✅ *Instalação agendada com sucesso!*\n\n` +
                        `📅 *Data:* ${diaEscolhido.label}\n` +
                        `📍 *Endereço:* ${dados.dadosSalvar.endereco}\n\n` +
                        `Nossa equipe estará aí nesse dia. Qualquer dúvida é só chamar! 🚀\n\n` +
                        `Bem-vindo à JMENET! 🎉`
                    );
                    
                    // Notifica administradores
                    for (const adm of ADMINISTRADORES) {
                        client.sendMessage(adm,
                            `📅 *NOVA INSTALAÇÃO AGENDADA*\n\n` +
                            `👤 Cliente: ${dados.dadosSalvar.nome}\n` +
                            `📱 Número: ${deQuem.replace('@c.us', '')}\n` +
                            `📍 Endereço: ${dados.dadosSalvar.endereco}\n` +
                            `📆 Data: ${diaEscolhido.label}\n` +
                            `📦 Plano: ${dados.dadosSalvar.plano}\n` +
                            `📶 Roteador: ${dados.dadosSalvar.roteador}`
                        ).catch(() => {});
                    }
                    
                    dbSalvarHistorico(deQuem, 'assistant', `Instalação agendada para ${diaEscolhido.label}`);
                    return;
                }
            }
            
            await client.sendMessage(deQuem, 
                `${P}Por favor, escolha um número de 1 a ${dias.length} para o dia da instalação.`
            );
            state.iniciarTimer(deQuem);
            return;
        }
    }

    return { iniciar, handle };
};