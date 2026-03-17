require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const criarFluxoSuporte     = require('./fluxos/suporte');
const criarFluxoFinanceiro  = require('./fluxos/financeiro');
const criarFluxoPromessa    = require('./fluxos/promessa');
const criarFluxoNovoCliente = require('./fluxos/novoCliente');
const criarFluxoCancelamento = require('./fluxos/cancelamento');
const StateManager          = require('./stateManager');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const Groq = require('groq-sdk');
const express = require('express');
const cors = require('cors');

// =====================================================
// SERVIÇOS MODULARIZADOS
// =====================================================
const { dispararCobrancaReal, obterAgendaDia } = require('./services/cobrancaService');
const { perguntarAdmins, verificarCobrancasAutomaticas } = require('./services/adminService');
const { gerarMensagemCobranca, enviarChavesPix } = require('./services/mensagemService');
const { enviarMensagemSegura } = require('./services/whatsappService');
const { analisarImagem } = require('./services/midiaService');
const { transcreverAudio } = require('./services/audioService');
const { horaLocal, atendenteDisponivel, proximoAtendimento, falarSinalAmigavel, redeNormal } = require('./services/utilsService');
const {
    processarMensagem,
    handleIdentificacao,
    delegarParaFluxo,
    responderComIA,
    processarAposIdentificacao
} = require('./services/fluxoService');

const P = "🤖 *Assistente JMENET*\n\n";

// =====================================================
// FIREBASE
// =====================================================
const { db: firebaseDb } = require('./config/firebase');
const banco = require('./database/funcoes-firebase');
const agendamentos = require('./database/agendamentos-firebase')(firebaseDb);
const instalacoesAgendadas = require('./database/instalacoes-agendadas-firebase')(firebaseDb);

const criarUtils = require('./shared/utils');
const criarClassificador = require('./shared/classificador');
const criarDetectorMultiplas = require('./shared/multiplasIntencoes');

const pdfParse = require('pdf-parse');

agendamentos.inicializarTabela();
instalacoesAgendadas.criarTabela();

// =====================================================
// CONFIGURAÇÕES
// =====================================================
const DATA_PATH = (() => {
    if (process.env.RAILWAY_VOLUME_MOUNT_PATH) return process.env.RAILWAY_VOLUME_MOUNT_PATH;
    if (process.env.RENDER) return '/opt/render/project/src/data';
    return __dirname;
})();

console.log(`📁 Dados persistentes em: ${DATA_PATH}`);
if (!fs.existsSync(DATA_PATH)) fs.mkdirSync(DATA_PATH, { recursive: true });

// =====================================================
// UTILS E CLASSIFICADORES
// =====================================================
const utils = criarUtils(groqChatFallback);
const classificador = criarClassificador(groqChatFallback);
const detectorMultiplas = criarDetectorMultiplas(groqChatFallback);

const ADMINISTRADORES = ['558184636954@c.us', '558186650773@c.us'];
const FUNCIONARIOS = ['558185937690@c.us', '558198594699@c.us', '558184597727@c.us', '558184065116@c.us']; 
const chavePixExibicao = "jmetelecomnt@gmail.com";

let botAtivo = true;
let situacaoRede = 'normal';
let previsaoRetorno = 'sem previsão';
let horarioFuncionamento = { inicio: 8, fim: 20, ativo: true };
let horarioCobranca = { inicio: 8, fim: 17 };
let botIniciadoEm = null;
let ultimoQR = null;

const state = new StateManager(null);

const metrics = {
    mensagensProcessadas: 0,
    temposResposta: [],
    inicioBot: Date.now(),
    erros: []
};

// =====================================================
// MAPAS GLOBAIS
// =====================================================
const processingLock = new Map();
const filaEspera = new Map();
const mensagensPendentes = new Map();
const debounceTimers = new Map();
const fotosPendentes = new Map();

const DEBOUNCE_TEXTO = 12000;
const DEBOUNCE_AUDIO = 10000;
const DEBOUNCE_MIDIA = 6000;

