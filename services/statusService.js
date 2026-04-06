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
 * Calcula o status do cliente baseado no historico_pagamentos.
 *
 * Estratégia: percorre os meses do mais antigo ao mais recente.
 * Se encontra pagamento → passa ao próximo mês.
 * Se encontra pendente → verifica se esse mês já venceu.
 * Se não encontra registro → verifica se o mês já venceu.
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

    // Para um dado mes/ano, verifica se o vencimento já passou
    function jaVenceu(m, y) {
        if (y < anoHoje) return true;
        if (y > anoHoje) return false;
        if (m < mesHoje) return true;
        if (m > mesHoje) return false;
        // Mesmo mês/ano atual
        if (diaVencimento === 30) return diaHoje > 5;
        return diaHoje >= diaVencimento;
    }

    // Calcula atraso para o mes/ano m/y em relação ao mês/ano atual
    function atrasoPara(m, y) {
        // Quantos meses entre m/y e o mesHoje/anoHoje
        const mesesDif = (anoHoje - y) * 12 + (mesHoje - m);
        if (mesesDif <= 0) return 0;
        const ultimoDia = new Date(anoHoje, mesHoje - 1, 0).getDate();
        return (mesesDif - 1) * 30 + (ultimoDia - diaVencimento) + diaHoje;
    }

    // Encontra o mes/ano mais antigo presente no historico
    const chaves = Object.keys(_historico).map(k => k.replace('/', '-'));
    let menorAno = Infinity, menorMes = Infinity;
    chaves.forEach(k => {
        const [m, y] = k.split('-').map(Number);
        if (y < menorAno || (y === menorAno && m < menorMes)) { menorMes = m; menorAno = y; }
    });
    // Se não tem chaves, começa do mes anterior
    if (menorAno === Infinity) {
        menorMes = mesHoje === 1 ? 12 : mesHoje - 1;
        menorAno = mesHoje === 1 ? anoHoje - 1 : anoHoje;
    }

    // Percorre mês a mês a partir do mais antigo
    let m = menorMes, y = menorAno;
    for (let i = 0; i < 14; i++) {
        const mm = String(m).padStart(2, '0');
        const docId = `${mm}-${y}`, chave = `${mm}/${y}`;
        const reg = _historico[docId] || _historico[chave] || null;

        if (!reg) {
            // Sem registro neste mês
            if (jaVenceu(m, y)) {
                if (atrasoPara(m, y) >= 5) return 'inadimplente';
                return 'pendente';
            }
            return 'em_dia';
        }

        if (reg.status === 'pago' || reg.status === 'isento') {
            // Passa ao próximo mês
            m = m === 12 ? 1 : m + 1;
            if (m === 1) y++;
        } else if (reg.status === 'pendente') {
            if (jaVenceu(m, y)) {
                if (atrasoPara(m, y) >= 5) return 'inadimplente';
                return 'pendente';
            }
            return 'pendente';
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