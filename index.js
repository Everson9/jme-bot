require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const criarFluxoSuporte     = require('./fluxos/suporte');
const criarFluxoFinanceiro  = require('./fluxos/financeiro');
const criarFluxoPromessa    = require('./fluxos/promessa');
const criarFluxoNovoCliente = require('./fluxos/novoCliente');
const criarFluxoCancelamento = require('./fluxos/cancelamento');
const StateManager          = require('./stateManager');
const QRCode = require('qrcode');
const express = require('express');
const cors = require('cors');

// =====================================================
// SERVIÇOS
// =====================================================
const { dispararCobrancaReal } = require('./services/cobrancaService');
const { verificarCobrancasAutomaticas } = require('./services/adminService');
const { analisarImagem } = require('./services/midiaService');
const { horaLocal, atendenteDisponivel, proximoAtendimento, falarSinalAmigavel, redeNormal } = require('./services/utilsService');
const sseService = require('./services/sseService');

const P = "🤖 *Assistente JMENET*\n\n";

// =====================================================
// FIREBASE
// =====================================================
const { db: firebaseDb } = require('./config/firebase');
const banco = require('./database/funcoes-firebase');
const agendamentos = require('./database/agendamentos-firebase')(firebaseDb);
const instalacoesAgendadas = require('./database/instalacoes-agendadas-firebase')(firebaseDb);

const criarUtils = require('./shared/utils');
const fs = require('fs');
const path = require('path');

agendamentos.inicializarTabela();
instalacoesAgendadas.criarTabela();

// =====================================================
// CONFIGURAÇÕES
// =====================================================
const DATA_PATH = (() => {
    if (process.env.RAILWAY_VOLUME_MOUNT_PATH) return process.env.RAILWAY_VOLUME_MOUNT_PATH;
    if (process.env.FLY_VOLUME_MOUNT_PATH) return process.env.FLY_VOLUME_MOUNT_PATH;
    if (process.env.FLY_MOUNT_DIR) return process.env.FLY_MOUNT_DIR;
    return '/data'; // Fallback para Fly.io
})();

console.log(`📁 Dados persistentes em: ${DATA_PATH}`);
if (!fs.existsSync(DATA_PATH)) fs.mkdirSync(DATA_PATH, { recursive: true });

const utils = criarUtils(groqChatFallback);

const ADMINISTRADORES = ['558184636954@c.us'].filter(Boolean);  // adicione mais números aqui
const FUNCIONARIOS = ['558185937690@c.us', '558198594699@c.us', '558184597727@c.us', '558184065116@c.us']; 
const chavePixExibicao = "jmetelecomnt@gmail.com";

let botAtivo = true;
let situacaoRede = 'normal';
let previsaoRetorno = 'sem previsão';
let motivoRede = '';
let horarioFuncionamento = { inicio: 8, fim: 20, ativo: true };
let horarioCobranca = { inicio: 8, fim: 17 };
let botIniciadoEm = null;
let ultimoQR = null;

const state = new StateManager(null);

const metrics = { erros: [] };

let _fluxoSuporte, _fluxoFinanceiro, _fluxoPromessa, _fluxoNovoCliente, _fluxoCancelamento;

const fotosPendentes = new Map();

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
        if (baixa.sucesso) {
            // Achou pelo telefone — confirma ao cliente e notifica admin
            await client.sendMessage(deQuem,
                `${P}Comprovante recebido e pagamento confirmado! ✅\n\n` +
                `Obrigado, *${baixa.nomeCliente.split(' ')[0]}*! Sua internet já está em dia. 😊`
            );
            await banco.dbLogComprovante(deQuem);
            for (const adm of ADMINISTRADORES) {
                client.sendMessage(adm,
                    `✅ *BAIXA AUTOMÁTICA VIA COMPROVANTE*\n\n` +
                    `👤 ${baixa.nomeCliente}\n` +
                    `📱 ${deQuem.replace('@c.us','')}\n` +
                    `💰 R$ ${analise.valor || 'N/A'}`
                ).catch(() => {});
            }
            sseService.broadcast();
            sseService.notificar('clientes');
            return true;
        } else {
            // Não achou pelo telefone — pede o nome
            await client.sendMessage(deQuem,
                `${P}Recebi seu comprovante! 😊\n\n` +
                `Para dar baixa no sistema, me informe o *nome completo do titular* da internet.`
            );
            state.iniciar(deQuem, 'aguardando_nome_comprovante', 'nome', { analise });
            return true;
        }
    }
    return false;
}


