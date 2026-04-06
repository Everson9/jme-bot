// services/statusService.js
// =====================================================
// 3 funções separadas por dia de vencimento
// Cada uma com sua lógica isolada para não vazar estado
// =====================================================

// =====================================================
// Ciclo 10 — Vence dia 10, tolerância até dia 15
// Dia  1-15 → ciclo mês anterior (último venc foi dia 10 do mês passado)
// Dia 16+   → ciclo mês atual (último vencimento foi dia 10 deste mês)
// =====================================================
function _ciclo10(hojeBr) {
    const diaHoje  = hojeBr.getUTCDate();
    const mesHoje  = hojeBr.getUTCMonth() + 1;
    const anoHoje  = hojeBr.getUTCFullYear();
    const mesAnt = mesHoje === 1 ? 12 : mesHoje - 1;
    const anoAnt = mesHoje === 1 ? anoHoje - 1 : anoHoje;

    let mesRef, anoRef;
    if (diaHoje > 15) {
        mesRef = mesHoje; anoRef = anoHoje;
    } else {
        mesRef = mesAnt; anoRef = anoAnt;
    }
    const mm = String(mesRef).padStart(2, '0');
    return { mesRef, anoRef, chave: `${mm}/${anoRef}`, docId: `${mm}-${anoRef}` };
}

function _status10(hojeBr, reg) {
    const diaHoje = hojeBr.getUTCDate();
    if (reg) {
        if (reg.status === 'pago' || reg.status === 'isento') return 'pago';
        // Registro pendente mas já passou da tolerância → inadimplente
        if (diaHoje > 15) return 'inadimplente';
        return reg.status || 'pendente';
    }
    if (diaHoje > 15) return 'inadimplente';
    return 'em_dia';
}

// =====================================================
// Ciclo 20 — Vence dia 20, tolerância até dia 25
// Dia  1-25 → ciclo mês anterior (último venc foi dia 20 do mês passado)
// Dia 26+   → ciclo mês atual (último vencimento foi dia 20 deste mês)
// =====================================================
function _ciclo20(hojeBr) {
    const diaHoje  = hojeBr.getUTCDate();
    const mesHoje  = hojeBr.getUTCMonth() + 1;
    const anoHoje  = hojeBr.getUTCFullYear();
    const mesAnt = mesHoje === 1 ? 12 : mesHoje - 1;
    const anoAnt = mesHoje === 1 ? anoHoje - 1 : anoHoje;

    let mesRef, anoRef;
    if (diaHoje > 25) {
        mesRef = mesHoje; anoRef = anoHoje;
    } else {
        mesRef = mesAnt; anoRef = anoAnt;
    }
    const mm = String(mesRef).padStart(2, '0');
    return { mesRef, anoRef, chave: `${mm}/${anoRef}`, docId: `${mm}-${anoRef}` };
}

function _status20(hojeBr, reg) {
    const diaHoje = hojeBr.getUTCDate();
    if (reg) {
        if (reg.status === 'pago' || reg.status === 'isento') return 'pago';
        if (diaHoje > 25) return 'inadimplente';
        return reg.status || 'pendente';
    }
    if (diaHoje > 25) return 'inadimplente';
    return 'em_dia';
}

// =====================================================
// Ciclo 30 — Vence dia 30, tolerância até dia 5 do seguinte
// Dia 1-5   → ciclo mês anterior (último venc foi dia 30 do mês passado)
// Dia 6-30 → ciclo mês atual (último venc foi dia 30 deste mês)
//
// Ex: 06/04 → ciclo é mês ANTERIOR ao de referência
// Mas como em 06/04 o diaHoje <= 5 é false e diaHoje < 30
// → entra no "mês atual" que é abril, e o registro é de 30/03 = 03-2026
//
// PAREI — lógica tava errada. Vou repensar o ciclo 30:
// "30/03" → docId = "03-2026" (mês da referência 30/03)
// Então em 06/04, deveria buscar "03-2026" (março = anterior)
// Mas em 06/05 deveria buscar "04-2026" (abril = anterior)
// Em 30/05 deveria buscar "05-2026" (maio = atual, pois é o venc atual)
// =====================================================
function _ciclo30(hojeBr) {
    const diaHoje  = hojeBr.getUTCDate();
    const mesHoje  = hojeBr.getUTCMonth() + 1;
    const anoHoje  = hojeBr.getUTCFullYear();
    const mesAnt = mesHoje === 1 ? 12 : mesHoje - 1;
    const anoAnt = mesHoje === 1 ? anoHoje - 1 : anoHoje;

    let mesRef, anoRef;
    if (diaHoje >= 30) {
        // É o dia do vencimento → registro é de 30/este mês
        mesRef = mesHoje; anoRef = anoHoje;
    } else {
        // Ainda não é dia 30 → último venc foi 30 do mês anterior
        mesRef = mesAnt; anoRef = anoAnt;
    }
    const mm = String(mesRef).padStart(2, '0');
    return { mesRef, anoRef, chave: `${mm}/${anoRef}`, docId: `${mm}-${anoRef}` };
}

function _status30(hojeBr, reg) {
    const diaHoje = hojeBr.getUTCDate();
    if (reg) {
        if (reg.status === 'pago' || reg.status === 'isento') return 'pago';
        if (diaHoje > 5) return 'inadimplente';
        return reg.status || 'pendente';
    }
    if (diaHoje > 5 && diaHoje < 30) return 'inadimplente';
    return 'em_dia';
}

// =====================================================
// API pública
// =====================================================

function getCicloAtual(diaVencimento, hoje = new Date()) {
    const agoraBR = new Date(hoje.getTime() - 3 * 60 * 60 * 1000);
    switch (diaVencimento) {
        case 10: return _ciclo10(agoraBR);
        case 20: return _ciclo20(agoraBR);
        case 30: return _ciclo30(agoraBR);
        default: return _ciclo10(agoraBR);
    }
}

function calcularStatusCliente(cliente, _historico = null) {
    if (!cliente) return 'pendente';
    if (cliente.status === 'cancelado') return 'cancelado';
    if (cliente.status === 'promessa')  return 'promessa';

    const diaVencimento = parseInt(cliente.dia_vencimento);
    if (!diaVencimento) return cliente.status || 'pendente';
    if (!_historico) return cliente.status || 'pendente';

    const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);

    let reg;
    switch (diaVencimento) {
        case 10: {
            const ciclo = _ciclo10(agoraBR);
            reg = _historico[ciclo.docId] || _historico[ciclo.chave] || null;
            return _status10(agoraBR, reg);
        }
        case 20: {
            const ciclo = _ciclo20(agoraBR);
            reg = _historico[ciclo.docId] || _historico[ciclo.chave] || null;
            return _status20(agoraBR, reg);
        }
        case 30: {
            const ciclo = _ciclo30(agoraBR);
            reg = _historico[ciclo.docId] || _historico[ciclo.chave] || null;
            return _status30(agoraBR, reg);
        }
        default: {
            const ciclo = _ciclo10(agoraBR);
            reg = _historico[ciclo.docId] || _historico[ciclo.chave] || null;
            return _status10(agoraBR, reg);
        }
    }
}

function deveSerCobrado(cliente, registro) {
    if (cliente.status === 'cancelado') return false;
    if (cliente.status === 'promessa')  return false;
    if (!registro) return true;
    if (registro.status === 'pago')   return false;
    if (registro.status === 'isento') return false;
    return true;
}

module.exports = { calcularStatusCliente, getCicloAtual, deveSerCobrado };
