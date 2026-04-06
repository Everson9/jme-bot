// services/statusService.js
// Fonte de verdade: historico_pagamentos (subcoleção no Firebase)
// O campo status no documento do cliente é cache — atualizado ao dar/reverter baixa

/**
 * Retorna o ciclo de referência atual para um dado vencimento.
 *
 * Ciclos:
 *   Data 10 → vence dia 10, tolerância até dia 15
 *             ciclo de referência = mês atual
 *   Data 20 → vence dia 20, tolerância até dia 25
 *             ciclo de referência = mês atual
 *   Data 30 → vence dia 30, tolerância até dia 4/5 do mês seguinte
 *             se hoje é dia 1-5 → ainda no ciclo do mês ANTERIOR
 *             se hoje é dia 6+ → ciclo do mês atual
 *
 * Retorna { mesRef, anoRef, chave: "MM/YYYY", docId: "MM-YYYY" }
 */
function getCicloAtual(diaVencimento, hoje = new Date()) {
    const agoraBR = new Date(hoje.getTime() - 3 * 60 * 60 * 1000);
    const diaHoje  = agoraBR.getUTCDate();
    const mesHoje  = agoraBR.getUTCMonth() + 1;
    const anoHoje  = agoraBR.getUTCFullYear();

    let mesRef = mesHoje;
    let anoRef = anoHoje;

    if (diaVencimento === 30 && diaHoje <= 5) {
        // Vence dia 30 com tolerância até dia 5 — se hoje é 1-5, ainda no ciclo anterior
        mesRef = mesHoje === 1 ? 12 : mesHoje - 1;
        anoRef = mesHoje === 1 ? anoHoje - 1 : anoHoje;
    } else if (diaVencimento === 10 && diaHoje < 10) {
        // Antes do vencimento 10 — ciclo do mês anterior
        mesRef = mesHoje === 1 ? 12 : mesHoje - 1;
        anoRef = mesHoje === 1 ? anoHoje - 1 : anoHoje;
    } else if (diaVencimento === 20 && diaHoje < 20) {
        // Antes do vencimento 20 — ciclo do mês anterior
        mesRef = mesHoje === 1 ? 12 : mesHoje - 1;
        anoRef = mesHoje === 1 ? anoHoje - 1 : anoHoje;
    }

    const mm = String(mesRef).padStart(2, '0');
    return {
        mesRef,
        anoRef,
        chave: `${mm}/${anoRef}`,
        docId: `${mm}-${anoRef}`,
    };
}

/**
 * Calcula o status do cliente.
 *
 * Se _historico for passado (objeto { "MM-YYYY": { status, ... } }),
 * usa o registro do ciclo atual para determinar o status.
 *
 * Se _historico for null/undefined, retorna o campo status do Firebase
 * (usado na listagem geral para evitar leituras excessivas).
 *
 * Retorna: 'pago' | 'pendente' | 'em_dia' | 'promessa' | 'cancelado'
 */
/**
 * Calcula dias de atraso considerando rollover de mês.
 * Para dia 30: se diaHoje < diaVencimento, assume que o vencimento foi no último mês.
 */
function calcularAtraso(diaVencimento, diaHoje, mesHoje, anoHoje) {
    let atraso;
    if (diaHoje >= diaVencimento) {
        atraso = diaHoje - diaVencimento;
    } else {
        // Rollover — o vencimento foi no mês anterior
        const ultimoDiaMesAnterior = new Date(anoHoje, mesHoje - 1, 0).getDate();
        atraso = (ultimoDiaMesAnterior - diaVencimento) + diaHoje;
    }
    return atraso < 0 ? 0 : atraso;
}

function calcularStatusCliente(cliente, _historico = null) {
    if (!cliente) return 'pendente';

    // Status manuais — nunca sobrescrever
    if (cliente.status === 'cancelado') return 'cancelado';
    if (cliente.status === 'promessa')  return 'promessa';

    const diaVencimento = parseInt(cliente.dia_vencimento);
    if (!diaVencimento) return cliente.status || 'pendente';

    // Sem histórico passado → usa campo status diretamente (cache)
    if (!_historico) return cliente.status || 'pendente';

    const ciclo = getCicloAtual(diaVencimento);
    const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const diaHoje  = agoraBR.getUTCDate();
    const mesHoje  = agoraBR.getUTCMonth() + 1;
    const anoHoje  = agoraBR.getUTCFullYear();
    const atraso   = calcularAtraso(diaVencimento, diaHoje, mesHoje, anoHoje);

    // Tenta localizar o registro pelo docId ("MM-YYYY") ou chave ("MM/YYYY")
    const reg = _historico[ciclo.docId] || _historico[ciclo.chave] || null;

    if (reg) {
        if (reg.status === 'pago' || reg.status === 'isento') return 'pago';
        // Se pendente e já passou 5+ dias do vencimento → inadimplente
        if (reg.status === 'pendente' && atraso >= 5) return 'inadimplente';
        return reg.status || 'pendente';
    }

    // Sem registro no ciclo atual — verifica se ainda não venceu
    if (diaVencimento === 10 && diaHoje < 10) return 'em_dia';
    if (diaVencimento === 20 && diaHoje < 20) return 'em_dia';
    if (diaVencimento === 30) {
        if (diaHoje <= 5) return 'em_dia'; // tolerância
    }

    // Vencido e sem registro
    if (atraso >= 5) return 'inadimplente';

    return 'pendente';
}

/**
 * Retorna true se o cliente deve ser cobrado no ciclo atual.
 * Usado pela cobrança automática — verifica o histórico, não o campo status.
 *
 * @param {Object} cliente         - Documento do cliente
 * @param {Object|null} registro   - Registro do historico_pagamentos do ciclo atual (ou null)
 */
function deveSerCobrado(cliente, registro) {
    if (cliente.status === 'cancelado') return false;
    if (!registro) return true; // sem registro → deve cobrar
    if (registro.status === 'pago')   return false;
    if (registro.status === 'isento') return false;
    return true;
}

module.exports = { calcularStatusCliente, getCicloAtual, deveSerCobrado };