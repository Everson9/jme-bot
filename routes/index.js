// routes/index.js
module.exports = function setupRoutes(app, ctx) {
    const {
        db, state, client, ADMINISTRADORES,
        dbGetConfig, dbSetConfig, dbRelatorio,
        dbListarChamados, dbAtualizarChamado,
        dbSalvarAtendimentoHumano, dbRemoverAtendimentoHumano,
        botAtivo, botIniciadoEm, situacaoRede, previsaoRetorno,
        horarioFuncionamento, horarioCobranca,
        // funções de cobrança
        dispararCobrancaReal, obterAgendaDia,
        // funções de base
        executarMigracao, isentarMesEntrada,
        // outras dependências
        fs, path
    } = ctx;

    // =====================================================
    // ROTAS BÁSICAS
    // =====================================================
    
    // Horário de funcionamento
    app.get('/api/horario', (req, res) => {
        res.json(horarioFuncionamento);
    });

    app.post('/api/horario', (req, res) => {
        const { inicio, fim, ativo } = req.body;
        if (typeof ativo === 'boolean') horarioFuncionamento.ativo = ativo;
        if (typeof inicio === 'number') horarioFuncionamento.inicio = inicio;
        if (typeof fim === 'number') horarioFuncionamento.fim = fim;
        dbSetConfig('horario_atendente', JSON.stringify(horarioFuncionamento));
        console.log(`⏰ Horário atendente atualizado:`, horarioFuncionamento);
        res.json(horarioFuncionamento);
    });

    // Horário de cobrança
    app.get('/api/horario/cobranca', (req, res) => {
        res.json(horarioCobranca);
    });

    app.post('/api/horario/cobranca', (req, res) => {
        const { inicio, fim } = req.body;
        if (typeof inicio === 'number' && inicio >= 0 && inicio <= 23) horarioCobranca.inicio = inicio;
        if (typeof fim === 'number' && fim >= 0 && fim <= 23) horarioCobranca.fim = fim;
        dbSetConfig('horario_cobranca', JSON.stringify(horarioCobranca));
        console.log(`📬 Horário de cobrança atualizado:`, horarioCobranca);
        res.json(horarioCobranca);
    });

 // =====================================================
// STATUS DO BOT - VERSÃO CORRIGIDA (USA CTX)
// =====================================================
app.get('/api/status', (req, res) => {
  res.json({
    botAtivo: ctx.botAtivo,
    online: ctx.botIniciadoEm ? true : false,  // ← USA CTX, não global
    iniciadoEm: ctx.botIniciadoEm,              // ← USA CTX
    atendimentosAtivos: state?.stats()?.atendimentoHumano || 0,
    situacaoRede: ctx.situacaoRede || situacaoRede,
    previsaoRetorno: ctx.previsaoRetorno || previsaoRetorno,
  });
});
            // =====================================================
    // ROTA PARA LIGAR/DESLIGAR O BOT
        // =====================================================
        app.post('/api/bot/toggle', (req, res) => {
        try {
            // Pega o estado atual do banco
            const atual = dbGetConfig('bot_ativo');
            const novoEstado = atual === '1' ? '0' : '1';
            
            // Salva no banco
            dbSetConfig('bot_ativo', novoEstado);
            
            // Atualiza a variável em memória
            ctx.botAtivo = novoEstado === '1';
            
            console.log(`🤖 Bot ${ctx.botAtivo ? 'ligado' : 'desligado'} via API`);
            
            res.json({ 
            success: true, 
            botAtivo: ctx.botAtivo 
            });
        } catch (error) {
            console.error('Erro ao toggle bot:', error);
            res.status(500).json({ 
            success: false, 
            error: error.message 
            });
        }
        });
    

    // Estados ativos
    app.get('/api/estados', (req, res) => {
        res.json({
            estados: state.todos(),
            stats: state.stats(),
        });
    });

    app.post('/api/estados/:numero/reset', (req, res) => {
        const numero = req.params.numero.includes('@c.us')
            ? req.params.numero
            : `55${req.params.numero.replace(/\D/g,'')}@c.us`;
        try {
            db.prepare("DELETE FROM atendimento_humano WHERE numero = ?").run(numero);
            db.prepare("DELETE FROM estados_v2 WHERE numero = ?").run(numero);
            state.limpar(numero);
            if (ctx.cancelarTimerInatividade) ctx.cancelarTimerInatividade(numero);
            console.log(`🔄 Estado resetado via painel: ${numero}`);
            res.json({ ok: true });
        } catch(e) {
            res.status(500).json({ erro: e.message });
        }
    });

    // Toggle bot
    app.post('/api/bot/toggle', (req, res) => {
        ctx.botAtivo = !ctx.botAtivo;
        dbSetConfig('bot_ativo', ctx.botAtivo ? '1' : '0');
        res.json({ botAtivo: ctx.botAtivo });
    });

    // =====================================================
// ROTA PARA LIGAR/DESLIGAR O BOT
// =====================================================
app.post('/api/bot/toggle', (req, res) => {
  try {
    // Inverte o estado do bot
    ctx.botAtivo = !ctx.botAtivo;
    
    // Salva no banco
    dbSetConfig('bot_ativo', ctx.botAtivo ? '1' : '0');
    
    console.log(`🤖 Bot ${ctx.botAtivo ? 'ligado' : 'desligado'} via painel`);
    
    res.json({ 
      success: true, 
      botAtivo: ctx.botAtivo 
    });
  } catch (error) {
    console.error('Erro ao toggle bot:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

    // Rede
    app.get('/api/rede', (req, res) => {
        res.json({ situacaoRede, previsaoRetorno });
    });

    app.post('/api/rede', async (req, res) => {
        const { status, previsao } = req.body;
        const validos = ['normal', 'instavel', 'manutencao', 'fibra_rompida'];
        if (!validos.includes(status)) {
            return res.status(400).json({ erro: 'Status inválido. Use: ' + validos.join(', ') });
        }
        ctx.situacaoRede = status;
        ctx.previsaoRetorno = previsao || 'sem previsão';
        dbSetConfig('situacao_rede', ctx.situacaoRede);
        dbSetConfig('previsao_retorno', ctx.previsaoRetorno);
        console.log(`📡 Rede atualizada via painel: ${ctx.situacaoRede} | Previsão: ${ctx.previsaoRetorno}`);
        res.json({ situacaoRede: ctx.situacaoRede, previsaoRetorno: ctx.previsaoRetorno });
    });

    // =====================================================
    // ROTAS DE CLIENTES E BASES
    // =====================================================
    
    // Busca global
    app.get('/api/clientes/buscar', (req, res) => {
        const { q } = req.query;
        if (!q || q.trim().length < 2) return res.json([]);
        const termo = '%' + q.trim() + '%';
        const clientes = db.prepare(`
            SELECT cb.id, cb.nome, cb.telefone, cb.dia_vencimento, cb.status, b.nome AS base_nome
            FROM clientes_base cb
            LEFT JOIN bases b ON b.id = cb.base_id
            WHERE cb.nome LIKE ? OR cb.telefone LIKE ?
            ORDER BY cb.nome
            LIMIT 20
        `).all(termo, termo);
        res.json(clientes);
    });

    // Busca global detalhada
    app.get('/api/clientes/busca-global', (req, res) => {
        const { q } = req.query;
        if (!q || q.length < 2) return res.json([]);
        const busca = '%' + q + '%';
        try {
            res.json(db.prepare(`
                SELECT cb.id, cb.nome, cb.telefone, cb.cpf, cb.endereco, cb.plano, cb.status, cb.dia_vencimento, cb.base_id, b.nome AS base_nome
                FROM clientes_base cb LEFT JOIN bases b ON b.id = cb.base_id
                WHERE cb.nome LIKE ? OR cb.telefone LIKE ? OR cb.cpf LIKE ? OR cb.endereco LIKE ?
                ORDER BY cb.nome ASC LIMIT 20
            `).all(busca, busca, busca, busca));
        } catch(e) { res.json([]); }
    });

    // Bases
    app.get('/api/bases', (req, res) => {
        const bases = db.prepare('SELECT * FROM bases ORDER BY criado_em ASC').all();
        const result = bases.map(base => {
            const dias = db.prepare('SELECT dia FROM datas_base WHERE base_id = ? ORDER BY dia ASC').all(base.id).map(d => d.dia);
            const total = db.prepare('SELECT COUNT(*) as n FROM clientes_base WHERE base_id = ?').get(base.id).n;
            const pagos = db.prepare("SELECT COUNT(*) as n FROM clientes_base WHERE base_id = ? AND status = 'pago'").get(base.id).n;
            return { ...base, dias, total, pagos };
        });
        res.json(result);
    });

    // Criar base
    app.post('/api/bases', (req, res) => {
        const { nome, descricao, dias } = req.body;
        if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });
        if (!dias || !Array.isArray(dias) || dias.length === 0) return res.status(400).json({ erro: 'Informe pelo menos um dia de vencimento' });
        try {
            const r = db.prepare('INSERT INTO bases (nome, descricao) VALUES (?, ?)').run(nome.trim(), descricao || '');
            const insertDia = db.prepare('INSERT OR IGNORE INTO datas_base (base_id, dia) VALUES (?, ?)');
            for (const dia of dias) {
                const d = parseInt(dia);
                if (d >= 1 && d <= 31) insertDia.run(r.lastInsertRowid, d);
            }
            const base = db.prepare('SELECT * FROM bases WHERE id = ?').get(r.lastInsertRowid);
            const diasSalvos = db.prepare('SELECT dia FROM datas_base WHERE base_id = ? ORDER BY dia ASC').all(r.lastInsertRowid).map(d => d.dia);
            res.json({ ...base, dias: diasSalvos, total: 0, pagos: 0 });
        } catch (e) {
            if (e.message.includes('UNIQUE')) return res.status(400).json({ erro: 'Já existe uma base com esse nome' });
            res.status(500).json({ erro: e.message });
        }
    });

    // Deletar base
    app.delete('/api/bases/:id', (req, res) => {
        const { id } = req.params;
        const base = db.prepare('SELECT * FROM bases WHERE id = ?').get(id);
        if (!base) return res.status(404).json({ erro: 'Base não encontrada' });
        if (base.nome === 'JME') return res.status(400).json({ erro: 'A base JME não pode ser excluída' });
        db.prepare('DELETE FROM clientes_base WHERE base_id = ?').run(id);
        db.prepare('DELETE FROM datas_base WHERE base_id = ?').run(id);
        db.prepare('DELETE FROM bases WHERE id = ?').run(id);
        res.json({ ok: true });
    });

    // Clientes de uma base
    app.get('/api/bases/:id/clientes-enriquecidos', (req, res) => {
        const { id } = req.params;
        const { dia, busca } = req.query;
        let query = `
            SELECT cb.*,
                   p.data_promessa, p.status as promessa_status
            FROM clientes_base cb
            LEFT JOIN (
                SELECT numero, data_promessa, status
                FROM promessas WHERE status = 'pendente'
                ORDER BY criado_em DESC
            ) p ON p.numero = ('55' || REPLACE(REPLACE(cb.telefone,'-',''),' ',''))
            WHERE cb.base_id = ?
        `;
        const params = [id];
        if (dia) { query += ' AND cb.dia_vencimento = ?'; params.push(parseInt(dia)); }
        if (busca) { query += ' AND (cb.nome LIKE ? OR cb.cpf LIKE ? OR cb.telefone LIKE ? OR cb.endereco LIKE ?)'; const b = '%'+busca+'%'; params.push(b,b,b,b); }
        query += ' ORDER BY cb.nome ASC';
        try { res.json(db.prepare(query).all(...params)); } catch(e) { console.error('clientes-enriquecidos:', e.message); res.json([]); }
    });

    // =====================================================
    // ROTAS DE COBRANÇA
    // =====================================================
    
    app.post('/api/cobrar/manual', async (req, res) => {
        const { data, tipo } = req.body || {};
        const datasValidas = ['10', '20', '30'];
        const tiposValidos = ['lembrete', 'atraso', 'atraso_final', 'reconquista', 'reconquista_final'];

        if (!datasValidas.includes(data)) {
            return res.status(400).json({ erro: 'data inválida. Use: 10, 20 ou 30' });
        }
        if (tipo && !tiposValidos.includes(tipo)) {
            return res.status(400).json({ erro: 'tipo inválido. Use: lembrete, atraso, atraso_final, reconquista, reconquista_final' });
        }

        const hoje = new Date().toISOString().split('T')[0];
        const jaDisparouHoje = db.prepare(`
            SELECT id FROM log_cobrancas WHERE data_vencimento = ? AND DATE(enviado_em) = ? LIMIT 1
        `).get(data, hoje);
        if (jaDisparouHoje) {
            return res.json({ ok: false, aviso: `Cobrança da data ${data} já foi disparada hoje. Nenhuma mensagem enviada.` });
        }

        const iniciouEm = new Date().toISOString();
        const logId = db.prepare(`
            INSERT INTO log_bot (numero, direcao, tipo, conteudo, criado_em)
            VALUES ('sistema', 'decisao', 'disparo_manual', ?, ?)
        `).run(
            JSON.stringify({ data, tipo: tipo || 'auto', iniciadoPor: 'painel' }),
            iniciouEm
        ).lastInsertRowid;

        res.json({ ok: true, mensagem: 'Disparo iniciado', logId, iniciouEm });

        setTimeout(async () => {
            try {
                const total = await dispararCobrancaReal(data, tipo || null);
                const tipoLabel = {
                    lembrete: 'Lembrete', atraso: 'Atraso', atraso_final: 'Atraso Final',
                    reconquista: 'Reconquista 1', reconquista_final: 'Reconquista 2 (última)'
                };
                const label = tipo ? tipoLabel[tipo] : 'automático (por data)';
                console.log(`✅ Disparo manual concluído: Data ${data} — ${label} — ${total} mensagens`);

                db.prepare(`UPDATE log_bot SET conteudo = ? WHERE id = ?`).run(
                    JSON.stringify({ data, tipo: tipo || 'auto', iniciadoPor: 'painel', total, status: 'concluido' }),
                    logId
                );

                for (const adm of ADMINISTRADORES) {
                    await client.sendMessage(adm,
                        `🖥️ *DISPARO MANUAL CONCLUÍDO (painel)*\n\n📋 Data ${data} — ${label}\n📨 ${total} mensagens enviadas`
                    ).catch(() => {});
                }
            } catch (e) {
                console.error('Erro no disparo manual:', e);
                db.prepare(`UPDATE log_bot SET conteudo = ? WHERE id = ?`).run(
                    JSON.stringify({ data, tipo: tipo || 'auto', iniciadoPor: 'painel', erro: e.message, status: 'erro' }),
                    logId
                );
            }
        }, 100);
    });

    app.get('/api/cobrar/agenda', (req, res) => {
        const agora = new Date();
        const mes = agora.getMonth() + 1;
        const ano = agora.getFullYear();
        const dia = agora.getDate();
        const agenda = {};

        for (let d = 1; d <= 31; d++) {
            const entradas = obterAgendaDia(d, mes, ano);
            if (entradas.length > 0) agenda[d] = entradas;
        }

        const pendenciaStr = dbGetConfig('cobranca_adiada', null);
        const pendencia = pendenciaStr ? (() => { try { return JSON.parse(pendenciaStr); } catch { return null; } })() : null;

        res.json({ agenda, diaAtual: dia, mes, ano, pendencia: pendencia || null });
    });

// =====================================================
// ROTAS DE PROMESSAS - COMPLETAS (GET e POST)
// =====================================================

// Listar promessas (GET)
// Listar promessas (GET) - com expiração de 7 dias
app.get('/api/promessas', (req, res) => {
    try {
        const { status } = req.query;
        let query = `
            SELECT p.*,
                   cb.dia_vencimento,
                   b.nome AS base_nome
            FROM promessas p
            LEFT JOIN clientes_base cb ON (
                cb.numero = REPLACE(REPLACE(p.numero, '@c.us', ''), '55', '')
                OR LOWER(cb.nome) = LOWER(p.nome)
            )
            LEFT JOIN bases b ON b.id = cb.base_id
        `;
        const params = [];
        
        // Se não tiver filtro ou for 'todos', aplica a regra de 7 dias
        if (!status || status === 'todos') {
            query += ` WHERE p.status = 'pendente' 
                       OR (p.status IN ('pago', 'cancelada') 
                           AND julianday('now') - julianday(p.criado_em) <= 7)`;
        } 
        // Se tiver filtro específico, mostra todos daquele status
        else {
            query += ' WHERE p.status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY p.criado_em DESC LIMIT 200';
        
        const promessas = db.prepare(query).all(...params);
        res.json(promessas);
    } catch (error) {
        console.error('Erro ao buscar promessas:', error);
        res.status(500).json({ erro: error.message });
    }
});

// Marcar promessa como pago (POST)
app.post('/api/promessas/:id/pago', (req, res) => {
    try {
        const { id } = req.params;
        
        // Atualiza a promessa
        const result = db.prepare(`
            UPDATE promessas 
            SET status = 'pago', pago_em = CURRENT_TIMESTAMP 
            WHERE id = ?
        `).run(id);
        
        if (result.changes === 0) {
            return res.status(404).json({ erro: 'Promessa não encontrada' });
        }
        
        // Busca os dados da promessa
        const promessa = db.prepare(`
            SELECT nome, numero, data_promessa 
            FROM promessas WHERE id = ?
        `).get(id);
        
        if (promessa?.nome) {
            // 1. Atualiza o status do cliente para 'pago'
            const updateResult = db.prepare(`
                UPDATE clientes_base 
                SET status = 'pago', atualizado_em = CURRENT_TIMESTAMP 
                WHERE LOWER(nome) LIKE LOWER(?) AND status != 'cancelado'
            `).run('%' + promessa.nome.trim() + '%');
            
            // 2. Se encontrou o cliente, registra no histórico de pagamentos
            if (updateResult.changes > 0) {
                const cliente = db.prepare(`
                    SELECT id, dia_vencimento 
                    FROM clientes_base 
                    WHERE LOWER(nome) LIKE LOWER(?)
                `).get('%' + promessa.nome.trim() + '%');
                
                if (cliente) {
                    // Define a referência do mês (ex: "03/2026")
                    const hoje = new Date();
                    const mesRef = `${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
                    
                    // Insere no histórico de pagamentos
                    db.prepare(`
                        INSERT INTO historico_pagamentos 
                            (cliente_id, referencia, status, forma_pagamento, pago_em, data_vencimento)
                        VALUES (?, ?, 'pago', 'Promessa', CURRENT_TIMESTAMP, ?)
                        ON CONFLICT(cliente_id, referencia) DO UPDATE SET
                            status = 'pago',
                            forma_pagamento = 'Promessa',
                            pago_em = CURRENT_TIMESTAMP
                    `).run(cliente.id, mesRef, cliente.dia_vencimento || 10);
                }
            }
        }
        
        res.json({ ok: true, mensagem: 'Promessa marcada como paga' });
    } catch (error) {
        console.error('Erro ao marcar promessa como paga:', error);
        res.status(500).json({ erro: error.message });
    }
});

// Cancelar promessa (POST)
app.post('/api/promessas/:id/cancelar', (req, res) => {
    try {
        const { id } = req.params;
        
        // Atualiza a promessa
        const result = db.prepare(`
            UPDATE promessas 
            SET status = 'cancelada' 
            WHERE id = ?
        `).run(id);
        
        if (result.changes === 0) {
            return res.status(404).json({ erro: 'Promessa não encontrada' });
        }
        
        // Busca o nome do cliente para reverter na base
        const promessa = db.prepare('SELECT nome FROM promessas WHERE id = ?').get(id);
        
        if (promessa?.nome) {
            // Reverte o status do cliente para pendente (se estava como promessa)
            db.prepare(`
                UPDATE clientes_base 
                SET status = 'pendente', atualizado_em = CURRENT_TIMESTAMP 
                WHERE LOWER(nome) LIKE LOWER(?) AND status = 'promessa'
            `).run('%' + promessa.nome.trim() + '%');
        }
        
        res.json({ ok: true, mensagem: 'Promessa cancelada' });
    } catch (error) {
        console.error('Erro ao cancelar promessa:', error);
        res.status(500).json({ erro: error.message });
    }
});

// Criar nova promessa (POST)
app.post('/api/promessas', (req, res) => {
    try {
        const { nome, numero, data_promessa, cliente_id } = req.body;
        
        if (!data_promessa) {
            return res.status(400).json({ erro: 'data_promessa obrigatória' });
        }
        
        const numWpp = numero ? (numero.replace(/\D/g,'').replace(/^0/,'55') + '@c.us') : null;
        
        const result = db.prepare(`
            INSERT INTO promessas (numero, nome, data_promessa, status) 
            VALUES (?, ?, ?, 'pendente')
        `).run(numWpp || null, nome || null, data_promessa);
        
        // Se tiver cliente_id, atualiza o status na base
        if (cliente_id) {
            db.prepare(`
                UPDATE clientes_base 
                SET status = 'promessa', atualizado_em = CURRENT_TIMESTAMP 
                WHERE id = ? AND status = 'pendente'
            `).run(cliente_id);
        } else if (nome) {
            // Tenta encontrar o cliente pelo nome
            db.prepare(`
                UPDATE clientes_base 
                SET status = 'promessa', atualizado_em = CURRENT_TIMESTAMP 
                WHERE LOWER(nome) LIKE LOWER(?) AND status = 'pendente'
            `).run('%' + nome.trim() + '%');
        }
        
        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (error) {
        console.error('Erro ao criar promessa:', error);
        res.status(500).json({ erro: error.message });
    }
});

// Verificar promessas vencidas (POST)
app.post('/api/promessas/verificar', (req, res) => {
    try {
        if (ctx.verificarPromessasVencidas) {
            ctx.verificarPromessasVencidas();
        }
        res.json({ ok: true, msg: 'Verificação executada' });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// Deletar promessa (DELETE - opcional)
app.delete('/api/promessas/:id', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare('DELETE FROM promessas WHERE id = ?').run(id);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

    // =====================================================
    // ROTAS DE LOGS
    // =====================================================
    
    app.get('/api/logs/cobrancas', (req, res) => {
        const limit = parseInt(req.query.limit) || 50;
        const registros = db.prepare(`SELECT * FROM log_cobrancas ORDER BY enviado_em DESC LIMIT ?`).all(limit);
        res.json(registros);
    });

    app.get('/api/logs/comprovantes', (req, res) => {
        const limit = parseInt(req.query.limit) || 50;
        const registros = db.prepare(`SELECT * FROM log_comprovantes ORDER BY recebido_em DESC LIMIT ?`).all(limit);
        res.json(registros);
    });

    app.get('/api/atendimentos', (req, res) => {
        const limit = parseInt(req.query.limit) || 50;
        const registros = db.prepare(`SELECT * FROM log_atendimentos ORDER BY iniciado_em DESC LIMIT ?`).all(limit);
        res.json(registros);
    });

    app.get('/api/logs/bot', (req, res) => {
        const { numero, limit = 200, offset = 0 } = req.query;
        const sql = numero
            ? `SELECT * FROM log_bot WHERE numero = ? ORDER BY criado_em DESC LIMIT ? OFFSET ?`
            : `SELECT * FROM log_bot ORDER BY criado_em DESC LIMIT ? OFFSET ?`;
        const rows = numero
            ? db.prepare(sql).all(numero, parseInt(limit), parseInt(offset))
            : db.prepare(sql).all(parseInt(limit), parseInt(offset));
        const total = db.prepare(`SELECT COUNT(*) as c FROM log_bot${numero ? ' WHERE numero = ?' : ''}`)
                        .get(...(numero ? [numero] : [])).c;
        res.json({ rows, total });
    });

    app.get('/api/logs/correcoes', (req, res) => {
        res.json(db.prepare(`SELECT * FROM log_correcoes ORDER BY criado_em DESC LIMIT 200`).all());
    });

    app.post('/api/logs/correcoes', (req, res) => {
        const { log_id, mensagem, classificou_como, correto_seria, tipo } = req.body;
        if (!mensagem || !correto_seria) return res.status(400).json({ erro: 'mensagem e correto_seria obrigatórios' });
        const tipoFinal = tipo === 'confirmacao' ? 'confirmacao' : 'correcao';
        db.prepare(`INSERT INTO log_correcoes (log_id, mensagem, classificou_como, correto_seria, tipo) VALUES (?, ?, ?, ?, ?)`)
          .run(log_id || null, mensagem, classificou_como || null, correto_seria, tipoFinal);
        res.json({ ok: true });
    });

    app.get('/api/logs/stats', (req, res) => {
        const hoje = new Date().toISOString().split('T')[0];
        const stats = {
            total_hoje: db.prepare(`SELECT COUNT(*) as c FROM log_bot WHERE DATE(criado_em) = ?`).get(hoje).c,
            entradas_hoje: db.prepare(`SELECT COUNT(*) as c FROM log_bot WHERE DATE(criado_em) = ? AND direcao = 'entrada'`).get(hoje).c,
            intencoes: db.prepare(`SELECT intencao, COUNT(*) as c FROM log_bot WHERE intencao IS NOT NULL AND DATE(criado_em) >= DATE('now', '-7 days') GROUP BY intencao ORDER BY c DESC`).all(),
            ultimos_numeros: db.prepare(`SELECT DISTINCT numero, MAX(criado_em) as ultimo FROM log_bot GROUP BY numero ORDER BY ultimo DESC LIMIT 10`).all(),
            total_correcoes: db.prepare(`SELECT COUNT(*) as c FROM log_correcoes`).get().c,
        };
        res.json(stats);
    });

// =====================================================
// ROTA: Histórico de pagamentos do cliente
// =====================================================
app.get('/api/clientes/:clienteId/historico', (req, res) => {
  try {
    const { clienteId } = req.params;
    
    // Busca dados do cliente
    const cliente = db.prepare('SELECT * FROM clientes_base WHERE id = ?').get(clienteId);
    if (!cliente) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }

    // Busca histórico de pagamentos
    const historico = db.prepare(`
      SELECT * FROM historico_pagamentos 
      WHERE cliente_id = ? 
      ORDER BY referencia DESC
    `).all(clienteId);

    res.json({ 
      cliente, 
      historico 
    });
  } catch (error) {
    console.error('Erro ao buscar histórico:', error);
    res.status(500).json({ 
      erro: 'Erro ao carregar histórico',
      message: error.message 
    });
  }
});

// =====================================================
// ROTA: Dar baixa em pagamento
// =====================================================
app.post('/api/clientes/:clienteId/historico/:ref/pagar', (req, res) => {
  try {
    const { clienteId, ref } = req.params;
    const { forma_pagamento } = req.body;
    const referencia = decodeURIComponent(ref);
    
    // Busca dia de vencimento do cliente
    const cli = db.prepare('SELECT dia_vencimento FROM clientes_base WHERE id = ?').get(clienteId);
    
    // Insere ou atualiza o pagamento
    db.prepare(`
      INSERT INTO historico_pagamentos 
        (cliente_id, referencia, status, forma_pagamento, pago_em, data_vencimento) 
      VALUES (?,?, 'pago', ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(cliente_id, referencia) DO UPDATE SET 
        status='pago', 
        forma_pagamento=excluded.forma_pagamento, 
        pago_em=CURRENT_TIMESTAMP
    `).run(clienteId, referencia, forma_pagamento || null, cli?.dia_vencimento || 10);
    
    // Se for a fatura do mês atual, atualiza status do cliente
    const hoje = new Date();
    const refAtual = `${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}`;
    if (referencia === refAtual) {
      db.prepare("UPDATE clientes_base SET status='pago', atualizado_em=CURRENT_TIMESTAMP WHERE id=?").run(clienteId);
    }
    
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao dar baixa:', error);
    res.status(500).json({ erro: error.message });
  }
});

// =====================================================
// ROTA: Reverter baixa
// =====================================================
app.post('/api/clientes/:clienteId/historico/:ref/reverter', (req, res) => {
  try {
    const { clienteId, ref } = req.params;
    const referencia = decodeURIComponent(ref);
    
    // Reverte o pagamento
    db.prepare(`
      UPDATE historico_pagamentos 
      SET status='pendente', pago_em=NULL, forma_pagamento=NULL 
      WHERE cliente_id=? AND referencia=?
    `).run(clienteId, referencia);
    
    // Se for a fatura do mês atual, atualiza status do cliente
    const hoje = new Date();
    const refAtual = `${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}`;
    if (referencia === refAtual) {
      db.prepare("UPDATE clientes_base SET status='pendente', atualizado_em=CURRENT_TIMESTAMP WHERE id=?").run(clienteId);
    }
    
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao reverter:', error);
    res.status(500).json({ erro: error.message });
  }
});





    // =====================================================
    // ROTAS DE RELATÓRIOS E GRÁFICOS
    // =====================================================
    
    app.get('/api/relatorio', (req, res) => {
        try {
            const r = dbRelatorio();
            res.json(r);
        } catch(e) {
            res.status(500).json({ erro: e.message });
        }
    });

    app.get('/api/graficos/atendimentos', (req, res) => {
        const dados = db.prepare(`
            SELECT DATE(datetime(iniciado_em, '-3 hours')) as dia, COUNT(*) as total
            FROM log_atendimentos
            WHERE iniciado_em >= datetime('now', '-7 days')
            GROUP BY dia ORDER BY dia ASC
        `).all();
        res.json(dados);
    });

    app.get('/api/graficos/cobrancas', (req, res) => {
        const dados = db.prepare(`
            SELECT DATE(datetime(enviado_em, '-3 hours')) as dia, COUNT(*) as total
            FROM log_cobrancas
            WHERE enviado_em >= datetime('now', '-7 days')
            GROUP BY dia ORDER BY dia ASC
        `).all();
        res.json(dados);
    });


// =====================================================
// ROTAS DE CLIENTES (CRUD)
// =====================================================

// Atualizar cliente
app.put('/api/bases/:baseId/clientes/:clienteId', (req, res) => {
  try {
    const { clienteId } = req.params;
    const { 
      nome, cpf, endereco, numero, telefone, senha, 
      dia_vencimento, observacao, forma_pagamento, plano, status 
    } = req.body;

    // Verifica se o cliente existe
    const cliente = db.prepare('SELECT id FROM clientes_base WHERE id = ?').get(clienteId);
    if (!cliente) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }

    // Atualiza o cliente
    db.prepare(`
      UPDATE clientes_base SET
        nome = COALESCE(?, nome),
        cpf = COALESCE(?, cpf),
        endereco = COALESCE(?, endereco),
        numero = COALESCE(?, numero),
        telefone = COALESCE(?, telefone),
        senha = COALESCE(?, senha),
        dia_vencimento = COALESCE(?, dia_vencimento),
        observacao = COALESCE(?, observacao),
        forma_pagamento = COALESCE(?, forma_pagamento),
        plano = COALESCE(?, plano),
        status = COALESCE(?, status),
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      nome, cpf, endereco, numero, telefone, senha,
      dia_vencimento ? parseInt(dia_vencimento) : null,
      observacao, forma_pagamento, plano, status,
      clienteId
    );

    // Busca o cliente atualizado
    const clienteAtualizado = db.prepare('SELECT * FROM clientes_base WHERE id = ?').get(clienteId);
    
    res.json(clienteAtualizado);
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);
    res.status(500).json({ erro: error.message });
  }
});

// Marcar cliente como pago / pendente
app.post('/api/bases/:baseId/clientes/:clienteId/status', (req, res) => {
  try {
    const { clienteId } = req.params;
    const { status } = req.body; // 'pago' ou 'pendente'
    
    if (!['pago', 'pendente', 'cancelado', 'promessa'].includes(status)) {
      return res.status(400).json({ erro: 'Status inválido' });
    }
    
    db.prepare("UPDATE clientes_base SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")
      .run(status, clienteId);
    
    res.json({ ok: true, status });
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    res.status(500).json({ erro: error.message });
  }
});

// Deletar cliente
app.delete('/api/bases/:baseId/clientes/:clienteId', (req, res) => {
  try {
    const { clienteId } = req.params;
    
    db.prepare('DELETE FROM clientes_base WHERE id = ?').run(clienteId);
    
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao deletar cliente:', error);
    res.status(500).json({ erro: error.message });
  }
});

// Buscar cliente por ID (para o modal de edição)
app.get('/api/bases/:baseId/clientes/:clienteId', (req, res) => {
  try {
    const { clienteId } = req.params;
    
    const cliente = db.prepare('SELECT * FROM clientes_base WHERE id = ?').get(clienteId);
    if (!cliente) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }
    
    res.json(cliente);
  } catch (error) {
    console.error('Erro ao buscar cliente:', error);
    res.status(500).json({ erro: error.message });
  }
});






    // =====================================================
    // ROTAS DE CHAMADOS
    // =====================================================
    
    app.get('/api/chamados', (req, res) => {
        const { status } = req.query;
        const lista = dbListarChamados(status || null);
        res.json(lista);
    });

    app.post('/api/chamados/:id/assumir', (req, res) => {
        const { id } = req.params;
        dbAtualizarChamado(Number(id), 'em_atendimento');
        res.json({ sucesso: true });
    });

    app.post('/api/chamados/:id/fechar', (req, res) => {
        const { id } = req.params;
        dbAtualizarChamado(Number(id), 'fechado');
        const chamado = db.prepare('SELECT numero FROM chamados WHERE id = ?').get(Number(id));
        if (chamado) {
            dbRemoverAtendimentoHumano(chamado.numero);
        }
        res.json({ sucesso: true });
    });

    // =====================================================
    // ROTAS DE CANCELAMENTOS
    // =====================================================
    
    app.get('/api/cancelamentos', (req, res) => {
        const { status } = req.query;
        let sql = 'SELECT * FROM cancelamentos';
        const params = [];
        if (status) { sql += ' WHERE status = ?'; params.push(status); }
        sql += ' ORDER BY solicitado_em DESC';
        res.json(db.prepare(sql).all(...params));
    });

    app.post('/api/cancelamentos', (req, res) => {
        const { cliente_id, base_id, nome, cpf, telefone, numero_whatsapp, endereco,
                numero, senha, plano, forma_pagamento, baixa_sgp, dia_vencimento,
                observacao, motivo, motivo_detalhado, solicitado_via } = req.body;
        if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });
        try {
            let dadosCliente = {};
            if (cliente_id) {
                dadosCliente = db.prepare('SELECT * FROM clientes_base WHERE id = ?').get(cliente_id) || {};
            }

            const result = db.prepare(`
                INSERT INTO cancelamentos
                    (cliente_id, base_id, nome, cpf, telefone, numero_whatsapp, endereco,
                     numero, senha, plano, forma_pagamento, baixa_sgp, dia_vencimento,
                     observacao, motivo, motivo_detalhado, solicitado_via, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'solicitado')
            `).run(
                cliente_id || null,
                base_id || dadosCliente.base_id || null,
                nome || dadosCliente.nome,
                cpf || dadosCliente.cpf || null,
                telefone || dadosCliente.telefone || null,
                numero_whatsapp || null,
                endereco || dadosCliente.endereco || null,
                numero || dadosCliente.numero || null,
                senha || dadosCliente.senha || null,
                plano || dadosCliente.plano || null,
                forma_pagamento || dadosCliente.forma_pagamento || null,
                baixa_sgp ?? dadosCliente.baixa_sgp ?? 0,
                dia_vencimento || dadosCliente.dia_vencimento || null,
                observacao || dadosCliente.observacao || null,
                motivo || null,
                motivo_detalhado || null,
                solicitado_via || 'painel'
            );

            if (cliente_id) {
                db.prepare('DELETE FROM clientes_base WHERE id = ?').run(cliente_id);
                console.log(`🗑️ Cliente ${nome} removido da base (cancelamento)`);
            }

            for (const adm of ADMINISTRADORES) {
                client.sendMessage(adm,
                    `❌ *CANCELAMENTO${solicitado_via === 'painel' ? ' VIA PAINEL' : ''}*\n\n` +
                    `👤 *Nome:* ${nome}\n` +
                    `📅 *Vencimento:* Dia ${dia_vencimento || dadosCliente.dia_vencimento || 'N/A'}\n` +
                    `📦 *Plano:* ${plano || dadosCliente.plano || 'N/A'}\n` +
                    `💬 *Motivo:* ${motivo || 'Não informado'}\n` +
                    (motivo_detalhado ? `📝 *Detalhe:* ${motivo_detalhado}\n` : '')
                ).catch(() => {});
            }
            res.json({ ok: true, id: result.lastInsertRowid });
        } catch(e) {
            res.status(500).json({ erro: e.message });
        }
    });

    app.post('/api/cancelamentos/:id/confirmar', (req, res) => {
        const { id } = req.params;
        const cancel = db.prepare('SELECT * FROM cancelamentos WHERE id = ?').get(id);
        if (!cancel) return res.status(404).json({ erro: 'Não encontrado' });

        db.prepare(`UPDATE cancelamentos SET status = 'confirmado', confirmado_em = CURRENT_TIMESTAMP WHERE id = ?`).run(id);

        if (cancel.cliente_id) {
            db.prepare(`UPDATE clientes_base SET status = 'cancelado', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`).run(cancel.cliente_id);
        } else if (cancel.nome) {
            db.prepare(`UPDATE clientes_base SET status = 'cancelado', atualizado_em = CURRENT_TIMESTAMP WHERE LOWER(nome) LIKE LOWER(?)`).run('%' + cancel.nome.trim() + '%');
        }

        if (cancel.numero_whatsapp && botIniciadoEm) {
            const nomeP = cancel.nome ? cancel.nome.split(' ')[0] : '';
            client.sendMessage(cancel.numero_whatsapp,
                `🤖 *Assistente JMENET*\n\nOlá${nomeP ? ', ' + nomeP : ''}! Seu cancelamento foi confirmado. Sentimos muito em perder você como cliente. 😢\n\nSe mudar de ideia ou precisar de algo, estamos à disposição!`
            ).catch(() => {});
        }

        res.json({ ok: true });
    });

    app.post('/api/cancelamentos/:id/cancelar', (req, res) => {
        const cancel = db.prepare('SELECT * FROM cancelamentos WHERE id = ?').get(req.params.id);
        if (!cancel) return res.status(404).json({ erro: 'Não encontrado' });

        try {
            if (cancel.base_id && cancel.nome) {
                const jaExiste = db.prepare(
                    'SELECT id FROM clientes_base WHERE base_id = ? AND LOWER(nome) = LOWER(?)'
                ).get(cancel.base_id, cancel.nome);

                if (!jaExiste) {
                    db.prepare(`
                        INSERT INTO clientes_base
                            (base_id, dia_vencimento, nome, cpf, endereco, numero, telefone,
                             senha, plano, forma_pagamento, baixa_sgp, observacao, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')
                    `).run(
                        cancel.base_id, cancel.dia_vencimento || 10, cancel.nome,
                        cancel.cpf, cancel.endereco, cancel.numero, cancel.telefone,
                        cancel.senha, cancel.plano, cancel.forma_pagamento,
                        cancel.baixa_sgp || 0, cancel.observacao
                    );
                    console.log(`↩️ Cliente ${cancel.nome} reinserido na base (reverteu cancelamento)`);
                }
            }

            db.prepare(`UPDATE cancelamentos SET status = 'desistiu' WHERE id = ?`).run(req.params.id);
            res.json({ ok: true });
        } catch(e) {
            res.status(500).json({ erro: e.message });
        }
    });

    app.delete('/api/cancelamentos/:id', (req, res) => {
        db.prepare('DELETE FROM cancelamentos WHERE id = ?').run(req.params.id);
        res.json({ ok: true });
    });

    // =====================================================
    // ROTAS DE INSTALAÇÕES
    // =====================================================
    
    app.get('/api/instalacoes', (req, res) => {
        const status = req.query.status;
        const sql = status
            ? `SELECT * FROM novos_clientes WHERE status = ? ORDER BY cadastrado_em DESC`
            : `SELECT * FROM novos_clientes ORDER BY cadastrado_em DESC`;
        const registros = status ? db.prepare(sql).all(status) : db.prepare(sql).all();
        res.json(registros);
    });

    app.put('/api/instalacoes/:id', (req, res) => {
        const { nome, cpf, endereco, telefone, plano, roteador, data_vencimento, disponibilidade, obs, status } = req.body;
        db.prepare(`UPDATE novos_clientes SET nome=?, cpf=?, endereco=?, telefone=?, plano=?, roteador=?, data_vencimento=?, disponibilidade=?, obs=?, status=? WHERE id=?`)
          .run(nome, cpf, endereco, telefone, plano, roteador, data_vencimento, disponibilidade, obs, status, req.params.id);
        res.json({ ok: true });
    });

    app.post('/api/instalacoes/:id/confirmar', (req, res) => {
        db.prepare(`UPDATE novos_clientes SET status='confirmado', confirmado_em=CURRENT_TIMESTAMP WHERE id=?`).run(req.params.id);
        res.json({ ok: true });
    });

    app.post('/api/instalacoes/:id/finalizar', (req, res) => {
        const inst = db.prepare(`SELECT * FROM novos_clientes WHERE id=?`).get(req.params.id);
        if (!inst) return res.status(404).json({ erro: 'Não encontrado' });

        db.prepare(`UPDATE novos_clientes SET status='finalizado', finalizado_em=CURRENT_TIMESTAMP WHERE id=?`).run(req.params.id);

        const dia = inst.data_vencimento;
        if (dia && [10, 20, 30].includes(Number(dia))) {
            const nomeBase = `Data ${dia}`;
            const base = db.prepare(`SELECT id FROM bases WHERE nome = ?`).get(nomeBase);
            if (base) {
                try {
                    const insRow = db.prepare(`
                        INSERT OR IGNORE INTO clientes_base
                            (base_id, dia_vencimento, numero, nome, cpf, endereco, telefone, plano, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pago')
                    `).run(base.id, dia, inst.numero, inst.nome,
                           inst.cpf || null, inst.endereco || null,
                           inst.telefone || inst.numero || null, inst.plano || null);
                    const novoId = insRow.lastInsertRowid;
                    if (novoId && ctx.isentarMesEntrada) ctx.isentarMesEntrada(novoId, dia);
                    console.log(`✅ Cliente ${inst.nome} adicionado à base ${nomeBase} (mês isento)`);
                } catch(e) { console.error('Erro ao adicionar na base:', e.message); }
            }

            if (inst.numero) {
                client.sendMessage(inst.numero,
                    `🤖 *Assistente JMENET*\n\nOlá, ${inst.nome ? inst.nome.split(' ')[0] : ''}! 🎉\n\nSua instalação foi concluída com sucesso! Seja bem-vindo(a) à JMENET!\n\nSua mensalidade vence todo dia *${dia}*. Após 5 dias de atraso o serviço é suspenso automaticamente.\n\nQualquer dúvida é só chamar! 😊`
                ).catch(() => {});
            }
        }
        res.json({ ok: true, base: dia ? `Data ${dia}` : null });
    });

    app.delete('/api/instalacoes/:id', (req, res) => {
        db.prepare(`DELETE FROM novos_clientes WHERE id=?`).run(req.params.id);
        res.json({ ok: true });
    });



    // =====================================================
    // ROTAS DE DASHBOARD
    // =====================================================
    
    app.get('/api/dashboard/resumo-bases', (req, res) => {
        try {
            const bases = db.prepare('SELECT id, nome FROM bases').all();
            const result = bases.map(b => {
                const total    = db.prepare("SELECT COUNT(*) as c FROM clientes_base WHERE base_id = ?").get(b.id).c;
                const pagos    = db.prepare("SELECT COUNT(*) as c FROM clientes_base WHERE base_id = ? AND status = 'pago'").get(b.id).c;
                const pend     = db.prepare("SELECT COUNT(*) as c FROM clientes_base WHERE base_id = ? AND status = 'pendente'").get(b.id).c;
                const prom     = db.prepare("SELECT COUNT(*) as c FROM clientes_base WHERE base_id = ? AND status = 'promessa'").get(b.id).c;
                return { id: b.id, nome: b.nome, total, pagos, pendentes: pend, promessas: prom };
            });
            res.json({ bases: result, totalPendentes: result.reduce((a,b)=>a+b.pendentes,0), totalPromessas: result.reduce((a,b)=>a+b.promessas,0) });
        } catch(e) { res.json({ bases: [], totalPendentes: 0, totalPromessas: 0 }); }
    });

    app.get('/api/dashboard/caixa-hoje', (req, res) => {
        try {
            const rows = db.prepare(`
                SELECT cb.nome, cb.plano, cb.forma_pagamento,
                    hp.forma_pagamento AS forma_baixa, hp.pago_em,
                    b.nome AS base_nome,
                    CASE
                        WHEN lower(cb.plano) LIKE '%iptv%' OR lower(cb.plano) LIKE '%70%' THEN 70
                        WHEN lower(cb.plano) LIKE '%200%' OR lower(cb.plano) LIKE '%fibra%' THEN 60
                        WHEN lower(cb.plano) LIKE '%50%'  OR lower(cb.plano) LIKE '%cabo%'  THEN 50
                        ELSE NULL
                    END AS valor_plano
                FROM historico_pagamentos hp
                JOIN clientes_base cb ON cb.id = hp.cliente_id
                JOIN bases b ON b.id = cb.base_id
                WHERE DATE(hp.pago_em) = DATE('now', '-3 hours')
                ORDER BY hp.pago_em DESC
            `).all();
            res.json(rows);
        } catch(e) { res.json([]); }
    });

    app.get('/api/dashboard/alertas', (req, res) => {
        try {
            const hoje = new Date();
            const hojeStr = hoje.toISOString().split('T')[0];
            const amanha = new Date(hoje); amanha.setDate(amanha.getDate()+1);
            const amanhaStr = amanha.toISOString().split('T')[0];
            const toDate = d => `${d.slice(6,10)}-${d.slice(3,5)}-${d.slice(0,2)}`;
            const promHoje = db.prepare(`SELECT nome, numero, data_promessa FROM promessas WHERE status='pendente' AND notificado=0 AND data_promessa IS NOT NULL`).all().filter(p => toDate(p.data_promessa) === hojeStr);
            const promAmanha = db.prepare(`SELECT nome FROM promessas WHERE status='pendente' AND notificado=0 AND data_promessa IS NOT NULL`).all().filter(p => toDate(p.data_promessa) === amanhaStr);
            const inadimp = db.prepare(`SELECT COUNT(*) as c FROM clientes_base WHERE status='pendente' AND julianday('now')-julianday(atualizado_em)>5`).get();
            const chamados = db.prepare(`SELECT COUNT(*) as c FROM chamados WHERE status='aberto' AND (julianday('now')*86400000)-aberto_em>86400000`).get();
            res.json({ promessasHoje: promHoje.length, promessasAmanha: promAmanha.length, promessasHojeDetalhe: promHoje, inadimplentes: inadimp.c, chamadosAbertos: chamados.c });
        } catch(e) { res.json({ promessasHoje:0, promessasAmanha:0, promessasHojeDetalhe:[], inadimplentes:0, chamadosAbertos:0 }); }
    });

    app.get('/api/dashboard/fluxo-clientes', (req, res) => {
        const hoje = new Date();
        const mesAtual = hoje.getMonth() + 1;
        const anoAtual = hoje.getFullYear();
        const mesStr = String(mesAtual).padStart(2, '0');

        const entradas = db.prepare(`
            SELECT COUNT(*) as total FROM novos_clientes
            WHERE status IN ('confirmado','finalizado')
            AND strftime('%Y-%m', finalizado_em) = ?
        `).get(`${anoAtual}-${mesStr}`);

        const saidas = db.prepare(`
            SELECT COUNT(*) as total FROM cancelamentos
            WHERE status = 'confirmado'
            AND strftime('%Y-%m', confirmado_em) = ?
        `).get(`${anoAtual}-${mesStr}`);

        const totalAtivos = db.prepare(`SELECT COUNT(*) as total FROM clientes_base WHERE status != 'cancelado'`).get();
        const totalCancelados = db.prepare(`SELECT COUNT(*) as total FROM clientes_base WHERE status = 'cancelado'`).get();

        const historico = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(anoAtual, mesAtual - 1 - i, 1);
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const a = d.getFullYear();
            const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
            const ent = db.prepare(`SELECT COUNT(*) as t FROM novos_clientes WHERE status IN ('confirmado','finalizado') AND strftime('%Y-%m', finalizado_em) = ?`).get(`${a}-${m}`);
            const sai = db.prepare(`SELECT COUNT(*) as t FROM cancelamentos WHERE status = 'confirmado' AND strftime('%Y-%m', confirmado_em) = ?`).get(`${a}-${m}`);
            historico.push({ label, entradas: ent.t, saidas: sai.t });
        }

        res.json({
            mes: { entradas: entradas.total, saidas: saidas.total },
            totalAtivos: totalAtivos.total,
            totalCancelados: totalCancelados.total,
            historico,
        });
    });

    // =====================================================
    // ROTAS DE CARNÊ
    // =====================================================
    
    app.get('/api/carne', (req, res) => {
        const { status } = req.query;
        let query = `
            SELECT cs.*,
                   cb.dia_vencimento, cb.plano, cb.telefone AS telefone_cadastro
            FROM carne_solicitacoes cs
            LEFT JOIN clientes_base cb ON cb.id = cs.cliente_id
        `;
        const params = [];
        if (status) { query += ' WHERE status = ?'; params.push(status); }
        query += ' ORDER BY solicitado_em DESC';
        res.json(db.prepare(query).all(...params));
    });

    app.post('/api/carne', (req, res) => {
        const { cliente_id, nome, numero, endereco, observacao } = req.body;
        if (!nome && !cliente_id) return res.status(400).json({ erro: 'nome ou cliente_id obrigatório' });

        let dadosCli = {};
        if (cliente_id) {
            dadosCli = db.prepare('SELECT nome, telefone, endereco FROM clientes_base WHERE id = ?').get(cliente_id) || {};
        }

        if (cliente_id) {
            db.prepare(`DELETE FROM carne_solicitacoes WHERE cliente_id = ? AND status = 'solicitado'`).run(cliente_id);
        }

        const r = db.prepare(`
            INSERT INTO carne_solicitacoes (cliente_id, numero, nome, endereco, observacao, origem, status)
            VALUES (?, ?, ?, ?, ?, 'painel', 'solicitado')
        `).run(
            cliente_id || null,
            numero || dadosCli.telefone || null,
            nome || dadosCli.nome,
            endereco || dadosCli.endereco || null,
            observacao || null
        );

        const nomeFinal = nome || dadosCli.nome || 'não informado';
        for (const adm of ADMINISTRADORES) {
            client.sendMessage(adm,
                `📋 *SOLICITAÇÃO DE CARNÊ (painel)*\n\n` +
                `👤 ${nomeFinal}\n` +
                `📍 ${endereco || dadosCli.endereco || 'endereço não informado'}\n` +
                `_Acesse Carnês para marcar como impresso e entregue._`
            ).catch(() => {});
        }

        res.json({ ok: true, id: r.lastInsertRowid });
    });

    app.post('/api/carne/:id/imprimir', (req, res) => {
        db.prepare(`UPDATE carne_solicitacoes SET status = 'impresso', impresso_em = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
        res.json({ ok: true });
    });

    app.post('/api/carne/:id/entregar', (req, res) => {
        const sol = db.prepare('SELECT * FROM carne_solicitacoes WHERE id = ?').get(req.params.id);
        if (!sol) return res.status(404).json({ erro: 'Não encontrado' });
        db.prepare(`UPDATE carne_solicitacoes SET status = 'entregue', entregue_em = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
        if (botIniciadoEm) {
            client.sendMessage(sol.numero,
                `🤖 *Assistente JMENET*\n\nOlá${sol.nome ? ', ' + sol.nome.split(' ')[0] : ''}! 😊 Seu *carnê físico* já está pronto e foi entregue/está disponível para retirada! 📋\n\nQualquer dúvida é só chamar!`
            ).catch(() => {});
        }
        res.json({ ok: true });
    });

    app.delete('/api/carne/:id', (req, res) => {
        db.prepare('DELETE FROM carne_solicitacoes WHERE id = ?').run(req.params.id);
        res.json({ ok: true });
    });

    // =====================================================
    // ROTAS DE INADIMPLENTES
    // =====================================================
    
    app.get('/api/relatorio/inadimplentes', (req, res) => {
        const dias = parseInt(req.query.dias) || 5;
        try {
            res.json(db.prepare(`
                SELECT cb.id, cb.nome, cb.telefone, cb.plano, cb.dia_vencimento, cb.atualizado_em, b.nome AS base_nome,
                       CAST(julianday('now') - julianday(cb.atualizado_em) AS INTEGER) AS dias_pendente
                FROM clientes_base cb LEFT JOIN bases b ON b.id = cb.base_id
                WHERE cb.status = 'pendente' AND julianday('now') - julianday(cb.atualizado_em) > ?
                ORDER BY dias_pendente DESC
            `).all(dias));
        } catch(e) { res.json([]); }
    });

    // =====================================================
    // ROTAS DE EXPORTAÇÃO
    // =====================================================
    
    app.get('/api/exportar/clientes', (req, res) => {
        try {
            res.json(db.prepare(`
                SELECT cb.nome, cb.cpf, cb.telefone, cb.endereco, cb.numero AS numero_casa,
                       cb.plano, cb.forma_pagamento, cb.status, cb.observacao, cb.senha AS pppoe,
                       cb.dia_vencimento, b.nome AS base, cb.criado_em, cb.atualizado_em
                FROM clientes_base cb LEFT JOIN bases b ON b.id = cb.base_id
                ORDER BY b.nome, cb.nome
            `).all());
        } catch(e) { res.status(500).json({ erro: e.message }); }
    });

    // =====================================================
    // ROTAS DE PLANILHA (JME)
    // =====================================================
    
    app.get('/api/planilha/resumo', (req, res) => {
        try {
            const result = {};
            for (const dia of ['10', '20', '30']) {
                const pagos    = db.prepare("SELECT COUNT(*) as t FROM clientes_base WHERE dia_vencimento = ? AND status = 'pago'").get(dia);
                const pend     = db.prepare("SELECT COUNT(*) as t FROM clientes_base WHERE dia_vencimento = ? AND status != 'pago'").get(dia);
                const clientes = db.prepare("SELECT nome, telefone, status, forma_pagamento FROM clientes_base WHERE dia_vencimento = ? ORDER BY nome").all(dia);
                result[dia] = { pagos: pagos.t, pendentes: pend.t, total: pagos.t + pend.t, clientes };
            }
            res.json(result);
        } catch(e) {
            res.status(500).json({ erro: e.message });
        }
    });

    app.post('/api/jme/migrar', async (req, res) => {
        try {
            const resultado = await executarMigracao(
                process.env.PLANILHA_ID,
                [{ nome: 'Data 10', diaVencimento: 10 }, { nome: 'Data 20', diaVencimento: 20 }, { nome: 'Data 30', diaVencimento: 30 }],
                null,
                'JME'
            );
            const msg = `✅ Migração JME: ${resultado.importados} importados, ${resultado.atualizados} atualizados, ${resultado.ignorados} ignorados`;
            console.log(msg);
            res.json({ ok: true, ...resultado, mensagem: msg });
        } catch(e) {
            console.error('Erro na migração JME:', e);
            res.status(500).json({ erro: e.message });
        }
    });

    app.post('/api/migrar/planilha', async (req, res) => {
        try {
            const { baseNome, planilhaId, abas, colunas } = req.body;
            if (!baseNome || !planilhaId || !abas?.length) {
                return res.status(400).json({ erro: 'Informe baseNome, planilhaId e abas' });
            }
            const resultado = await executarMigracao(planilhaId, abas, colunas || null, baseNome);
            const msg = `✅ Migração "${baseNome}": ${resultado.importados} importados, ${resultado.atualizados} atualizados, ${resultado.ignorados} ignorados`;
            console.log(msg);
            res.json({ ok: true, ...resultado, mensagem: msg });
        } catch(e) {
            console.error('Erro na migração genérica:', e);
            res.status(500).json({ erro: e.message });
        }
    });

    // =====================================================
    // ROTAS DE ADMIN
    // =====================================================
    
    app.post('/api/admin/limpar-estado', (req, res) => {
        const { numero } = req.body || {};
        if (!numero) return res.status(400).json({ erro: 'numero obrigatório' });
        try {
            db.prepare("DELETE FROM atendimento_humano WHERE numero = ?").run(numero);
            db.prepare("DELETE FROM estados_v2 WHERE numero = ?").run(numero);
            state.limpar(numero);
            if (ctx.cancelarTimerInatividade) ctx.cancelarTimerInatividade(numero);
            console.log(`🧹 Estado de ${numero} limpo via API`);
            res.json({ ok: true, mensagem: `Estado de ${numero} limpo com sucesso` });
        } catch(e) {
            res.status(500).json({ erro: e.message });
        }
    });

    app.post('/api/sgp/confirmar', (req, res) => {
        try {
            const { nome } = req.body;
            if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });

            const result = db.prepare(`
                UPDATE clientes_base SET baixa_sgp = 1, atualizado_em = CURRENT_TIMESTAMP
                WHERE LOWER(nome) = LOWER(?)
            `).run(nome.trim());

            if (result.changes === 0) return res.status(404).json({ erro: 'Cliente não encontrado' });
            res.json({ sucesso: true });
        } catch(e) {
            res.status(500).json({ erro: e.message });
        }
    });
  
 // =====================================================
// ROTAS DE MONITORAMENTO - COMPLETAS
// =====================================================

// Health check simples
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memoria: process.memoryUsage(),
        botAtivo: ctx.botAtivo,
        conexaoWhatsApp: !!botIniciadoEm
    });
});

