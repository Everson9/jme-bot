// services/mensagemService.js

// 🔥 NOVO: Constantes com dados do PIX
const NOME_TITULAR_PIX = "ERIVALDO CLEMENTINO DA SILVA";
const CHAVE_EMAIL = "jmetelecomnt@gmail.com";
const CHAVE_TELEFONE = "+55 81 98750-0456";

function gerarMensagemCobranca(nome, data, tipo) {
    const prNome = nome ? nome.split(' ')[0] : null;
    const oi = prNome ? `Oi *${prNome}*` : 'Oi';

    // Bloco PIX embutido — direto e fácil de copiar
    const bloco_pix = 
        `💳 *Chave PIX:*\n` +
        `${CHAVE_EMAIL}\n` +
        `ou ${CHAVE_TELEFONE}\n` +
        `👤 *Titular:* ${NOME_TITULAR_PIX}`;

    let corpo = '';
    switch(tipo) {
        case 'lembrete':
            corpo = `${oi}! 😊 Só lembrando que amanhã, dia *${data}*, vence sua mensalidade da JMENET.\n\n` +
                    `Pode pagar via PIX na hora:\n\n${bloco_pix}\n\n` +
                    `Após o pagamento, pode mandar o comprovante aqui que a gente dá baixa! ✅`;
            break;
        case 'atraso':
            corpo = `${oi}! Sua mensalidade do dia *${data}* está com *3 dias de atraso*. 😕\n\n` +
                    `Ainda dá tempo de resolver — é só fazer o PIX:\n\n${bloco_pix}\n\n` +
                    `Mande o comprovante aqui e a gente libera na hora! 😊`;
            break;
        case 'atraso_final':
            corpo = `${oi}! Sua mensalidade do dia *${data}* está com *5 dias de atraso*. 😟\n\n` +
                    `Quer resolver agora? PIX:\n\n${bloco_pix}\n\n` +
                    `Qualquer dificuldade é só responder aqui, a gente ajuda!`;
            break;
        case 'reconquista':
            corpo = `${oi}! 😊 Sentimos sua falta! A mensalidade do dia *${data}* ainda está em aberto.\n\n` +
                    `Bora resolver? PIX:\n\n${bloco_pix}\n\n` +
                    `Manda o comprovante aqui quando pagar! ✅`;
            break;
        case 'reconquista_final':
            corpo = `${oi}! A mensalidade do dia *${data}* ainda está pendente e o serviço pode ser cancelado. 😢\n\n` +
                    `Se quiser continuar com a gente, é só pagar via PIX:\n\n${bloco_pix}\n\n` +
                    `Qualquer dúvida é só chamar!`;
            break;
        default:
            corpo = `${oi}! 😊 Sua mensalidade com vencimento dia *${data}* está disponível para pagamento.\n\n` +
                    `PIX:\n\n${bloco_pix}\n\n` +
                    `Mande o comprovante aqui quando pagar! ✅`;
    }

    return `🤖 *JMENET TELECOM*\n\n${corpo}`;
}

async function enviarChavesPix(client, deQuem, nome) {
    // Chamada após cobrança — cobrança já inclui PIX, então só envia 1 mensagem de cópia rápida
    const msg =
        `📋 *Copie a chave PIX:*\n\n` +
        `📧 ${CHAVE_EMAIL}\n` +
        `📱 ${CHAVE_TELEFONE}\n` +
        `👤 *Titular:* ${NOME_TITULAR_PIX}`;

    await client.sendMessage(deQuem, msg);
}

// 🔥 NOVA FUNÇÃO: Detecta se cliente perguntou sobre PIX e responde
async function responderPerguntaPix(client, deQuem, pergunta, nomeCliente = null) {
    const perguntaLower = pergunta.toLowerCase();
    
    // Palavras-chave que indicam pergunta sobre PIX
    const palavrasChave = [
        'pix', 'chave', 'transferência', 'transferencia', 
        'depositar', 'depósito', 'deposito', 'qual o pix',
        'qual pix', 'qual a chave', 'email para pix', 
        'telefone para pix', 'pagamento', 'pagar'
    ];
    
    const detectouPix = palavrasChave.some(palavra => perguntaLower.includes(palavra));
    
    if (!detectouPix) {
        return false; // Não é pergunta sobre PIX
    }
    
    // Se detectou, envia as chaves com o nome do titular
    const saudacao = nomeCliente ? `${nomeCliente.split(' ')[0]}, ` : '';
    
    const mensagem = 
        `🤖 *Assistente JMENET*\n\n` +
        `${saudacao}claro! Aqui estão as informações para pagamento via PIX:\n\n` +
        `📱 *Email:*\n${CHAVE_EMAIL}\n\n` +
        `📲 *Telefone:*\n${CHAVE_TELEFONE}\n\n` +
        `👤 *Titular:* ${NOME_TITULAR_PIX}\n\n` +
        `💰 *Valor:* Consulte sua fatura\n\n` +
        `Após o pagamento, envie o *comprovante* aqui para confirmarmos! ✅`;
    
    await client.sendMessage(deQuem, mensagem);
    return true; // Respondeu
}

module.exports = { 
    gerarMensagemCobranca, 
    enviarChavesPix,
    responderPerguntaPix  // 🔥 Exporta a nova função
};