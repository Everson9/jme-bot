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
function calcularStatusCliente(cliente, _historico = null) {
    if (!cliente) return 'pendente';

    // Status manuais — nunca sobrescrever
    if (cliente.status === 'cancelado') return 'cancelado';
    if (cliente.status === 'promessa')  return 'promessa';

    const diaVencimento = parseInt(cliente.dia_vencimento);
    if (!diaVencimento) return cliente.status || 'pendente';

    // Sem histórico passado → usa campo status diretamente (cache)
    if (!_historico) return cliente.status || 'pendente';

    const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const diaHoje  = agoraBR.getUTCDate();
    const mesHoje  = agoraBR.getUTCMonth() + 1;
    const anoHoje  = agoraBR.getUTCFullYear();

    // Determina qual foi o vencimento mais recente
    // Para dia 10: antes do 10 → vencimento foi mês anterior; depois → mês atual
    // Para dia 20: antes do 20 → vencimento foi mês anterior; depois → mês atual
    // Para dia 30: antes do 30 → vencimento foi mês anterior
    let mesRefVencido, anoRefVencido;
    if (diaHoje < diaVencimento) {
        // Ainda não venceu este mês → o vencimento é do mês anterior
        mesRefVencido = mesHoje === 1 ? 12 : mesHoje - 1;
        anoRefVencido = mesHoje === 1 ? anoHoje - 1 : anoHoje;
    } else {
        // Já passou do vencimento → vencimento deste mês
        mesRefVencido = mesHoje;
        anoRefVencido = anoHoje;
    }

    const mmV = String(mesRefVencido).padStart(2, '0');
    const docIdVencido = `${mmV}-${anoRefVencido}`;
    const chaveVencido = `${mmV}/${anoRefVencido}`;

    // Dias de atraso
    let diasAtraso = 0;
    if (diaHoje >= diaVencimento) {
        diasAtraso = diaHoje - diaVencimento;
    } else {
        const ultimoDiaMesAnterior = new Date(anoHoje, mesHoje - 1, 0).getDate();
        diasAtraso = (ultimoDiaMesAnterior - diaVencimento) + diaHoje;
    }
    if (diasAtraso < 0) diasAtraso = 0;

    // 1. Verifica o registro do vencimento mais recente
    const regVencido = _historico[docIdVencido] || _historico[chaveVencido] || null;

    if (regVencido) {
        if (regVencido.status === 'pago' || regVencido.status === 'isento') {
            // Pago no vencimento → verifica se JÁ TEM registro do PRÓXIMO ciclo
            let proxMes = mesRefVencido === 12 ? 1 : mesRefVencido + 1;
            let proxAno = mesRefVencido === 12 ? anoRefVencido + 1 : anoRefVencido;
            const mmP = String(proxMes).padStart(2, '0');
            const regProx = _historico[`${mmP}-${proxAno}`] || _historico[`${mmP}/${proxAno}`] || null;
            if (regProx) {
                if (regProx.status === 'pago' || regProx.status === 'isento') return 'pago';
                if (regProx.status === 'pendente' && diasAtraso >= 5) return 'inadimplente';
                return regProx.status || 'pendente';
            }
            // Sem registro próximo → ainda em dia (próximo vencimento não chegou)
            return 'em_dia';
        }
        // Vencimento recente pendente ou promise
        if (regVencido.status === 'pendente' && diasAtraso >= 5) return 'inadimplente';
        return regVencido.status || 'pendente';
    }

    // Sem registro do vencido → inadimplente se passou 5+ dias
    if (diasAtraso >= 5) return 'inadimplente';

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