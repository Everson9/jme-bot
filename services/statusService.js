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
    if (cliente.status === 'cancelado') return 'cancelado';
    if (cliente.status === 'promessa')  return 'promessa';

    const diaVencimento = parseInt(cliente.dia_vencimento);
    if (!diaVencimento) return cliente.status || 'pendente';
    if (!_historico) return cliente.status || 'pendente';

    const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const diaHoje  = agoraBR.getUTCDate();
    const mesHoje  = agoraBR.getUTCMonth() + 1;
    const anoHoje  = agoraBR.getUTCFullYear();

    // Mês de referência: se ainda não venceu neste mês, usa o anterior
    let mRef, yRef;
    if (diaHoje < diaVencimento) {
        mRef = mesHoje === 1 ? 12 : mesHoje - 1;
        yRef = mesHoje === 1 ? anoHoje - 1 : anoHoje;
    } else {
        mRef = mesHoje;
        yRef = anoHoje;
    }

    // Percorre os meses a partir do mês de referência
    let m = mRef, y = yRef;
    for (let i = 0; i < 13; i++) {
        const mm = String(m).padStart(2, '0');
        const docId = `${mm}-${y}`;
        const chave = `${mm}/${y}`;
        const reg = _historico[docId] || _historico[chave] || null;

        if (!reg) {
            // Sem registro neste mês — calcula se já venceu
            if (m === mesHoje && y === anoHoje) {
                // É o mês/ano atual
                if (diaHoje >= diaVencimento) return 'pendente';
                return 'em_dia';
            }
            // Mês passado sem registro → inadimplente
            return 'inadimplente';
        }

        if (reg.status === 'pago' || reg.status === 'isento') {
            // Passa para o próximo mês
            m = m === 12 ? 1 : m + 1;
            if (m === 1) y++;
        } else if (reg.status === 'pendente') {
            // Pendente — verifica se é o mês/ano atual e se já venceu
            if (m === mesHoje && y === anoHoje) {
                // Vencimento atual
                if (diaHoje >= diaVencimento && (diaHoje - diaVencimento) >= 5) return 'inadimplente';
                return 'pendente';
            }
            // Mês passado, pendente → inadimplente
            return 'inadimplente';
        } else if (reg.status === 'promessa') {
            return 'promessa';
        } else {
            return reg.status || 'pendente';
        }
    }

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