let _fluxoSuporte, _fluxoFinanceiro, _fluxoPromessa, _fluxoNovoCliente, _fluxoCancelamento;

// =====================================================
// FUNÇÕES AUXILIARES RESTANTES (PEQUENAS)
// =====================================================
function logErro(contexto, erro, dados = {}) {
    const entry = { timestamp: new Date().toISOString(), contexto, mensagem: erro.message, stack: erro.stack, dados };
    console.error('❌', entry);
    metrics.erros.push(entry);
    if (metrics.erros.length > 100) metrics.erros.shift();
}

async function groqChatFallback(messages, temperature = 0.5, tentativa = 1) {
    const MAX_TENTATIVAS = 3;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
            body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, temperature, max_tokens: 1024 })
        });
        clearTimeout(timeout);
        if (!response.ok) {
            const err = await response.text();
            if ((response.status === 429 || response.status === 503) && tentativa < MAX_TENTATIVAS) {
                await new Promise(r => setTimeout(r, tentativa * 2000));
                return groqChatFallback(messages, temperature, tentativa + 1);
            }
            throw new Error(`Groq fallback ${response.status}: ${err}`);
        }
        const data = await response.json();
        return data.choices?.[0]?.message?.content || null;
    } catch (e) {
        clearTimeout(timeout);
        if (e.name === 'AbortError') {
            if (tentativa < MAX_TENTATIVAS) return groqChatFallback(messages, temperature, tentativa + 1);
            throw new Error('Groq timeout após 3 tentativas');
        }
        throw e;
    }
}

async function processarMidiaAutomatico(deQuem, msg) {
    console.log(`📷 Processando mídia automaticamente: ${msg.type}`);
    const analise = await analisarImagem(msg, groqChatFallback);
    if (!analise) {
        if (!fotosPendentes.has(deQuem)) fotosPendentes.set(deQuem, []);
        fotosPendentes.get(deQuem).push(msg);
        return false;
    }
    if (analise.categoria === 'comprovante') {
        const baixa = await darBaixaAutomatica(deQuem, analise);
        if (baixa.sucesso && baixa.nomeCliente) {
            await client.sendMessage(deQuem, `${P}Comprovante recebido e pagamento confirmado! ✅`);
            await banco.dbLogComprovante(deQuem);
            for (const adm of ADMINISTRADORES) {
                client.sendMessage(adm, `✅ *BAIXA AUTOMÁTICA*\n\n👤 ${baixa.nomeCliente}\n📱 ${deQuem.replace('@c.us','')}\n💰 R$ ${analise.valor || 'N/A'}`).catch(() => {});
            }
            return true;
        } else if (baixa.sucesso && !baixa.nomeCliente) {
            await client.sendMessage(deQuem, `${P}Recebi seu comprovante! Para confirmar, me informe o *nome completo do titular*.`);
            state.iniciar(deQuem, 'aguardando_nome_comprovante', 'nome', { analise });
            return true;
        } else {
            await client.sendMessage(deQuem, `${P}Não consegui validar o comprovante. Vou chamar um atendente.`);
            abrirChamadoComMotivo(deQuem, null, 'Comprovante inválido', { analise });
            return true;
        }
    }
    return false;
}

