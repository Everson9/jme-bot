require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// ── Fluxos ────────────────────────────────────────────
const criarFluxoSuporte      = require('./fluxos/suporte');
const criarFluxoFinanceiro   = require('./fluxos/financeiro');
const criarFluxoPromessa     = require('./fluxos/promessa');
const criarFluxoNovoCliente  = require('./fluxos/novoCliente');
const criarFluxoCancelamento = require('./fluxos/cancelamento');

// ── Serviços ──────────────────────────────────────────
const { dispararCobrancaReal }          = require('./services/cobrancaService');
const { verificarCobrancasAutomaticas } = require('./services/adminService');
const { analisarImagem }                = require('./services/midiaService');
const { horaLocal, atendenteDisponivel, proximoAtendimento,
      falarSinalAmigavel, redeNormal }  = require('./services/utilsService');
const sseService                        = require('./services/sseService');

// ── Banco ─────────────────────────────────────────────
const { db: firebaseDb } = require('./config/firebase');
const banco = require('./database/funcoes-firebase');
const agendamentosDb         = require('./database/agendamentos-firebase')(firebaseDb);
const instalacoesAgendadasDb = require('./database/instalacoes-agendadas-firebase')(firebaseDb);
agendamentosDb.inicializarTabela();
instalacoesAgendadasDb.criarTabela();

// ── Middleware ────────────────────────────────────────
const setupComprovante  = require('./middleware/comprovante');
const { configurarMensagens } = require('./middleware/Mensagem');
const iniciarTimers     = require('./middleware/timers');
const StateManager = require('./stateManager');
const criarUtils   = require('./shared/utils');

// =====================================================
// CONFIGURAÇÕES
// =====================================================
const DATA_PATH = (() => {
    if (process.env.RAILWAY_VOLUME_MOUNT_PATH) return process.env.RAILWAY_VOLUME_MOUNT_PATH;
    if (process.env.FLY_VOLUME_MOUNT_PATH)     return process.env.FLY_VOLUME_MOUNT_PATH;
    if (process.env.FLY_MOUNT_DIR)             return process.env.FLY_MOUNT_DIR;
    return '/data';
})();
console.log(`📁 Dados persistentes em: ${DATA_PATH}`);
if (!fs.existsSync(DATA_PATH)) fs.mkdirSync(DATA_PATH, { recursive: true });

const P = "🤖 *Assistente JMENET*\n\n";
const ADMINISTRADORES = ['558184636954@c.us'].filter(Boolean);
const FUNCIONARIOS    = ['558185937690@c.us','558198594699@c.us','558184597727@c.us','558184065116@c.us'];

let botAtivo            = true;
let situacaoRede        = 'normal';
let previsaoRetorno     = 'sem previsão';
let motivoRede          = '';
let horarioFuncionamento = { inicio: 8, fim: 20, ativo: true };
let horarioCobranca     = { inicio: 8, fim: 17 };
let botIniciadoEm       = null;
let ultimoQR            = null;

const state   = new StateManager(null);
let _fluxoSuporte, _fluxoFinanceiro, _fluxoPromessa, _fluxoNovoCliente, _fluxoCancelamento;

// =====================================================
// GROQ AI FALLBACK
// =====================================================
async function groqChatFallback(messages, temperature = 0.5, tentativa = 1) {
    const MAX_TENTATIVAS = 3;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
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

const utils = criarUtils(groqChatFallback);

// =====================================================
// WHATSAPP CLIENT
// =====================================================
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(DATA_PATH, '.wwebjs_auth') }),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'], headless: true }
});

client.on('qr', (qr) => {
    ultimoQR = qr;
    console.log('QR Code gerado. Acesse /qr para escanear.');
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp desconectado:', reason);
    botIniciadoEm = null;
    sseService.broadcast();
});

// =====================================================
// EXPRESS
// =====================================================
const app = express();
app.use(cors());
app.use(express.json());

