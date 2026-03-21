// shared/utils.js
const { NAO_NOMES } = require('./constants');

module.exports = function criarUtils(groqChatFallback) {
    
    async function extrairNomeDaMensagem(texto) {
        // Atalho rápido: mensagem é só o nome (1-4 palavras, só letras)
        const soNome = texto.trim().match(/^([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,3})\.?$/);
        if (soNome) {
            const candidato = soNome[1].trim().toLowerCase();
            if (!NAO_NOMES.has(candidato) && !NAO_NOMES.has(candidato.split(' ')[0])) {
                return soNome[1].trim().split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
            }
        }

        // Para tudo mais, usa IA com prompt rico
        const prompt = `Você precisa extrair o nome próprio de uma pessoa nessa mensagem de WhatsApp.
Responda APENAS com o nome, capitalizado corretamente. Se não houver nome, responda: DESCONHECIDO.

Exemplos de como clientes costumam mandar o nome:
"meu nome é João Silva" → João Silva
"João Silva" → João Silva  
"sou a Maria" → Maria
"pode me chamar de Carlos" → Carlos
"posso sim, prometheus" → Prometheus
"tá bom, é Everson" → Everson
"claro! me chamo Ana Paula" → Ana Paula
"pode, sou o Renato Souza" → Renato Souza
"é o José" → Jose
"aqui é a Fernanda" → Fernanda
"meu nome? é Marcos" → Marcos
"sim! Luciana" → Luciana
"oi, Beatriz Santos aqui" → Beatriz Santos
"Jailson Dias da Silva, é dia 25 não é dia 20" → Jailson Dias da Silva
"meu marido é José Pereira de Lima" → José Pereira de Lima
"É o meu esposo, Jair pereira de lima" → Jair Pereira de Lima
"ok" → DESCONHECIDO
"sim" → DESCONHECIDO
"pode ser" → DESCONHECIDO
"tá bom" → DESCONHECIDO

IMPORTANTE: Responda APENAS o nome da pessoa, no máximo 5 palavras, sem explicações.

Mensagem: "${texto}"`;
        
        try {
            const resp = await groqChatFallback([{ role: 'user', content: prompt }], 0.0);
            const nomeExtraido = (resp || '').trim().split('\n')[0].trim();
            if (nomeExtraido === 'DESCONHECIDO' || nomeExtraido.length < 2) return null;
            if (nomeExtraido.split(' ').length > 5) return null; // rejeita frases longas
            return nomeExtraido.split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
        } catch (error) {
            console.error('Erro ao extrair nome com Groq:', error);
            return null;
        }
    }

    async function extrairDataPromessa(texto) {
        const hoje = new Date();
        const dd   = String(hoje.getDate()).padStart(2,'0');
        const mm   = String(hoje.getMonth()+1).padStart(2,'0');
        const aaaa = hoje.getFullYear();
        
        const prompt = `Hoje é ${dd}/${mm}/${aaaa}. Extraia a data de pagamento prometida na mensagem abaixo.
Responda APENAS com a data no formato DD/MM/AAAA.
Se não houver data clara, responda: SEM_DATA

Mensagem: "${texto.length > 400 ? texto.substring(0,200)+' [...] '+texto.substring(texto.length-200) : texto}"`;
        
        try {
            const resp = await groqChatFallback([{ role:'user', content: prompt }], 0.1);
            const data = (resp || '').trim();
            if (data === 'SEM_DATA' || !/\d{2}\/\d{2}\/\d{4}/.test(data)) return null;
            const dataExtraida = data.match(/\d{2}\/\d{2}\/\d{4}/)[0];
            // Rejeita datas no passado
            const [dia, mes, ano] = dataExtraida.split('/').map(Number);
            const dataObj = new Date(ano, mes - 1, dia);
            const hojeObj = new Date(); hojeObj.setHours(0, 0, 0, 0);
            if (dataObj < hojeObj) return null;
            return dataExtraida;
        } catch (_) { 
            return null; 
        }
    }

    async function normalizarMotivoCancelamento(texto) {
        const MOTIVOS_FIXOS = [
            'Problemas financeiros',
            'Qualidade do serviço',
            'Mudança de endereço',
            'Contratei outro provedor',
            'Outro motivo',
        ];
        
        try {
            const prompt = `Classifique o motivo de cancelamento abaixo em UMA das opções. Responda APENAS com a opção exata.

Opções:
- Problemas financeiros
- Qualidade do serviço
- Mudança de endereço
- Contratei outro provedor
- Outro motivo

Motivo: "${texto}"`;
            
            const resp = (await groqChatFallback([{ role: 'user', content: prompt }], 0.0) || '').trim();
            return MOTIVOS_FIXOS.includes(resp) ? resp : texto;
        } catch { 
            return texto; 
        }
    }

    async function detectarContinuacaoFluxo(fluxoAtual, etapaAtual, texto) {
        // Se for resposta numérica (1,2,3) ou palavras-chave óbvias, mantém fluxo
        if (/^[1-5]$/.test(texto.trim())) return true;
        
        // Palavras de confirmação típicas
        const palavrasConfirmacao = ['sim','s','claro','ok','pode','pode ser','certo','isso','tá','ta'];
        if (palavrasConfirmacao.includes(texto.trim().toLowerCase())) return true;
        
        // Usa IA com contexto do fluxo atual
        const prompt = `O cliente está no fluxo de ${fluxoAtual} (etapa: ${etapaAtual}). 
A mensagem dele: "${texto}"
Isso parece uma RESPOSTA válida para continuar o fluxo atual ou uma MUDANÇA de assunto?
Responda apenas: CONTINUA ou MUDA`;
        
        try {
            const resp = await groqChatFallback([{ role: 'user', content: prompt }], 0.0);
            return (resp || '').trim().toUpperCase() === 'CONTINUA';
        } catch {
            return true; // Em caso de erro, assume que continua
        }
    }

    function normalizarTexto(texto) {
        if (!texto) return '';
        return texto
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // remove acentos
            .toLowerCase()
            .trim();
    }

    return {
        extrairNomeDaMensagem,
        extrairDataPromessa,
        normalizarMotivoCancelamento,
        detectarContinuacaoFluxo,
        normalizarTexto
    };
};