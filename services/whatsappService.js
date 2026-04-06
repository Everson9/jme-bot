// services/whatsappService.js
async function enviarMensagemSegura(client, numero, mensagem) {
    try {
        await client.sendMessage(numero, mensagem);
        return { sucesso: true, numero };
    } catch (error) {
        if (error.message?.includes('No LID for user')) {
            const numeroLimpo = numero.replace('@c.us', '').replace(/\D/g, '');
            console.log(`⚠️ Erro de LID para ${numero}, tentando resolver...`);
            try {
                // Tentativa 1: getNumberId com número cru
                let contato = await client.getNumberId(numeroLimpo);
                if (contato?._serialized) {
                    await client.sendMessage(contato._serialized, mensagem);
                    return { sucesso: true, numero: contato._serialized };
                }

                // Tentativa 2: getNumberId com sufixo @c.us
                contato = await client.getNumberId(numeroLimpo + '@c.us');
                if (contato?._serialized) {
                    await client.sendMessage(contato._serialized, mensagem);
                    return { sucesso: true, numero: contato._serialized };
                }

                // Tentativa 3: força cache + delay + retry
                await client.isRegisteredUser(numeroLimpo);
                await new Promise(r => setTimeout(r, 2000));
                contato = await client.getNumberId(numeroLimpo);
                if (contato?._serialized) {
                    await client.sendMessage(contato._serialized, mensagem);
                    return { sucesso: true, numero: contato._serialized };
                }

            } catch (err) {
                console.log(`❌ Falha ao resolver LID: ${err.message}`);
            }
        }
        return { sucesso: false, erro: error.message };
    }
}

module.exports = { enviarMensagemSegura };