app.get('/qr', async (req, res) => {
    if (!ultimoQR) return res.status(404).send('Nenhum QR Code disponível.');
    try { res.type('png').send(await QRCode.toBuffer(ultimoQR, { type: 'png', margin: 1 })); }
    catch { res.status(500).send('Erro ao gerar QR.'); }
});

app.get('/api/status-stream', (req, res) => sseService.handleConnection(req, res));

app.get('/api/status', (req, res) => {
    res.json({
        botAtivo, online: !!botIniciadoEm, iniciadoEm: botIniciadoEm,
        atendimentosAtivos: state?.stats()?.atendimentoHumano || 0,
        situacaoRede, previsaoRetorno,
    });
});

// =====================================================
// CONTEXTO PARA ROTAS
// =====================================================
const ctxRotas = {
    db: firebaseDb, banco, state, get client() { return client; }, ADMINISTRADORES,
    dbRelatorio: banco.dbRelatorio, dbListarChamados: banco.dbListarChamados,
    dbAtualizarChamado: banco.dbAtualizarChamado,
    dbSalvarAtendimentoHumano: banco.dbSalvarAtendimentoHumano,
    dbRemoverAtendimentoHumano: banco.dbRemoverAtendimentoHumano,
    get botAtivo() { return botAtivo; }, set botAtivo(v) { botAtivo = v; },
    get botIniciadoEm() { return botIniciadoEm; }, set botIniciadoEm(v) { botIniciadoEm = v; },
    get situacaoRede() { return situacaoRede; }, set situacaoRede(v) { situacaoRede = v; },
    get previsaoRetorno() { return previsaoRetorno; }, set previsaoRetorno(v) { previsaoRetorno = v; },
    get motivoRede() { return motivoRede; }, set motivoRede(v) { motivoRede = v; },
    horarioFuncionamento, horarioCobranca,
    dispararCobrancaReal: (d, t) => dispararCobrancaReal(client, firebaseDb, d, t),
    verificarCobrancasAutomaticas, sseService,
    obterAgendaDia: (d, m, a) => agendamentosDb.obterAgendaDia?.(d, m, a) ?? [],
    executarMigracao: () => ({}),
    fs, path,
    isentarMesEntrada: async (cid, dv) => {
        try {
            const hoje = new Date();
            const mr = `${String(hoje.getMonth()+1).padStart(2,'0')}-${hoje.getFullYear()}`;
            await firebaseDb.collection('clientes').doc(cid)
                .collection('historico_pagamentos').doc(mr).set({
                    referencia: mr.replace('-', '/'), status: 'isento',
                    forma_pagamento: 'Mês de instalação', pago_em: new Date().toISOString(),
                    data_vencimento: parseInt(dv) || 10 });
        } catch(e) { console.error('Erro ao isentar mês de entrada:', e); }
    },
    verificarPromessasVencidas: async () => {
        try {
            const hoje = new Date(Date.now()-3*60*60*1000).toISOString().split('T')[0];
            const snap = await firebaseDb.collection('promessas').where('status','==','pendente').get();
            let vencidas = 0; const batch = firebaseDb.batch();
            snap.docs.forEach(doc => {
                const p = doc.data(); if (!p.data_promessa) return;
                let dp = p.data_promessa;
                if (dp.includes('/')) { const [d,m,y]=dp.split('/'); dp=`${y}-${m}-${d}`; }
                if (dp < hoje) { batch.update(doc.ref,{status:'vencida'}); vencidas++; }
            });
            if (vencidas > 0) {
                await batch.commit();
                const cs = await firebaseDb.collection('clientes').where('status','==','promessa').get();
                const b2 = firebaseDb.batch();
                cs.docs.forEach(d => b2.update(d.ref,{status:'pendente'}));
                await b2.commit();
                console.log(`🤝 ${vencidas} promessa(s) vencida(s) marcadas.`);
            }
            return vencidas;
        } catch(e) { console.error('Erro verificarPromessasVencidas:', e); return 0; }
    },
};

sseService.init(ctxRotas);
require('./routes/index')(app, ctxRotas);

