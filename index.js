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
const sseService = require('./services/sseService');
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

const ADMINISTRADORES = ['558184636954@c.us'].filter(Boolean);  // adicione mais números aqui
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
// CONTEXTO PARA PROCESSAMENTO DE MENSAGENS (NOVO!)
// =====================================================
let messageContext = {}; // Será preenchido após inicialização dos fluxos

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
app.use(express.static(path.join(__dirname, 'frontend/dist')));

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
        classificador, detectorMultiplas,
        iniciarFluxoPorIntencao: (i, d, m) => iniciarFluxoPorIntencao(i, d, m),
        // processarResposta via lazy ref ao messageContext (populado depois de inicializarFluxos)
        processarResposta: (d, m) => processarMensagem(d, m, messageContext),
        verificarETransferir, fotosPendentes,
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

    // 🔥 NOVO: Preenche o messageContext com todas as dependências
    messageContext = {
        state, banco, client, utils, classificador, detectorMultiplas,
        verificarETransferir,
        // fluxos para delegarParaFluxo
        _fluxoSuporte, _fluxoFinanceiro, _fluxoPromessa, _fluxoNovoCliente, _fluxoCancelamento,
        responderComIA: (d, m) => responderComIA(d, m, { banco, client, groqChatFallback }),
        iniciarFluxoPorIntencao: (i, d, m) => iniciarFluxoPorIntencao(i, d, m),
        processarResposta: (d, m) => processarMensagem(d, m, messageContext),
        handleIdentificacao: (d, m) => handleIdentificacao(d, m, {
            state, banco, client, utils, verificarETransferir,
            processarAposIdentificacao: (d, n, o, i) => processarAposIdentificacao(d, n, o, i, {
                banco, state, client, iniciarFluxoPorIntencao,
                redeNormal: () => redeNormal(situacaoRede),
                falarSinalAmigavel: () => falarSinalAmigavel(situacaoRede, previsaoRetorno),
            })
        }),
        abrirChamadoComMotivo, darBaixaAutomatica,
        processingLock, filaEspera, P, logErro, metrics, processarFila,
        ADMINISTRADORES, sseService,
        get situacaoRede() { return situacaoRede; },
        get previsaoRetorno() { return previsaoRetorno; },
    };

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

