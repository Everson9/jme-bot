// services/statusService.js

function calcularStatusCliente(cliente) {
    if (!cliente) return 'pendente';
    if (cliente.status === 'promessa') return 'promessa';
    if (cliente.status === 'cancelado') return 'cancelado';

    const vencimento = parseInt(cliente.dia_vencimento);
    if (!vencimento) return 'pendente';

    const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const diaHoje = agoraBR.getUTCDate();
    const mesHoje = agoraBR.getUTCMonth() + 1;
    const anoHoje = agoraBR.getUTCFullYear();

    const mesAtualKey = `${String(mesHoje).padStart(2,'0')}-${anoHoje}`;
    const mesAnteriorDate = new Date(anoHoje, mesHoje - 2, 1);
    const mesAnteriorKey = `${String(mesAnteriorDate.getMonth() + 1).padStart(2,'0')}-${mesAnteriorDate.getFullYear()}`;

    const historico = cliente._historico || {};

    if (historico[mesAtualKey]?.status === 'pago') return 'pago';
    if (historico[mesAtualKey]?.status === 'isento') return 'pago';

    const limiteJanela = vencimento - 2;

    if (diaHoje < vencimento) {
        if (historico[mesAnteriorKey]?.status === 'pago') return 'pago';
        if (historico[mesAnteriorKey]?.status === 'isento') return 'pago';
        if (diaHoje <= limiteJanela) return 'em_dia';
        return 'pendente';
    }

    if (historico[mesAtualKey]) return historico[mesAtualKey].status;
    return 'pendente';
}

module.exports = { calcularStatusCliente };