// Métricas detalhadas do sistema
app.get('/api/metricas', (req, res) => {
    try {
        const metricas = {
            bot: {
                ativo: ctx.botAtivo,
                iniciadoEm: botIniciadoEm,
                uptime: botIniciadoEm ? Math.floor((Date.now() - botIniciadoEm) / 1000) : 0
            },
            banco: {
                tamanho: fs.existsSync('./jmenet.db') ? fs.statSync('./jmenet.db').size : 0,
                tabelas: db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length
            },
            atendimentos: {
                ativos: state?.stats?.()?.atendimentoHumano || 0,
                totalHoje: db.prepare(`
                    SELECT COUNT(*) as total FROM log_atendimentos 
                    WHERE DATE(iniciado_em) = DATE('now')
                `).get().total
            },
            mensagens: {
                total: db.prepare('SELECT COUNT(*) as total FROM log_bot').get().total,
                ultimaHora: db.prepare(`
                    SELECT COUNT(*) as total FROM log_bot 
                    WHERE criado_em >= datetime('now', '-1 hour')
                `).get().total
            },
            sistema: {
                memoria: process.memoryUsage(),
                cpu: process.cpuUsage(),
                versao: process.version
            }
        };
        res.json(metricas);
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// =====================================================
// ROTA CORRIGIDA - Monitor de performance dos fluxos
// =====================================================
app.get('/api/metricas/fluxos', (req, res) => {
    try {
        console.log('📊 Rota /api/metricas/fluxos chamada');
        
        // 1. Primeiro, busca os fluxos
        const fluxos = db.prepare(`
            SELECT 
                COALESCE(intencao, 'OUTRO') as intencao,
                COUNT(*) as total,
                COUNT(DISTINCT numero) as clientes_unicos,
                MAX(criado_em) as ultimo_uso
            FROM log_bot 
            WHERE criado_em >= datetime('now', '-7 days')
            GROUP BY COALESCE(intencao, 'OUTRO')
            ORDER BY total DESC
        `).all();
        
        console.log('✅ Fluxos encontrados:', fluxos.length);

        // 2. Busca tempos médios (opcional, pode dar erro se tabela não existir)
        let temposMedios = [];
        try {
            temposMedios = db.prepare(`
                SELECT 
                    COALESCE(intencao, 'OUTRO') as intencao,
                    AVG(CAST((julianday(encerrado_em) - julianday(iniciado_em)) * 86400 AS INTEGER)) as tempo_medio_segundos
                FROM log_atendimentos 
                WHERE encerrado_em IS NOT NULL 
                    AND iniciado_em >= datetime('now', '-7 days')
                GROUP BY COALESCE(intencao, 'OUTRO')
            `).all();
        } catch (e) {
            console.log('⚠️ Tabela log_atendimentos pode não ter os dados esperados:', e.message);
        }

        // 3. Responde com os dados
        res.json({
            fluxos,
            temposMedios,
            total: fluxos.reduce((acc, f) => acc + f.total, 0)
        });

    } catch (error) {
        console.error('❌ ERRO NA ROTA:', error);
        
        // Retorna erro detalhado
        res.status(500).json({ 
            erro: error.message,
            stack: error.stack,
            banco: 'verificado e funcionando'
        });
    }
});

// Logs de erro do sistema
app.get('/api/logs/erros', (req, res) => {
    const { limit = 50 } = req.query;
    try {
        const erros = db.prepare(`
            SELECT * FROM log_bot 
            WHERE tipo = 'erro' OR conteudo LIKE '%error%' OR conteudo LIKE '%exception%'
            ORDER BY criado_em DESC 
            LIMIT ?
        `).all(parseInt(limit));
        res.json(erros);
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// Status da fila de processamento
app.get('/api/metricas/fila', (req, res) => {
    try {
        // Você precisa ter acesso ao processingLock e filaEspera do index.js
        // Se não tiver, comente esta rota ou adapte
        res.json({
            mensagem: 'Métricas de fila disponíveis apenas em tempo real',
            // processingLock: processingLock?.size || 0,
            // filaEspera: filaEspera?.size || 0
        });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// Backup manual do banco
app.post('/api/admin/backup', (req, res) => {
    try {
        const backupDir = path.join(__dirname, '../backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const data = new Date();
        const nomeArquivo = `backup-${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}.db`;
        const caminhoBackup = path.join(backupDir, nomeArquivo);

        fs.copyFileSync('./jmenet.db', caminhoBackup);

        // Limpar backups antigos (manter últimos 7)
        const arquivos = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('backup-'))
            .map(f => ({ nome: f, path: path.join(backupDir, f), time: fs.statSync(path.join(backupDir, f)).mtime.getTime() }))
            .sort((a, b) => b.time - a.time);

        if (arquivos.length > 7) {
            arquivos.slice(7).forEach(f => fs.unlinkSync(f.path));
        }

        res.json({ 
            ok: true, 
            mensagem: `Backup criado: ${nomeArquivo}`,
            arquivo: nomeArquivo,
            tamanho: fs.statSync(caminhoBackup).size
        });
    } catch (error) {
        console.error('Erro ao criar backup:', error);
        res.status(500).json({ erro: error.message });
    }
});

// Listar backups disponíveis
app.get('/api/admin/backups', (req, res) => {
    try {
        const backupDir = path.join(__dirname, '../backups');
        if (!fs.existsSync(backupDir)) {
            return res.json([]);
        }

        const backups = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('backup-') && f.endsWith('.db'))
            .map(f => {
                const stats = fs.statSync(path.join(backupDir, f));
                return {
                    nome: f,
                    tamanho: stats.size,
                    criadoEm: stats.mtime,
                    data: stats.mtime.toISOString().split('T')[0]
                };
            })
            .sort((a, b) => b.criadoEm - a.criadoEm);

        res.json(backups);
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// Restaurar backup (cuidado!)
app.post('/api/admin/restaurar/:arquivo', (req, res) => {
    try {
        const { arquivo } = req.params;
        const backupPath = path.join(__dirname, '../backups', arquivo);
        
        if (!fs.existsSync(backupPath)) {
            return res.status(404).json({ erro: 'Backup não encontrado' });
        }

        // Fazer backup automático antes de restaurar
        const data = new Date();
        const backupAntes = path.join(__dirname, '../backups', `pre-restore-${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}.db`);
        fs.copyFileSync('./jmenet.db', backupAntes);

        // Restaurar
        fs.copyFileSync(backupPath, './jmenet.db');

        res.json({ 
            ok: true, 
            mensagem: `Banco restaurado de ${arquivo}`,
            backupAutomatico: path.basename(backupAntes)
        });
    } catch (error) {
        console.error('Erro ao restaurar backup:', error);
        res.status(500).json({ erro: error.message });
    }
});

    require('./agendamentos')(app, ctx);
    require('./instalacoes-agendadas')(app, ctx);
    require('./paginacao')(app, ctx);
    require('./alertas')(app, ctx);
    // =====================================================
    // FALLBACK PARA REACT ROUTER
    // =====================================================
    
    app.get('/{*path}', (req, res) => {
        const indexPath = path.join(__dirname, '../frontend/dist/index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.json({ status: 'API JMENET online', versao: '1.0' });
        }
    });
};