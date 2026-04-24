require('dotenv').config();
const { Client, RemoteAuth } = require('whatsapp-web.js');
const FirestoreStore = require('./services/FirestoreStore');
const QRCode = require('qrcode');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

process.on('unhandledRejection', (reason) => {
    console.error('⚠️ UnhandledRejection capturado:', reason);
});

// ── Serviços ──────────────────────────────────────────
const { dispararCobrancaReal }          = require('./services/cobrancaService');
const { verificarCobrancasAutomaticas } = require('./services/adminService');
const sseService                        = require('./services/sseService');

// ── Banco ─────────────────────────────────────────────
const { db: firebaseDb, admin } = require('./config/firebase');
const banco = require('./database/funcoes-firebase');
const agendamentosDb         = require('./database/agendamentos-firebase')(firebaseDb);
const instalacoesAgendadasDb = require('./database/instalacoes-agendadas-firebase')(firebaseDb);
agendamentosDb.inicializarTabela();
instalacoesAgendadasDb.criarTabela();

// ── Middleware ────────────────────────────────────────
const iniciarTimers = require('./middleware/timers');

// =====================================================
// CONFIGURAÇÕES
// =====================================================
const DATA_PATH = (() => {
    if (process.env.RAILWAY) {
        const railwayPath = '/app/data';
        if (!fs.existsSync(railwayPath)) fs.mkdirSync(railwayPath, { recursive: true });
        return railwayPath;
    }
    if (process.env.RENDER) {
        const renderPath = '/tmp/data';
        if (!fs.existsSync(renderPath)) fs.mkdirSync(renderPath, { recursive: true });
        return renderPath;
    }
    return '/data';
})();
console.log(`📁 Dados persistentes em: ${DATA_PATH}`);
if (!fs.existsSync(DATA_PATH)) fs.mkdirSync(DATA_PATH, { recursive: true });

const P = "🤖 *Assistente JMENET*\n\n";

const toWpp = (n) => {
    const cleaned = n.replace(/\D/g, '');
    return (cleaned.startsWith('55') ? cleaned : '55' + cleaned) + '@c.us';
};
const parseNumbers = (env, fallback) =>
    (process.env[env] || fallback).split(',').map(s => s.trim()).filter(Boolean).map(toWpp);

const ADMINISTRADORES = parseNumbers('ADMIN_PHONE', '');

let botAtivo             = true;
let situacaoRede         = 'normal';
let previsaoRetorno      = 'sem previsão';
let motivoRede           = '';
let horarioFuncionamento = { inicio: 8, fim: 20, ativo: true };
let horarioCobranca      = { inicio: 8, fim: 17 };
let botIniciadoEm        = null;
let ultimoQR             = null;

// =====================================================
// WHATSAPP CLIENT
// =====================================================
function criarNovoClient() {
    const store = new FirestoreStore();
    const c = new Client({
        authStrategy: new RemoteAuth({
            clientId: 'jme-bot',
            backupSyncIntervalMs: 300000,
            store,
        }),
        puppeteer: {
            headless: true,
            protocolTimeout: 240000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--no-process-singleton',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-default-browser-check',
                '--safebrowsing-disable-auto-update',
                '--disable-features=TranslateUI,BlinkGenPropertyTrees,site-per-process',
            ]
        }
    });

    return c;
}

let client;

// =====================================================
// EXPRESS
// =====================================================
const app = express();

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        callback(new Error(`CORS bloqueado para origem: ${origin}`));
    },
    credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =====================================================
// MIDDLEWARE DE AUTENTICAÇÃO
// =====================================================
const requireAuth = require('./middleware/auth');
app.use('/api', requireAuth);

// =====================================================
// ROTAS PÚBLICAS
// =====================================================
app.get('/qr', async (req, res) => {
    if (!ultimoQR) return res.status(404).send('Nenhum QR Code disponível.');
    try { res.type('png').send(await QRCode.toBuffer(ultimoQR, { type: 'png', margin: 1 })); }
    catch { res.status(500).send('Erro ao gerar QR.'); }
});

app.get('/api/status-stream', (req, res) => sseService.handleConnection(req, res));

app.get('/api/status', (req, res) => {
    res.json({
        botAtivo, online: !!botIniciadoEm, iniciadoEm: botIniciadoEm,
        situacaoRede, previsaoRetorno,
    });
});

