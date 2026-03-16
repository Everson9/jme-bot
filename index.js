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

const { criarTabelas, dbGetConfig, dbSetConfig } = require('./database/database');
const criarFuncoesBanco = require('./database/funcoes');
const criarUtils = require('./shared/utils');
const criarClassificador = require('./shared/classificador');
const criarDetectorMultiplas = require('./shared/multiplasIntencoes');

const pdfParse = require('pdf-parse');

const db = criarTabelas();
const banco = criarFuncoesBanco(db);

const utils = criarUtils(groqChatFallback);
const classificador = criarClassificador(groqChatFallback);
const detectorMultiplas = criarDetectorMultiplas(groqChatFallback);

const ADMINISTRADORES = ['558184636954@c.us', '558186650773@c.us'];
const FUNCIONARIOS = ['558185937690@c.us', '558198594699@c.us', '558184597727@c.us', '558184065116@c.us']; 
const NUMEROS_TESTE = [];
const chavePixExibicao = "jmetelecomnt@gmail.com";

let botAtivo = true;
let situacaoRede = dbGetConfig('situacao_rede', 'normal');
let previsaoRetorno = dbGetConfig('previsao_retorno', 'sem previsão');
let horarioFuncionamento = { inicio: 8, fim: 20, ativo: true };
let horarioCobranca = { inicio: 8, fim: 17 };
let botIniciadoEm = null;
let ultimoQR = null;

const state = new StateManager(db);

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
const fotosPendentes = new Map(); // ← GLOBAL para comprovantes

const DEBOUNCE_TEXTO = 12000;
const DEBOUNCE_AUDIO = 10000;
const DEBOUNCE_MIDIA = 6000;

let _fluxoSuporte, _fluxoFinanceiro, _fluxoPromessa, _fluxoNovoCliente, _fluxoCancelamento;

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

function logErro(contexto, erro, dados = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        contexto,
        mensagem: erro.message,
        stack: erro.stack,
        dados
    };
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
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages,
                temperature,
                max_tokens: 1024,
            })
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

async function analisarImagem(msg) {
    try {
        if (typeof msg.downloadMedia !== 'function') return null;
        const media = await msg.downloadMedia();
        if (!media || !media.data) return null;

        // Se for PDF
        if (media.mimetype === 'application/pdf') {
            try {
                const pdfBuffer = Buffer.from(media.data, 'base64');
                const pdfData = await pdfParse(pdfBuffer);
                const textoPdf = pdfData.text;
                
                // Usa a IA para extrair dados do texto
                const prompt = `Analise o texto extraído de um comprovante de pagamento e extraia as informações em JSON.
                Responda apenas com o JSON, sem explicações.
                
                Texto: "${textoPdf.substring(0, 2000)}"
                
                Formato esperado:
                {
                    "categoria": "comprovante",
                    "valido": true/false,
                    "valor": 123.45,
                    "data": "DD/MM/AAAA",
                    "motivo_invalido": "se houver"
                }`;
                
                const resp = await groqChatFallback([{ role: 'user', content: prompt }], 0.1);
                const clean = resp.replace(/```json|```/g, '').trim();
                return JSON.parse(clean);
            } catch (pdfErr) {
                console.error('Erro ao processar PDF:', pdfErr);
                return {
                    categoria: 'comprovante',
                    valido: false,
                    motivo_invalido: 'Não foi possível ler o PDF'
                };
            }
        }

        // Se for imagem (código existente)
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                max_tokens: 500,
                messages: [{
                    role: "user",
                    content: [
                        {
                            type: "image_url",
                            image_url: { url: `data:${media.mimetype};base64,${media.data}` }
                        },
                        {
                            type: "text",
                            text: `Analise a imagem. Se for comprovante, extraia dados em JSON.`
                        }
                    ]
                }]
            })
        });

        const data = await response.json();
        const texto = data.choices?.[0]?.message?.content || '';
        const clean = texto.replace(/```json|```/g, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        console.error("Erro na análise de imagem/PDF:", e);
        return null;
    }
}

// =====================================================
// PROCESSAMENTO AUTOMÁTICO DE MÍDIA (COMPROVANTES)
// =====================================================
async function processarMidiaAutomatico(deQuem, msg) {
    console.log(`📷 Processando mídia automaticamente: ${msg.type}`);
    
    // Tenta analisar a imagem/PDF
    const analise = await analisarImagem(msg);
    
    if (!analise) {
        console.log('❌ Falha na análise, salvando para verificação manual');
        if (!fotosPendentes.has(deQuem)) {
            fotosPendentes.set(deQuem, []);
        }
        fotosPendentes.get(deQuem).push(msg);
        return false;
    }
    
    // Se for comprovante
    if (analise.categoria === 'comprovante') {
        console.log('✅ Mídia identificada como comprovante');
        
        // Tenta dar baixa automática
        const baixa = await darBaixaAutomatica(deQuem, analise);
        
        if (baixa.sucesso && baixa.nomeCliente) {
            // ✅ Cliente identificado e pagamento confirmado
            await client.sendMessage(deQuem, 
                `${P}Comprovante recebido e pagamento confirmado! ✅ Já dei baixa no sistema. Obrigado, ${baixa.nomeCliente}! 😊`
            );
            
            try { db.prepare(`INSERT INTO log_comprovantes (numero) VALUES (?)`).run(deQuem); } catch(_){}
            
            for (const adm of ADMINISTRADORES) {
                client.sendMessage(adm,
                    `✅ *BAIXA AUTOMÁTICA*\n\n👤 ${baixa.nomeCliente}\n📱 ${deQuem.replace('@c.us','')}\n💰 R$ ${analise.valor || 'N/A'}`
                ).catch(() => {});
            }
            return true;
            
        } else if (baixa.sucesso && !baixa.nomeCliente) {
            // ✅ Pagamento válido, mas cliente não identificado
            await client.sendMessage(deQuem,
                `${P}Recebi seu comprovante e o pagamento parece válido! ✅\n\n` +
                `Para confirmar em nome de quem foi o pagamento, por favor me informe o *nome completo do titular* da internet.`
            );
            
            // Salva o contexto
            state.iniciar(deQuem, 'aguardando_nome_comprovante', 'nome', {
                analise: analise
            });
            return true;
            
        } else {
            // ❌ Comprovante inválido
            await client.sendMessage(deQuem,
                `${P}Recebi seu comprovante, mas não consegui validar automaticamente. ` +
                `Vou encaminhar para um atendente verificar. 😊`
            );
            
            abrirChamadoComMotivo(deQuem, null, 'Comprovante inválido', { analise });
            return true;
        }
    }
    
    // Se não for comprovante, segue fluxo normal
    console.log('ℹ️ Mídia não é comprovante');
    return false;
}

