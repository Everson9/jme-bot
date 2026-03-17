// services/whatsappService.js
async function enviarMensagemSegura(client, numero, mensagem) {
    try {
        await client.sendMessage(numero, mensagem);
        return { sucesso: true, numero };
    } catch (error) {
        if (error.message?.includes('No LID for user')) {
            console.log(`⚠️ Erro de LID para ${numero}, tentando resolver...`);
            try {
                const numeroLimpo = numero.replace('@c.us', '');
                const contato = await client.getNumberId(numeroLimpo);
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