async function darBaixaAutomatica(numeroWhatsapp, analise) {
    try {
        const numeroBusca = numeroWhatsapp.replace('@c.us', '').replace(/^55/, '');
        const cliente = await banco.buscarClientePorTelefone(numeroBusca);
        if (!cliente) return { sucesso: false, nomeCliente: null, valido: false };

        await firebaseDb.collection('clientes').doc(cliente.id).update({
            status: 'pago',
            atualizado_em: new Date().toISOString()
        });

        const hoje = new Date();
        const mesRef = `${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
        
        await firebaseDb.collection('clientes')
            .doc(cliente.id)
            .collection('historico_pagamentos')
            .doc(mesRef)
            .set({
                referencia: mesRef,
                status: 'pago',
                forma_pagamento: 'Comprovante',
                pago_em: new Date().toISOString(),
                data_vencimento: cliente.dia_vencimento || 10,
                valor: analise.valor
            }, { merge: true });

        return { sucesso: true, nomeCliente: cliente.nome, valido: analise.valido };
    } catch(e) {
        console.error('Erro em darBaixaAutomatica:', e);
        return { sucesso: false, nomeCliente: null, valido: false };
    }
}

function abrirChamadoComMotivo(deQuem, nome, motivo, extras = {}) {
    state.setAtendimentoHumano(deQuem, true);
    banco.dbSalvarAtendimentoHumano(deQuem);
    banco.dbAbrirChamado(deQuem, nome || null, motivo);
    
    let msg = `🔔 *Novo chamado!*\n\n📱 *Número:* ${deQuem.replace('@c.us','')}\n👤 *Nome:* ${nome || 'não informado'}\n🔧 *Motivo:* ${motivo}\n`;
    if (extras.endereco) msg += `📍 *Endereço:* ${extras.endereco}\n`;
    if (extras.disponibilidade) msg += `📅 *Disponibilidade:* ${extras.disponibilidade}\n`;
    
    for (const adm of ADMINISTRADORES) client.sendMessage(adm, msg).catch(() => {});
}

async function verificarETransferir(deQuem, motivo) {
    const erros = state.incrementarErros ? state.incrementarErros(deQuem) : 1;
    if (erros >= 5) {
        state.setAtendimentoHumano(deQuem, true);
        banco.dbSalvarAtendimentoHumano(deQuem);
        const nome = state.getDados(deQuem)?.nomeCliente || 'não identificado';
        banco.dbAbrirChamado(deQuem, nome, `Transferido por erro - ${motivo}`);
        
        const atendenteDisponivel = (new Date().getDay() >= 1 && new Date().getDay() <= 6 && horaLocal() >= 8 && horaLocal() < 20);
        let mensagem = `🤖 *Assistente JMENET*\n\n`;
        if (atendenteDisponivel) {
            mensagem += `Estou com dificuldade. Já transferi para um *atendente humano*. 👤\n\nAguarde um momento!`;
        } else {
            mensagem += `Estou com dificuldade. 😕\n\nNo momento não temos atendentes disponíveis (seg-sáb 8h às 20h).\n\nUm atendente entrará em contato em breve.`;
        }
        await client.sendMessage(deQuem, mensagem);
        for (const adm of ADMINISTRADORES) {
            client.sendMessage(adm, `🆘 *TRANSFERÊNCIA POR ERRO*\n\nCliente: ${deQuem.replace('@c.us', '')}\nNome: ${nome}\nMotivo: ${motivo}\nErros: ${erros}`).catch(() => {});
        }
        return true;
    }
    return false;
}

// =====================================================
// CLIENTE DO WHATSAPP
// =====================================================
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(DATA_PATH, '.wwebjs_auth') }),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'], headless: true }
});

client.on('qr', (qr) => { ultimoQR = qr; console.log('📱 QR Code gerado. Acesse /qr para escanear.'); });
client.on('ready', () => { console.log('✅ WhatsApp conectado e pronto!'); });

// =====================================================
// CONFIGURAÇÃO DO EXPRESS
// =====================================================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend/dist')));

app.get('/qr', async (req, res) => {
    if (!ultimoQR) return res.status(404).send('Nenhum QR Code disponível.');
    try { res.type('png').send(await QRCode.toBuffer(ultimoQR, { type: 'png', margin: 1 })); } 
    catch (err) { res.status(500).send('Erro ao gerar QR.'); }
});

// =====================================================
// CONTEXTO PARA ROTAS E FLUXOS
// =====================================================
const ctxRotas = {
    db: firebaseDb, banco, state, client, ADMINISTRADORES,
    dbRelatorio: banco.dbRelatorio,
    dbListarChamados: banco.dbListarChamados,
    dbAtualizarChamado: banco.dbAtualizarChamado,
    dbSalvarAtendimentoHumano: banco.dbSalvarAtendimentoHumano,
    dbRemoverAtendimentoHumano: banco.dbRemoverAtendimentoHumano,
    botAtivo,
    botIniciadoEm, situacaoRede, previsaoRetorno,
    horarioFuncionamento, horarioCobranca,
    dispararCobrancaReal: (data, tipo) => dispararCobrancaReal(client, firebaseDb, data, tipo),
    obterAgendaDia: (dia, mes, ano) => obterAgendaDia(firebaseDb, dia, mes, ano),
    executarMigracao: () => ({}),
    isentarMesEntrada: () => {},
    verificarPromessasVencidas: () => 0,
    fs, path
};

require('./routes/index')(app, ctxRotas);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🌐 Painel rodando em http://localhost:${PORT}`));