// =====================================================
// CONTEXTO PARA ROTAS
// =====================================================
const ctxRotas = {
    db: firebaseDb, banco, ADMINISTRADORES,
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
    dispararCobrancaReal: (d, t) => dispararCobrancaReal(client, firebaseDb, d, t, null, ADMINISTRADORES),
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
// KILL ZOMBIE BROWSER
// =====================================================
async function killZombieBrowser() {
    const cmds = [
        'pkill -9 -f "google-chrome" 2>/dev/null || true',
        'pkill -9 -f "chromium" 2>/dev/null || true',
        'pkill -9 -f "chrome" 2>/dev/null || true',
        'pkill -9 -f "puppeteer" 2>/dev/null || true',
        'pkill -9 -f ".wwebjs" 2>/dev/null || true',
        'pkill -9 -f "RemoteAuth" 2>/dev/null || true',
    ];
    for (const cmd of cmds) {
        try { execSync(cmd); } catch (_) {}
    }

    await new Promise(r => setTimeout(r, 6000));
}

// =====================================================
// TIMERS EM BACKGROUND
// =====================================================
function inicializarTimers() {
    iniciarTimers(client, firebaseDb, ADMINISTRADORES, {
        dispararCobrancaReal, verificarCobrancasAutomaticas,
        get situacaoRede()    { return situacaoRede; },
        get previsaoRetorno() { return previsaoRetorno; },
        redeNormal: () => situacaoRede === 'normal',
        banco, sseService,
    });
}

// =====================================================
// INICIALIZAÇÃO DO WHATSAPP
// =====================================================
async function inicializarWhatsApp(tentativa = 1) {
    console.log(`🔄 Tentativa ${tentativa}...`);

    await killZombieBrowser();

    client = criarNovoClient();

    client.on('qr', (qr) => {
        ultimoQR = qr;
        console.log('📱 QR Code gerado. Acesse /qr');
    });

    client.on('remote_session_saved', () => {
        console.log('💾 remote_session_saved — sessão sincronizada com Storage');
    });

    client.on('ready', async () => {
        console.log('✅ WhatsApp conectado!');
        inicializarTimers();
        botIniciadoEm = Date.now();

        try {
            const [cfgBot, cfgRede, cfgPrevisao, cfgMotivo, cfgHorario, cfgCobranca] = await Promise.all([
                firebaseDb.collection('config').doc('bot_ativo').get(),
                firebaseDb.collection('config').doc('situacao_rede').get(),
                firebaseDb.collection('config').doc('previsao_retorno').get(),
                firebaseDb.collection('config').doc('motivo_rede').get(),
                firebaseDb.collection('config').doc('horario_atendente').get(),
                firebaseDb.collection('config').doc('horario_cobranca').get(),
            ]);
            if (cfgBot.exists)      botAtivo        = cfgBot.data().valor ?? true;
            if (cfgRede.exists)     situacaoRede    = cfgRede.data().valor ?? 'normal';
            if (cfgPrevisao.exists) previsaoRetorno = cfgPrevisao.data().valor ?? 'sem previsão';
            if (cfgMotivo.exists)   motivoRede      = cfgMotivo.data().valor ?? '';
            if (cfgHorario.exists)  Object.assign(horarioFuncionamento, cfgHorario.data());
            if (cfgCobranca.exists) Object.assign(horarioCobranca, cfgCobranca.data());
            console.log(`⚙️  Config restaurada: bot=${botAtivo ? 'ON' : 'OFF'} | rede=${situacaoRede}`);
        } catch(e) { console.error('⚠️  Erro ao restaurar config:', e.message); }

        sseService.broadcast();
        console.log(`\n🚀 JMENET: Sistema online!`);
        console.log(`🤖 Bot IA: ${botAtivo ? 'LIGADO ✅' : 'DESLIGADO ❌'}`);
        console.log(`📡 Rede: ${situacaoRede} | Previsão: ${previsaoRetorno}`);
        console.log(`🔥 Banco de dados: Firebase Firestore`);
    });

    client.on('disconnected', async (reason) => {
        console.log('WhatsApp desconectado:', reason);
        botIniciadoEm = null;
        // Deleta sessão corrompida do Storage
        try {
            const store = new FirestoreStore();
            await store.delete({ session: 'RemoteAuth-jme-bot' });
            console.log('🗑️ Sessão removida do Storage após desconexão');
        } catch (e) {
            console.log('⚠️ Erro ao remover sessão:', e.message);
        }
        await new Promise(r => setTimeout(r, 30000));
        inicializarWhatsApp();
    });

    try {
        await client.initialize();
        console.log('✅ WhatsApp inicializado!');
    } catch (err) {
        console.error(`❌ Erro (tentativa ${tentativa}):`, err.message);

        if (tentativa < 5) {
            const delay = tentativa * 10000;
            console.log(`🔄 Nova tentativa em ${delay/1000}s...`);
            setTimeout(() => inicializarWhatsApp(tentativa + 1), delay);
        }
    }
}

// INICIA O BOT
inicializarWhatsApp();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🌐 Painel rodando em http://localhost:${PORT}`));