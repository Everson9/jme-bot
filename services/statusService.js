// services/statusService.js

function calcularStatusCliente(cliente) {
    if (!cliente) return 'pendente';

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

    // Pagou ou está isento no mês atual → pago
    if (historico[mesAtualKey]?.status === 'pago') return 'pago';
    if (historico[mesAtualKey]?.status === 'isento') return 'pago';

    // Janela de graça: 2 dias antes do próximo vencimento
    // Data 10 → cobra a partir do dia 9  (janela até dia 8)
    // Data 20 → cobra a partir do dia 19 (janela até dia 18)
    // Data 30 → cobra a partir do dia 29 (janela até dia 28)
    const limiteJanela = vencimento - 2;

    if (diaHoje < vencimento) {
        // Ainda não chegou o vencimento deste mês
        // Verifica se pagou o mês anterior (ainda está na janela de graça do ciclo anterior)
        if (historico[mesAnteriorKey]?.status === 'pago') return 'pago';
        if (historico[mesAnteriorKey]?.status === 'isento') return 'pago';
        // Dentro da janela de graça (ex: dia 5, vencimento 10, limite 8 → em_dia)
        if (diaHoje <= limiteJanela) return 'em_dia';
        // Passou da janela mas ainda não venceu → já considera pendente para cobrar
        return 'pendente';
    }

    // Passou do vencimento — se tem registro no mês atual usa ele, senão pendente
    if (historico[mesAtualKey]) return historico[mesAtualKey].status;
    return 'pendente';
}

module.exports = { calcularStatusCliente };