async function transcreverAudio(msg) {
    try {
        const media = await msg.downloadMedia();
        if (!media || !media.data) return null;

        const audioBuffer = Buffer.from(media.data, 'base64');
        const tmpPath = path.join(__dirname, `audio_tmp_${Date.now()}.ogg`);
        fs.writeFileSync(tmpPath, audioBuffer);

        const groqWhisper = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const transcricao = await groqWhisper.audio.transcriptions.create({
            file: fs.createReadStream(tmpPath),
            model: 'whisper-large-v3',
            language: 'pt',
        });

        fs.unlinkSync(tmpPath);
        return transcricao.text || null;
    } catch (e) {
        console.error("Erro na transcrição:", e);
        return null;
    }
}

function horaLocal() {
    const h = new Date().getUTCHours() - 3;
    return h < 0 ? h + 24 : h;
}

function atendenteDisponivel() {
    if (!horarioFuncionamento.ativo) return true;
    const h = horaLocal();
    const d = new Date().getDay();
    return d >= 1 && d <= 6 && h >= horarioFuncionamento.inicio && h < horarioFuncionamento.fim;
}

function proximoAtendimento() {
    const h = horaLocal();
    const d = new Date().getDay();
    const ini = horarioFuncionamento.inicio;
    if (d === 0) return `segunda-feira a partir das ${ini}h`;
    if (d === 6 && h >= horarioFuncionamento.fim) return `segunda-feira a partir das ${ini}h`;
    if (h < ini) return `hoje a partir das ${ini}h`;
    return `amanhã a partir das ${ini}h`;
}

function falarSinalAmigavel() {
    if (situacaoRede === "fibra_rompida") {
        return `🔴 Identificamos um rompimento na fibra na sua região.`;
    }
    if (situacaoRede === "manutencao") {
        return `🔴 Estamos realizando uma manutenção programada na rede.`;
    }
    if (situacaoRede === "instavel") {
        return `⚠️ Estamos com uma instabilidade técnica na região no momento.`;
    }
    return "🟢 O sinal da nossa central está funcionando normalmente";
}

function redeNormal() {
    return situacaoRede === "normal";
}

async function darBaixaAutomatica(numeroWhatsapp, analise) {
    try {
        const numeroBusca = numeroWhatsapp.replace('@c.us', '').replace(/^55/, '');
        const cliente = db.prepare(`
            SELECT id, nome FROM clientes_base
            WHERE REPLACE(REPLACE(REPLACE(telefone, '-', ''), ' ', ''), '()', '') LIKE ?
            LIMIT 1
        `).get('%' + numeroBusca.slice(-8) + '%');

        if (!cliente) return { sucesso: false, nomeCliente: null, valido: false };

        const obs = !analise.valido ? ` ⚠️ Pix suspeito: ${analise.motivo_invalido || 'verificar'}` : null;

        db.prepare(`UPDATE clientes_base SET status = 'pago', baixa_sgp = 1,
            forma_pagamento = 'EFI',
            observacao = COALESCE(observacao, '') || COALESCE(?, ''),
            atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`).run(obs, cliente.id);

        return { sucesso: true, nomeCliente: cliente.nome, valido: analise.valido };
    } catch(e) {
        return { sucesso: false, nomeCliente: null, valido: false };
    }
}

function abrirChamadoComMotivo(deQuem, nome, motivo, extras = {}) {
    state.setAtendimentoHumano(deQuem, true);
    banco.dbSalvarAtendimentoHumano(deQuem);
    banco.dbAbrirChamado(deQuem, nome || null, motivo);
    
    let msg = `🔔 *Novo chamado!*\n\n`;
    msg += `📱 *Número:* ${deQuem.replace('@c.us','')}\n`;
    msg += `👤 *Nome:* ${nome || 'não informado'}\n`;
    msg += `🔧 *Motivo:* ${motivo}\n`;
    if (extras.endereco) msg += `📍 *Endereço:* ${extras.endereco}\n`;
    if (extras.disponibilidade) msg += `📅 *Disponibilidade:* ${extras.disponibilidade}\n`;
    
    for (const adm of ADMINISTRADORES) {
        client.sendMessage(adm, msg).catch(() => {});
    }
}

