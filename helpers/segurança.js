// helpers/seguranca.js
module.exports = function criarSeguranca(state, db, client, ADMINISTRADORES) {
    
    async function verificarETransferir(deQuem, motivo) {
        const erros = state.incrementarErros ? state.incrementarErros(deQuem) : 1;
        
        console.log(`⚠️ Cliente ${deQuem} - Erro ${erros}/5: ${motivo}`);
        
        if (erros >= 5) {
            console.log(`🆘 Transferindo para atendente humano após ${erros} erros`);
            
            if (state.resetarErros) state.resetarErros(deQuem);
            
            state.setAtendimentoHumano(deQuem, true);
            db.prepare('INSERT OR REPLACE INTO atendimento_humano (numero, desde) VALUES (?, ?)').run(deQuem, Date.now());
            
            const nome = state.getDados(deQuem)?.nomeCliente || 'não identificado';
            const chamadoId = db.prepare(`
                INSERT INTO chamados (numero, nome, motivo, aberto_em)
                VALUES (?, ?, ?, ?)
            `).run(deQuem, nome, `Transferido por erro - ${motivo}`, Date.now()).lastInsertRowid;
            
            console.log(`✅ Chamado #${chamadoId} aberto para atendente`);
            
            const hora = new Date().getUTCHours() - 3;
            const diaSemana = new Date().getDay();
            const atendenteDisponivel = (diaSemana >= 1 && diaSemana <= 6 && hora >= 8 && hora < 20);
            
            let mensagem = `🤖 *Assistente JMENET*\n\n`;
            
            if (atendenteDisponivel) {
                mensagem += `Estou com dificuldade para entender sua solicitação. `;
                mensagem += `Já transferi para um *atendente humano* que vai te ajudar agora mesmo. 👤\n\n`;
                mensagem += `Aguarde um momento, por favor!`;
            } else {
                mensagem += `Estou com dificuldade para entender sua solicitação. 😕\n\n`;
                mensagem += `No momento não temos atendentes disponíveis (horário de funcionamento: seg-sáb 8h às 20h).\n\n`;
                mensagem += `Um atendente entrará em contato assim que possível no horário comercial. `;
                mensagem += `Enquanto isso, tente digitar de forma mais simples ou ligue para nosso suporte. 📞`;
            }
            
            await client.sendMessage(deQuem, mensagem);
            
            for (const adm of ADMINISTRADORES) {
                client.sendMessage(adm, 
                    `🆘 *TRANSFERÊNCIA POR ERRO*\n\n` +
                    `Cliente: ${deQuem.replace('@c.us', '')}\n` +
                    `Nome: ${nome}\n` +
                    `Motivo: ${motivo}\n` +
                    `Erros: ${erros}\n` +
                    `Chamado: #${chamadoId}\n` +
                    `Horário: ${new Date().toLocaleString()}`
                ).catch(() => {});
            }
            
            return true;
        }
        
        return false;
    }

    return { verificarETransferir };
};