async function iniciarFluxoPorIntencao(intencao, deQuem, msg) {
    // Guarda: cliente dizendo que resolveu não abre suporte
    if (intencao === 'SUPORTE') {
        const textoLower = (msg?.body || '').toLowerCase();
        const FRASES_RESOLVEU = [
            'tudo certo','tá certo','ta certo','voltou','já voltou','ja voltou',
            'resolveu','funcionou','tô bem','to bem','tudo bem','ficou bom',
            'está funcionando','esta funcionando','voltou a funcionar',
            'obrigado','obrigada','valeu','vlw','tmj','era só isso','era so isso',
        ];
        const parece_resolvido = FRASES_RESOLVEU.some(f => textoLower.includes(f));
        if (parece_resolvido) {
            console.log(`⚡ [SUPORTE] Falso-positivo bloqueado: "${msg?.body}"`);
            return; // não abre suporte
        }
    }
    // Reseta contador de não-entendidos quando detecta intenção válida
    if (intencao !== 'OUTRO') {
        state.atualizar(deQuem, { _naoEntendidos: 0 });
    }
    switch(intencao) {
        case 'SUPORTE': {
            // Se rede está com problema conhecido → responde direto sem pedir nome
            if (!redeNormal(situacaoRede)) {
                const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
                const hora = agoraBR.getUTCHours();
                const fora_horario = hora < 8 || hora >= 20;

                // Monta resposta empática com info do problema
                const infoRede = falarSinalAmigavel(situacaoRede, previsaoRetorno);
                let resposta = `${infoRede}\n\n`;

                if (fora_horario) {
                    resposta += `Sabemos do problema e nossa equipe vai entrar em contato assim que possível. 🙏\n\nSe a internet ainda estiver fora quando amanhecer, avisamos nossos técnicos para priorizarem o seu endereço.`;
                } else {
                    resposta += `Nossa equipe já está trabalhando para resolver. Vamos entrar em contato assim que normalizar. 🙏`;
                }

                await client.sendMessage(deQuem, `${P}${resposta}`);

                // Abre chamado automaticamente com número do cliente
                const nome = state.getDados(deQuem)?.nomeCliente || null;
                await abrirChamadoComMotivo(deQuem, nome, `Reclamação durante instabilidade (${situacaoRede})`);
                return;
            }
            await _fluxoSuporte.iniciar(deQuem, msg);
            break;
        }
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
        default:
            // Conta mensagens consecutivas não entendidas
            const dadosNaoEnt = state.getDados(deQuem) || {};
            const naoEntendidos = (dadosNaoEnt._naoEntendidos || 0) + 1;
            state.atualizar(deQuem, { _naoEntendidos: naoEntendidos });

            if (naoEntendidos === 2) {
                // Segunda tentativa — avisa que não entendeu e oferece menu
                await client.sendMessage(deQuem,
                    `${P}Hmm, não entendi muito bem. 😅 Pode me dizer com o que precisa de ajuda?\n\n` +
                    `1️⃣ Problema com a internet\n` +
                    `2️⃣ Pagamento / PIX\n` +
                    `3️⃣ Falar com atendente`
                );
                state.iniciar(deQuem, 'menu_rapido', 'aguardando_escolha', {});
            } else if (naoEntendidos >= 3) {
                // Terceira tentativa — chama atendente
                state.atualizar(deQuem, { _naoEntendidos: 0 });
                await client.sendMessage(deQuem,
                    `${P}Deixa eu chamar alguém pra te ajudar melhor. 😊 Aguarda um instante!`
                );
                await abrirChamadoComMotivo(deQuem,
                    state.getDados(deQuem)?.nomeCliente || null,
                    'Cliente — mensagem não reconhecida'
                );
            } else {
                // Primeira tentativa — tenta IA
                await responderComIA(deQuem, msg, { banco, client, groqChatFallback });
            }
    }
}

// =====================================================
// FUNÇÕES DE FILA
// =====================================================
function processarFila(deQuem) {
    const fila = filaEspera.get(deQuem) || [];
    if (fila.length > 0) {
        const proxima = fila.shift();
        if (fila.length === 0) filaEspera.delete(deQuem);
        else filaEspera.set(deQuem, fila);
        // 🔥 CORRIGIDO: Usa messageContext
        setImmediate(() => processarMensagem(deQuem, proxima, messageContext));
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
            // 🔥 CORRIGIDO: Usa messageContext
            await processarMensagem(deQuem, msgFake, messageContext);
        } else if (temMidia) {
            const itemMidia = fila.find(f => ['image','document'].includes(f.tipo));
            // Tenta processar como comprovante primeiro
            const processado = await processarMidiaAutomatico(deQuem, itemMidia.msg);
            if (!processado) {
                // Não era comprovante — processa normalmente (ex: foto do roteador no suporte)
                await processarMensagem(deQuem, itemMidia.msg, messageContext);
            }
        } else {
            const textoJunto = textos.join(' ').trim();
            if (!textoJunto) return;
            const msgCombinada = { ...fila[fila.length - 1].msg, body: textoJunto };
            // 🔥 CORRIGIDO: Usa messageContext
            await processarMensagem(deQuem, msgCombinada, messageContext);
        }
    }, delay);
    debounceTimers.set(deQuem, timer);
}