async function verificarETransferir(deQuem, motivo) {
    const erros = state.incrementarErros ? state.incrementarErros(deQuem) : 1;
    
    console.log(`⚠️ Cliente ${deQuem} - Erro ${erros}/5: ${motivo}`);
    
    if (erros >= 5) {
        console.log(`🆘 Transferindo para atendente humano após ${erros} erros`);
        
        if (state.resetarErros) state.resetarErros(deQuem);
        
        state.setAtendimentoHumano(deQuem, true);
        banco.dbSalvarAtendimentoHumano(deQuem);
        
        const nome = state.getDados(deQuem)?.nomeCliente || 'não identificado';
        banco.dbAbrirChamado(deQuem, nome, `Transferido por erro - ${motivo}`);
        
        const atendenteDisponivel = (new Date().getDay() >= 1 && new Date().getDay() <= 6 && 
                                     horaLocal() >= 8 && horaLocal() < 20);
        
        let mensagem = `🤖 *Assistente JMENET*\n\n`;
        
        if (atendenteDisponivel) {
            mensagem += `Estou com dificuldade para entender sua solicitação. `;
            mensagem += `Já transferi para um *atendente humano* que vai te ajudar agora mesmo. 👤\n\n`;
            mensagem += `Aguarde um momento, por favor!`;
        } else {
            mensagem += `Estou com dificuldade para entender sua solicitação. 😕\n\n`;
            mensagem += `No momento não temos atendentes disponíveis (horário de funcionamento: seg-sáb 8h às 20h).\n\n`;
            mensagem += `Um atendente entrará em contato assim que possível no horário comercial. `;
            mensagem += `Enquanto isso, tente digitar de forma mais simples ou ligue para nosso suporte. 📞`;
        }
        
        await client.sendMessage(deQuem, mensagem);
        
        for (const adm of ADMINISTRADORES) {
            client.sendMessage(adm, 
                `🆘 *TRANSFERÊNCIA POR ERRO*\n\n` +
                `Cliente: ${deQuem.replace('@c.us', '')}\n` +
                `Nome: ${nome}\n` +
                `Motivo: ${motivo}\n` +
                `Erros: ${erros}\n` +
                `Horário: ${new Date().toLocaleString()}`
            ).catch(() => {});
        }
        
        return true;
    }
    
    return false;
}

