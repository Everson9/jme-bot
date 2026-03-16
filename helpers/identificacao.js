// helpers/identificacao.js
module.exports = function criarIdentificacao(db, state, client, utils, banco, verificarETransferir, processarAposIdentificacao) {
    
    async function handleIdentificacao(deQuem, msg) {
        const etapa = state.getEtapa(deQuem);
        const dados = state.getDados(deQuem);
        const texto = msg.body?.trim() || '';
        
        console.log(`🆔 Fluxo de identificação - etapa: ${etapa}`);
        
        // ─── AGUARDANDO NOME (1ª tentativa) ─────────────────
        if (etapa === 'aguardando_nome') {
            if (!texto || texto.length < 3) {
                await client.sendMessage(deQuem, 
                    `🤖 *Assistente JMENET*\n\n` +
                    `Por favor, me informe o *nome completo do titular* da internet. 😊`
                );
                state.iniciarTimer(deQuem);
                return;
            }
            
            console.log(`📝 Nome informado: "${texto}"`);
            
            const clientes = banco.buscarClientePorNome(texto);
            
            if (clientes.length === 1) {
                console.log(`✅ Cliente encontrado por nome: ${clientes[0].nome}`);
                await processarAposIdentificacao(deQuem, clientes[0].nome, dados.msgOriginal, dados.intencoes);
                return;
            }
            
            if (clientes.length === 0) {
                console.log(`❌ Nenhum cliente encontrado com nome: ${texto}`);
                state.atualizar(deQuem, { 
                    etapa: 'aguardando_cpf',
                    tentativasCpf: 1,
                    nomeTentado: texto
                });
                await client.sendMessage(deQuem, 
                    `🤖 *Assistente JMENET*\n\n` +
                    `Não encontrei *${texto}* na minha base. 😕\n\n` +
                    `Para facilitar a busca, poderia me informar o *CPF* do titular? (apenas números)`
                );
                state.iniciarTimer(deQuem);
                return;
            }
            
            if (clientes.length > 1) {
                console.log(`⚠️ Múltiplos clientes (${clientes.length}) com nome: ${texto}`);
                state.atualizar(deQuem, { 
                    etapa: 'aguardando_cpf',
                    tentativasCpf: 1,
                    nomeTentado: texto,
                    multiplosClientes: clientes
                });
                await client.sendMessage(deQuem, 
                    `🤖 *Assistente JMENET*\n\n` +
                    `Encontrei *${clientes.length}* clientes com esse nome. 😕\n\n` +
                    `Para identificar corretamente, poderia me informar o *CPF* do titular? (apenas números)`
                );
                state.iniciarTimer(deQuem);
                return;
            }
        }
        
        // ─── AGUARDANDO CPF (2ª tentativa) ─────────────────
        if (etapa === 'aguardando_cpf') {
            const cpf = texto.replace(/\D/g, '');
            
            // Validação de tamanho
            if (cpf.length !== 11) {
                const tentativas = (dados.tentativasCpf || 1);
                
                if (tentativas >= 3) {
                    state.atualizar(deQuem, { 
                        etapa: 'aguardando_telefone',
                        tentativasTelefone: 1
                    });
                    await client.sendMessage(deQuem, 
                        `🤖 *Assistente JMENET*\n\n` +
                        `Vamos tentar de outra forma. Poderia me informar o *telefone de contato* do titular? (com DDD, apenas números)`
                    );
                    return;
                }
                
                await client.sendMessage(deQuem, 
                    `🤖 *Assistente JMENET*\n\n` +
                    `CPF deve ter 11 dígitos. Você informou ${cpf.length}. Digite apenas números.`
                );
                state.atualizar(deQuem, { tentativasCpf: tentativas + 1 });
                return;
            }
            
            const cliente = banco.buscarClientePorCPF(cpf);
            
            if (cliente) {
                console.log(`✅ Cliente encontrado por CPF: ${cliente.nome}`);
                await processarAposIdentificacao(deQuem, cliente.nome, dados.msgOriginal, dados.intencoes);
                return;
            }
            
            console.log(`❌ Cliente não encontrado com CPF: ${cpf}`);
            
            state.atualizar(deQuem, { 
                etapa: 'aguardando_telefone',
                tentativasTelefone: 1
            });
            
            await client.sendMessage(deQuem, 
                `🤖 *Assistente JMENET*\n\n` +
                `Não encontrei o CPF na base. 😕\n\n` +
                `Última tentativa: poderia me informar o *telefone de contato* do titular? (com DDD, apenas números)`
            );
            return;
        }
        
        // ─── AGUARDANDO TELEFONE (3ª tentativa) ─────────────────
        if (etapa === 'aguardando_telefone') {
            const telefone = texto.replace(/\D/g, '');
            
            if (telefone.length < 10 || telefone.length > 11) {
                const tentativas = (dados.tentativasTelefone || 1);
                
                if (tentativas >= 2) {
                    await verificarETransferir(deQuem, 'Não identificado após nome, CPF e telefone');
                    return;
                }
                
                await client.sendMessage(deQuem, 
                    `🤖 *Assistente JMENET*\n\n` +
                    `Telefone deve ter 10 ou 11 dígitos (com DDD). Digite apenas números.`
                );
                state.atualizar(deQuem, { tentativasTelefone: tentativas + 1 });
                return;
            }
            
            const cliente = banco.buscarClientePorTelefone(telefone);
            
            if (cliente) {
                console.log(`✅ Cliente encontrado por telefone: ${cliente.nome}`);
                await processarAposIdentificacao(deQuem, cliente.nome, dados.msgOriginal, dados.intencoes);
                return;
            }
            
            console.log(`❌ Cliente não encontrado após TODAS as tentativas`);
            await verificarETransferir(deQuem, 'Não identificado após nome, CPF e telefone');
            return;
        }
    }

    return { handleIdentificacao };
};