// services/statusService.js

function calcularStatusCliente(cliente) {
    if (!cliente) return 'pendente';

    // Status definidos manualmente — nunca sobrescrever
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

    // Pagou ou está isento no mês atual → pago
    if (historico[mesAtualKey]?.status === 'pago') return 'pago';
    if (historico[mesAtualKey]?.status === 'isento') return 'pago';

    // Janela de cobrança: cliente só vira pendente 2 dias ANTES do vencimento
    // Data 10 → pendente a partir do dia 9
    // Data 20 → pendente a partir do dia 19
    // Data 30 → pendente a partir do dia 29
    if (diaHoje < vencimento - 1) {
        // Ainda dentro do ciclo anterior
        if (historico[mesAnteriorKey]?.status === 'pago') return 'pago';
        if (historico[mesAnteriorKey]?.status === 'isento') return 'pago';
        // Sem histórico mas ainda no ciclo → em_dia (benefício da dúvida)
        return 'em_dia';
    }

    // Entrou na janela de cobrança
    if (historico[mesAtualKey]) return historico[mesAtualKey].status;
    return 'pendente';
}

module.exports = { calcularStatusCliente };