// =====================================================
// FUNÇÃO processarAposIdentificacao
// =====================================================
async function processarAposIdentificacao(deQuem, nomeTitular, msgOriginal, intencoes) {
    const cliente = db.prepare(`
        SELECT nome, status, dia_vencimento, telefone, cpf
        FROM clientes_base
        WHERE LOWER(nome) LIKE LOWER(?)
        LIMIT 1
    `).get('%' + nomeTitular.trim() + '%');
    
    if (!cliente) {
        await client.sendMessage(deQuem, 
            `🤖 *Assistente JMENET*\n\n` +
            `Não encontrei nenhum cliente com esse nome. 😕\n\n` +
            `Vou te ajudar mesmo assim. Como posso ajudar?`
        );
        if (intencoes.length > 0) {
            await iniciarFluxoPorIntencao(intencoes[0], deQuem, { body: msgOriginal });
        }
        return;
    }
    
    if (state.resetarErros) state.resetarErros(deQuem);
    
    state.atualizar(deQuem, { 
        fluxo: null,
        etapa: null,
        clienteIdentificado: true,
        nomeCliente: cliente.nome,
        statusCliente: cliente.status,
        telefoneCliente: cliente.telefone,
        cpfCliente: cliente.cpf
    });
    
    const promessa = banco.buscarPromessa(cliente.nome);
    
    if (promessa) {
        state.atualizar(deQuem, { promessaCliente: promessa.data_promessa });
        
        let mensagem = `Encontrei o cadastro de *${cliente.nome}*! `;
        mensagem += `Você tem uma *promessa de pagamento* para o dia *${promessa.data_promessa}*. 😊\n\n`;
        
        if (cliente.status === 'pago') {
            mensagem += `Sua internet está em dia! Como posso ajudar?`;
            await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${mensagem}`);
            if (intencoes.length > 0) {
                await iniciarFluxoPorIntencao(intencoes[0], deQuem, { body: msgOriginal });
            }
            return;
        }
        
        mensagem += `Quer *confirmar o pagamento* agora ou precisa de ajuda com a internet?`;
        await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${mensagem}`);
        state.atualizar(deQuem, { aguardandoEscolha: 'promessa_ou_suporte' });
        return;
    }
    
    const hoje = new Date().getDate();
    const diaVenc = cliente.dia_vencimento;
    const status = cliente.status;
    
    let mensagem = `Encontrei o cadastro de *${cliente.nome}*! `;
    
    if (status === 'pendente' && hoje > diaVenc) {
        mensagem += `A internet está *suspensa* por falta de pagamento do dia ${diaVenc}. 😕\n\n` +
                   `Gostaria de regularizar agora?`;
        await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${mensagem}`);
        await iniciarFluxoPorIntencao('FINANCEIRO', deQuem, { body: msgOriginal });
    }
    else if (!redeNormal()) {
        mensagem += falarSinalAmigavel();
        await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${mensagem}`);
    }
    else {
        if (status === 'pago') {
            mensagem += `Tudo em dia! 😊 Vou verificar seu problema.`;
        } else if (status === 'pendente') {
            mensagem += `Você está com o pagamento *pendente* do dia ${diaVenc}, mas ainda dentro do prazo. 😊\n\n` +
                       `Quer aproveitar para *regularizar* agora?`;
        } else {
            mensagem += `Como posso ajudar?`;
        }
        await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${mensagem}`);
        if (intencoes.length > 0) {
            await iniciarFluxoPorIntencao(intencoes[0], deQuem, { body: msgOriginal });
        }
    }
}

async function processarMensagem(deQuem, msg) {
    if (state.isAtendimentoHumano(deQuem)) return;

    if (processingLock.get(deQuem)) {
        const fila = filaEspera.get(deQuem) || [];
        fila.push(msg);
        filaEspera.set(deQuem, fila);
        return;
    }

    processingLock.set(deQuem, true);
    const inicioProcessamento = Date.now();
    
    try {
        // =====================================================
        // ✅ VERIFICA SE PASSOU MUITO TEMPO (EXPIRAÇÃO)
        // =====================================================
        const dadosAtuais = state.getDados(deQuem);
        const ultimaAtualizacao = dadosAtuais?.atualizadoEm;
        const agora = Date.now();
        
        // Se passou mais de 1 hora desde a última interação, reseta
        if (ultimaAtualizacao && (agora - ultimaAtualizacao > 60 * 60 * 1000)) {
            console.log(`🔄 Sessão expirada para ${deQuem.slice(-8)} (mais de 1h sem atividade)`);
            state.encerrarFluxo(deQuem);
            banco.dbLimparHistorico(deQuem);
        }

        const fluxoAtivo = state.getFluxo(deQuem);
        
        if (dadosAtuais?.clienteIdentificado) {
            console.log(`✅ Cliente já identificado: ${dadosAtuais.nomeCliente}`);
            
            if (dadosAtuais.aguardandoEscolha === 'promessa_ou_suporte') {
                const texto = msg.body?.toLowerCase() || '';
                
                if (texto.includes('confirmar') || texto.includes('pagar') || texto.includes('sim')) {
                    await iniciarFluxoPorIntencao('FINANCEIRO', deQuem, msg);
                    return;
                } else {
                    await iniciarFluxoPorIntencao('SUPORTE', deQuem, msg);
                    return;
                }
            }
            
            const multiplas = await detectorMultiplas.detectarMultiplasIntencoes(msg.body || '');
            if (multiplas.length > 0) {
                await iniciarFluxoPorIntencao(multiplas[0], deQuem, msg);
            } else {
                const transferiu = await verificarETransferir(deQuem, 'Não entendeu mensagem');
                if (transferiu) return;
                await responderComIA(deQuem, msg);
            }
            return;
        }

        if (fluxoAtivo) {
            if (fluxoAtivo === 'identificacao') {
                await handleIdentificacao(deQuem, msg);
                return;
            }
            
            // ✅ NOVO: tratamento para quem está aguardando nome do comprovante
            if (fluxoAtivo === 'aguardando_nome_comprovante') {
                const nomeLimpo = await utils.extrairNomeDaMensagem(msg.body || '');
                if (nomeLimpo) {
                    // Busca cliente pelo nome
                    const cliente = banco.buscarClientePorNome(nomeLimpo);
                    if (cliente && cliente.length > 0) {
                        // Dá baixa no cliente encontrado
                        await darBaixaAutomatica(deQuem, dados.analise);
                        await client.sendMessage(deQuem, 
                            `${P}✅ Pagamento confirmado para ${cliente[0].nome}! Obrigado.`
                        );
                    } else {
                        await client.sendMessage(deQuem, 
                            `${P}Não encontrei cliente com esse nome. Vou abrir um chamado para verificar.`
                        );
                        abrirChamadoComMotivo(deQuem, nomeLimpo, 'Comprovante sem cadastro', { analise: dados.analise });
                    }
                } else {
                    await client.sendMessage(deQuem, 
                        `${P}Não consegui identificar o nome. Por favor, digite o nome completo.`
                    );
                    return;
                }
                state.encerrarFluxo(deQuem);
                return;
            }
            
            const continua = await utils.detectarContinuacaoFluxo(
                fluxoAtivo,
                state.getEtapa(deQuem),
                msg.body || ''
            );
            
            if (continua) {
                await delegarParaFluxo(fluxoAtivo, deQuem, msg);
            } else {
                state.encerrarFluxo(deQuem);
                await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\nEntendi! Vou te ajudar com isso.`);
            }
            return;
        }

        const dadosCliente = banco.buscarStatusCliente(deQuem);
        
        if (!dadosCliente) {
            console.log(`🆔 Cliente não identificado por telefone. Iniciando identificação.`);
            
            const intencoes = await detectorMultiplas.detectarMultiplasIntencoes(msg.body || '');
            
            state.iniciar(deQuem, 'identificacao', 'aguardando_nome', { 
                msgOriginal: msg.body,
                intencoes: intencoes 
            });
            
            await client.sendMessage(deQuem, 
                `🤖 *Assistente JMENET*\n\n` +
                `Olá! Não encontrei seu cadastro pelo telefone. 😊\n\n` +
                `Para melhor atendê-lo, poderia me informar o *nome completo do titular* da internet?`
            );
            
            banco.dbIniciarAtendimento(deQuem);
            return;
        }

        console.log(`✅ Cliente identificado por telefone: ${dadosCliente.nome} (${dadosCliente.status})`);
        
        const cliente = db.prepare(`
            SELECT nome, status, dia_vencimento, telefone
            FROM clientes_base
            WHERE LOWER(nome) LIKE LOWER(?)
            LIMIT 1
        `).get('%' + dadosCliente.nome + '%');
        
        state.atualizar(deQuem, { 
            clienteIdentificado: true,
            nomeCliente: cliente.nome,
            statusCliente: cliente.status,
            telefoneCliente: cliente.telefone
        });
        
        const promessa = banco.buscarPromessa(cliente.nome);
        
        if (promessa) {
            console.log(`📅 Promessa encontrada: ${promessa.data_promessa}`);
            
            state.atualizar(deQuem, { promessaCliente: promessa.data_promessa });
            
            let mensagem = `Encontrei o cadastro de *${cliente.nome}*! `;
            mensagem += `Você tem uma *promessa de pagamento* para o dia *${promessa.data_promessa}*. 😊\n\n`;
            
            if (cliente.status === 'pago') {
                mensagem += `Sua internet está em dia! Como posso ajudar?`;
                await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${mensagem}`);
                
                const multiplas = await detectorMultiplas.detectarMultiplasIntencoes(msg.body || '');
                if (multiplas.length > 0) {
                    await iniciarFluxoPorIntencao(multiplas[0], deQuem, msg);
                }
                return;
            }
            
            mensagem += `Quer *confirmar o pagamento* agora ou precisa de ajuda com a internet?`;
            await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${mensagem}`);
            
            state.atualizar(deQuem, {
                aguardandoEscolha: 'promessa_ou_suporte'
            });
            return;
        }
        
        const multiplas = await detectorMultiplas.detectarMultiplasIntencoes(msg.body || '');
        console.log(`🎯 Intenções detectadas: ${multiplas.length > 0 ? multiplas.join(', ') : 'nenhuma'}`);
        
        if (!redeNormal()) {
            const sinalMsg = falarSinalAmigavel();
            await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${sinalMsg}`);
            
            if (multiplas.length > 1) {
                state.atualizar(deQuem, { 
                    intencoesPendentes: multiplas.slice(1),
                    msgPendente: msg.body 
                });
            }
            banco.dbIniciarAtendimento(deQuem);
            return;
        }

        const hoje = new Date().getDate();
        const diaVencimento = parseInt(dadosCliente.aba.replace('Data ', ''));
        const estaSuspenso = (dadosCliente.status === 'pendente' && hoje > diaVencimento);
        
        if (estaSuspenso) {
            console.log(`💰 Cliente SUSPENSO por falta de pagamento. Priorizando financeiro.`);
            
            if (multiplas.includes('SUPORTE')) {
                const outrasIntencoes = multiplas.filter(i => i !== 'FINANCEIRO' && i !== 'PROMESSA');
                state.atualizar(deQuem, { 
                    intencoesPendentes: outrasIntencoes,
                    msgPendente: msg.body 
                });
            }
            
            if (multiplas.includes('PROMESSA')) {
                await iniciarFluxoPorIntencao('PROMESSA', deQuem, msg);
            } else {
                await iniciarFluxoPorIntencao('FINANCEIRO', deQuem, msg);
            }
            return;
        }

        if (multiplas.length > 1) {
            console.log(`🎯 Múltiplas intenções: ${multiplas.join(', ')}`);
            
            const [primeira, ...restantes] = multiplas;
            state.atualizar(deQuem, { 
                intencoesPendentes: restantes,
                msgPendente: msg.body 
            });
            
            await iniciarFluxoPorIntencao(primeira, deQuem, msg);
            return;
        }

        const historico = banco.dbCarregarHistorico(deQuem);
        const intencao = multiplas.length === 1 ? multiplas[0] : 
                        await classificador.classificarIntencaoUnificada(msg.body || '', historico, fluxoAtivo);
        
        banco.dbLog(deQuem, 'decisao', 'classificacao', msg.body, { intencao });
        await iniciarFluxoPorIntencao(intencao, deQuem, msg);
        
    } catch (error) {
        logErro('processarMensagem', error, { numero: deQuem, msg: msg.body });
    } finally {
        metrics.mensagensProcessadas++;
        metrics.temposResposta.push(Date.now() - inicioProcessamento);
        if (metrics.temposResposta.length > 100) metrics.temposResposta.shift();
        
        processingLock.delete(deQuem);
        processarFila(deQuem);
    }
}

async function handleIdentificacao(deQuem, msg) {
    const etapa = state.getEtapa(deQuem);
    const dados = state.getDados(deQuem);
    const texto = msg.body?.trim() || '';
    
    console.log(`🆔 Fluxo de identificação - etapa: ${etapa}`);
    
    if (etapa === 'aguardando_nome') {
        if (!texto || texto.length < 3) {
            await client.sendMessage(deQuem, 
                `🤖 *Assistente JMENET*\n\n` +
                `Por favor, me informe o *nome completo do titular* da internet. 😊`
            );
            state.iniciarTimer(deQuem);
            return;
        }
        
        console.log(`📝 Nome informado: "${texto}"`);
        
        const clientes = banco.buscarClientePorNome(texto);
        
        if (clientes.length === 1) {
            console.log(`✅ Cliente encontrado por nome: ${clientes[0].nome}`);
            await processarAposIdentificacao(deQuem, clientes[0].nome, dados.msgOriginal, dados.intencoes);
            return;
        }
        
        if (clientes.length === 0) {
            console.log(`❌ Nenhum cliente encontrado com nome: ${texto}`);
            state.atualizar(deQuem, { 
                etapa: 'aguardando_cpf',
                tentativasCpf: 1,
                nomeTentado: texto
            });
            await client.sendMessage(deQuem, 
                `🤖 *Assistente JMENET*\n\n` +
                `Não encontrei *${texto}* na minha base. 😕\n\n` +
                `Para facilitar a busca, poderia me informar o *CPF* do titular? (apenas números)`
            );
            state.iniciarTimer(deQuem);
            return;
        }
        
        if (clientes.length > 1) {
            console.log(`⚠️ Múltiplos clientes (${clientes.length}) com nome: ${texto}`);
            state.atualizar(deQuem, { 
                etapa: 'aguardando_cpf',
                tentativasCpf: 1,
                nomeTentado: texto,
                multiplosClientes: clientes
            });
            await client.sendMessage(deQuem, 
                `🤖 *Assistente JMENET*\n\n` +
                `Encontrei *${clientes.length}* clientes com esse nome. 😕\n\n` +
                `Para identificar corretamente, poderia me informar o *CPF* do titular? (apenas números)`
            );
            state.iniciarTimer(deQuem);
            return;
        }
    }
    
    if (etapa === 'aguardando_cpf') {
        const cpf = texto.replace(/\D/g, '');
        
        if (cpf.length !== 11) {
            const tentativas = (dados.tentativasCpf || 1);
            
            if (tentativas >= 3) {
                state.atualizar(deQuem, { 
                    etapa: 'aguardando_telefone',
                    tentativasTelefone: 1
                });
                await client.sendMessage(deQuem, 
                    `🤖 *Assistente JMENET*\n\n` +
                    `Vamos tentar de outra forma. Poderia me informar o *telefone de contato* do titular? (com DDD, apenas números)`
                );
                return;
            }
            
            await client.sendMessage(deQuem, 
                `🤖 *Assistente JMENET*\n\n` +
                `CPF deve ter 11 dígitos. Você informou ${cpf.length}. Digite apenas números.`
            );
            state.atualizar(deQuem, { tentativasCpf: tentativas + 1 });
            return;
        }
        
        const cliente = banco.buscarClientePorCPF(cpf);
        
        if (cliente) {
            console.log(`✅ Cliente encontrado por CPF: ${cliente.nome}`);
            await processarAposIdentificacao(deQuem, cliente.nome, dados.msgOriginal, dados.intencoes);
            return;
        }
        
        console.log(`❌ Cliente não encontrado com CPF: ${cpf}`);
        
        state.atualizar(deQuem, { 
            etapa: 'aguardando_telefone',
            tentativasTelefone: 1
        });
        
        await client.sendMessage(deQuem, 
            `🤖 *Assistente JMENET*\n\n` +
            `Não encontrei o CPF na base. 😕\n\n` +
            `Última tentativa: poderia me informar o *telefone de contato* do titular? (com DDD, apenas números)`
        );
        return;
    }
    
    if (etapa === 'aguardando_telefone') {
        const telefone = texto.replace(/\D/g, '');
        
        if (telefone.length < 10 || telefone.length > 11) {
            const tentativas = (dados.tentativasTelefone || 1);
            
            if (tentativas >= 2) {
                await verificarETransferir(deQuem, 'Não identificado após nome, CPF e telefone');
                return;
            }
            
            await client.sendMessage(deQuem, 
                `🤖 *Assistente JMENET*\n\n` +
                `Telefone deve ter 10 ou 11 dígitos (com DDD). Digite apenas números.`
            );
            state.atualizar(deQuem, { tentativasTelefone: tentativas + 1 });
            return;
        }
        
        const cliente = banco.buscarClientePorTelefone(telefone);
        
        if (cliente) {
            console.log(`✅ Cliente encontrado por telefone: ${cliente.nome}`);
            await processarAposIdentificacao(deQuem, cliente.nome, dados.msgOriginal, dados.intencoes);
            return;
        }
        
        console.log(`❌ Cliente não encontrado após TODAS as tentativas`);
        await verificarETransferir(deQuem, 'Não identificado após nome, CPF e telefone');
        return;
    }
}

async function delegarParaFluxo(fluxo, deQuem, msg) {
    const fluxos = {
        'suporte': _fluxoSuporte,
        'financeiro': _fluxoFinanceiro,
        'promessa': _fluxoPromessa,
        'novoCliente': _fluxoNovoCliente,
        'cancelamento': _fluxoCancelamento,
        'identificacao': { handle: handleIdentificacao }
    };
    
    const fluxoHandler = fluxos[fluxo];
    if (!fluxoHandler) {
        console.error(`Fluxo desconhecido: ${fluxo}`);
        return false;
    }
    
    await fluxoHandler.handle(deQuem, msg);
    return true;
}

async function responderComIA(deQuem, msg) {
    const historico = banco.dbCarregarHistorico(deQuem).slice(-10);
    const systemMsg = `Você é o assistente virtual da JMENET Telecom.`;
    try {
        const respostaIA = await groqChatFallback([
            { role: 'system', content: systemMsg },
            ...historico,
            { role: 'user', content: msg.body }
        ], 0.5);
        
        if (respostaIA) {
            await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${respostaIA}`);
            banco.dbSalvarHistorico(deQuem, 'assistant', respostaIA);
        }
    } catch (error) {
        console.error("Erro no Groq:", error);
    }
}