// Registra pagamento na coleção pagamentos_hoje para o caixa do dia
// Custo: 1 escrita — evita 74 leituras no caixa-hoje
async function registrarPagamentoHoje(firebaseDb, clienteId, clienteData, formaBaixa, valor) {
    try {
        const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
        const hoje = agoraBR.toISOString().split('T')[0];
        const planoLower = (clienteData.plano || '').toLowerCase();
        let valor_plano = null;
        if (planoLower.includes('iptv') || planoLower.includes('70')) valor_plano = 70;
        else if (planoLower.includes('200') || planoLower.includes('fibra')) valor_plano = 60;
        else if (planoLower.includes('50') || planoLower.includes('cabo')) valor_plano = 50;

        await firebaseDb.collection('pagamentos_hoje').doc(clienteId + '_' + hoje).set({
            data: hoje,
            cliente_id: clienteId,
            nome: clienteData.nome || '—',
            plano: clienteData.plano,
            forma_pagamento: clienteData.forma_pagamento,
            forma_baixa: formaBaixa || 'Comprovante',
            pago_em: new Date().toISOString(),
            valor_plano,
            valor: valor || null
        });
    } catch(e) {
        console.error('Erro ao registrar pagamento_hoje:', e.message);
    }
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
        const docId = mesRef.replace('/', '-'); // "03/2026" → "03-2026" (Firestore não aceita '/' no ID)
        
        await firebaseDb.collection('clientes')
            .doc(cliente.id)
            .collection('historico_pagamentos')
            .doc(docId)
            .set({
                referencia: mesRef,  // exibição: mantém "03/2026"
                status: 'pago',
                forma_pagamento: 'Comprovante',
                pago_em: new Date().toISOString(),
                data_vencimento: cliente.dia_vencimento || 10,
                valor: analise.valor
            }, { merge: true });

        // Registra no caixa do dia — 1 escrita, evita 74 leituras no dashboard
        await registrarPagamentoHoje(firebaseDb, cliente.id, cliente, 'Comprovante', analise.valor);

        return { sucesso: true, nomeCliente: cliente.nome, valido: analise.valido };
    } catch(e) {
        console.error('Erro em darBaixaAutomatica:', e);
        return { sucesso: false, nomeCliente: null, valido: false };
    }
}

async function abrirChamadoComMotivo(deQuem, nome, motivo, extras = {}) {
    state.setAtendimentoHumano(deQuem, true);
    await banco.dbSalvarAtendimentoHumano(deQuem).catch(() => {});
    await banco.dbAbrirChamado(deQuem, nome || null, motivo).catch(() => {});
    
    let msg = `🔔 *Novo chamado!*\n\n📱 *Número:* ${deQuem.replace('@c.us','')}\n👤 *Nome:* ${nome || 'não informado'}\n🔧 *Motivo:* ${motivo}\n`;
    if (extras.endereco) msg += `📍 *Endereço:* ${extras.endereco}\n`;
    if (extras.disponibilidade) msg += `📅 *Disponibilidade:* ${extras.disponibilidade}\n`;
    if (extras.fotoEnviada) msg += `📷 *Foto do roteador:* enviada\n`;
    if (extras.descricaoRoteador) msg += `💡 *Luzes:* ${extras.descricaoRoteador}\n`;
    
    for (const adm of ADMINISTRADORES) await client.sendMessage(adm, msg).catch(() => {});
}

// =====================================================
// CLIENTE DO WHATSAPP
// =====================================================
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(DATA_PATH, '.wwebjs_auth') }),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'], headless: true }
});

client.on('qr', (qr) => { ultimoQR = qr; console.log('📱 QR Code gerado. Acesse /qr para escanear.'); });

client.on('disconnected', (reason) => {
    console.log('❌ WhatsApp desconectado:', reason);
    botIniciadoEm = null; // marca como offline
    sseService.broadcast();
});

// =====================================================
// CONFIGURAÇÃO DO EXPRESS
// =====================================================
const app = express();
app.use(cors());
app.use(express.json());

app.get('/qr', async (req, res) => {
    if (!ultimoQR) return res.status(404).send('Nenhum QR Code disponível.');
    try { res.type('png').send(await QRCode.toBuffer(ultimoQR, { type: 'png', margin: 1 })); } 
    catch (err) { res.status(500).send('Erro ao gerar QR.'); }
});

app.get('/api/status-stream', (req, res) => {
    sseService.handleConnection(req, res);
});