// =====================================================
// EVENTO DE MENSAGEM (SIMPLIFICADO)
// =====================================================
client.on('message', async (msg) => {
    console.log(`\n📨 MENSAGEM RECEBIDA: De: ${msg.from} Corpo: "${msg.body}"`);
    
    if (msg.from === 'status@broadcast' || msg.from.includes('@g.us')) return;
    
    const deQuem = msg.from;
    if (FUNCIONARIOS.includes(deQuem)) return;
    if (!botIniciadoEm || (msg.timestamp * 1000) < botIniciadoEm) return;
    if (!botAtivo && !ADMINISTRADORES.includes(deQuem)) return;

    // COMANDOS ADMIN
    if (ADMINISTRADORES.includes(deQuem)) {
        const texto = msg.body || '';
        const args = texto.split(' ');
        const comando = args[0].toLowerCase();
        
        if (comando === '!bot') {
            if (args[1] === 'off') { botAtivo = false; return msg.reply("🔴 *IA DESATIVADA.*"); }
            if (args[1] === 'on') { botAtivo = true; return msg.reply("🟢 *IA ATIVADA.*"); }
        }
        if (comando === '!status') {
            return msg.reply(
                `📊 *STATUS*\n\n🤖 Bot: ${botAtivo ? '✅ ATIVO' : '❌ INATIVO'}\n` +
                `📡 Rede: ${situacaoRede}\n🔮 Previsão: ${previsaoRetorno}\n` +
                `⏰ Cobrança: ${horarioCobranca.inicio}h-${horarioCobranca.fim}h\n` +
                `👥 Atendimentos: ${state?.stats()?.atendimentoHumano || 0}`
            );
        }
        if (comando === '!rede') {
            const novoStatus = args[1];
            const validos = ['normal', 'instavel', 'manutencao', 'fibra_rompida'];
            if (!novoStatus || !validos.includes(novoStatus)) {
                return msg.reply(`❌ Use: !rede normal | instavel | manutencao | fibra_rompida "previsão"`);
            }
            let previsao = 'sem previsão';
            if (args.length > 2) previsao = args.slice(2).join(' ').replace(/["']/g, '');
            
            ctxRotas.situacaoRede = novoStatus; ctxRotas.previsaoRetorno = previsao;
            situacaoRede = novoStatus; previsaoRetorno = previsao;
            
            try {
                await firebaseDb.collection('config').doc('situacao_rede').set({ valor: novoStatus });
                await firebaseDb.collection('config').doc('previsao_retorno').set({ valor: previsao });
            } catch (e) {}
            
            return msg.reply(`✅ *REDE ATUALIZADA*\n\n📡 Status: ${novoStatus}\n🔮 Previsão: ${previsao}`);
        }
        if (comando === '!cobrar') {
            const data = args[1];
            if (!data || !['10', '20', '30'].includes(data)) return msg.reply("❌ Use: !cobrar 10 | 20 | 30");
            msg.reply(`⏳ Iniciando cobrança...`);
            setTimeout(async () => {
                const total = await dispararCobrancaReal(client, firebaseDb, data, args[2] || null);
                await client.sendMessage(deQuem, `✅ *COBRANÇA*\n\n📅 Data: ${data}\n📨 Mensagens: ${total}`);
            }, 100);
            return;
        }
        if (comando === '!pendentes') {
            const data = args[1];
            if (!data || !['10', '20', '30'].includes(data)) return msg.reply("❌ Use: !pendentes 10 | 20 | 30");
            msg.reply(`⏳ Buscando...`);
            setTimeout(async () => {
                const snap = await firebaseDb.collection('clientes')
                    .where('dia_vencimento', '==', parseInt(data))
                    .where('status', '==', 'pendente')
                    .get();
                if (snap.empty) return client.sendMessage(deQuem, `✅ Nenhum pendente dia ${data}`);
                let resp = `📋 *PENDENTES DIA ${data}*\nTotal: ${snap.size}\n\n`;
                snap.docs.slice(0, 20).forEach((d, i) => {
                    const c = d.data();
                    resp += `${i+1}. ${c.nome} - ${c.telefone || 'sem tel'}\n`;
                });
                if (snap.size > 20) resp += `\n... e mais ${snap.size - 20}`;
                await client.sendMessage(deQuem, resp);
            }, 100);
            return;
        }
        if (comando === '!ajuda') {
            return msg.reply(
                `📚 *COMANDOS*\n\n` +
                `🤖 *!bot on/off*\n📡 *!status*\n🌐 *!rede*\n💰 *!cobrar 10|20|30*\n` +
                `📋 *!pendentes 10|20|30*`
            );
        }
        return;
    }

    // FLUXO NORMAL (CLIENTES)
    if (msg.type === 'sticker') return;
    
    const tipo = msg.hasMedia
        ? (['audio','ptt'].includes(msg.type) ? 'audio' : ['image','document'].includes(msg.type) ? msg.type : 'outro')
        : 'texto';

    if (tipo === 'outro' || tipo === 'image' || (msg.hasMedia && msg.mimetype === 'application/pdf')) {
        const processado = await processarMidiaAutomatico(deQuem, msg);
        if (processado) return;
        await processarMensagem(deQuem, msg, {
            state, banco, client, utils, classificador, detectorMultiplas,
            verificarETransferir, responderComIA: (d, m) => responderComIA(d, m, { banco, client, groqChatFallback }),
            iniciarFluxoPorIntencao: (i, d, m) => iniciarFluxoPorIntencao(i, d, m),
            handleIdentificacao: (d, m) => handleIdentificacao(d, m, {
                state, banco, client, utils, verificarETransferir,
                processarAposIdentificacao: (d, n, o, i) => processarAposIdentificacao(d, n, o, i, {
                    banco, state, client, iniciarFluxoPorIntencao, redeNormal, falarSinalAmigavel
                })
            }),
            abrirChamadoComMotivo, darBaixaAutomatica,
            processingLock, filaEspera, P, logErro, metrics, processarFila
        });
        return;
    }

    const fila = mensagensPendentes.get(deQuem) || [];
    fila.push({ msg, tipo });
    mensagensPendentes.set(deQuem, fila);

    const temAudio = fila.some(f => ['audio','ptt'].includes(f.tipo));
    const temMidia = fila.some(f => ['image','document'].includes(f.tipo));
    const delay = temAudio ? DEBOUNCE_AUDIO : temMidia ? DEBOUNCE_MIDIA : DEBOUNCE_TEXTO;

    if (state.cancelarTimer) state.cancelarTimer(deQuem);
    agendarProcessamento(deQuem, delay);
});

// =====================================================
// FUNÇÕES DE FILA
// =====================================================
function processarFila(deQuem) {
    const fila = filaEspera.get(deQuem) || [];
    if (fila.length > 0) {
        const proxima = fila.shift();
        if (fila.length === 0) filaEspera.delete(deQuem);
        else filaEspera.set(deQuem, fila);
        setImmediate(() => processarMensagem(deQuem, proxima));
    }
}

function agendarProcessamento(deQuem, delay) {
    if (debounceTimers.has(deQuem)) clearTimeout(debounceTimers.get(deQuem));
    const timer = setTimeout(async () => {
        const fila = mensagensPendentes.get(deQuem) || [];
        mensagensPendentes.delete(deQuem);
        debounceTimers.delete(deQuem);
        if (fila.length === 0) return;
        if (state.isAtendimentoHumano(deQuem)) return;

        const temAudio = fila.some(f => ['audio','ptt'].includes(f.tipo));
        const temMidia = fila.some(f => ['image','document'].includes(f.tipo));
        const textos = fila.filter(f => f.tipo === 'texto').map(f => f.msg.body || '').filter(Boolean);

        if (temAudio) {
            const transcricoes = [];
            for (const item of fila.filter(f => ['audio','ptt'].includes(f.tipo))) {
                const t = await transcreverAudio(item.msg, process.env.GROQ_API_KEY);
                if (t) transcricoes.push(t);
            }
            const tudoJunto = [...transcricoes, ...textos].join(' ').trim();
            if (!tudoJunto) {
                const transferiu = await verificarETransferir(deQuem, 'Não entendeu áudio');
                if (transferiu) return;
                await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\nNão consegui entender o áudio. Poderia digitar?`);
                return;
            }
            const msgFake = { body: tudoJunto, from: deQuem, hasMedia: false };
            await processarMensagem(deQuem, msgFake);
        } else if (temMidia) {
            const itemMidia = fila.find(f => ['image','document'].includes(f.tipo));
            await processarMensagem(deQuem, itemMidia.msg);
        } else {
            const textoJunto = textos.join(' ').trim();
            if (!textoJunto) return;
            const msgCombinada = { ...fila[fila.length - 1].msg, body: textoJunto };
            await processarMensagem(deQuem, msgCombinada);
        }
    }, delay);
    debounceTimers.set(deQuem, timer);
}

// =====================================================
// INICIALIZAÇÃO DOS FLUXOS
// =====================================================
function inicializarFluxos() {
    const ctx = {
        client, db: firebaseDb, banco, state, ADMINISTRADORES,
        P, chavePixExibicao, situacaoRede: () => situacaoRede,
        previsaoRetorno: () => previsaoRetorno, falarSinalAmigavel, redeNormal,
        atendenteDisponivel: () => atendenteDisponivel(horarioFuncionamento),
        proximoAtendimento: () => proximoAtendimento(horarioFuncionamento),
        horaLocal, analisarImagem, groqChatFallback,
        normalizarTexto: utils.normalizarTexto || (t => t),
        buscarStatusCliente: banco.buscarStatusCliente,
        darBaixaAutomatica, abrirChamadoComMotivo, utils,
        classificador, detectorMultiplas,
        iniciarFluxoPorIntencao: (i, d, m) => iniciarFluxoPorIntencao(i, d, m),
        verificarETransferir, fotosPendentes,
        dbLog: banco.dbLog, dbSalvarHistorico: banco.dbSalvarHistorico,
        dbCarregarHistorico: banco.dbCarregarHistorico,
        dbIniciarAtendimento: banco.dbIniciarAtendimento,
        dbEncerrarAtendimento: banco.dbEncerrarAtendimento,
        dbSalvarNovoCliente: banco.dbSalvarNovoCliente,
        dbAbrirChamado: banco.dbAbrirChamado,
        dbAtualizarChamado: banco.dbAtualizarChamado,
    };

    _fluxoSuporte     = criarFluxoSuporte(ctx);
    _fluxoFinanceiro  = criarFluxoFinanceiro(ctx);
    _fluxoPromessa    = criarFluxoPromessa(ctx);
    _fluxoNovoCliente = criarFluxoNovoCliente(ctx);
    _fluxoCancelamento = criarFluxoCancelamento(ctx);

    console.log('✅ Fluxos inicializados!');
}

async function iniciarFluxoPorIntencao(intencao, deQuem, msg) {
    switch(intencao) {
        case 'SUPORTE': await _fluxoSuporte.iniciar(deQuem, msg); break;
        case 'FINANCEIRO': case 'PIX': case 'BOLETO': case 'CARNE': case 'DINHEIRO':
            await _fluxoFinanceiro.iniciar(deQuem, msg, intencao); break;
        case 'PROMESSA': await _fluxoPromessa.iniciar(deQuem, msg); break;
        case 'NOVO_CLIENTE': await _fluxoNovoCliente.iniciar(deQuem); break;
        case 'CANCELAMENTO': await _fluxoCancelamento.iniciar(deQuem, msg); break;
        case 'SAUDACAO':
            const h = horaLocal();
            const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
            const resp = `${saudacao}! Como posso te ajudar hoje?\n\n1️⃣ Suporte\n2️⃣ Financeiro\n3️⃣ Planos`;
            await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${resp}`);
            await banco.dbSalvarHistorico(deQuem, 'assistant', resp);
            await banco.dbIniciarAtendimento(deQuem);
            break;
        default: await responderComIA(deQuem, msg, { banco, client, groqChatFallback });
    }
}

// =====================================================
// COBRANÇA AUTOMÁTICA
// =====================================================
setInterval(async () => {
    await verificarCobrancasAutomaticas(
        client, firebaseDb, ADMINISTRADORES,
        situacaoRede, previsaoRetorno, () => redeNormal(situacaoRede),
        (data, tipo) => dispararCobrancaReal(client, firebaseDb, data, tipo)
    );
}, 5 * 60 * 1000);

setTimeout(async () => {
    await verificarCobrancasAutomaticas(
        client, firebaseDb, ADMINISTRADORES,
        situacaoRede, previsaoRetorno, () => redeNormal(situacaoRede),
        (data, tipo) => dispararCobrancaReal(client, firebaseDb, data, tipo)
    );
}, 10 * 1000);

// =====================================================
// LIMPEZA DE LOGS
// =====================================================
async function limparLogsAntigos() {
    try {
        const mesAtras = new Date(); mesAtras.setMonth(mesAtras.getMonth() - 1);
        const colecoes = ['log_bot', 'log_cobrancas', 'log_comprovantes', 'log_atendimentos'];
        for (const colecao of colecoes) {
            const snapshot = await firebaseDb.collection(colecao)
                .where('criado_em', '<', mesAtras.toISOString())
                .get();
            if (snapshot.size === 0) continue;
            const batch = firebaseDb.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log(`   🗑️ ${snapshot.size} registros antigos de ${colecao}`);
        }
    } catch (error) { console.error('Erro na limpeza:', error); }
}

setInterval(() => { if (new Date().getHours() === 3) limparLogsAntigos(); }, 60 * 60 * 1000);

// =====================================================
// PROMESSAS DO DIA
// =====================================================
async function verificarPromessasDoDia() {
    try {
        const hoje = new Date().toISOString().split('T')[0];
        const snapshot = await firebaseDb.collection('promessas')
            .where('data_promessa', '==', hoje)
            .where('status', '==', 'pendente')
            .get();
        if (snapshot.empty) return;
        let mensagem = `🤝 *PROMESSAS DE HOJE (${hoje})*\n\n`;
        snapshot.docs.forEach((doc, i) => { const p = doc.data(); mensagem += `${i+1}. ${p.nome || 'sem nome'}\n`; });
        for (const adm of ADMINISTRADORES) await client.sendMessage(adm, mensagem).catch(() => {});
        console.log(`🔔 Notificação de promessas: ${snapshot.size}`);
    } catch (error) { console.error('Erro promessas:', error); }
}

setInterval(async () => {
    const agora = new Date();
    if (agora.getHours() === 8 && agora.getMinutes() === 0) await verificarPromessasDoDia();
}, 60 * 1000);

// =====================================================
// READY
// =====================================================
client.on('ready', async () => {
    inicializarFluxos();
    botIniciadoEm = Date.now();
    ctxRotas.botIniciadoEm = botIniciadoEm;
    
    const NUMERO_TESTE = '558187500456@c.us';
    if (state.limpar) state.limpar(NUMERO_TESTE);
    if (banco.dbLimparHistorico) await banco.dbLimparHistorico(NUMERO_TESTE);
    
    botAtivo = true;
    
    console.log(`\n🚀 JMENET: Sistema online!`);
    console.log(`🤖 Bot IA: LIGADO ✅`);
    console.log(`📡 Rede: ${situacaoRede} | Previsão: ${previsaoRetorno}`);
    console.log(`🔥 Banco de dados: Firebase Firestore`);
});

client.initialize();