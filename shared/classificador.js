// shared/classificador.js
const { INTENCOES_PRIORIDADE, INTENCAO_LABEL } = require('./constants');

module.exports = function criarClassificador(groqChatFallback) {
    
    // Detecção rápida por palavras-chave (sem IA)
    function detectarIntencaoRapida(texto) {
        const t = texto.toLowerCase();
        
        // Cancelamento
        if (/cancelar|cancela|cancelamento|quero cancelar|quero sair|quero desativar|encerrar contrato/.test(t)) {
            return 'CANCELAMENTO';
        }
        
        // Suporte (palavras-chave)
        const KEYWORDS_SUPORTE = [
            'sem internet','sem sinal','internet caiu','internet caindo','internet lenta',
            'internet devagar','internet travando','internet parou','rede caiu','fibra cortada',
            'sinal fraco','conexão caiu','conexão ruim','não consigo acessar','nao consigo acessar',
            'não entra','nao entra','tá fora','ta fora','tá sem','ta sem','offline','desconectado'
        ];
        if (KEYWORDS_SUPORTE.some(k => t.includes(k))) {
            return 'SUPORTE';
        }
        
        // Promessa
        if (/vou pagar|pago dia|pago amanhã|pago amanha|pago semana|me d[aá] um prazo|n[aã]o consigo pagar/.test(t)) {
            return 'PROMESSA';
        }
        
        // Pix
        if (t.includes('chave pix') || t.includes('quero pagar no pix') || t === 'pix') {
            return 'PIX';
        }
        
        // Boleto
        if (t.includes('boleto') || t.includes('codigo de barras') || t.includes('código de barras')) {
            return 'BOLETO';
        }
        
        // Carnê
        if (t.includes('carnê') || t.includes('carne')) {
            return 'CARNE';
        }
        
        // Dinheiro
        if (t.includes('dinheiro') || t.includes('espécie') || t.includes('especie')) {
            return 'DINHEIRO';
        }
        
        // Novo cliente
        if (t.includes('quero contratar') || t.includes('quero assinar') || t.includes('quero instalar') || 
            t.includes('quero internet') || t.includes('virar cliente')) {
            return 'NOVO_CLIENTE';
        }
        
        // Respostas a cobrança (palavras-chave específicas)
        if (/pode fazer do mesmo|do mesmo jeito|como sempre|mesma forma|sim|ok|pode/.test(t)) {
            return 'RESPOSTA_FINANCEIRA';
        }
        
        // Saudação
        const SAUDACOES = ['oi','olá','ola','bom dia','boa tarde','boa noite','oie','oii'];
        if (SAUDACOES.includes(t.trim())) {
            return 'SAUDACAO';
        }
        
        return null;
    }

    async function classificarIntencaoComIA(texto, historico, fluxoAtual = null) {
        // Pega as últimas 5 mensagens do histórico
        const historicoRecent = historico.slice(-5).map(h => 
            `${h.role === 'user' ? 'Cliente' : 'Bot'}: ${h.content.substring(0, 100)}`
        ).join('\n');

        // Se tem um fluxo ativo, adiciona no prompt
        const contextoFluxo = fluxoAtual ? `O cliente está atualmente no fluxo: ${fluxoAtual}.` : '';

        const prompt = `Você é um classificador de intenções de clientes de um provedor de internet.
Analise a mensagem do cliente e o histórico recente da conversa.

${contextoFluxo}

Histórico recente:
${historicoRecent || 'Nenhum histórico'}

Mensagem atual: "${texto}"

Classifique em UMA das opções abaixo. Responda APENAS com a palavra da opção.

OPÇÕES:
SUPORTE = problema com internet/conexão
FINANCEIRO = dúvidas sobre fatura, vencimento, valor
PROMESSA = avisa que vai pagar em data futura
PIX = quer pagar via pix ou pede chave pix
BOLETO = quer boleto ou código de barras
CARNE = quer carnê físico
DINHEIRO = quer pagar em dinheiro
NOVO_CLIENTE = quer contratar internet
CANCELAMENTO = quer cancelar o serviço
SAUDACAO = só cumprimento, sem assunto
RESPOSTA_FINANCEIRA = resposta a uma cobrança (ex: "pode fazer do mesmo jeito", "sim", "ok", "como sempre")
OUTRO = não se encaixa em nada acima`;

        try {
            const resp = await groqChatFallback([{ role: 'user', content: prompt }], 0.1);
            const intencao = (resp || '').trim().toUpperCase().split(/\s/)[0];
            const validas = ['SUPORTE','FINANCEIRO','PROMESSA','PIX','BOLETO','CARNE','DINHEIRO','NOVO_CLIENTE','CANCELAMENTO','SAUDACAO','RESPOSTA_FINANCEIRA','OUTRO'];
            
            return validas.includes(intencao) ? intencao : 'OUTRO';
        } catch (error) {
            console.error('Erro na classificação com IA:', error);
            return 'OUTRO';
        }
    }

    async function classificarIntencaoUnificada(texto, historico = [], fluxoAtual = null) {
        // 1. Tenta detecção rápida primeiro
        const rapida = detectarIntencaoRapida(texto);
        if (rapida) {
            console.log(`⚡ Classificação rápida: ${rapida} ("${texto.substring(0, 50)}")`);
            return rapida;
        }

        // 2. Se não conseguiu, usa IA com contexto do fluxo
        const intencaoIA = await classificarIntencaoComIA(texto, historico, fluxoAtual);
        console.log(`🧠 Classificação IA: ${intencaoIA} ("${texto.substring(0, 50)}")`);
        
        return intencaoIA;
    }

    return {
        classificarIntencaoUnificada,
        detectarIntencaoRapida,
        classificarIntencaoComIA
    };
};