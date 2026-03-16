// shared/agendamentoConfig.js
module.exports = {
    // Horários de atendimento dos técnicos
    HORARIO_TECNICO: {
        inicio: 8,  // 8h
        fim: 17,    // 17h (5 da tarde)
    },
    
    // Capacidade por período (AJUSTE AQUI!)
    CAPACIDADE: {
        manha: 3,   // 8h-12h: 3 clientes
        tarde: 3,   // 13h-17h: 3 clientes
        // noite: 2  ← Remove noite se técnico não trabalha
    },
    
    // Dias que NÃO trabalha (0 = domingo, 6 = sábado)
    DIAS_BLOQUEADOS: [0], // só domingo
    
    // Pular dias se não houver vaga
    PULAR_DIA_LOTADO: true, // Se true, pula para próximo dia
    
    // Máximo de dias para frente para oferecer
    MAX_DIAS_FRENTE: 14,
    
    // Mínimo de horas de antecedência
    MIN_HORAS_ANTECEDENCIA: 2,
};