// =====================================================
// CONTEXTO PARA ROTAS E FLUXOS
// =====================================================
const ctxRotas = {
    db: firebaseDb, 
    banco, 
    state, 
    client, 
    ADMINISTRADORES,
    dbRelatorio: banco.dbRelatorio,
    dbListarChamados: banco.dbListarChamados,
    dbAtualizarChamado: banco.dbAtualizarChamado,
    dbSalvarAtendimentoHumano: banco.dbSalvarAtendimentoHumano,
    dbRemoverAtendimentoHumano: banco.dbRemoverAtendimentoHumano,
    // botAtivo como getter/setter — mantém ctxRotas e variável local sincronizados
    get botAtivo() { return botAtivo; },
    set botAtivo(v) { botAtivo = v; },
    get botIniciadoEm() { return botIniciadoEm; },
    set botIniciadoEm(v) { botIniciadoEm = v; },
    get situacaoRede() { return situacaoRede; },
    set situacaoRede(v) { situacaoRede = v; },
    get previsaoRetorno() { return previsaoRetorno; },
    set previsaoRetorno(v) { previsaoRetorno = v; },
    get motivoRede() { return motivoRede; },
    set motivoRede(v) { motivoRede = v; },
    horarioFuncionamento, 
    horarioCobranca,
    dispararCobrancaReal: (data, tipo) => dispararCobrancaReal(client, firebaseDb, data, tipo),
    sseService,
    obterAgendaDia: (dia, mes, ano) => obterAgendaDia(firebaseDb, dia, mes, ano),
    executarMigracao: () => ({}),
    isentarMesEntrada: async (clienteId, diaVencimento) => {
        try {
            const hoje = new Date();
            const mesRef = `${String(hoje.getMonth()+1).padStart(2,'0')}-${hoje.getFullYear()}`;
            await firebaseDb.collection('clientes').doc(clienteId)
                .collection('historico_pagamentos').doc(mesRef).set({
                    referencia: `${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}`,
                    status: 'isento',
                    forma_pagamento: 'Mês de instalação',
                    pago_em: new Date().toISOString(),
                    data_vencimento: parseInt(diaVencimento) || 10
                });
            console.log(`✅ Mês isento registrado para cliente ${clienteId}`);
        } catch(e) {
            console.error('Erro ao isentar mês de entrada:', e);
        }
    },
    verificarPromessasVencidas: async () => {
        try {
            const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
            const hoje = agoraBR.toISOString().split('T')[0];
            const snap = await firebaseDb.collection('promessas')
                .where('status', '==', 'pendente')
                .get();
            let vencidas = 0;
            const batch = firebaseDb.batch();
            snap.docs.forEach(doc => {
                const p = doc.data();
                if (!p.data_promessa) return;
                // Normaliza para YYYY-MM-DD
                let dataPromessa = p.data_promessa;
                if (dataPromessa.includes('/')) {
                    const [d, m, y] = dataPromessa.split('/');
                    dataPromessa = `${y}-${m}-${d}`;
                }
                if (dataPromessa < hoje) {
                    batch.update(doc.ref, { status: 'vencida' });
                    vencidas++;
                }
            });
            if (vencidas > 0) {
                await batch.commit();
                // Volta status dos clientes com promessa vencida para pendente
                const clientesSnap = await firebaseDb.collection('clientes')
                    .where('status', '==', 'promessa').get();
                const batchClientes = firebaseDb.batch();
                clientesSnap.docs.forEach(doc => batchClientes.update(doc.ref, { status: 'pendente' }));
                await batchClientes.commit();
                console.log(`🤝 ${vencidas} promessa(s) vencida(s) marcadas.`);
            }
            return vencidas;
        } catch(e) { console.error('Erro verificarPromessasVencidas:', e); return 0; }
    },
    fs, 
    path
};

sseService.init(ctxRotas);

require('./routes/index')(app, ctxRotas);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🌐 Painel rodando em http://localhost:${PORT}`));