async function iniciarFluxoPorIntencao(intencao, deQuem, msg) {
    switch(intencao) {
        case 'SUPORTE':
            await _fluxoSuporte.iniciar(deQuem, msg);
            break;
        case 'FINANCEIRO':
        case 'PIX':
        case 'BOLETO':
        case 'CARNE':
        case 'DINHEIRO':
            await _fluxoFinanceiro.iniciar(deQuem, msg, intencao);
            break;
        case 'PROMESSA':
            await _fluxoPromessa.iniciar(deQuem, msg);
            break;
        case 'NOVO_CLIENTE':
            await _fluxoNovoCliente.iniciar(deQuem);
            break;
        case 'CANCELAMENTO':
            await _fluxoCancelamento.iniciar(deQuem, msg);
            break;
        case 'SAUDACAO':
            const h = horaLocal();
            const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
            const resp = `${saudacao}! Como posso te ajudar hoje?\n\n1️⃣ Suporte técnico\n2️⃣ Financeiro\n3️⃣ Planos e instalação`;
            await client.sendMessage(deQuem, `🤖 *Assistente JMENET*\n\n${resp}`);
            banco.dbSalvarHistorico(deQuem, 'assistant', resp);
            banco.dbIniciarAtendimento(deQuem);
            break;
        default:
            await responderComIA(deQuem, msg);
    }
}

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
                const t = await transcreverAudio(item.msg);
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

