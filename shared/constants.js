// shared/constants.js
module.exports = {
    // Palavras que NÃO são nomes
    NAO_NOMES: new Set([
        'sim','nao','não','ok','ola','olá','oi','tudo','bom','boa',
        'pode','posso','claro','certo','isso','opa','obrigado','obrigada',
        'entendi','combinado','perfeito','pagar','pago','pagamento'
    ]),
    
    // Prioridade das intenções
    INTENCOES_PRIORIDADE: {
        'CANCELAMENTO': 100,
        'SUPORTE': 90,
        'PROMESSA': 80,
        'FINANCEIRO': 70,
        'RESPOSTA_FINANCEIRA': 65,
        'PIX': 60,
        'BOLETO': 50,
        'CARNE': 40,
        'DINHEIRO': 30,
        'NOVO_CLIENTE': 20,
        'SAUDACAO': 10,
        'OUTRO': 0
    },
    
    // Cores e labels para o frontend
    INTENCAO_LABEL: {
        SUPORTE: { label: "Suporte", cor: "#ef4444", emoji: "🔧" },
        FINANCEIRO: { label: "Financeiro", cor: "#f59e0b", emoji: "💰" },
        RESPOSTA_FINANCEIRA: { label: "Resp. Financeira", cor: "#f59e0b", emoji: "💬" },
        PIX: { label: "Pix", cor: "#10b981", emoji: "💸" },
        BOLETO: { label: "Boleto", cor: "#3b82f6", emoji: "📄" },
        CARNE: { label: "Carnê", cor: "#8b5cf6", emoji: "📋" },
        DINHEIRO: { label: "Dinheiro", cor: "#f97316", emoji: "💵" },
        PROMESSA: { label: "Promessa", cor: "#ec4899", emoji: "🤝" },
        NOVO_CLIENTE: { label: "Novo Cliente", cor: "#06b6d4", emoji: "👤" },
        CANCELAMENTO: { label: "Cancelamento", cor: "#ef4444", emoji: "❌" },
        SAUDACAO: { label: "Saudação", cor: "#6b7280", emoji: "👋" },
        OUTRO: { label: "Outro", cor: "#4b5563", emoji: "💬" }
    }
};