// =====================================================
// INICIALIZAÇÃO DOS FLUXOS
// =====================================================
function inicializarFluxos() {
    const ctx = {
        client, db: firebaseDb, banco, state, ADMINISTRADORES,
        P, chavePixExibicao,
        get situacaoRede() { return situacaoRede; },
        get previsaoRetorno() { return previsaoRetorno; },
        falarSinalAmigavel: (...args) => falarSinalAmigavel(args[0] !== undefined ? args[0] : situacaoRede, args[1] !== undefined ? args[1] : previsaoRetorno),
        redeNormal: (...args) => redeNormal(args[0] !== undefined ? args[0] : situacaoRede),
        atendenteDisponivel: () => atendenteDisponivel(horarioFuncionamento),
        proximoAtendimento: () => proximoAtendimento(horarioFuncionamento),
        horaLocal, analisarImagem, groqChatFallback,
        normalizarTexto: utils.normalizarTexto || (t => t),
        buscarStatusCliente: banco.buscarStatusCliente,
        darBaixaAutomatica, abrirChamadoComMotivo, utils,
        dbLog: banco.dbLog, dbSalvarHistorico: banco.dbSalvarHistorico,
        dbCarregarHistorico: banco.dbCarregarHistorico,
        dbIniciarAtendimento: banco.dbIniciarAtendimento,
        dbEncerrarAtendimento: banco.dbEncerrarAtendimento,
        dbSalvarNovoCliente: banco.dbSalvarNovoCliente,
        dbAbrirChamado: banco.dbAbrirChamado,
        dbAtualizarChamado: banco.dbAtualizarChamado,
    };

    // Callback de expiração de sessão por inatividade
    ctx.encerrarSessaoPorInatividade = async (numero) => {
        try {
            if (state.hasFluxo(numero) || state.isAtendimentoHumano(numero)) {
                // Ainda tem estado — avisa e limpa
                await client.sendMessage(numero,
                    `🤖 *Assistente JMENET*\n\nPor inatividade, encerramos o atendimento. Se precisar de algo é só chamar! 😊`
                ).catch(() => {});
            }
            state.encerrarFluxo(numero);
            await banco.dbEncerrarAtendimento(numero, 'inatividade').catch(() => {});
        } catch(_) {}
    };

    // Sobrescreve iniciarTimer para já incluir o callback de expiração
    const _iniciarTimerOriginal = state.iniciarTimer.bind(state);
    state.iniciarTimer = (numero, callback, ms) => {
        const cb = callback || ctx.encerrarSessaoPorInatividade;
        _iniciarTimerOriginal(numero, cb, ms || 10 * 60 * 1000);
    };

    _fluxoSuporte     = criarFluxoSuporte(ctx);
    _fluxoFinanceiro  = criarFluxoFinanceiro(ctx);
    _fluxoPromessa    = criarFluxoPromessa(ctx);
    _fluxoNovoCliente = criarFluxoNovoCliente(ctx);
    _fluxoCancelamento = criarFluxoCancelamento(ctx);

    console.log('✅ Fluxos inicializados!');
}

app.get('/api/status', (req, res) => {
    res.json({
        botAtivo: botAtivo,
        online: botIniciadoEm ? true : false,
        iniciadoEm: botIniciadoEm,
        atendimentosAtivos: state?.stats()?.atendimentoHumano || 0,
        situacaoRede: situacaoRede,
        previsaoRetorno: previsaoRetorno,
    });
});

// =====================================================
// MENUS
// =====================================================
const MENU_PRINCIPAL = `🤖 *Assistente JMENET*

Olá! Como posso te ajudar? 😊

1️⃣ Problema com a internet
2️⃣ Pagamento / Financeiro
3️⃣ Cancelamento
4️⃣ Falar com atendente`;

const MENU_FINANCEIRO = `🤖 *Assistente JMENET*

Como prefere pagar? 💰

1️⃣ PIX
2️⃣ Boleto bancário
3️⃣ Carnê físico
4️⃣ Dinheiro (cobrador)
5️⃣ Já efetuei o pagamento`;

