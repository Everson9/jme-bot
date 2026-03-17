// services/utilsService.js
function horaLocal() {
    const h = new Date().getUTCHours() - 3;
    return h < 0 ? h + 24 : h;
}

function atendenteDisponivel(horarioFuncionamento) {
    if (!horarioFuncionamento.ativo) return true;
    const h = horaLocal();
    const d = new Date().getDay();
    return d >= 1 && d <= 6 && h >= horarioFuncionamento.inicio && h < horarioFuncionamento.fim;
}

function proximoAtendimento(horarioFuncionamento) {
    const h = horaLocal();
    const d = new Date().getDay();
    const ini = horarioFuncionamento.inicio;
    if (d === 0) return `segunda-feira a partir das ${ini}h`;
    if (d === 6 && h >= horarioFuncionamento.fim) return `segunda-feira a partir das ${ini}h`;
    if (h < ini) return `hoje a partir das ${ini}h`;
    return `amanhã a partir das ${ini}h`;
}

function falarSinalAmigavel(situacaoRede, previsaoRetorno) {
    if (situacaoRede === "fibra_rompida") return "🔴 Rompimento de fibra na região.";
    if (situacaoRede === "manutencao") return "🔴 Manutenção programada na rede.";
    if (situacaoRede === "instavel") return "⚠️ Instabilidade técnica no momento.";
    return "🟢 Sinal normal";
}

function redeNormal(situacaoRede) {
    return situacaoRede === "normal";
}

module.exports = { horaLocal, atendenteDisponivel, proximoAtendimento, falarSinalAmigavel, redeNormal };