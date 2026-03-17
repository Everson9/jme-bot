// services/mensagemService.js
function gerarMensagemCobranca(nome, data, tipo) {
    const saudacao = nome ? `Olá *${nome}*` : 'Olá';
    
    let mensagemBase = '';
    switch(tipo) {
        case 'lembrete':
            mensagemBase = `${saudacao}! Tudo bem por aí? 😊\n\n` +
                `Passando aqui só para lembrar que amanhã, dia *${data}*, vence a sua fatura da JMENET.\n\n` +
                `Queremos que você continue conectado sem interrupções!`;
            break;
        case 'atraso':
            mensagemBase = `${saudacao}! Tudo bem? 😊\n\n` +
                `Identificamos aqui que sua fatura do dia *${data}* está com *3 dias de atraso*.\n\n` +
                `Ainda dá tempo de regularizar e evitar qualquer transtorno. Vamos resolver isso juntos?`;
            break;
        case 'atraso_final':
            mensagemBase = `${saudacao}! 😕\n\n` +
                `Sua fatura do dia *${data}* já está com *5 dias de atraso*.\n\n` +
                `Estamos torcendo para você continuar conosco! 😊 Se precisar de ajuda para pagar, ` +
                `ou se tiver qualquer dificuldade, é só responder essa mensagem que um atendente vai te ajudar.`;
            break;
        case 'reconquista':
            mensagemBase = `${saudacao}! Tudo bem? 😊\n\n` +
                `Sentimos sua falta por aqui! Saudades de ter você como cliente da JMENET.\n\n` +
                `Sua fatura do dia *${data}* ainda está pendente, mas ainda dá tempo de regularizar ` +
                `e continuar conectado. Vamos resolver isso?`;
            break;
        case 'reconquista_final':
            mensagemBase = `${saudacao}! 😢\n\n` +
                `É uma pena ver você indo embora... Sua fatura do dia *${data}* está prestes a ser cancelada.\n\n` +
                `Se mudar de ideia, ainda dá tempo! Basta fazer o pagamento e continuar com a gente.`;
            break;
        default:
            mensagemBase = `${saudacao}! Tudo bem? 😊\n\n` +
                `Sua fatura com vencimento dia *${data}* já está disponível para pagamento.\n\n` +
                `Queremos que você continue conectado sem preocupações!`;
    }
    
    return `🤖 *JMENET TELECOM*\n\n${mensagemBase}\n\n💡 Se quiser *falar com um atendente* agora, é só responder essa mensagem pedindo ajuda!`;
}

async function enviarChavesPix(client, deQuem, nome) {
    const nomeCliente = nome ? nome.split(' ')[0] : '';
    const saudacao = nomeCliente ? `${nomeCliente}, aqui` : 'Aqui';
    
    const mensagemPix = 
        `🤖 *JMENET TELECOM*\n\n` +
        `${saudacao} estão as nossas chaves PIX para pagamento:\n\n` +
        `📱 *Chave 1 (Email):*\n` +
        `jmetelecomnt@gmail.com\n\n` +
        `📲 *Chave 2 (Telefone):*\n` +
        `+55 81 98750-0456\n\n` +
        `💡 *Como pagar:*\n` +
        `1. Abra o app do seu banco\n` +
        `2. Escolha a opção PIX\n` +
        `3. Selecione "PIX copia e cola" ou "Chave PIX"\n` +
        `4. Digite uma das chaves acima\n` +
        `5. Confirme o pagamento\n\n` +
        `⏰ Após o pagamento, sua internet será liberada em até 30 minutos.\n\n` +
        `Precisando de ajuda? É só responder essa mensagem! 😊`;
    
    await client.sendMessage(deQuem, mensagemPix);
    await new Promise(r => setTimeout(r, 1000));
    
    const mensagemApenasChaves = 
        `📋 *CHAVES PIX PARA CÓPIA*\n\n` +
        `📱 *Email:*\n` +
        `jmetelecomnt@gmail.com\n\n` +
        `📲 *Telefone:*\n` +
        `+55 81 98750-0456\n\n` +
        `Basta copiar e colar no seu banco! ✅`;
    
    await client.sendMessage(deQuem, mensagemApenasChaves);
}

module.exports = { gerarMensagemCobranca, enviarChavesPix };