// =====================================================
// DETECTAR PROMESSA/AGENDAMENTO NA FALA DO ADMIN
// =====================================================
async function detectarAcaoAdmin(para, textoAdmin) {
    const t = textoAdmin.toLowerCase();
    const utils = criarUtils(groqChatFallback);

    // Detecta promessa de pagamento
    const padroePromessa = [
        /promete[uo]u?\s+pagar/i, /vai\s+pagar/i, /paga\s+(dia|amanhã|hoje)/i,
        /prometeu\s+(dia|até)/i, /pagamento\s+(dia|até|amanhã)/i
    ];
    if (padroePromessa.some(r => r.test(t))) {
        try {
            const dataExtraida = await utils.extrairDataPromessa(textoAdmin);
            if (dataExtraida) {
                const clienteDoc = await banco.buscarClientePorTelefone(
                    para.replace('@c.us','').replace(/^55/,'')
                );
                await firebaseDb.collection('promessas').add({
                    numero: para,
                    nome: clienteDoc?.nome || null,
                    data_promessa: dataExtraida,
                    status: 'pendente',
                    notificado: 0,
                    criado_em: new Date().toISOString(),
                    origem: 'admin'
                });
                if (clienteDoc?.id) {
                    await firebaseDb.collection('clientes').doc(clienteDoc.id).update({
                        status: 'promessa', atualizado_em: new Date().toISOString()
                    });
                }
                sseService.notificar('clientes');
                console.log(`🤝 Promessa registrada automaticamente: ${para.slice(-8)} — ${dataExtraida}`);
                for (const adm of ADMINISTRADORES) {
                    client.sendMessage(adm,
                        `🤝 *Promessa registrada automaticamente*\n` +
                        `👤 ${clienteDoc?.nome || para.replace('@c.us','')}\n` +
                        `📅 Dia: ${dataExtraida}`
                    ).catch(() => {});
                }
            }
        } catch(e) { console.error('Erro ao registrar promessa do admin:', e.message); }
    }

    // Detecta agendamento de visita técnica
    const padroesVisita = [
        /agendei\s+(visita|técnico|instalação)/i, /vou\s+(passar|mandar)\s+(técnico|lá)/i,
        /técnico\s+(vai|passa)\s+(dia|amanhã|hoje)/i, /visita\s+(dia|amanhã|hoje|marcada)/i
    ];
    if (padroesVisita.some(r => r.test(t))) {
        try {
            const dataExtraida = await utils.extrairDataPromessa(textoAdmin);
            const clienteDoc = await banco.buscarClientePorTelefone(
                para.replace('@c.us','').replace(/^55/,'')
            );
            await firebaseDb.collection('agendamentos').add({
                numero: para,
                nome: clienteDoc?.nome || null,
                data: dataExtraida || null,
                tipo: 'visita_tecnica',
                status: 'agendado',
                origem: 'admin',
                criado_em: new Date().toISOString()
            });
            sseService.notificar('chamados');
            console.log(`📅 Visita técnica registrada automaticamente: ${para.slice(-8)}`);
        } catch(e) { console.error('Erro ao registrar visita:', e.message); }
    }
}

// =====================================================
// MENSAGENS ENVIADAS PELO ADMIN (fromMe) — listener único
// Quando admin digita no chat do cliente, bot assume o atendimento
// =====================================================
client.on('message_create', async (msg) => {
    if (!msg.fromMe) return;
    const para = msg.to;
    if (!para || para.includes('@g.us') || para === 'status@broadcast') return;
    if (ADMINISTRADORES.includes(para)) return;

    const corpo = msg.body || '';
    if (corpo.startsWith('🤖') || corpo.startsWith('💳') || corpo.startsWith('✅') || corpo === '') return;

    if (!state.isAtendimentoHumano(para)) {
        state.setAtendimentoHumano(para, true);
        await banco.dbSalvarAtendimentoHumano(para).catch(() => {});
        sseService.notificar('estados');
        console.log(`👤 Admin assumiu ${para.replace('@c.us','')}`);
    }

    if (corpo.length > 10) detectarAcaoAdmin(para, corpo).catch(() => {});

    state.iniciarTimer(para, async (numero) => {
        state.setAtendimentoHumano(numero, false);
        state.encerrarFluxo(numero);
        await banco.dbRemoverAtendimentoHumano(numero).catch(() => {});
        console.log(`⏰ Atendimento humano expirado: ${numero.replace('@c.us','')}`);
    }, 2 * 60 * 60 * 1000);
});