// =====================================================
// MIDDLEWARE: COMPROVANTES
// =====================================================
const comprovante = setupComprovante(
    client, firebaseDb, banco, state, ADMINISTRADORES, sseService,
    P, criarUtils, groqChatFallback, analisarImagem
);

// =====================================================
// INICIALIZAÇÃO DOS FLUXOS
// =====================================================
let handlersProntos = false;  // evita iniciar fluxos antes dos handlers

function inicializarFluxos() {
    handlersProntos = true;
    const ctx = {
        client, db: firebaseDb, banco, state, ADMINISTRADORES, P,
        get sseService()       { return sseService; },
        get situacaoRede()     { return situacaoRede; },
        get previsaoRetorno()  { return previsaoRetorno; },
        get motivoRede()       { return motivoRede; },
        falarSinalAmigavel: (...a) => falarSinalAmigavel(a[0] ?? situacaoRede, a[1] ?? previsaoRetorno, a[2] ?? motivoRede),
        redeNormal: (...a) => redeNormal(a[0] ?? situacaoRede),
        atendenteDisponivel: () => atendenteDisponivel(horarioFuncionamento),
        proximoAtendimento: () => proximoAtendimento(horarioFuncionamento),
        horaLocal, analisarImagem, groqChatFallback,
        normalizarTexto: utils.normalizarTexto || (t => t),
        buscarStatusCliente: banco.buscarStatusCliente,
        darBaixaAutomatica: comprovante.darBaixaAutomatica,
        abrirChamadoComMotivo: comprovante.abrirChamadoComMotivo,
        utils,
        dbLog: banco.dbLog, dbSalvarHistorico: banco.dbSalvarHistorico,
        dbCarregarHistorico: banco.dbCarregarHistorico,
        dbIniciarAtendimento: banco.dbIniciarAtendimento,
        dbEncerrarAtendimento: banco.dbEncerrarAtendimento,
        dbSalvarNovoCliente: banco.dbSalvarNovoCliente,
        dbAbrirChamado: banco.dbAbrirChamado,
        dbAtualizarChamado: banco.dbAtualizarChamado,
        dbLogComprovante: banco.dbLogComprovante,
    };

    ctx.encerrarSessaoPorInatividade = async (numero) => {
        try {
            if (state.hasFluxo(numero) || state.isAtendimentoHumano(numero)) {
                await client.sendMessage(numero,
                    `🤖 *Assistente JMENET*\n\nPor inatividade, encerramos o atendimento. Se precisar de algo é só chamar! 😊`
                ).catch(() => {});
            }
            state.encerrarFluxo(numero);
            await banco.dbEncerrarAtendimento(numero, 'inatividade').catch(() => {});
        } catch(_) {}
    };

    const _iniciarTimerOriginal = state.iniciarTimer.bind(state);
    state.iniciarTimer = (numero, callback, ms) => {
        _iniciarTimerOriginal(numero, callback || ctx.encerrarSessaoPorInatividade, ms || 10 * 60 * 1000);
    };

    _fluxoSuporte      = criarFluxoSuporte(ctx);
    _fluxoFinanceiro   = criarFluxoFinanceiro(ctx);
    _fluxoPromessa     = criarFluxoPromessa(ctx);
    _fluxoNovoCliente  = criarFluxoNovoCliente(ctx);
    _fluxoCancelamento = criarFluxoCancelamento(ctx);

    console.log('✅ Fluxos inicializados!');
}

