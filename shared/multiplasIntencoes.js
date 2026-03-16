// shared/multiplasIntencoes.js
module.exports = function criarDetectorMultiplas(groqChatFallback) {
    
    function detectarPorPalavrasChave(texto) {
        const t = texto.toLowerCase();
        const intencoes = [];
        
        const regras = [
            { 
                palavras: [
                    'sem net', 'internet caiu', 'sem sinal', 'wifi', 'conexão', 
                    'caiu a net', 'sem internet', 'internet lenta', 'internet caindo',
                    'sem net', 'caiu', 'sinal', 'não funciona', 'nao funciona',
                    'não conecta', 'nao conecta', 'offline', 'desconectado',
                    'parou de funcionar', 'não abre', 'nao abre', 'lenta', 'travando',
                    'instável', 'instavel', 'oscilando', 'caindo toda hora'
                ], 
                intencao: 'SUPORTE' 
            },
            { 
                palavras: [
                    'pagar', 'pagamento', 'fatura', 'boleto', 'pix', 'mensalidade',
                    'quanto devo', 'quanto tá minha conta', 'valor', 'dinheiro',
                    'quanto é', 'quanto é mesmo', 'qual o valor', 'minha conta',
                    'devo', 'estou devendo', 'meu débito', 'meu saldo',
                    'pagar fatura', 'pagar conta', 'quitado', 'pago'
                ], 
                intencao: 'FINANCEIRO' 
            },
            { 
                palavras: [
                    'dia ', 'pago dia', 'vou pagar', 'promessa', 'acerto',
                    'vou pagar dia', 'pago amanhã', 'pago semana que vem',
                    'entre dia', 'dia 20', 'dia 25', '20 a 25', 'pagar entre',
                    'vão pagar', 'pagamento no dia', 'pagar dia', 'até dia',
                    'pago até', 'prometo pagar', 'vou acertar', 'vou quitar',
                    'me dê um prazo', 'me dá um prazo', 'preciso de prazo'
                ], 
                intencao: 'PROMESSA' 
            },
            { 
                palavras: [
                    'contratar', 'instalar', 'quero internet', 'novo cliente', 
                    'assinar', 'quero contratar', 'quero instalar', 'colocar internet',
                    'como faço pra contratar', 'valores', 'planos', 'quero ser cliente'
                ], 
                intencao: 'NOVO_CLIENTE' 
            },
            { 
                palavras: [
                    'cancelar', 'cancelamento', 'quero cancelar', 'sair da internet',
                    'encerrar', 'desativar', 'quero sair', 'não quero mais',
                    'cancelar contrato', 'cancelar serviço'
                ], 
                intencao: 'CANCELAMENTO' 
            }
        ];
        
        for (const regra of regras) {
            for (const palavra of regra.palavras) {
                if (t.includes(palavra)) {
                    intencoes.push(regra.intencao);
                    break;
                }
            }
        }
        
        return [...new Set(intencoes)];
    }

    async function detectarPorIA(texto) {
        const prompt = `Analise a mensagem do cliente e identifique QUAIS ASSUNTOS ele está falando.
Pode ser mais de um assunto na mesma mensagem.

Assuntos possíveis:
- SUPORTE: problemas com internet, conexão, sinal, wi-fi, roteador, lenta, caindo, sem sinal
- FINANCEIRO: pagamentos, faturas, boletos, pix, mensalidades, quanto devo, quanto é, valor, conta
- PROMESSA: promessa de pagamento em data futura (ex: vou pagar dia 20, pago amanhã, entre dia 20 a 25, me dá um prazo)
- NOVO_CLIENTE: quer contratar ou instalar internet, planos, valores de instalação
- CANCELAMENTO: quer cancelar o serviço, sair da internet, encerrar contrato
- SAUDACAO: apenas cumprimentos (bom dia, boa tarde, oi, olá)
- OUTRO: outros assuntos não relacionados

Responda APENAS com um array JSON contendo os assuntos encontrados.
Exemplos:
"estou sem internet e vou pagar dia 20" → ["SUPORTE", "PROMESSA"]
"quanto é mesmo? preciso pagar minha fatura" → ["FINANCEIRO"]
"quero contratar internet" → ["NOVO_CLIENTE"]
"bom dia" → ["SAUDACAO"]
"minha internet caiu e quero pagar minha fatura" → ["SUPORTE", "FINANCEIRO"]
"sem net, e vão pagar entre dia 20 a 25" → ["SUPORTE", "PROMESSA"]
"quanto é mesmo? e vou pagar dia 20" → ["FINANCEIRO", "PROMESSA"]
"internet lenta e preciso de prazo pra pagar" → ["SUPORTE", "PROMESSA"]

Mensagem: "${texto}"`;

        try {
            const resp = await groqChatFallback([{ role: 'user', content: prompt }], 0.1);
            const match = resp.match(/\[.*\]/s);
            if (match) {
                return JSON.parse(match[0]);
            }
        } catch (error) {
            console.error('Erro na detecção por IA:', error);
        }
        return [];
    }

    async function detectarMultiplasIntencoes(texto) {
        // Primeiro tenta por palavras-chave (rápido)
        const porPalavras = detectarPorPalavrasChave(texto);
        
        if (porPalavras.length > 0) {
            console.log(`📊 Múltiplas intenções (palavras-chave): ${porPalavras.join(', ')}`);
            return porPalavras;
        }
        
        // Se não achou por palavras, tenta por IA
        const porIA = await detectarPorIA(texto);
        if (porIA.length > 0) {
            console.log(`📊 Múltiplas intenções (IA): ${porIA.join(', ')}`);
            return porIA;
        }
        
        return [];
    }

    return {
        detectarMultiplasIntencoes
    };
};