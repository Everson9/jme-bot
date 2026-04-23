// services/whatsappService.js

// Executa uma promise com timeout. Se demorar mais que ms, rejeita.
function comTimeout(promise, ms = 30000, label = '') {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout (${ms/1000}s)${label ? ': ' + label : ''}`)), ms)
        )
    ]);
}

async function enviarMensagemSegura(client, numero, mensagem) {
    try {
        await comTimeout(client.sendMessage(numero, mensagem), 30000, `sendMessage ${numero}`);
        return { sucesso: true, numero };
    } catch (error) {
        if (error.message?.includes('No LID for user')) {
            const numeroLimpo = numero.replace('@c.us', '').replace(/\D/g, '');
            console.log(`⚠️ Erro de LID para ${numero}, tentando resolver...`);
            try {
                // Tentativa 1: getNumberId com número cru
                let contato = await comTimeout(client.getNumberId(numeroLimpo), 15000, 'getNumberId-1');
                if (contato?._serialized) {
                    await comTimeout(client.sendMessage(contato._serialized, mensagem), 30000, 'sendMessage-retry-1');
                    return { sucesso: true, numero: contato._serialized };
                }

                // Tentativa 2: getNumberId com sufixo @c.us
                contato = await comTimeout(client.getNumberId(numeroLimpo + '@c.us'), 15000, 'getNumberId-2');
                if (contato?._serialized) {
                    await comTimeout(client.sendMessage(contato._serialized, mensagem), 30000, 'sendMessage-retry-2');
                    return { sucesso: true, numero: contato._serialized };
                }

                // Tentativa 3: força cache + delay + retry
                await comTimeout(client.isRegisteredUser(numeroLimpo), 15000, 'isRegisteredUser');
                await new Promise(r => setTimeout(r, 2000));
                contato = await comTimeout(client.getNumberId(numeroLimpo), 15000, 'getNumberId-3');
                if (contato?._serialized) {
                    await comTimeout(client.sendMessage(contato._serialized, mensagem), 30000, 'sendMessage-retry-3');
                    return { sucesso: true, numero: contato._serialized };
                }

            } catch (err) {
                console.log(`❌ Falha ao resolver LID: ${err.message}`);
            }
        }
        return { sucesso: false, erro: error.message };
    }
}

module.exports = { enviarMensagemSegura, comTimeout };