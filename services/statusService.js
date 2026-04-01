// services/statusService.js

function calcularStatusCliente(cliente) {
    const hoje = new Date();
    const vencimento = cliente.dia_vencimento;
    
    // Se não tem vencimento, considera pendente
    if (!vencimento) return 'pendente';
    
    const mesAtual = `${hoje.getMonth() + 1}/${hoje.getFullYear()}`;
    const historico = cliente.historico_pagamentos || {};
    
    // Já pagou este mês?
    if (historico[mesAtual]?.status === 'pago') {
        return 'pago';
    }
    
    // Pagou adiantado (mês que vem)?
    const mesQueVem = `${hoje.getMonth() + 2}/${hoje.getFullYear()}`;
    if (historico[mesQueVem]?.status === 'pago') {
        return 'pago';
    }
    
    // Venceu e não pagou?
    if (hoje.getDate() >= vencimento) {
        return 'pendente';
    }
    
    return 'em_dia';
}

module.exports = { calcularStatusCliente };