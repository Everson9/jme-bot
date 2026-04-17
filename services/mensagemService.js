// services/mensagemService.js
'use strict';

/**
 * Gera mensagem de cobrança personalizada por tipo
 * @param {string} nome - Nome do cliente
 * @param {string} data - Dia do vencimento (10, 20, 30)
 * @param {string} tipo - Tipo da cobrança (lembrete, atraso, atraso_final, reconquista, reconquista_final)
 * @param {number} valor - Valor do plano (opcional)
 * @param {string} dataVencimentoReal - Data real de vencimento (ex: 10/04/2026)
 * @returns {Object} - { mensagem, pix, formasPagamento }
 */
function gerarMensagemCobranca(nome, data, tipo, valor = null, dataVencimentoReal = null) {
    const primeiroNome = nome?.split(' ')[0] || 'Cliente';
    const valorFormatado = valor ? `R$ ${valor.toFixed(2)}` : 'R$ 79,90';
    const dataVenc = dataVencimentoReal || `dia ${data}`;
    
    // Branding no topo
    const BRANDING = `🤖 *JMENET TELECOM* 🤖\n\n`;
    
    // Chaves PIX reais
    const CHAVES_PIX = 
        `💳 *FORMAS DE PAGAMENTO - PIX*\n\n` +
        `📧 *E-mail:* \`jmetelecomnt@gmail.com\`\n` +
        `📱 *Telefone:* \`+55 81 98750-0456\`\n\n` +
        `_Copie e cole a chave no seu app bancário_`;
    
    // =====================================================
    // MENSAGENS POR TIPO
    // =====================================================
    
    let mensagem = '';
    
    switch (tipo) {
        case 'lembrete':
            mensagem = 
                `🔔 *LEMBRETE DE VENCIMENTO* 🔔\n\n` +
                `Olá ${primeiroNome}, tudo bem?\n\n` +
                `Amanhã vence sua mensalidade da JMENET TELECOM.\n\n` +
                `📅 *Vencimento:* ${dataVenc}\n` +
                `💰 *Valor:* ${valorFormatado}\n\n` +
                `Para evitar bloqueios, mantenha seu pagamento em dia.\n\n` +
                `Assim que pagar, envie o comprovante aqui mesmo para confirmarmos. 😊`;
            break;
            
        case 'atraso':
            mensagem = 
                `⚠️ *PAGAMENTO ATRASADO* ⚠️\n\n` +
                `Olá ${primeiroNome},\n\n` +
                `Identificamos que sua mensalidade da JMENET TELECOM está atrasada.\n\n` +
                `📅 *Vencimento:* ${dataVenc}\n` +
                `💰 *Valor:* ${valorFormatado}\n` +
                `📆 *Dias em atraso:* 3\n\n` +
                `Seu sinal pode ser reduzido a qualquer momento.\n\n` +
                `Realize o pagamento hoje mesmo e envie o comprovante para regularizarmos.`;
            break;
            
        case 'atraso_final':
            mensagem = 
                `🔴 *PAGAMENTO ATRASADO* -  🔴\n\n` +
                `Olá ${primeiroNome},\n\n` +
                `Sua mensalidade da JMENET TELECOM está com 5 dias de atraso!\n\n` +
                `📅 *Vencimento:* ${dataVenc}\n` +
                `💰 *Valor:* ${valorFormatado}\n` +
                `📆 *Dias em atraso:* 5\n\n` +
                `⚠️ *Seu serviço pode ser BLOQUEADO a qualquer momento!*\n\n` +
                `Envie o comprovante após o pagamento. 🚨`;
            break;
            
        case 'reconquista':
            mensagem = 
                `Olá ${primeiroNome}, sentimos sua falta!\n\n` +
                `Seu serviço foi bloqueado por falta de pagamento.\n\n` +
                `Mas você pode reativar HOJE mesmo!\n\n` +
                `💰 *Valor para reativação:* ${valorFormatado}\n` +
                `📅 *Vencimento original:* ${dataVenc}\n` +
                `📆 *Dias em atraso:* 7\n\n` +
                `Após o pagamento, envie o comprovante e seu serviço voltará em até 1 hora.\n\n` +
                `Aguardamos você de volta! 😊`;
            break;
            
        case 'reconquista_final':
            mensagem = 
                `Olá ${primeiroNome},\n\n` +
                `Esta é sua *ÚLTIMA OPORTUNIDADE* de regularização.\n\n` +
                `Seu serviço da JMENET TELECOM será *CANCELADO PERMANENTEMENTE* se não for pago em 24h.\n\n` +
                `💰 *Valor:* ${valorFormatado}\n` +
                `📅 *Vencimento original:* ${dataVenc}\n` +
                `📆 *Dias em atraso:* 10\n\n` +
                `⚠️ *Após o cancelamento, será necessário nova instalação com taxa!* ⚠️\n\n` +
                `Pague agora e envie o comprovante.`;
            break;
            
        default:
            mensagem = 
                `📋 *COBRANÇA*\n\n` +
                `Olá ${primeiroNome}!\n\n` +
                `Sua fatura da JMENET TELECOM com vencimento dia *${data}* está disponível.\n\n` +
                `Realize o pagamento e envie o comprovante aqui mesmo para confirmarmos.`;
            break;
    }
    
    // Adiciona branding ao final também
    mensagem = BRANDING + mensagem + `\n\n📱 Dúvidas? Responda esta mensagem.`;
    
    // Mensagem separada com as chaves PIX (para fácil cópia)
    const formasPagamento = CHAVES_PIX;
    
    return { mensagem, pix: formasPagamento, formasPagamento };
}

module.exports = { gerarMensagemCobranca };