const DATA_PATH = process.env.RENDER ? '/opt/render/project/src/data' : __dirname;

const client = new Client({
    authStrategy: new LocalAuth({ 
        dataPath: path.join(DATA_PATH, '.wwebjs_auth') 
    }),
    puppeteer: { 
        args: ['--no-sandbox', '--disable-setuid-sandbox'], 
        headless: true 
    }
});

client.on('qr', (qr) => {
    ultimoQR = qr;
    console.log('📱 QR Code gerado. Acesse /qr para escanear.');
});

app.get('/qr', async (req, res) => {
    if (!ultimoQR) {
        return res.status(404).send('Nenhum QR Code disponível. Aguarde o bot gerar um novo.');
    }
    try {
        // Gera a imagem PNG do QR e envia como resposta
        const qrImage = await QRCode.toBuffer(ultimoQR, { type: 'png', margin: 1 });
        res.type('png').send(qrImage);
    } catch (err) {
        res.status(500).send('Erro ao gerar imagem do QR.');
    }
});

client.on('ready', () => {
    console.log('✅ WhatsApp conectado e pronto!');
});


client.on('message', async (msg) => {
    console.log(`\n📨 MENSAGEM RECEBIDA:`);
    console.log(`   De: ${msg.from}`);
    console.log(`   Corpo: "${msg.body}"`);
    console.log(`   Timestamp: ${msg.timestamp}`);
    
    if (msg.from === 'status@broadcast' || msg.from.includes('@g.us')) {
        console.log(`   ⚠️ Ignorada (broadcast/grupo)`);
        return;
    }
    
    const deQuem = msg.from;
    const NUMERO_TESTE = '558187500456@c.us';
    
    if (deQuem === NUMERO_TESTE) {
        console.log(`   ✅ É NÚMERO DE TESTE! Vai processar!`);
    }
    else if (FUNCIONARIOS.includes(deQuem)) {
        console.log(`   ⚠️ É funcionário, ignorando`);
        return;
    }
    
    if (!botIniciadoEm) {
        console.log(`   ⚠️ Bot não iniciado ainda (botIniciadoEm = null)`);
        return;
    }
    
    if ((msg.timestamp * 1000) < botIniciadoEm) {
        console.log(`   ⚠️ Mensagem antiga, ignorando`);
        return;
    }
    
    if (!botAtivo && !ADMINISTRADORES.includes(deQuem)) {
        console.log(`   ⚠️ Bot inativo e não é admin, ignorando`);
        return;
    }

    if (ADMINISTRADORES.includes(deQuem)) {
        console.log(`   👤 É ADMIN, verificando comandos...`);
        const texto = msg.body || '';
        if (texto === '!bot off') {
            botAtivo = false;
            dbSetConfig('bot_ativo', '0');
            console.log(`   🔴 Bot desativado por comando admin`);
            return msg.reply("🔴 *IA DESATIVADA.*");
        }
        if (texto === '!bot on') {
            botAtivo = true;
            dbSetConfig('bot_ativo', '1');
            console.log(`   🟢 Bot ativado por comando admin`);
            return msg.reply("🟢 *IA ATIVADA.*");
        }
        console.log(`   👤 Admin não usou comando, ignorando fluxo`);
        return;
    }

    if (msg.type === 'sticker') {
        console.log(`   🎭 É figurinha, ignorando`);
        return;
    }

    console.log(`   ✅ Mensagem passou por todas as validações!`);

    const tipo = msg.hasMedia
        ? (['audio','ptt'].includes(msg.type) ? 'audio' : ['image','document'].includes(msg.type) ? msg.type : 'outro')
        : 'texto';

    console.log(`   📊 Tipo detectado: ${tipo}`);

    // =====================================================
    // PROCESSAMENTO DE MÍDIA (COMPROVANTES)
    // =====================================================
    if (tipo === 'outro' || tipo === 'image' || (msg.hasMedia && msg.mimetype === 'application/pdf')) {
        console.log(`   🔄 Tentando processar como comprovante...`);
        
        const processado = await processarMidiaAutomatico(deQuem, msg);
        
        if (processado) {
            console.log(`   ✅ Mídia processada como comprovante`);
            return;
        }
        
        // Se não era comprovante, segue para o processamento normal
        console.log(`   ℹ️ Mídia não é comprovante, segue fluxo normal`);
        await processarMensagem(deQuem, msg);
        return;
    }

    const fila = mensagensPendentes.get(deQuem) || [];
    fila.push({ msg, tipo });
    mensagensPendentes.set(deQuem, fila);
    console.log(`   📦 Mensagem adicionada à fila. Tamanho da fila: ${fila.length}`);

    const temAudio = fila.some(f => ['audio','ptt'].includes(f.tipo));
    const temMidia = fila.some(f => ['image','document'].includes(f.tipo));
    const delay = temAudio ? DEBOUNCE_AUDIO : temMidia ? DEBOUNCE_MIDIA : DEBOUNCE_TEXTO;

    console.log(`   ⏱️ Delay calculado: ${delay}ms (áudio: ${temAudio}, mídia: ${temMidia})`);

    if (state.cancelarTimer) {
        state.cancelarTimer(deQuem);
        console.log(`   ⏰ Timer anterior cancelado`);
    }
    
    agendarProcessamento(deQuem, delay);
    console.log(`   ⏲️ Processamento agendado para ${delay}ms`);
});

