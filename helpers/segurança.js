// helpers/seguranca.js
module.exports = function criarSeguranca(state, firebaseDb, banco, client, ADMINISTRADORES) {
    
    async function verificarETransferir(deQuem, motivo) {
        const erros = state.incrementarErros ? state.incrementarErros(deQuem) : 1;
        
        console.log(`⚠️ Cliente ${deQuem} - Erro ${erros}/5: ${motivo}`);
        
        if (erros >= 5) {
            console.log(`🆘 Transferindo para atendente humano após ${erros} erros`);
            
            if (state.resetarErros) state.resetarErros(deQuem);
            
            state.setAtendimentoHumano(deQuem, true);
            
            // 🔥 FIREBASE: salva atendimento humano
            await firebaseDb.collection('atendimento_humano').doc(deQuem).set({
                numero: deQuem,
                desde: Date.now()
            });
            
            const nome = state.getDados(deQuem)?.nomeCliente || 'não identificado';
            
            // 🔥 FIREBASE: abre chamado
            const chamadoRef = await firebaseDb.collection('chamados').add({
                numero: deQuem,
                nome: nome,
                motivo: `Transferido por erro - ${motivo}`,
                status: 'aberto',
                aberto_em: Date.now(),
                criado_em: new Date().toISOString()
            });
            
            console.log(`✅ Chamado #${chamadoRef.id} aberto para atendente`);
            
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
                await client.sendMessage(adm, 
                    `🆘 *TRANSFERÊNCIA POR ERRO*\n\n` +
                    `Cliente: ${deQuem.replace('@c.us', '')}\n` +
                    `Nome: ${nome}\n` +
                    `Motivo: ${motivo}\n` +
                    `Erros: ${erros}\n` +
                    `Chamado: #${chamadoRef.id}\n` +
                    `Horário: ${new Date().toLocaleString()}`
                ).catch(() => {});
            }
            
            return true;
        }
        
        return false;
    }

    return { verificarETransferir };
};