// =====================================================
// EVENTO DE MENSAGEM
// =====================================================
client.on('message', async (msg) => {
    if (msg.from === 'status@broadcast' || msg.from.includes('@g.us')) return;
    const deQuem = msg.from;
    if (FUNCIONARIOS.includes(deQuem)) return;
    if (!botIniciadoEm || (msg.timestamp * 1000) < botIniciadoEm) return;
    if (!botAtivo && !ADMINISTRADORES.includes(deQuem)) return;

    // ── COMANDOS ADMIN ─────────────────────────────────
    if (ADMINISTRADORES.includes(deQuem)) {
        const texto = msg.body || '';
        const args = texto.split(' ');
        const comando = args[0].toLowerCase();

        if (comando === '!sim' || comando === '!nao' || comando === '!cobrar-sim' || comando === '!cobrar-nao') {
            const resposta = (comando === '!sim' || comando === '!cobrar-sim') ? 'aprovado' : 'negado';
            let votacaoId = args[1] || null;
            if (!votacaoId) {
                const doc = await firebaseDb.collection('config').doc('ultima_votacao').get();
                votacaoId = doc.exists ? doc.data().votacaoId : null;
            }
            if (!votacaoId) return msg.reply('❌ Nenhuma votação ativa.');
            const vDoc = await firebaseDb.collection('votacoes').doc(votacaoId).get();
            if (!vDoc.exists || vDoc.data().resolvido) return msg.reply('❌ Votação não encontrada.');
            await firebaseDb.collection('votacoes').doc(votacaoId).update({
                status: 'respondido', resolvido: true, resultado: resposta,
                respondido_por: deQuem, respondido_em: new Date().toISOString()
            });
            return msg.reply(resposta === 'aprovado' ? '✅ Cobrança autorizada!' : '❌ Cobrança pulada.');
        }
        if (comando === '!bot') {
            if (args[1] === 'off') { botAtivo = false; sseService.broadcast(); return msg.reply('🔴 Bot desativado.'); }
            if (args[1] === 'on')  { botAtivo = true;  sseService.broadcast(); return msg.reply('🟢 Bot ativado.'); }
        }
        if (comando === '!status') return msg.reply(`📊 Bot: ${botAtivo ? '✅' : '❌'} | Rede: ${situacaoRede} | Atendimentos: ${state?.stats()?.atendimentoHumano || 0}`);
        if (comando === '!rede') {
            const novoStatus = args[1];
            if (!['normal','instavel','manutencao','fibra_rompida'].includes(novoStatus))
                return msg.reply('❌ Use: !rede normal | instavel | manutencao | fibra_rompida');
            ctxRotas.situacaoRede = novoStatus;
            ctxRotas.previsaoRetorno = args.slice(2).join(' ').replace(/["']/g,'') || 'sem previsão';
            sseService.broadcast();
            return msg.reply(`✅ Rede: ${novoStatus}`);
        }
        if (comando === '!cobrar') {
            const data = args[1];
            if (!['10','20','30'].includes(data)) return msg.reply('❌ Use: !cobrar 10|20|30');
            msg.reply('⏳ Iniciando...');
            setTimeout(async () => {
                const total = await dispararCobrancaReal(client, firebaseDb, data, args[2] || null);
                client.sendMessage(deQuem, `✅ Cobrança dia ${data}: ${total} mensagens`);
            }, 100);
            return;
        }
        if (comando === '!assumir') {
            const num = args[1]?.replace(/\D/g,'');
            if (!num) return msg.reply('❌ Use: !assumir 819xxxxxxx');
            const numWpp = (num.startsWith('55') ? num : '55' + num) + '@c.us';
            state.setAtendimentoHumano(numWpp, true);
            await banco.dbSalvarAtendimentoHumano(numWpp).catch(() => {});
            return msg.reply(`✅ Assumido ${num}. Use !liberar ${num} para devolver.`);
        }
        if (comando === '!liberar') {
            const num = args[1]?.replace(/\D/g,'');
            if (!num) return msg.reply('❌ Use: !liberar 819xxxxxxx');
            const numWpp = (num.startsWith('55') ? num : '55' + num) + '@c.us';
            state.setAtendimentoHumano(numWpp, false);
            state.encerrarFluxo(numWpp);
            await banco.dbRemoverAtendimentoHumano(numWpp).catch(() => {});
            await client.sendMessage(numWpp, `${P}Olá! Se precisar de algo é só chamar! 😊`).catch(() => {});
            return msg.reply(`✅ ${num} devolvido ao bot.`);
        }
        if (comando === '!listar') {
            const humanos = Object.entries(state.todos?.() || {})
                .filter(([,v]) => v.atendimentoHumano)
                .map(([n]) => n.replace('@c.us','').replace(/^55/,''));
            return msg.reply(humanos.length ? `👤 Em atendimento:\n${humanos.join('\n')}` : '✅ Nenhum em atendimento.');
        }
        if (comando === '!ajuda') {
            return msg.reply(`📚 *COMANDOS*\n!bot on/off | !status | !rede | !cobrar 10|20|30 | !assumir N | !liberar N | !listar`);
        }
        return;
    }

    // ── CLIENTES ───────────────────────────────────────
    if (msg.type === 'sticker') return;

    // Comprovante — processa mesmo em atendimento humano
    if (msg.hasMedia && ['image','document'].includes(msg.type)) {
        await processarMidiaAutomatico(deQuem, msg);
        return;
    }

    // Se admin está respondendo, não interfere
    if (state.isAtendimentoHumano(deQuem)) return;

    const texto = msg.body?.trim() || '';
    if (!texto) return;

    console.log(`\n📨 ${deQuem.slice(-8)}: "${texto}"`);

    const fluxoAtivo = state.getFluxo(deQuem);
    const t = texto.toLowerCase();

    // ── Fluxo ativo → delega para o fluxo correspondente ──
    if (fluxoAtivo === 'suporte')      { await _fluxoSuporte.handle(deQuem, msg);      return; }
    if (fluxoAtivo === 'financeiro')   { await _fluxoFinanceiro.handle(deQuem, msg);   return; }
    if (fluxoAtivo === 'promessa')     { await _fluxoPromessa.handle(deQuem, msg);     return; }
    if (fluxoAtivo === 'cancelamento') { await _fluxoCancelamento.handle(deQuem, msg); return; }
    if (fluxoAtivo === 'novoCliente')  { await _fluxoNovoCliente.handle(deQuem, msg);  return; }

    // ── Sub-menu financeiro ─────────────────────────────
    if (fluxoAtivo === 'menu_financeiro') {
        state.encerrarFluxo(deQuem);
        if (t === '1' || t.includes('pix') || t.includes('transferência') || t.includes('transferencia')) {
            await _fluxoFinanceiro.iniciar(deQuem, msg, 'PIX'); return;
        }
        if (t === '2' || t.includes('boleto')) {
            await _fluxoFinanceiro.iniciar(deQuem, msg, 'BOLETO'); return;
        }
        if (t === '3' || t.includes('carnê') || t.includes('carne') || t.includes('físico') || t.includes('fisico')) {
            await _fluxoFinanceiro.iniciar(deQuem, msg, 'CARNE'); return;
        }
        if (t === '4' || t.includes('dinheiro') || t.includes('cobrador') || t.includes('espécie') || t.includes('especie')) {
            await _fluxoFinanceiro.iniciar(deQuem, msg, 'DINHEIRO'); return;
        }
        if (t === '5' || t.includes('paguei') || t.includes('já paguei') || t.includes('feito') || t.includes('efetuei')) {
            await _fluxoFinanceiro.iniciar(deQuem, msg, 'PAGO'); return;
        }
        // Não entendeu — mostra menu financeiro de novo
        await client.sendMessage(deQuem, MENU_FINANCEIRO);
        state.iniciar(deQuem, 'menu_financeiro', 'aguardando_escolha', {});
        return;
    }

    // ── Menu principal ──────────────────────────────────
    if (fluxoAtivo === 'menu') {
        state.encerrarFluxo(deQuem);
        if (t === '1' || t.includes('internet') || t.includes('caiu') || t.includes('lento') ||
            t.includes('sinal') || t.includes('suporte') || t.includes('técnico') || t.includes('tecnico')) {
            if (!redeNormal(situacaoRede)) {
                const infoRede = falarSinalAmigavel(situacaoRede, previsaoRetorno, motivoRede);
                const hora = new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCHours();
                const fora = hora < 8 || hora >= 20;
                await client.sendMessage(deQuem,
                    `${P}${infoRede}\n\n` + (fora
                        ? `Sabemos do problema. Nossa equipe vai entrar em contato no início do expediente. 🙏`
                        : `Nossa equipe já está trabalhando para resolver. 🙏`)
                );
                await abrirChamadoComMotivo(deQuem, null, `Reclamação — rede ${situacaoRede}`);
                return;
            }
            await _fluxoSuporte.iniciar(deQuem, msg);
            return;
        }
        if (t === '2' || t.includes('pagar') || t.includes('pagamento') || t.includes('pix') ||
            t.includes('boleto') || t.includes('carnê') || t.includes('carne') || t.includes('financeiro')) {
            await client.sendMessage(deQuem, MENU_FINANCEIRO);
            state.iniciar(deQuem, 'menu_financeiro', 'aguardando_escolha', {});
            return;
        }
        if (t === '3' || t.includes('cancelar') || t.includes('cancelamento') || t.includes('encerrar')) {
            await _fluxoCancelamento.iniciar(deQuem, msg);
            return;
        }
        if (t === '4' || t.includes('atendente') || t.includes('humano') || t.includes('pessoa') || t.includes('falar')) {
            await client.sendMessage(deQuem, `${P}Vou chamar um atendente! Aguarda um instante. 😊`);
            await abrirChamadoComMotivo(deQuem, null, 'Cliente solicitou atendente');
            return;
        }
        // Não entendeu — mostra menu de novo
        await client.sendMessage(deQuem, MENU_PRINCIPAL);
        state.iniciar(deQuem, 'menu', 'aguardando_escolha', {});
        return;
    }

    // ── Sem fluxo ativo → mostra menu principal ─────────
    await client.sendMessage(deQuem, MENU_PRINCIPAL);
    state.iniciar(deQuem, 'menu', 'aguardando_escolha', {});
});

// =====================================================
// COBRANÇA AUTOMÁTICA
// =====================================================
setInterval(async () => {
    await verificarCobrancasAutomaticas(
        client, firebaseDb, ADMINISTRADORES,
        situacaoRede, previsaoRetorno, () => redeNormal(situacaoRede),
        (data, tipo) => dispararCobrancaReal(client, firebaseDb, data, tipo)
    );
}, 2 * 60 * 60 * 1000); // a cada 2 horas

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
// RESET MENSAL: todo dia 1 às 00:05 (horário Brasília)
// Volta todos os clientes 'pago' para 'pendente'
// =====================================================


// =====================================================
// PROMESSAS DO DIA
// =====================================================
async function verificarPromessasDoDia() {
    try {
        const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
        const hoje = agoraBR.toISOString().split('T')[0];
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
    const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const horaBR = agoraBR.getUTCHours();
    const minBR  = agoraBR.getUTCMinutes();
    if (horaBR === 8 && minBR === 0) await verificarPromessasDoDia();
}, 60 * 1000);

// =====================================================
// READY
// =====================================================
client.on('ready', async () => {
    inicializarFluxos();
    ctxRotas.botIniciadoEm = Date.now();

    // ── Restaura configurações salvas no Firebase ANTES do broadcast ──
    try {
        const [cfgBot, cfgRede, cfgPrevisao, cfgHorario, cfgCobranca] = await Promise.all([
            firebaseDb.collection('config').doc('bot_ativo').get(),
            firebaseDb.collection('config').doc('situacao_rede').get(),
            firebaseDb.collection('config').doc('previsao_retorno').get(),
            firebaseDb.collection('config').doc('horario_atendente').get(),
            firebaseDb.collection('config').doc('horario_cobranca').get(),
        ]);

        if (cfgBot.exists)      botAtivo = cfgBot.data().valor ?? true;
        if (cfgRede.exists)     situacaoRede = cfgRede.data().valor ?? 'normal';
        if (cfgPrevisao.exists) previsaoRetorno = cfgPrevisao.data().valor ?? 'sem previsão';
        const cfgMotivo = await firebaseDb.collection('config').doc('motivo_rede').get();
        if (cfgMotivo.exists) motivoRede = cfgMotivo.data().valor ?? '';
        if (cfgHorario.exists)  Object.assign(horarioFuncionamento, cfgHorario.data());
        if (cfgCobranca.exists) Object.assign(horarioCobranca, cfgCobranca.data());

        console.log(`⚙️  Config restaurada: bot=${botAtivo ? 'ON' : 'OFF'} | rede=${situacaoRede}`);
    } catch(e) {
        console.error('⚠️  Erro ao restaurar config:', e.message);
    }

    // Broadcast APÓS restaurar — garante que o front recebe o estado correto
    sseService.broadcast();

    // ── Restaura atendimentos humanos abertos ──────────────────────
    try {
        const atendimentos = await banco.dbCarregarAtendimentosHumanos();
        atendimentos.forEach(a => state.setAtendimentoHumano(a.numero, true));
        if (atendimentos.length > 0) {
            console.log(`👤 ${atendimentos.length} atendimento(s) humano(s) restaurado(s)`);
        }
    } catch(e) {
        console.error('⚠️  Erro ao restaurar atendimentos:', e.message);
    }

    const NUMERO_TESTE = '558187500456@c.us';
    if (state.limpar) state.limpar(NUMERO_TESTE);
    if (banco.dbLimparHistorico) await banco.dbLimparHistorico(NUMERO_TESTE);

    console.log(`\n🚀 JMENET: Sistema online!`);
    console.log(`🤖 Bot IA: ${botAtivo ? 'LIGADO ✅' : 'DESLIGADO ❌'}`);
    console.log(`📡 Rede: ${situacaoRede} | Previsão: ${previsaoRetorno}`);
    console.log(`🔥 Banco de dados: Firebase Firestore`);
});

client.initialize();