function inicializarFluxos() {
    const ctx = {
        client, db, banco,
        state,
        ADMINISTRADORES,
        P: "🤖 *Assistente JMENET*\n\n",
        chavePixExibicao,
        situacaoRede: () => situacaoRede,
        previsaoRetorno: () => previsaoRetorno,
        falarSinalAmigavel, redeNormal,
        atendenteDisponivel, proximoAtendimento,
        horaLocal, analisarImagem,
        groqChatFallback,
        normalizarTexto: utils.normalizarTexto || (t => t),
        buscarStatusCliente: banco.buscarStatusCliente,
        darBaixaAutomatica,
        abrirChamadoComMotivo,
        utils,
        classificador,
        detectorMultiplas,
        iniciarFluxoPorIntencao,
        verificarETransferir,
        fotosPendentes, // ← COMPARTILHADO COM TODOS OS FLUXOS
        
        // TODAS AS FUNÇÕES DO BANCO
        dbLog: banco.dbLog,
        dbSalvarHistorico: banco.dbSalvarHistorico,
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

// =====================================================
// LIMPEZA AUTOMÁTICA DE LOGS ANTIGOS
// =====================================================
function limparLogsAntigos() {
    try {
        const result = db.prepare(`
            DELETE FROM log_bot 
            WHERE criado_em < datetime('now', '-90 days')
        `).run();
        
        if (result.changes > 0) {
            console.log(`🧹 ${result.changes} logs antigos removidos`);
        }
    } catch (e) {
        console.error('Erro ao limpar logs:', e);
    }
}

// Executa 1x por dia (3 da manhã)
setInterval(() => {
    const agora = new Date();
    if (agora.getHours() === 3) {
        limparLogsAntigos();
    }
}, 60 * 60 * 1000); // verifica a cada hora

client.on('ready', async () => {
    inicializarFluxos();
    botIniciadoEm = Date.now();
    ctxRotas.botIniciadoEm = botIniciadoEm;

    
    const NUMERO_TESTE = '558187500456@c.us';
    if (state.limpar) state.limpar(NUMERO_TESTE);
    banco.dbLimparHistorico(NUMERO_TESTE);
    
    const botAtivoSalvo = dbGetConfig('bot_ativo');
    botAtivo = botAtivoSalvo === '' || botAtivoSalvo === '1';
    
    try {
        const hAtendSalvo = dbGetConfig('horario_atendente');
        if (hAtendSalvo) horarioFuncionamento = { ...horarioFuncionamento, ...JSON.parse(hAtendSalvo) };
    } catch(e) {}
    
    try {
        const hCobrancaSalvo = dbGetConfig('horario_cobranca');
        if (hCobrancaSalvo) horarioCobranca = { ...horarioCobranca, ...JSON.parse(hCobrancaSalvo) };
    } catch(e) {}
    
    situacaoRede = dbGetConfig('situacao_rede', 'normal');
    previsaoRetorno = dbGetConfig('previsao_retorno', 'sem previsão');
    
    console.log(`\n🚀 JMENET: Sistema online!`);
    console.log(`🤖 Bot IA: ${botAtivo ? 'LIGADO ✅' : 'DESLIGADO ❌'}`);
    console.log(`📡 Rede: ${situacaoRede} | Previsão: ${previsaoRetorno}`);

    setInterval(() => {
        const expirados = state.verificarTimeouts?.() || [];
        if (expirados.length > 0) {
            console.log(`🧹 Limpeza automática: ${expirados.length} estados expirados`);
        }
    }, 5 * 60 * 1000);
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend/dist')));

const ctxRotas = {
    db, banco, state, client, ADMINISTRADORES,
    dbGetConfig, 
    dbSetConfig, 
    dbRelatorio: banco.dbRelatorio,
    dbListarChamados: banco.dbListarChamados,
    dbAtualizarChamado: banco.dbAtualizarChamado,
    dbSalvarAtendimentoHumano: banco.dbSalvarAtendimentoHumano,
    dbRemoverAtendimentoHumano: banco.dbRemoverAtendimentoHumano,
    botAtivo,
    botIniciadoEm, situacaoRede, previsaoRetorno,
    horarioFuncionamento, horarioCobranca,
    dispararCobrancaReal: (d,t) => console.log('disparar cobranca'),
    obterAgendaDia: (d,m,a) => [],
    executarMigracao: () => ({}),
    isentarMesEntrada: () => {},
    verificarPromessasVencidas: () => 0,
    fs, path
};

require('./routes/index')(app, ctxRotas);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🌐 Painel web rodando em http://localhost:${PORT}`);
});

client.initialize();