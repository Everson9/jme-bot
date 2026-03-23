// services/mensagemService.js

// 🔥 NOVO: Constantes com dados do PIX
const NOME_TITULAR_PIX = "ERIVALDO CLEMENTINO DA SILVA";
const CHAVE_EMAIL = "jmetelecomnt@gmail.com";
const CHAVE_TELEFONE = "+55 81 98750-0456";

// Retorna { mensagem, pix } — dois textos separados para envio em sequência
function gerarMensagemCobranca(nome, data, tipo) {
    const prNome = nome ? nome.split(' ')[0] : null;
    const oi = prNome ? `Oi *${prNome}*` : 'Oi';

    // Mensagem PIX separada — mais fácil de copiar
    const pix =
        `💳 *Chave PIX para pagamento:*\n\n` +
        `📧 ${CHAVE_EMAIL}\n` +
        `📱 ${CHAVE_TELEFONE}\n\n` +
        `👤 *Titular:* ${NOME_TITULAR_PIX}\n\n` +
        `_Após pagar, mande o comprovante aqui! ✅_`;

    let corpo = '';
    switch(tipo) {
        case 'lembrete':
            corpo = `${oi}! 😊 Só um lembrete: amanhã, dia *${data}*, vence sua mensalidade da JMENET.\n\n` +
                    `Pague com antecedência e evite atrasos! A chave PIX está logo abaixo. 👇`;
            break;
        case 'atraso':
            // D+3 — cliente NÃO está suspenso ainda
            corpo = `${oi}! Sua mensalidade do dia *${data}* está com *3 dias de atraso*. 😕\n\n` +
                    `Ainda dá tempo de regularizar antes de qualquer suspensão. A chave PIX está logo abaixo. 👇`;
            break;
        case 'atraso_final':
            // D+5 — cliente NÃO está suspenso ainda
            corpo = `${oi}! Sua mensalidade do dia *${data}* está com *5 dias de atraso*. 😟\n\n` +
                    `Por favor, regularize o quanto antes para evitar a suspensão do serviço. A chave PIX está logo abaixo. 👇`;
            break;
        case 'reconquista':
            // D+7 — aviso sério
            corpo = `${oi}! A mensalidade do dia *${data}* ainda está em aberto — já são *7 dias*. 😔\n\n` +
                    `Evite a suspensão do serviço. A chave PIX está logo abaixo. 👇`;
            break;
        case 'reconquista_final':
            // D+10 — última chance antes do bloqueio
            corpo = `${oi}! Última chance: a mensalidade do dia *${data}* está com *10 dias de atraso*. ⚠️\n\n` +
                    `Após esse aviso, o serviço poderá ser suspenso. A chave PIX está logo abaixo. 👇`;
            break;
        default:
            corpo = `${oi}! 😊 Sua mensalidade com vencimento dia *${data}* está disponível para pagamento.\n\nA chave PIX está logo abaixo. 👇`;
    }

    return {
        mensagem: `🤖 *JMENET TELECOM*\n\n${corpo}`,
        pix
    };
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