// =====================================================
// HANDLERS DE MENSAGEM
// =====================================================
 configurarMensagens(client, {
    state, banco, sseService, ADMINISTRADORES, FUNCIONARIOS, P,
    get situacaoRede()   { return situacaoRede; },
    get previsaoRetorno() { return previsaoRetorno; },
    get motivoRede()     { return motivoRede; },
    get botIniciadoEm()  { return botIniciadoEm; },
    get botAtivo()       { return botAtivo; },
    firebaseDb,
    dispararCobrancaReal: (d,t) => dispararCobrancaReal(client, firebaseDb, d, t),
    groqChatFallback,
    redeNormal:   () => redeNormal(situacaoRede),
    falarSinalAmigavel: () => falarSinalAmigavel(situacaoRede, previsaoRetorno, motivoRede),
}, {
    processarMidiaAutomatico: comprovante.processarMidiaAutomatico,
    detectarAcaoAdmin:       comprovante.detectarAcaoAdmin,
    consultarSituacao:       comprovante.consultarSituacao,
    abrirChamadoComMotivo:   comprovante.abrirChamadoComMotivo,
    get _fluxoSuporte()     { return _fluxoSuporte; },
    get _fluxoFinanceiro()  { return _fluxoFinanceiro; },
    get _fluxoPromessa()    { return _fluxoPromessa; },
    get _fluxoNovoCliente() { return _fluxoNovoCliente; },
    get _fluxoCancelamento(){ return _fluxoCancelamento; },
});

// =====================================================
// TIMERS EM BACKGROUND
// =====================================================
function inicializarTimers() {
    iniciarTimers(client, firebaseDb, ADMINISTRADORES, {
        dispararCobrancaReal, verificarCobrancasAutomaticas,
        get situacaoRede() { return situacaoRede; },
        get previsaoRetorno() { return previsaoRetorno; },
        redeNormal: () => redeNormal(situacaoRede),
        state, banco, sseService,
    });
}

// =====================================================
// READY
// =====================================================
client.on('ready', async () => {
    inicializarFluxos();
    inicializarTimers();
    botIniciadoEm = Date.now();

    // Restaura configs do Firebase
    try {
        const [cfgBot, cfgRede, cfgPrevisao, cfgHorario, cfgCobranca] = await Promise.all([
            firebaseDb.collection('config').doc('bot_ativo').get(),
            firebaseDb.collection('config').doc('situacao_rede').get(),
            firebaseDb.collection('config').doc('previsao_retorno').get(),
            firebaseDb.collection('config').doc('horario_atendente').get(),
            firebaseDb.collection('config').doc('horario_cobranca').get(),
        ]);
        if (cfgBot.exists)      botAtivo            = cfgBot.data().valor ?? true;
        if (cfgRede.exists)     situacaoRede        = cfgRede.data().valor ?? 'normal';
        if (cfgPrevisao.exists) previsaoRetorno     = cfgPrevisao.data().valor ?? 'sem previsão';
        const cfgMotivo = await firebaseDb.collection('config').doc('motivo_rede').get();
        if (cfgMotivo.exists)   motivoRede          = cfgMotivo.data().valor ?? '';
        if (cfgHorario.exists)  Object.assign(horarioFuncionamento, cfgHorario.data());
        if (cfgCobranca.exists) Object.assign(horarioCobranca, cfgCobranca.data());
        console.log(`⚙️  Config restaurada: bot=${botAtivo ? 'ON' : 'OFF'} | rede=${situacaoRede}`);
    } catch(e) { console.error('⚠️  Erro ao restaurar config:', e.message); }

    sseService.broadcast();

    try {
        const atendimentos = await banco.dbCarregarAtendimentosHumanos();
        atendimentos.forEach(a => state.setAtendimentoHumano(a.numero, true));
        if (atendimentos.length > 0) console.log(`👤 ${atendimentos.length} atendimento(s) humano(s) restaurado(s)`);
    } catch(e) { console.error('⚠️  Erro ao restaurar atendimentos:', e.message); }

    const NUMERO_TESTE = '558187500456@c.us';
    if (state.limpar) state.limpar(NUMERO_TESTE);
    if (banco.dbLimparHistorico) await banco.dbLimparHistorico(NUMERO_TESTE);

    console.log(`\n🚀 JMENET: Sistema online!`);
    console.log(`🤖 Bot IA: ${botAtivo ? 'LIGADO ✅' : 'DESLIGADO ❌'}`);
    console.log(`📡 Rede: ${situacaoRede} | Previsão: ${previsaoRetorno}`);
    console.log(`🔥 Banco de dados: Firebase Firestore`);
});

client.initialize();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🌐 Painel rodando em http://localhost:${PORT}`));