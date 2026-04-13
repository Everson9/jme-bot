// services/mensagemService.js
'use strict';

/**
 * Gera mensagem de cobrança personalizada
 * @param {string} nome - Nome do cliente
 * @param {string} data - Dia do vencimento (10, 20, 30)
 * @param {string} tipo - Tipo da cobrança (lembrete, atraso, etc.)
 * @returns {Object} - { mensagem, pix }
 */
function gerarMensagemCobranca(nome, data, tipo) {
    const TIPO_LABEL = {
        lembrete:          '📅 Lembrete de Vencimento',
        atraso:            '⚠️ Atraso',
        atraso_final:      '🔴 Atraso Final',
        reconquista:       '💙 Reconquista',
        reconquista_final: '💔 Última Chance',
    };

    const label = TIPO_LABEL[tipo] || 'Cobrança';
    const primeiroNome = nome?.split(' ')[0] || 'Cliente';
    
    const mensagem = 
        `Olá ${primeiroNome}!\n\n` +
        `📋 *${label}*\n` +
        `Sua fatura com vencimento dia *${data}* está disponível.\n\n` +
        `💳 *Pague agora:*\n` +
        `Acesse: https://jme.net/pagamento\n\n` +
        `Dúvidas? Responda esta mensagem.`;

    const pix = 
        `💠 *PIX COPIA E COLA*\n\n` +
        `00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-426614174000\n\n` +
        `_Ou escaneie o QR Code no link acima_`;

    return { mensagem, pix };
}

module.exports = { gerarMensagemCobranca };