// =====================================================
// MENSAGENS ENVIADAS PELO ADMIN (fromMe)
// Quando admin digita direto no chat de um cliente, o bot para automaticamente
// =====================================================
client.on('message_create', async (msg) => {
    if (!msg.fromMe) return; // só mensagens enviadas por nós
    
    const para = msg.to;
    if (!para || para.includes('@g.us') || para === 'status@broadcast') return;
    if (ADMINISTRADORES.includes(para)) return; // conversa entre admins — ignora
    
    // Admin digitou para um cliente → assume o atendimento
    if (!state.isAtendimentoHumano(para)) {
        state.setAtendimentoHumano(para, true);
        await banco.dbSalvarAtendimentoHumano(para).catch(() => {});
        sseService.notificar('estados');
        console.log(`👤 Admin assumiu conversa com ${para.replace('@c.us','')} automaticamente`);
    }
    
    // Reinicia o timer de expiração — se admin parar de digitar por 30min, bot volta
    state.iniciarTimer(para, async (numero) => {
        state.setAtendimentoHumano(numero, false);
        state.encerrarFluxo(numero);
        await banco.dbRemoverAtendimentoHumano(numero).catch(() => {});
        console.log(`⏰ Atendimento humano expirado para ${numero.replace('@c.us','')} — bot retomou`);
    }, 2 * 60 * 60 * 1000); // 2 horas sem digitar → bot volta
});

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

        // !sim ou !nao — responde à última votação pendente
        if (comando === '!sim' || comando === '!nao' || comando === '!cobrar-sim' || comando === '!cobrar-nao') {
            const resposta = (comando === '!sim' || comando === '!cobrar-sim') ? 'aprovado' : 'negado';

            // Suporte ao formato antigo com ID explícito
            let votacaoId = args[1] || null;

            // Sem ID → pega a última votação ativa
            if (!votacaoId) {
                const ultimaDoc = await firebaseDb.collection('config').doc('ultima_votacao').get();
                votacaoId = ultimaDoc.exists ? ultimaDoc.data().votacaoId : null;
            }

            if (!votacaoId) {
                return msg.reply('❌ Nenhuma votação ativa no momento.');
            }

            const votacaoDoc = await firebaseDb.collection('votacoes').doc(votacaoId).get();
            if (!votacaoDoc.exists || votacaoDoc.data().resolvido) {
                return msg.reply('❌ Votação não encontrada ou já encerrada.');
            }

            await firebaseDb.collection('votacoes').doc(votacaoId).update({
                status: 'respondido',
                resolvido: true,
                resultado: resposta,
                respondido_por: deQuem,
                respondido_em: new Date().toISOString()
            });

            const emoji = resposta === 'aprovado' ? '✅' : '❌';
            return msg.reply(`${emoji} ${resposta === 'aprovado' ? 'Cobrança autorizada!' : 'Cobrança pulada.'}`);
        }
        
        if (comando === '!bot') {
            if (args[1] === 'off') { 
                botAtivo = false; 
                sseService.broadcast();
                return msg.reply("🔴 *IA DESATIVADA.*"); 
            }
            if (args[1] === 'on') { 
                botAtivo = true; 
                sseService.broadcast();
                return msg.reply("🟢 *IA ATIVADA.*"); 
            }
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
            
            ctxRotas.situacaoRede = novoStatus; 
            ctxRotas.previsaoRetorno = previsao;
            situacaoRede = novoStatus; 
            previsaoRetorno = previsao;
            
            sseService.broadcast();
            
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
        // !assumir NUMERO — admin toma a conversa, bot para de responder
        if (comando === '!assumir') {
            const numRaw = args[1]?.replace(/\D/g, '');
            if (!numRaw) return msg.reply('❌ Use: !assumir 819xxxxxxx');
            const numWpp = (numRaw.startsWith('55') ? numRaw : '55' + numRaw) + '@c.us';
            state.setAtendimentoHumano(numWpp, true);
            await banco.dbSalvarAtendimentoHumano(numWpp).catch(() => {});
            return msg.reply(`✅ Você assumiu o atendimento de *${numRaw}*\nO bot não vai mais responder esse cliente.\n\nQuando terminar: *!liberar ${numRaw}*`);
        }

        // !liberar NUMERO — devolve a conversa para o bot
        if (comando === '!liberar') {
            const numRaw = args[1]?.replace(/\D/g, '');
            if (!numRaw) return msg.reply('❌ Use: !liberar 819xxxxxxx');
            const numWpp = (numRaw.startsWith('55') ? numRaw : '55' + numRaw) + '@c.us';
            state.setAtendimentoHumano(numWpp, false);
            state.encerrarFluxo(numWpp);
            await banco.dbRemoverAtendimentoHumano(numWpp).catch(() => {});
            await client.sendMessage(numWpp,
                `🤖 *Assistente JMENET*\n\nOlá! Se precisar de algo, é só chamar! 😊`
            ).catch(() => {});
            return msg.reply(`✅ Conversa de *${numRaw}* devolvida para o bot.`);
        }

        // !listar — mostra quem está em atendimento humano
        if (comando === '!listar') {
            const stats = state.stats();
            const humanos = Object.entries(state.todos())
                .filter(([, v]) => v.atendimentoHumano)
                .map(([num]) => num.replace('@c.us', '').replace(/^55/, ''));
            if (humanos.length === 0) return msg.reply('✅ Nenhum cliente em atendimento humano no momento.');
            return msg.reply(`👤 *EM ATENDIMENTO HUMANO:*\n\n${humanos.map((n, i) => `${i+1}. ${n}`).join('\n')}\n\nUse *!liberar NUMERO* para devolver ao bot.`);
        }

        if (comando === '!ajuda') {
            return msg.reply(
                `📚 *COMANDOS*\n\n` +
                `🤖 *!bot on/off*\n📡 *!status*\n🌐 *!rede*\n💰 *!cobrar 10|20|30*\n` +
                `📋 *!pendentes 10|20|30*\n👤 *!assumir NUMERO*\n🔓 *!liberar NUMERO*\n📋 *!listar*`
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
        // 🔥 CORRIGIDO: Usa messageContext
        await processarMensagem(deQuem, msg, messageContext);
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
setInterval(async () => {
    const agora = new Date();
    const agoraBR = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
    const diaBR   = agoraBR.getUTCDate();
    const horaBR  = agoraBR.getUTCHours();
    const minBR   = agoraBR.getUTCMinutes();

    // Verifica promessas vencidas todo dia às 0h01 (UTC-3)
    if (horaBR === 0 && minBR === 1) {
        await ctxRotas.verificarPromessasVencidas().catch(() => {});
    }

    // Reset de atendimentos humanos todo dia às 20h (fim do expediente)
    if (horaBR === 20 && minBR === 0) {
        try {
            const atendimentos = await banco.dbCarregarAtendimentosHumanos();
            if (atendimentos.length > 0) {
                for (const a of atendimentos) {
                    state.setAtendimentoHumano(a.numero, false);
                    state.encerrarFluxo(a.numero);
                    await banco.dbRemoverAtendimentoHumano(a.numero).catch(() => {});
                }
                sseService.broadcast();
                console.log(`🔄 Reset de ${atendimentos.length} atendimento(s) humano(s) ao fim do expediente`);
            }
        } catch(e) {
            console.error('Erro no reset de atendimentos:', e);
        }
    }

    if (diaBR === 1 && horaBR === 0 && minBR === 5) {
        console.log('📅 Reset mensal: voltando clientes pagos para pendente...');
        try {
            const snap = await firebaseDb.collection('clientes')
                .where('status', '==', 'pago')
                .get();

            if (snap.empty) {
                console.log('📅 Nenhum cliente pago para resetar.');
                return;
            }

            // Processa em batches de 500 (limite do Firestore)
            const batch_size = 500;
            for (let i = 0; i < snap.docs.length; i += batch_size) {
                const batch = firebaseDb.batch();
                snap.docs.slice(i, i + batch_size).forEach(doc => {
                    batch.update(doc.ref, {
                        status: 'pendente',
                        atualizado_em: new Date().toISOString()
                    });
                });
                await batch.commit();
            }
            console.log(`📅 Reset mensal concluído: ${snap.size} clientes voltaram para pendente.`);

            for (const adm of ADMINISTRADORES) {
                await client.sendMessage(adm,
                    `📅 *RESET MENSAL CONCLUÍDO*\n\n${snap.size} clientes voltaram para pendente.\nA cobrança automática já pode rodar normalmente!`
                ).catch(() => {});
            }
        } catch(e) {
            console.error('Erro no reset mensal:', e);
        }
    }
}, 60 * 1000); // verifica a cada 1 min

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