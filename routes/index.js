// routes/index.js
module.exports = function setupRoutes(app, ctx) {
    const {
        db: firebaseDb,
        banco,
        state, client, ADMINISTRADORES,
        botAtivo, botIniciadoEm, situacaoRede, previsaoRetorno,
        horarioFuncionamento, horarioCobranca,
        dispararCobrancaReal, obterAgendaDia,
        executarMigracao, isentarMesEntrada,
        verificarPromessasVencidas,
        fs, path
    } = ctx;

    // =====================================================
    // ROTAS BÁSICAS (NÃO MUDAM)
    // =====================================================
    
    app.get('/api/horario', (req, res) => {
        res.json(horarioFuncionamento);
    });

    app.post('/api/horario', (req, res) => {
        const { inicio, fim, ativo } = req.body;
        if (typeof ativo === 'boolean') horarioFuncionamento.ativo = ativo;
        if (typeof inicio === 'number') horarioFuncionamento.inicio = inicio;
        if (typeof fim === 'number') horarioFuncionamento.fim = fim;
        
        firebaseDb.collection('config').doc('horario_atendente').set(horarioFuncionamento)
            .catch(e => console.error('Erro ao salvar horário:', e));
        
        console.log(`⏰ Horário atendente atualizado:`, horarioFuncionamento);
        res.json(horarioFuncionamento);
    });

    app.get('/api/horario/cobranca', (req, res) => {
        res.json(horarioCobranca);
    });

    app.post('/api/horario/cobranca', (req, res) => {
        const { inicio, fim } = req.body;
        if (typeof inicio === 'number' && inicio >= 0 && inicio <= 23) horarioCobranca.inicio = inicio;
        if (typeof fim === 'number' && fim >= 0 && fim <= 23) horarioCobranca.fim = fim;
        
        firebaseDb.collection('config').doc('horario_cobranca').set(horarioCobranca)
            .catch(e => console.error('Erro ao salvar horário cobrança:', e));
        
        console.log(`📬 Horário de cobrança atualizado:`, horarioCobranca);
        res.json(horarioCobranca);
    });

    // =====================================================
    // STATUS DO BOT
    // =====================================================
    // =====================================================
// STATUS DO BOT - CORRIGIDO
// =====================================================
// =====================================================
// STATUS DO BOT - COM LOGS PARA DEBUG
// =====================================================
app.get('/api/status', (req, res) => {
    console.log('📊 ROTA /api/status CHAMADA');
    console.log('   botIniciadoEm no ctx:', ctx.botIniciadoEm);
    console.log('   botAtivo no ctx:', ctx.botAtivo);
    
    const response = {
        botAtivo: ctx.botAtivo,
        online: ctx.botIniciadoEm ? true : false,
        iniciadoEm: ctx.botIniciadoEm,
        atendimentosAtivos: state?.stats()?.atendimentoHumano || 0,
        situacaoRede: ctx.situacaoRede,
        previsaoRetorno: ctx.previsaoRetorno,
    };
    
    console.log('   resposta:', response);
    res.json(response);
});
    // =====================================================
    // ROTA PARA LIGAR/DESLIGAR O BOT
    // =====================================================
    app.post('/api/bot/toggle', async (req, res) => {
        try {
            const configDoc = await firebaseDb.collection('config').doc('bot_ativo').get();
            const atual = configDoc.exists ? configDoc.data().valor : false;
            const novoEstado = !atual;
            
            await firebaseDb.collection('config').doc('bot_ativo').set({ valor: novoEstado });
            
            ctx.botAtivo = novoEstado;
            // Atualiza via SSE para todos os frontends abertos
            if (ctx.sseService) ctx.sseService.broadcast();
            
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

    app.post('/api/estados/:numero/reset', async (req, res) => {
        const numero = req.params.numero.includes('@c.us')
            ? req.params.numero
            : `55${req.params.numero.replace(/\D/g,'')}@c.us`;
        try {
            await banco.dbRemoverAtendimentoHumano(numero);
            await banco.dbLimparHistorico(numero);
            
            state.limpar(numero);
            if (ctx.cancelarTimerInatividade) ctx.cancelarTimerInatividade(numero);
            
            console.log(`🔄 Estado resetado via painel: ${numero}`);
            res.json({ ok: true });
        } catch(e) {
            res.status(500).json({ erro: e.message });
        }
    });

    // Rede — busca direto do Firebase para garantir valor correto mesmo antes do ready
    app.get('/api/rede', async (req, res) => {
        try {
            const [redeDoc, previsaoDoc] = await Promise.all([
                firebaseDb.collection('config').doc('situacao_rede').get(),
                firebaseDb.collection('config').doc('previsao_retorno').get(),
            ]);
            const motivoDoc = await firebaseDb.collection('config').doc('motivo_rede').get();
            res.json({
                situacaoRede: redeDoc.exists ? redeDoc.data().valor : (ctx.situacaoRede || 'normal'),
                previsaoRetorno: previsaoDoc.exists ? previsaoDoc.data().valor : (ctx.previsaoRetorno || 'sem previsão'),
                motivoRede: motivoDoc.exists ? motivoDoc.data().valor : (ctx.motivoRede || ''),
            });
        } catch(e) {
            res.json({ situacaoRede: ctx.situacaoRede || 'normal', previsaoRetorno: ctx.previsaoRetorno || 'sem previsão' });
        }
    });

    app.post('/api/rede', async (req, res) => {
        const { status, previsao, motivo } = req.body;
        const validos = ['normal', 'instavel', 'manutencao', 'fibra_rompida'];
        if (!validos.includes(status)) {
            return res.status(400).json({ erro: 'Status inválido. Use: ' + validos.join(', ') });
        }
        ctx.situacaoRede = status;
        ctx.previsaoRetorno = previsao || 'sem previsão';
        ctx.motivoRede = motivo || '';
        
        await Promise.all([
            firebaseDb.collection('config').doc('situacao_rede').set({ valor: status }),
            firebaseDb.collection('config').doc('previsao_retorno').set({ valor: previsao || 'sem previsão' }),
            firebaseDb.collection('config').doc('motivo_rede').set({ valor: motivo || '' }),
        ]);

        if (ctx.sseService) ctx.sseService.broadcast();
        console.log(`📡 Rede: ${status} | Previsão: ${ctx.previsaoRetorno} | Motivo: ${ctx.motivoRede}`);
        res.json({ situacaoRede: ctx.situacaoRede, previsaoRetorno: ctx.previsaoRetorno, motivoRede: ctx.motivoRede });
    });

    // =====================================================
    // ROTAS DE CLIENTES E BASES
    // =====================================================
    
    // Busca global
    app.get('/api/clientes/buscar', async (req, res) => {
        const { q } = req.query;
        if (!q || q.trim().length < 2) return res.json([]);
        
        try {
            const clientes = await banco.buscarClientePorNome(q.trim());
            
            const resultado = clientes.map(c => ({
                id: c.id,
                nome: c.nome,
                telefone: c.telefone,
                dia_vencimento: c.dia_vencimento,
                status: c.status,
                base_nome: c.base_nome
            }));
            
            res.json(resultado);
        } catch (error) {
            console.error('Erro na busca:', error);
            res.json([]);
        }
    });

    // Busca global detalhada
    app.get('/api/clientes/busca-global', async (req, res) => {
        const { q } = req.query;
        if (!q || q.length < 2) return res.json([]);
        
        try {
            const clientes = await banco.buscarClientePorNome(q.trim());
            res.json(clientes.slice(0, 20));
        } catch(e) { 
            res.json([]); 
        }
    });

    // BASES - ROTA PRINCIPAL
    app.get('/api/bases', async (req, res) => {
        try {
            const basesSnapshot = await firebaseDb.collection('bases').orderBy('criado_em', 'asc').get();
            
            const result = await Promise.all(basesSnapshot.docs.map(async (baseDoc) => {
                const base = { id: baseDoc.id, ...baseDoc.data() };
                
                // Buscar dias da base
                const diasSnapshot = await firebaseDb.collection('bases').doc(baseDoc.id).collection('datas_base')
                    .orderBy('dia', 'asc')
                    .get();
                const dias = diasSnapshot.docs.map(d => d.data().dia);
                
                // Buscar clientes da base - CORRIGIDO com parseInt
                const clientesSnapshot = await firebaseDb.collection('clientes')
                    .where('base_id', '==', parseInt(baseDoc.id))
                    .get();
                
                const total = clientesSnapshot.size;
                const pagos = clientesSnapshot.docs.filter(doc => doc.data().status === 'pago').length;
                
                return { ...base, dias, total, pagos };
            }));
            
            res.json(result);
        } catch (error) {
            console.error('Erro ao buscar bases:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    // Criar base
    app.post('/api/bases', async (req, res) => {
        const { nome, descricao, dias } = req.body;
        if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });
        if (!dias || !Array.isArray(dias) || dias.length === 0) {
            return res.status(400).json({ erro: 'Informe pelo menos um dia de vencimento' });
        }
        
        try {
            const existente = await firebaseDb.collection('bases')
                .where('nome', '==', nome.trim())
                .get();
            
            if (!existente.empty) {
                return res.status(400).json({ erro: 'Já existe uma base com esse nome' });
            }
            
            const baseRef = await firebaseDb.collection('bases').add({
                nome: nome.trim(),
                descricao: descricao || '',
                criado_em: new Date().toISOString()
            });
            
            const batch = firebaseDb.batch();
            for (const dia of dias) {
                const d = parseInt(dia);
                if (d >= 1 && d <= 31) {
                    const diaRef = firebaseDb.collection('bases').doc(baseRef.id).collection('datas_base').doc();
                    batch.set(diaRef, { dia: d });
                }
            }
            await batch.commit();
            
            const diasSnapshot = await firebaseDb.collection('bases').doc(baseRef.id).collection('datas_base')
                .orderBy('dia', 'asc')
                .get();
            const diasSalvos = diasSnapshot.docs.map(d => d.data().dia);
            
            res.json({ 
                id: baseRef.id, 
                nome: nome.trim(), 
                descricao: descricao || '',
                dias: diasSalvos, 
                total: 0, 
                pagos: 0 
            });
        } catch (e) {
            res.status(500).json({ erro: e.message });
        }
    });

    // Deletar base
    app.delete('/api/bases/:id', async (req, res) => {
        const { id } = req.params;
        
        try {
            const baseDoc = await firebaseDb.collection('bases').doc(id).get();
            if (!baseDoc.exists) {
                return res.status(404).json({ erro: 'Base não encontrada' });
            }
            
            const base = baseDoc.data();
            if (base.nome === 'JME') {
                return res.status(400).json({ erro: 'A base JME não pode ser excluída' });
            }
            
            const batch = firebaseDb.batch();
            
            // CORRIGIDO com parseInt
            const clientesSnapshot = await firebaseDb.collection('clientes')
                .where('base_id', '==', parseInt(baseDoc.id))
                .get();
            clientesSnapshot.forEach(doc => batch.delete(doc.ref));
            
            const diasSnapshot = await firebaseDb.collection('bases').doc(id).collection('datas_base').get();
            diasSnapshot.forEach(doc => batch.delete(doc.ref));
            
            batch.delete(firebaseDb.collection('bases').doc(id));
            
            await batch.commit();
            
            res.json({ ok: true });
        } catch (error) {
            console.error('Erro ao deletar base:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    // Clientes de uma base - CORRIGIDO!
    app.get('/api/bases/:id/clientes', async (req, res) => {
  const { id } = req.params;
  const { dia, busca } = req.query;
  
  console.log('🔍 Buscando clientes para base ID:', id);
  
  try {
    // 🔥 SOLUÇÃO: tenta número e string
    const baseIdNum = parseInt(id);
    const baseIdStr = String(id);
    
    console.log('   Tentando como número:', baseIdNum);
    console.log('   Tentando como string:', baseIdStr);
    
    // Busca clientes com base_id = número OU base_id = string
    const snapshotNum = await firebaseDb.collection('clientes')
      .where('base_id', '==', baseIdNum)
      .get();
      
    const snapshotStr = await firebaseDb.collection('clientes')
      .where('base_id', '==', baseIdStr)
      .get();
    
    // Junta os resultados (removendo duplicatas)
    const clientesMap = new Map();
    
    snapshotNum.docs.forEach(doc => {
      clientesMap.set(doc.id, { id: doc.id, ...doc.data() });
    });
    
    snapshotStr.docs.forEach(doc => {
      clientesMap.set(doc.id, { id: doc.id, ...doc.data() });
    });
    
    let clientes = Array.from(clientesMap.values());
    
    console.log(`   📊 Total clientes encontrados: ${clientes.length}`);
    
    // Filtrar por dia se necessário
    if (dia) {
      const diaNum = parseInt(dia);
      clientes = clientes.filter(c => c.dia_vencimento === diaNum);
      console.log(`   Após filtro de dia ${dia}: ${clientes.length} clientes`);
    }
    
    // Filtrar por busca textual se necessário
    if (busca) {
      const termo = busca.toLowerCase();
      clientes = clientes.filter(c => 
        (c.nome && c.nome.toLowerCase().includes(termo)) ||
        (c.cpf && c.cpf.includes(termo)) ||
        (c.telefone && c.telefone.includes(termo)) ||
        (c.endereco && c.endereco.toLowerCase().includes(termo))
      );
      console.log(`   Após busca textual: ${clientes.length} clientes`);
    }
    
    // Ordenar por nome
    clientes.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    
    // Busca todas as promessas pendentes de uma vez (1 query) e faz join local
    const promessasSnap = await firebaseDb.collection('promessas')
      .where('status', '==', 'pendente')
      .get();
    
    const promessaMap = {};
    promessasSnap.docs.forEach(d => {
      const p = d.data();
      const tel = (p.numero || '').replace('@c.us','').replace(/^55/,'').replace(/\D/g,'').slice(-8);
      if (tel) promessaMap[tel] = p;
    });
    
    clientes = clientes.map(cliente => {
      const tel = (cliente.telefone || '').replace(/\D/g,'').slice(-8);
      const promessa = promessaMap[tel];
      if (promessa) {
        cliente.data_promessa = promessa.data_promessa;
        cliente.promessa_status = promessa.status;
      }
      return cliente;
    });
    
    res.json(clientes);
    
  } catch(e) { 
    console.error('❌ Erro em /api/bases/:id/clientes:', e);
    res.status(500).json({ erro: e.message }); 
  }
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
        
        // Só bloqueia se o MESMO tipo já foi disparado hoje para essa data
        const tipoVerificar = tipo || 'auto';
        let jaDisparouQuery = firebaseDb.collection('log_cobrancas')
            .where('data_vencimento', '==', data)
            .where('data_envio', '==', hoje)
            .where('tipo', '==', tipoVerificar)
            .limit(1);
        const jaDisparouSnapshot = await jaDisparouQuery.get();
            
        if (!jaDisparouSnapshot.empty) {
            return res.json({ ok: false, aviso: `Cobrança ${tipoVerificar} da data ${data} já foi disparada hoje.` });
        }

        const iniciouEm = new Date().toISOString();
        
        const logRef = await firebaseDb.collection('log_bot').add({
            numero: 'sistema',
            direcao: 'decisao',
            tipo: 'disparo_manual',
            conteudo: JSON.stringify({ data, tipo: tipo || 'auto', iniciadoPor: 'painel' }),
            criado_em: iniciouEm
        });

        res.json({ ok: true, mensagem: 'Disparo iniciado', logId: logRef.id, iniciouEm });

        setTimeout(async () => {
            try {
                // ctx.dispararCobrancaReal já tem client e firebaseDb embutidos
                const total = await ctx.dispararCobrancaReal(data, tipo || null);
                const tipoLabel = {
                    lembrete: 'Lembrete', atraso: 'Atraso', atraso_final: 'Atraso Final',
                    reconquista: 'Reconquista 1', reconquista_final: 'Reconquista 2 (última)'
                };
                const label = tipo ? tipoLabel[tipo] : 'automático (por data)';
                console.log(`✅ Disparo manual concluído: Data ${data} — ${label} — ${total} mensagens`);

                await logRef.update({
                    conteudo: JSON.stringify({ 
                        data, 
                        tipo: tipo || 'auto', 
                        iniciadoPor: 'painel', 
                        total, 
                        status: 'concluido' 
                    })
                });

                for (const adm of ADMINISTRADORES) {
                    await client.sendMessage(adm,
                        `🖥️ *DISPARO MANUAL CONCLUÍDO (painel)*\n\n📋 Data ${data} — ${label}\n📨 ${total} mensagens enviadas`
                    ).catch(() => {});
                }
            } catch (e) {
                console.error('Erro no disparo manual:', e);
                await logRef.update({
                    conteudo: JSON.stringify({ 
                        data, 
                        tipo: tipo || 'auto', 
                        iniciadoPor: 'painel', 
                        erro: e.message, 
                        status: 'erro' 
                    })
                });
            }
        }, 100);
    });

    // =====================================================
// ROTA DE AGENDA OTIMIZADA (RÁPIDA)
// =====================================================
app.get('/api/cobrar/agenda', async (req, res) => {
    try {
        const agora = new Date();
        const mes = agora.getMonth() + 1;
        const ano = agora.getFullYear();
        const dia = agora.getDate();
        
        console.log(`📅 Buscando agenda otimizada para ${mes}/${ano}`);
        
        // 🔥 1. UMA CONSULTA: busca TODOS os logs do mês
        const inicioMes = `${ano}-${String(mes).padStart(2, '0')}-01`;
        const fimMes = `${ano}-${String(mes).padStart(2, '0')}-31`;
        
        const logsSnapshot = await firebaseDb.collection('log_cobrancas')
            .where('data_envio', '>=', inicioMes)
            .where('data_envio', '<=', fimMes)
            .get();
        
        console.log(`   📊 ${logsSnapshot.size} registros encontrados`);
        
        // 🔥 2. Organiza os logs por dia
        const agenda = {};
        
        logsSnapshot.docs.forEach(doc => {
            const c = doc.data();
            const diaLog = parseInt(c.data_envio.split('-')[2]);
            
            if (!agenda[diaLog]) agenda[diaLog] = [];
            
            // Agrupa por data_vencimento e tipo
            const existente = agenda[diaLog].find(e => 
                e.data === c.data_vencimento && e.tipo === (c.tipo || 'auto')
            );
            
            if (existente) {
                existente.clientes++;
            } else {
                agenda[diaLog].push({
                    data: c.data_vencimento,
                    tipo: c.tipo || 'auto',
                    clientes: 1,
                    status: 'realizado',
                    origem: c.origem || 'auto'
                });
            }
        });
        
        // 🔥 3. Busca pendência (outra consulta)
        const pendenciaDoc = await firebaseDb.collection('config').doc('cobranca_adiada').get();
        const pendencia = pendenciaDoc.exists ? pendenciaDoc.data().valor : null;
        
        // Adiciona pendência no dia
        if (pendencia && pendencia.dia && pendencia.mes === mes && pendencia.ano === ano) {
            if (!agenda[pendencia.dia]) agenda[pendencia.dia] = [];
            
            pendencia.entradas?.forEach(entrada => {
                // Evita duplicar se já foi realizado
                const jaExiste = agenda[pendencia.dia].some(e => 
                    e.data === entrada.data && e.tipo === entrada.tipo && e.status === 'realizado'
                );
                
                if (!jaExiste) {
                    agenda[pendencia.dia].push({
                        data: entrada.data,
                        tipo: entrada.tipo,
                        clientes: entrada.clientes || 0,
                        status: 'pendente',
                        motivo: pendencia.motivoBloqueio
                    });
                }
            });
        }
        
        // 🔥 4. Busca previsões para dias 10,20,30 (3 consultas)
        const diasVencimento = [10, 20, 30];
        
        for (const diaVenc of diasVencimento) {
            // Pula se já tem registro neste dia
            if (agenda[diaVenc]?.length > 0) continue;
            
            const clientesSnapshot = await firebaseDb.collection('clientes')
                .where('dia_vencimento', '==', diaVenc)
                .get();
            
            const pendentes = clientesSnapshot.docs.filter(doc => 
                doc.data().status === 'pendente'
            ).length;
            
            if (pendentes > 0) {
                if (!agenda[diaVenc]) agenda[diaVenc] = [];
                
                // Define se é futuro, hoje ou passado
                let status = 'futuro';
                if (diaVenc < dia) status = 'passado';
                if (diaVenc === dia) status = 'hoje';
                
                agenda[diaVenc].push({
                    data: String(diaVenc),
                    tipo: 'previsao',
                    clientes: pendentes,
                    status: status,
                    total_clientes: clientesSnapshot.size
                });
            }
        }
        
        console.log(`   ✅ Agenda montada com ${Object.keys(agenda).length} dias`);
        
        res.json({ 
            agenda, 
            diaAtual: dia, 
            mes, 
            ano, 
            pendencia,
            consultas: logsSnapshot.size + 1 + diasVencimento.length // Só pra debug
        });
        
    } catch (error) {
        console.error('❌ Erro na agenda:', error);
        res.status(500).json({ erro: error.message });
    }
});

    // =====================================================
// ROTAS DE PROMESSAS
// =====================================================

app.get('/api/promessas', async (req, res) => {
    try {
        const { status } = req.query;
        let query = firebaseDb.collection('promessas');
        
        if (status && status !== 'todos') {
            query = query.where('status', '==', status);
        }
        
        const snapshot = await query
            .orderBy('criado_em', 'desc')
            .limit(200)
            .get();
        
        const promessas = await Promise.all(snapshot.docs.map(async doc => {
            const promessa = { id: doc.id, ...doc.data() };
            
            const numero = promessa.numero?.replace('@c.us', '').replace('55', '');
            const cliente = await banco.buscarClientePorTelefone(numero);
            
            if (cliente) {
                promessa.dia_vencimento = cliente.dia_vencimento;
                
                // Verifica se base_id existe E se não é uma string vazia/nula
                if (cliente.base_id && typeof cliente.base_id === 'string' && cliente.base_id.trim() !== '') {
                    try {
                        const baseDoc = await firebaseDb.collection('bases').doc(cliente.base_id).get();
                        if (baseDoc.exists) {
                            promessa.base_nome = baseDoc.data().nome;
                        }
                    } catch (docError) {
                        console.error(`Erro ao buscar base_id ${cliente.base_id}:`, docError);
                        // Opcional: define um nome padrão ou ignora
                    }
                }
            }
            
            return promessa;
        }));
        
        const seteDiasAtras = new Date();
        seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
        
        const promessasFiltradas = (!status || status === 'todos') 
            ? promessas.filter(p => 
                p.status === 'pendente' || 
                (p.status !== 'pendente' && new Date(p.criado_em) >= seteDiasAtras)
              )
            : promessas;
        
        res.json(promessasFiltradas);
    } catch (error) {
        console.error('Erro ao buscar promessas:', error);
        res.status(500).json({ erro: error.message });
    }
});

app.post('/api/promessas/:id/pago', async (req, res) => {
    try {
        const { id } = req.params;
        
        const promessaRef = firebaseDb.collection('promessas').doc(id);
        const promessaDoc = await promessaRef.get();
        
        if (!promessaDoc.exists) {
            return res.status(404).json({ erro: 'Promessa não encontrada' });
        }
        
        const promessa = promessaDoc.data();
        
        await promessaRef.update({
            status: 'pago',
            pago_em: new Date().toISOString()
        });
        
        if (promessa.nome) {
            const clientes = await banco.buscarClientePorNome(promessa.nome);
            const cliente = clientes && clientes.length > 0 ? clientes[0] : null;
            
            if (cliente) {
                await firebaseDb.collection('clientes').doc(cliente.id).update({
                    status: 'pago',
                    atualizado_em: new Date().toISOString()
                });
                
                const hoje = new Date();
                const mesRef = `${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
                const docId = mesRef.replace('/', '-');
                
                await firebaseDb.collection('clientes')
                    .doc(cliente.id)
                    .collection('historico_pagamentos')
                    .doc(docId)
                    .set({
                        referencia: mesRef,
                        status: 'pago',
                        forma_pagamento: 'Promessa',
                        pago_em: new Date().toISOString(),
                        data_vencimento: cliente.dia_vencimento || 10
                    }, { merge: true });
            }
        }
        
        res.json({ ok: true, mensagem: 'Promessa marcada como paga' });
    } catch (error) {
        console.error('Erro ao marcar promessa como paga:', error);
        res.status(500).json({ erro: error.message });
    }
});

app.post('/api/promessas/:id/cancelar', async (req, res) => {
    try {
        const { id } = req.params;
        
        const promessaRef = firebaseDb.collection('promessas').doc(id);
        const promessaDoc = await promessaRef.get();
        
        if (!promessaDoc.exists) {
            return res.status(404).json({ erro: 'Promessa não encontrada' });
        }
        
        const promessa = promessaDoc.data();
        
        await promessaRef.update({
            status: 'cancelada'
        });
        
        if (promessa.nome) {
            const clientes = await banco.buscarClientePorNome(promessa.nome);
            const cliente = clientes && clientes.length > 0 ? clientes[0] : null;
            
            if (cliente) {
                const clienteDoc = await firebaseDb.collection('clientes').doc(cliente.id).get();
                if (clienteDoc.exists && clienteDoc.data().status === 'promessa') {
                    await firebaseDb.collection('clientes').doc(cliente.id).update({
                        status: 'pendente',
                        atualizado_em: new Date().toISOString()
                    });
                }
            }
        }
        
        res.json({ ok: true, mensagem: 'Promessa cancelada' });
    } catch (error) {
        console.error('Erro ao cancelar promessa:', error);
        res.status(500).json({ erro: error.message });
    }
});

app.post('/api/promessas', async (req, res) => {
    try {
        const { nome, numero, data_promessa, cliente_id } = req.body;
        
        if (!data_promessa) {
            return res.status(400).json({ erro: 'data_promessa obrigatória' });
        }
        
        const numWpp = numero ? (numero.replace(/\D/g,'').replace(/^0/,'55') + '@c.us') : null;
        
        const promessaRef = await firebaseDb.collection('promessas').add({
            numero: numWpp || null,
            nome: nome || null,
            data_promessa: data_promessa,
            status: 'pendente',
            criado_em: new Date().toISOString()
        });
        
        if (cliente_id) {
            const clienteRef = firebaseDb.collection('clientes').doc(cliente_id);
            const clienteDoc = await clienteRef.get();
            
            if (clienteDoc.exists && clienteDoc.data().status === 'pendente') {
                await clienteRef.update({
                    status: 'promessa',
                    atualizado_em: new Date().toISOString()
                });
            }
        } else if (nome) {
            const clientes = await banco.buscarClientePorNome(nome);
            const cliente = clientes && clientes.length > 0 ? clientes[0] : null;
            
            if (cliente) {
                const clienteDoc = await firebaseDb.collection('clientes').doc(cliente.id).get();
                if (clienteDoc.exists && clienteDoc.data().status === 'pendente') {
                    await firebaseDb.collection('clientes').doc(cliente.id).update({
                        status: 'promessa',
                        atualizado_em: new Date().toISOString()
                    });
                }
            }
        }
        
        res.json({ ok: true, id: promessaRef.id });
    } catch (error) {
        console.error('Erro ao criar promessa:', error);
        res.status(500).json({ erro: error.message });
    }
});

app.post('/api/promessas/verificar', (req, res) => {
    try {
        if (verificarPromessasVencidas) {
            verificarPromessasVencidas();
        }
        res.json({ ok: true, msg: 'Verificação executada' });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

app.delete('/api/promessas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await firebaseDb.collection('promessas').doc(id).delete();
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

    // =====================================================
    // ROTAS DE LOGS
    // =====================================================
    
    app.get('/api/logs/cobrancas', async (req, res) => {
        const limit = parseInt(req.query.limit) || 50;
        try {
            const snapshot = await firebaseDb.collection('log_cobrancas')
                .orderBy('enviado_em', 'desc')
                .limit(limit)
                .get();
            
            const registros = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json(registros);
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    app.get('/api/logs/comprovantes', async (req, res) => {
        const limit = parseInt(req.query.limit) || 50;
        try {
            const snapshot = await firebaseDb.collection('log_comprovantes')
                .orderBy('recebido_em', 'desc')
                .limit(limit)
                .get();
            
            const registros = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json(registros);
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    app.get('/api/atendimentos', async (req, res) => {
        const limit = parseInt(req.query.limit) || 50;
        try {
            const snapshot = await firebaseDb.collection('log_atendimentos')
                .orderBy('iniciado_em', 'desc')
                .limit(limit)
                .get();
            
            const registros = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json(registros);
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    app.get('/api/logs/bot', async (req, res) => {
        const { numero, limit = 200, offset = 0 } = req.query;
        
        try {
            let query = firebaseDb.collection('log_bot');
            
            if (numero) {
                query = query.where('numero', '==', numero);
            }
            
            const snapshot = await query
                .orderBy('criado_em', 'desc')
                .limit(parseInt(limit))
                .get();
            
            const rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            res.json({ 
                rows, 
                total: rows.length
            });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    app.get('/api/logs/correcoes', async (req, res) => {
        try {
            const snapshot = await firebaseDb.collection('log_correcoes')
                .orderBy('criado_em', 'desc')
                .limit(200)
                .get();
            
            const registros = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json(registros);
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    app.post('/api/logs/correcoes', async (req, res) => {
        const { log_id, mensagem, classificou_como, correto_seria, tipo } = req.body;
        
        if (!mensagem || !correto_seria) {
            return res.status(400).json({ erro: 'mensagem e correto_seria obrigatórios' });
        }
        
        const tipoFinal = tipo === 'confirmacao' ? 'confirmacao' : 'correcao';
        
        try {
            await firebaseDb.collection('log_correcoes').add({
                log_id: log_id || null,
                mensagem: mensagem,
                classificou_como: classificou_como || null,
                correto_seria: correto_seria,
                tipo: tipoFinal,
                criado_em: new Date().toISOString()
            });
            
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    app.get('/api/logs/stats', async (req, res) => {
        const hoje = new Date().toISOString().split('T')[0];
        
        try {
            const hojeSnapshot = await firebaseDb.collection('log_bot')
                .where('criado_em', '>=', hoje)
                .get();
            
            const entradasSnapshot = await firebaseDb.collection('log_bot')
                .where('criado_em', '>=', hoje)
                .where('direcao', '==', 'entrada')
                .get();
            
            const seteDiasAtras = new Date();
            seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
            
            const intencoesSnapshot = await firebaseDb.collection('log_bot')
                .where('criado_em', '>=', seteDiasAtras.toISOString().split('T')[0])
                .get();
            
            const intencoesMap = new Map();
            intencoesSnapshot.docs.forEach(doc => {
                const intencao = doc.data().intencao || 'OUTRO';
                intencoesMap.set(intencao, (intencoesMap.get(intencao) || 0) + 1);
            });
            
            const intencoes = Array.from(intencoesMap.entries())
                .map(([intencao, c]) => ({ intencao, c }))
                .sort((a, b) => b.c - a.c);
            
            const ultimosSnapshot = await firebaseDb.collection('log_bot')
                .orderBy('criado_em', 'desc')
                .limit(10)
                .get();
            
            const numerosUnicos = new Map();
            ultimosSnapshot.docs.forEach(doc => {
                const data = doc.data();
                if (!numerosUnicos.has(data.numero)) {
                    numerosUnicos.set(data.numero, data.criado_em);
                }
            });
            
            const ultimos_numeros = Array.from(numerosUnicos.entries())
                .map(([numero, ultimo]) => ({ numero, ultimo }));
            
            const correcoesSnapshot = await firebaseDb.collection('log_correcoes').get();
            
            const stats = {
                total_hoje: hojeSnapshot.size,
                entradas_hoje: entradasSnapshot.size,
                intencoes: intencoes,
                ultimos_numeros: ultimos_numeros,
                total_correcoes: correcoesSnapshot.size
            };
            
            res.json(stats);
        } catch (error) {
            console.error('Erro ao buscar stats:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    // =====================================================
    // ROTA: Histórico de pagamentos do cliente
    // =====================================================
    app.get('/api/clientes/:clienteId/historico', async (req, res) => {
    try {
        const { clienteId } = req.params;
        
        const clienteDoc = await firebaseDb.collection('clientes').doc(clienteId).get();
        if (!clienteDoc.exists) {
            return res.status(404).json({ erro: 'Cliente não encontrado' });
        }
        
        const cliente = { id: clienteDoc.id, ...clienteDoc.data() };
        
        const historicoSnapshot = await firebaseDb.collection('clientes')
            .doc(clienteId)
            .collection('historico_pagamentos')
            .get(); // Remove orderBy temporariamente se der erro
        
        const historico = historicoSnapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() 
        }));

        res.json({ cliente, historico });
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
    app.post('/api/clientes/:clienteId/historico/:ref/pagar', async (req, res) => {
    try {
        const { clienteId, ref } = req.params;
        const { forma_pagamento } = req.body;
        const referencia = decodeURIComponent(ref);
        
        const clienteDoc = await firebaseDb.collection('clientes').doc(clienteId).get();
        if (!clienteDoc.exists) {
            return res.status(404).json({ erro: 'Cliente não encontrado' });
        }
        
        const cliente = clienteDoc.data();
        
        // 🔥 CORREÇÃO: substituir / por - no ID do documento
        const documentId = referencia.replace(/\//g, '-'); // "03/2026" → "03-2026"
        
        await firebaseDb.collection('clientes')
            .doc(clienteId)
            .collection('historico_pagamentos')
            .doc(documentId)  // ← Agora usa "03-2026"
            .set({
                referencia: referencia,  // mantém o formato original para exibição
                status: 'pago',
                forma_pagamento: forma_pagamento || null,
                pago_em: new Date().toISOString(),
                data_vencimento: cliente.dia_vencimento || 10
            }, { merge: true });
        
        const hoje = new Date();
        const refAtual = `${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}`;
        
        if (referencia === refAtual) {
            await firebaseDb.collection('clientes').doc(clienteId).update({
                status: 'pago',
                atualizado_em: new Date().toISOString()
            });
        }
        if (ctx.sseService) ctx.sseService.notificar('clientes');
        if (ctx.sseService) ctx.sseService.notificar('alertas');
        res.json({ ok: true });
    } catch (error) {
        console.error('Erro ao dar baixa:', error);
        res.status(500).json({ erro: error.message });
    }
});

    // =====================================================
    // ROTA: Reverter baixa
    // =====================================================
   app.post('/api/clientes/:clienteId/historico/:ref/reverter', async (req, res) => {
    try {
        const { clienteId, ref } = req.params;
        const referencia = decodeURIComponent(ref);
        
        // 🔥 CORREÇÃO: substituir / por - no ID do documento
        const documentId = referencia.replace(/\//g, '-'); // "03/2026" → "03-2026"
        
        await firebaseDb.collection('clientes')
            .doc(clienteId)
            .collection('historico_pagamentos')
            .doc(documentId)  // ← Agora usa "03-2026"
            .update({
                status: 'pendente',
                pago_em: null,
                forma_pagamento: null
            });
        
        const hoje = new Date();
        const refAtual = `${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}`;
        
        if (referencia === refAtual) {
            await firebaseDb.collection('clientes').doc(clienteId).update({
                status: 'pendente',
                atualizado_em: new Date().toISOString()
            });
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
    
    app.get('/api/relatorio', async (req, res) => {
        try {
            const r = await banco.dbRelatorio();
            res.json(r);
        } catch(e) {
            res.status(500).json({ erro: e.message });
        }
    });

    app.get('/api/graficos/atendimentos', async (req, res) => {
        try {
            const seteDiasAtras = new Date();
            seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
            
            const snapshot = await firebaseDb.collection('log_atendimentos')
                .where('iniciado_em', '>=', seteDiasAtras.toISOString())
                .get();
            
            const dados = [];
            const diasMap = new Map();
            
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const dia = data.iniciado_em?.split('T')[0];
                if (dia) {
                    diasMap.set(dia, (diasMap.get(dia) || 0) + 1);
                }
            });
            
            Array.from(diasMap.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .forEach(([dia, total]) => {
                    dados.push({ dia, total });
                });
            
            res.json(dados);
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    app.get('/api/graficos/cobrancas', async (req, res) => {
        try {
            const seteDiasAtras = new Date();
            seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
            
            const snapshot = await firebaseDb.collection('log_cobrancas')
                .where('enviado_em', '>=', seteDiasAtras.toISOString())
                .get();
            
            const dados = [];
            const diasMap = new Map();
            
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const dia = data.enviado_em?.split('T')[0];
                if (dia) {
                    diasMap.set(dia, (diasMap.get(dia) || 0) + 1);
                }
            });
            
            Array.from(diasMap.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .forEach(([dia, total]) => {
                    dados.push({ dia, total });
                });
            
            res.json(dados);
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    // =====================================================
    // ROTAS DE CLIENTES (CRUD)
    // =====================================================

    // Atualizar cliente
    app.put('/api/bases/:baseId/clientes/:clienteId', async (req, res) => {
        try {
            const { clienteId } = req.params;
            const { 
                nome, cpf, endereco, numero, telefone, senha, 
                dia_vencimento, observacao, forma_pagamento, plano, status 
            } = req.body;

            const clienteRef = firebaseDb.collection('clientes').doc(clienteId);
            const clienteDoc = await clienteRef.get();
            
            if (!clienteDoc.exists) {
                return res.status(404).json({ erro: 'Cliente não encontrado' });
            }

            const updateData = {};
            if (nome !== undefined) updateData.nome = nome;
            if (cpf !== undefined) updateData.cpf = cpf;
            if (endereco !== undefined) updateData.endereco = endereco;
            if (numero !== undefined) updateData.numero = numero;
            if (telefone !== undefined) updateData.telefone = telefone;
            if (senha !== undefined) updateData.senha = senha;
            if (dia_vencimento !== undefined) updateData.dia_vencimento = parseInt(dia_vencimento);
            if (observacao !== undefined) updateData.observacao = observacao;
            if (forma_pagamento !== undefined) updateData.forma_pagamento = forma_pagamento;
            if (plano !== undefined) updateData.plano = plano;
            if (status !== undefined) updateData.status = status;
            
            updateData.atualizado_em = new Date().toISOString();

            await clienteRef.update(updateData);

            const clienteAtualizadoDoc = await clienteRef.get();
            const clienteAtualizado = { id: clienteId, ...clienteAtualizadoDoc.data() };
            
            res.json(clienteAtualizado);
        } catch (error) {
            console.error('Erro ao atualizar cliente:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    // Marcar cliente como pago / pendente
    app.post('/api/bases/:baseId/clientes/:clienteId/status', async (req, res) => {
        try {
            const { clienteId } = req.params;
            const { status } = req.body;
            
            if (!['pago', 'pendente', 'cancelado', 'promessa'].includes(status)) {
                return res.status(400).json({ erro: 'Status inválido' });
            }
            
            await firebaseDb.collection('clientes').doc(clienteId).update({
                status: status,
                atualizado_em: new Date().toISOString()
            });
            if (ctx.sseService) ctx.sseService.notificar('clientes');

            // Registrar no caixa do dia quando status vira pago
            if (status === 'pago') {
                try {
                    const clienteDoc = await firebaseDb.collection('clientes').doc(clienteId).get();
                    if (clienteDoc.exists) {
                        const cd = clienteDoc.data();
                        const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
                        const hoje = agoraBR.toISOString().split('T')[0];
                        const planoLower = (cd.plano || '').toLowerCase();
                        let valor_plano = null;
                        if (planoLower.includes('iptv') || planoLower.includes('70')) valor_plano = 70;
                        else if (planoLower.includes('200') || planoLower.includes('fibra')) valor_plano = 60;
                        else if (planoLower.includes('50') || planoLower.includes('cabo')) valor_plano = 50;
                        await firebaseDb.collection('pagamentos_hoje').doc(clienteId + '_' + hoje).set({
                            data: hoje, cliente_id: clienteId,
                            nome: cd.nome || '—', plano: cd.plano,
                            forma_pagamento: cd.forma_pagamento,
                            forma_baixa: 'Painel', pago_em: new Date().toISOString(), valor_plano
                        });
                    }
                } catch(_) {}
            }

            res.json({ ok: true, status });
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    // Deletar cliente
    app.delete('/api/bases/:baseId/clientes/:clienteId', async (req, res) => {
        try {
            const { clienteId } = req.params;
            
            const historicoSnapshot = await firebaseDb.collection('clientes')
                .doc(clienteId)
                .collection('historico_pagamentos')
                .get();
            
            const batch = firebaseDb.batch();
            historicoSnapshot.docs.forEach(doc => batch.delete(doc.ref));
            batch.delete(firebaseDb.collection('clientes').doc(clienteId));
            
            await batch.commit();
            
            res.json({ ok: true });
        } catch (error) {
            console.error('Erro ao deletar cliente:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    // Buscar cliente por ID
    app.get('/api/bases/:baseId/clientes/:clienteId', async (req, res) => {
        try {
            const { clienteId } = req.params;
            
            const clienteDoc = await firebaseDb.collection('clientes').doc(clienteId).get();
            if (!clienteDoc.exists) {
                return res.status(404).json({ erro: 'Cliente não encontrado' });
            }
            
            const cliente = { id: clienteDoc.id, ...clienteDoc.data() };
            res.json(cliente);
        } catch (error) {
            console.error('Erro ao buscar cliente:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    // =====================================================
    // ROTAS DE CHAMADOS
    // =====================================================
    
    app.get('/api/chamados', async (req, res) => {
        const { status } = req.query;
        try {
            const lista = await banco.dbListarChamados(status || null);
            res.json(lista);
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    app.post('/api/chamados/:id/assumir', async (req, res) => {
        const { id } = req.params;
        try {
            await banco.dbAtualizarChamado(id, 'em_atendimento');
            res.json({ sucesso: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    app.post('/api/chamados/:id/fechar', async (req, res) => {
        const { id } = req.params;
        try {
            await banco.dbAtualizarChamado(id, 'fechado');
            if (ctx.sseService) ctx.sseService.notificar('chamados');
            const chamadoDoc = await firebaseDb.collection('chamados').doc(id).get();
            if (chamadoDoc.exists) {
                const chamado = chamadoDoc.data();
                await banco.dbRemoverAtendimentoHumano(chamado.numero);
            }
            
            res.json({ sucesso: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    // =====================================================
    // ROTAS DE CANCELAMENTOS
    // =====================================================
    
    app.get('/api/cancelamentos', async (req, res) => {
        const { status } = req.query;
        try {
            let query = firebaseDb.collection('cancelamentos');
            if (status) {
                query = query.where('status', '==', status);
            }
            
            const snapshot = await query
                .orderBy('solicitado_em', 'desc')
                .get();
            
            const cancelamentos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json(cancelamentos);
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    app.post('/api/cancelamentos', async (req, res) => {
        const { 
            cliente_id, base_id, nome, cpf, telefone, numero_whatsapp, endereco,
            numero, senha, plano, forma_pagamento, baixa_sgp, dia_vencimento,
            observacao, motivo, motivo_detalhado, solicitado_via 
        } = req.body;
        
        if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });
        
        try {
            let dadosCliente = {};
            if (cliente_id) {
                const clienteDoc = await firebaseDb.collection('clientes').doc(cliente_id).get();
                if (clienteDoc.exists) {
                    dadosCliente = clienteDoc.data();
                }
            }

            const cancelamentoRef = await firebaseDb.collection('cancelamentos').add({
                cliente_id: cliente_id || null,
                base_id: base_id || dadosCliente.base_id || null,
                nome: nome || dadosCliente.nome,
                cpf: cpf || dadosCliente.cpf || null,
                telefone: telefone || dadosCliente.telefone || null,
                numero_whatsapp: numero_whatsapp || null,
                endereco: endereco || dadosCliente.endereco || null,
                numero: numero || dadosCliente.numero || null,
                senha: senha || dadosCliente.senha || null,
                plano: plano || dadosCliente.plano || null,
                forma_pagamento: forma_pagamento || dadosCliente.forma_pagamento || null,
                baixa_sgp: baixa_sgp ?? dadosCliente.baixa_sgp ?? 0,
                dia_vencimento: dia_vencimento || dadosCliente.dia_vencimento || null,
                observacao: observacao || dadosCliente.observacao || null,
                motivo: motivo || null,
                motivo_detalhado: motivo_detalhado || null,
                solicitado_via: solicitado_via || 'painel',
                status: 'solicitado',
                solicitado_em: new Date().toISOString()
            });

            if (cliente_id) {
                await firebaseDb.collection('clientes').doc(cliente_id).delete();
                console.log(`🗑️ Cliente ${nome} removido da base (cancelamento)`);
            }

            for (const adm of ADMINISTRADORES) {
                await client.sendMessage(adm,
                    `❌ *CANCELAMENTO${solicitado_via === 'painel' ? ' VIA PAINEL' : ''}*\n\n` +
                    `👤 *Nome:* ${nome}\n` +
                    `📅 *Vencimento:* Dia ${dia_vencimento || dadosCliente.dia_vencimento || 'N/A'}\n` +
                    `📦 *Plano:* ${plano || dadosCliente.plano || 'N/A'}\n` +
                    `💬 *Motivo:* ${motivo || 'Não informado'}\n` +
                    (motivo_detalhado ? `📝 *Detalhe:* ${motivo_detalhado}\n` : '')
                ).catch(() => {});
            }
            
            res.json({ ok: true, id: cancelamentoRef.id });
        } catch(e) {
            res.status(500).json({ erro: e.message });
        }
    });

    app.post('/api/cancelamentos/:id/confirmar', async (req, res) => {
        const { id } = req.params;
        
        try {
            const cancelamentoRef = firebaseDb.collection('cancelamentos').doc(id);
            const cancelamentoDoc = await cancelamentoRef.get();
            
            if (!cancelamentoDoc.exists) {
                return res.status(404).json({ erro: 'Não encontrado' });
            }
            
            const cancel = cancelamentoDoc.data();
            
            await cancelamentoRef.update({
                status: 'confirmado',
                confirmado_em: new Date().toISOString()
            });
            if (ctx.sseService) ctx.sseService.notificar('cancelamentos');

            if (cancel.cliente_id) {
                await firebaseDb.collection('clientes').doc(cancel.cliente_id).update({
                    status: 'cancelado',
                    atualizado_em: new Date().toISOString()
                });
            } else if (cancel.nome) {
                const clientes = await banco.buscarClientePorNome(cancel.nome);
                const cliente = clientes && clientes.length > 0 ? clientes[0] : null;
                
                if (cliente) {
                    await firebaseDb.collection('clientes').doc(cliente.id).update({
                        status: 'cancelado',
                        atualizado_em: new Date().toISOString()
                    });
                }
            }

            if (cancel.numero_whatsapp && botIniciadoEm) {
                const nomeP = cancel.nome ? cancel.nome.split(' ')[0] : '';
                await client.sendMessage(cancel.numero_whatsapp,
                    `🤖 *Assistente JMENET*\n\nOlá${nomeP ? ', ' + nomeP : ''}! Seu cancelamento foi confirmado. Sentimos muito em perder você como cliente. 😢\n\nSe mudar de ideia ou precisar de algo, estamos à disposição!`
                ).catch(() => {});
            }

            res.json({ ok: true });
        } catch(e) {
            res.status(500).json({ erro: e.message });
        }
    });

    app.post('/api/cancelamentos/:id/cancelar', async (req, res) => {
        const { id } = req.params;
        
        try {
            const cancelamentoRef = firebaseDb.collection('cancelamentos').doc(id);
            const cancelamentoDoc = await cancelamentoRef.get();
            
            if (!cancelamentoDoc.exists) {
                return res.status(404).json({ erro: 'Não encontrado' });
            }
            
            const cancel = cancelamentoDoc.data();

            if (cancel.base_id && cancel.nome) {
                const clientes = await banco.buscarClientePorNome(cancel.nome);
                const existente = clientes && clientes.length > 0 ? clientes[0] : null;
                
                if (!existente) {
                    await firebaseDb.collection('clientes').add({
                        base_id: cancel.base_id,
                        dia_vencimento: cancel.dia_vencimento || 10,
                        nome: cancel.nome,
                        cpf: cancel.cpf,
                        endereco: cancel.endereco,
                        numero: cancel.numero,
                        telefone: cancel.telefone,
                        senha: cancel.senha,
                        plano: cancel.plano,
                        forma_pagamento: cancel.forma_pagamento,
                        baixa_sgp: cancel.baixa_sgp || 0,
                        observacao: cancel.observacao,
                        status: 'pendente',
                        criado_em: new Date().toISOString(),
                        atualizado_em: new Date().toISOString()
                    });
                    console.log(`↩️ Cliente ${cancel.nome} reinserido na base (reverteu cancelamento)`);
                }
            }

            await cancelamentoRef.update({
                status: 'desistiu'
            });
            
            res.json({ ok: true });
        } catch(e) {
            res.status(500).json({ erro: e.message });
        }
    });

    app.delete('/api/cancelamentos/:id', async (req, res) => {
        try {
            await firebaseDb.collection('cancelamentos').doc(req.params.id).delete();
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });




    // =====================================================
    // ROTAS DE INSTALAÇÕES
    // =====================================================
    
    app.get('/api/instalacoes', async (req, res) => {
        const status = req.query.status;
        try {
            let query = firebaseDb.collection('novos_clientes');
            if (status) {
                query = query.where('status', '==', status);
            }
            
            const snapshot = await query
                .orderBy('cadastrado_em', 'desc')
                .get();
            
            const registros = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json(registros);
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    app.put('/api/instalacoes/:id', async (req, res) => {
        const { nome, cpf, endereco, telefone, plano, roteador, data_vencimento, disponibilidade, obs, status } = req.body;
        
        try {
            const updateData = {};
            if (nome !== undefined) updateData.nome = nome;
            if (cpf !== undefined) updateData.cpf = cpf;
            if (endereco !== undefined) updateData.endereco = endereco;
            if (telefone !== undefined) updateData.telefone = telefone;
            if (plano !== undefined) updateData.plano = plano;
            if (roteador !== undefined) updateData.roteador = roteador;
            if (data_vencimento !== undefined) updateData.data_vencimento = data_vencimento;
            if (disponibilidade !== undefined) updateData.disponibilidade = disponibilidade;
            if (obs !== undefined) updateData.obs = obs;
            if (status !== undefined) updateData.status = status;
            
            updateData.atualizado_em = new Date().toISOString();
            
            await firebaseDb.collection('novos_clientes').doc(req.params.id).update(updateData);
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    app.post('/api/instalacoes/:id/confirmar', async (req, res) => {
        try {
            await firebaseDb.collection('novos_clientes').doc(req.params.id).update({
                status: 'confirmado',
                confirmado_em: new Date().toISOString()
            });
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    app.post('/api/instalacoes/:id/finalizar', async (req, res) => {
        try {
            const instalacaoRef = firebaseDb.collection('novos_clientes').doc(req.params.id);
            const instalacaoDoc = await instalacaoRef.get();
            
            if (!instalacaoDoc.exists) {
                return res.status(404).json({ erro: 'Não encontrado' });
            }
            
            const inst = instalacaoDoc.data();
            
            await instalacaoRef.update({
                status: 'finalizado',
                finalizado_em: new Date().toISOString()
            });

            const dia = inst.data_vencimento;
            if (dia && [10, 20, 30].includes(Number(dia))) {
                const nomeBase = `Data ${dia}`;
                
                const baseSnapshot = await firebaseDb.collection('bases')
                    .where('nome', '==', nomeBase)
                    .limit(1)
                    .get();
                
                if (!baseSnapshot.empty) {
                    const base = baseSnapshot.docs[0];
                    
                    const clientesExistentes = await banco.buscarClientePorNome(inst.nome);
                    const existente = clientesExistentes && clientesExistentes.length > 0 ? clientesExistentes[0] : null;
                    
                    if (!existente) {
                        const clienteRef = await firebaseDb.collection('clientes').add({
                            base_id: base.id,
                            dia_vencimento: parseInt(dia),
                            numero: inst.numero,
                            nome: inst.nome,
                            cpf: inst.cpf || null,
                            endereco: inst.endereco || null,
                            telefone: inst.telefone || inst.numero || null,
                            plano: inst.plano || null,
                            status: 'pago',
                            criado_em: new Date().toISOString(),
                            atualizado_em: new Date().toISOString()
                        });
                        
                        if (isentarMesEntrada) {
                            await isentarMesEntrada(clienteRef.id, dia);
                        }
                        
                        console.log(`✅ Cliente ${inst.nome} adicionado à base ${nomeBase} (mês isento)`);
                    }
                }
            }

            if (inst.numero && botIniciadoEm) {
                await client.sendMessage(inst.numero,
                    `🤖 *Assistente JMENET*\n\nOlá, ${inst.nome ? inst.nome.split(' ')[0] : ''}! 🎉\n\nSua instalação foi concluída com sucesso! Seja bem-vindo(a) à JMENET!\n\nSua mensalidade vence todo dia *${dia}*. Após 5 dias de atraso o serviço é suspenso automaticamente.\n\nQualquer dúvida é só chamar! 😊`
                ).catch(() => {});
            }
            
            res.json({ ok: true, base: dia ? `Data ${dia}` : null });
        } catch (error) {
            console.error('Erro ao finalizar instalação:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    app.delete('/api/instalacoes/:id', async (req, res) => {
        try {
            await firebaseDb.collection('novos_clientes').doc(req.params.id).delete();
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });


        // =====================================================
// ROTA: Criar novo cliente
// =====================================================
    app.post('/api/clientes', async (req, res) => {
    try {
        const { base_id, nome, cpf, telefone, endereco, numero, senha, plano, dia_vencimento, observacao } = req.body;
        
        console.log('📝 Recebido POST /api/clientes:', { base_id, nome, telefone, dia_vencimento });
        
        if (!nome) {
            return res.status(400).json({ erro: 'Nome é obrigatório' });
        }
        
        if (!base_id) {
            return res.status(400).json({ erro: 'base_id é obrigatório' });
        }
        
        // Converte base_id para número
        const baseIdNum = parseInt(base_id);
        if (isNaN(baseIdNum)) {
            return res.status(400).json({ erro: 'base_id inválido' });
        }
        
        // Converte dia_vencimento para número
        const diaVencimentoNum = dia_vencimento ? parseInt(dia_vencimento) : 10;
        
        const clienteRef = await firebaseDb.collection('clientes').add({
            base_id: baseIdNum,
            nome: nome.trim(),
            cpf: cpf || null,
            telefone: telefone || null,
            endereco: endereco || null,
            numero: numero || null,
            senha: senha || null,
            plano: plano || null,
            dia_vencimento: diaVencimentoNum,
            observacao: observacao || null,
            status: 'pendente',
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString()
        });
        
        const novoCliente = await clienteRef.get();
        console.log('✅ Cliente criado com ID:', clienteRef.id);
        
        res.json({ id: clienteRef.id, ...novoCliente.data() });
        
    } catch (error) {
        console.error('❌ Erro ao criar cliente:', error);
        res.status(500).json({ erro: error.message });
    }
});


    // =====================================================
    // ROTAS DE DASHBOARD
    // =====================================================
    
    app.get('/api/dashboard/resumo-bases', async (req, res) => {
        try {
            const basesSnapshot = await firebaseDb.collection('bases').get();
            
            const result = await Promise.all(basesSnapshot.docs.map(async (baseDoc) => {
                const base = { id: baseDoc.id, ...baseDoc.data() };
                
                // CORRIGIDO com parseInt
                const clientesSnapshot = await firebaseDb.collection('clientes')
                    .where('base_id', '==', parseInt(baseDoc.id))
                    .get();
                
                const total = clientesSnapshot.size;
                let pagos = 0, pend = 0, prom = 0;
                
                clientesSnapshot.docs.forEach(doc => {
                    const status = doc.data().status;
                    if (status === 'pago') pagos++;
                    else if (status === 'pendente') pend++;
                    else if (status === 'promessa') prom++;
                });
                
                return { 
                    id: baseDoc.id, 
                    nome: base.nome, 
                    total, 
                    pagos, 
                    pendentes: pend, 
                    promessas: prom 
                };
            }));
            
            const totalPendentes = result.reduce((acc, b) => acc + b.pendentes, 0);
            const totalPromessas = result.reduce((acc, b) => acc + b.promessas, 0);
            
            res.json({ bases: result, totalPendentes, totalPromessas });
        } catch(e) { 
            res.json({ bases: [], totalPendentes: 0, totalPromessas: 0 }); 
        }
    });

    app.get('/api/dashboard/caixa-hoje', async (req, res) => {
        try {
            const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
            const hoje = agoraBR.toISOString().split('T')[0];

            // 1 query na coleção pagamentos_hoje — em vez de ler todos os clientes
            const snap = await firebaseDb.collection('pagamentos_hoje')
                .where('data', '==', hoje)
                .get();

            const rows = snap.docs.map(doc => doc.data());
            rows.sort((a, b) => (b.pago_em || '').localeCompare(a.pago_em || ''));
            res.json(rows);
        } catch(e) {
            console.error('Erro caixa-hoje:', e.message);
            res.json([]);
        }
    });
    app.get('/api/dashboard/alertas', async (req, res) => {
        try {
            const hoje = new Date();
            const hojeStr = hoje.toISOString().split('T')[0];
            const amanha = new Date(hoje);
            amanha.setDate(amanha.getDate() + 1);
            const amanhaStr = amanha.toISOString().split('T')[0];
            
            const promessasHojeSnapshot = await firebaseDb.collection('promessas')
                .where('status', '==', 'pendente')
                .where('data_promessa', '==', hojeStr)
                .get();
            
            const promessasAmanhaSnapshot = await firebaseDb.collection('promessas')
                .where('status', '==', 'pendente')
                .where('data_promessa', '==', amanhaStr)
                .get();
            
            const promessasHoje = promessasHojeSnapshot.docs.map(doc => ({
                nome: doc.data().nome,
                numero: doc.data().numero,
                data_promessa: doc.data().data_promessa
            }));
            
            const cincoDiasAtras = new Date();
            cincoDiasAtras.setDate(cincoDiasAtras.getDate() - 5);
            
            const inadimplentesSnapshot = await firebaseDb.collection('clientes')
                .where('status', '==', 'pendente')
                .where('atualizado_em', '<=', cincoDiasAtras.toISOString())
                .get();
            
            const umDiaAtras = Date.now() - 86400000;
            const chamadosSnapshot = await firebaseDb.collection('chamados')
                .where('status', '==', 'aberto')
                .get();
            
            const chamadosAbertos = chamadosSnapshot.docs.filter(doc => {
                const data = doc.data();
                return data.aberto_em && data.aberto_em < umDiaAtras;
            }).length;
            
            res.json({ 
                promessasHoje: promessasHoje.length, 
                promessasAmanha: promessasAmanhaSnapshot.size, 
                promessasHojeDetalhe: promessasHoje, 
                inadimplentes: inadimplentesSnapshot.size, 
                chamadosAbertos 
            });
        } catch(e) { 
            res.json({ promessasHoje:0, promessasAmanha:0, promessasHojeDetalhe:[], inadimplentes:0, chamadosAbertos:0 }); 
        }
    });

    app.get('/api/dashboard/fluxo-clientes', async (req, res) => {
        const hoje = new Date();
        const mesAtual = hoje.getMonth() + 1;
        const anoAtual = hoje.getFullYear();
        const mesStr = String(mesAtual).padStart(2, '0');

        const entradasSnapshot = await firebaseDb.collection('novos_clientes')
            .where('status', 'in', ['confirmado', 'finalizado'])
            .get();
        
        const entradas = entradasSnapshot.docs.filter(doc => {
            const data = doc.data().finalizado_em;
            return data && data.startsWith(`${anoAtual}-${mesStr}`);
        }).length;

        const saidasSnapshot = await firebaseDb.collection('cancelamentos')
            .where('status', '==', 'confirmado')
            .get();
        
        const saidas = saidasSnapshot.docs.filter(doc => {
            const data = doc.data().confirmado_em;
            return data && data.startsWith(`${anoAtual}-${mesStr}`);
        }).length;

        const ativosSnapshot = await firebaseDb.collection('clientes')
            .where('status', '!=', 'cancelado')
            .get();
        
        const totalAtivos = ativosSnapshot.size;

        const canceladosSnapshot = await firebaseDb.collection('clientes')
            .where('status', '==', 'cancelado')
            .get();
        
        const totalCancelados = canceladosSnapshot.size;

        // Busca tudo de uma vez e agrupa no JS — 2 queries em vez de 12
        const [novosSnap, cancelSnap] = await Promise.all([
            firebaseDb.collection('novos_clientes').where('status', 'in', ['confirmado', 'finalizado']).get(),
            firebaseDb.collection('cancelamentos').where('status', '==', 'confirmado').get()
        ]);
        
        const historico = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(anoAtual, mesAtual - 1 - i, 1);
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const a = d.getFullYear();
            const prefix = `${a}-${m}`;
            const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
            
            const ent = novosSnap.docs.filter(doc => doc.data().finalizado_em?.startsWith(prefix)).length;
            const sai = cancelSnap.docs.filter(doc => doc.data().confirmado_em?.startsWith(prefix)).length;
            
            historico.push({ label, entradas: ent, saidas: sai });
        }

        res.json({
            mes: { entradas, saidas },
            totalAtivos,
            totalCancelados,
            historico,
        });
    });

    // =====================================================
    // ROTAS DE CARNÊ
    // =====================================================
    
    app.get('/api/carne', async (req, res) => {
        const { status } = req.query;
        try {
            let query = firebaseDb.collection('carne_solicitacoes');
            if (status) {
                query = query.where('status', '==', status);
            }
            
            const snapshot = await query
                .orderBy('solicitado_em', 'desc')
                .get();
            
            const solicitacoes = await Promise.all(snapshot.docs.map(async doc => {
                const sol = { id: doc.id, ...doc.data() };
                
                if (sol.cliente_id) {
                    const clienteDoc = await firebaseDb.collection('clientes').doc(sol.cliente_id).get();
                    if (clienteDoc.exists) {
                        const cliente = clienteDoc.data();
                        sol.dia_vencimento = cliente.dia_vencimento;
                        sol.plano = cliente.plano;
                        sol.telefone_cadastro = cliente.telefone;
                    }
                }
                
                return sol;
            }));
            
            res.json(solicitacoes);
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    app.post('/api/carne', async (req, res) => {
        const { cliente_id, nome, numero, endereco, observacao } = req.body;
        if (!nome && !cliente_id) return res.status(400).json({ erro: 'nome ou cliente_id obrigatório' });

        try {
            let dadosCli = {};
            if (cliente_id) {
                const clienteDoc = await firebaseDb.collection('clientes').doc(cliente_id).get();
                if (clienteDoc.exists) {
                    dadosCli = clienteDoc.data();
                }
            }

            if (cliente_id) {
                const anteriores = await firebaseDb.collection('carne_solicitacoes')
                    .where('cliente_id', '==', cliente_id)
                    .where('status', '==', 'solicitado')
                    .get();
                
                const batch = firebaseDb.batch();
                anteriores.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }

            const solRef = await firebaseDb.collection('carne_solicitacoes').add({
                cliente_id: cliente_id || null,
                numero: numero || dadosCli.telefone || null,
                nome: nome || dadosCli.nome,
                endereco: endereco || dadosCli.endereco || null,
                observacao: observacao || null,
                origem: 'painel',
                status: 'solicitado',
                solicitado_em: new Date().toISOString()
            });

            const nomeFinal = nome || dadosCli.nome || 'não informado';
            
            for (const adm of ADMINISTRADORES) {
                await client.sendMessage(adm,
                    `📋 *SOLICITAÇÃO DE CARNÊ (painel)*\n\n` +
                    `👤 ${nomeFinal}\n` +
                    `📍 ${endereco || dadosCli.endereco || 'endereço não informado'}\n` +
                    `_Acesse Carnês para marcar como impresso e entregue._`
                ).catch(() => {});
            }

            res.json({ ok: true, id: solRef.id });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    app.post('/api/carne/:id/imprimir', async (req, res) => {
        try {
            await firebaseDb.collection('carne_solicitacoes').doc(req.params.id).update({
                status: 'impresso',
                impresso_em: new Date().toISOString()
            });
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    app.post('/api/carne/:id/entregar', async (req, res) => {
        try {
            const solRef = firebaseDb.collection('carne_solicitacoes').doc(req.params.id);
            const solDoc = await solRef.get();
            
            if (!solDoc.exists) {
                return res.status(404).json({ erro: 'Não encontrado' });
            }
            
            const sol = solDoc.data();
            
            await solRef.update({
                status: 'entregue',
                entregue_em: new Date().toISOString()
            });
            if (ctx.sseService) ctx.sseService.notificar('carne');
            
            if (botIniciadoEm && sol.numero) {
                await client.sendMessage(sol.numero,
                    `🤖 *Assistente JMENET*\n\nOlá${sol.nome ? ', ' + sol.nome.split(' ')[0] : ''}! 😊 Seu *carnê físico* já está pronto e foi entregue/está disponível para retirada! 📋\n\nQualquer dúvida é só chamar!`
                ).catch(() => {});
            }
            
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    app.delete('/api/carne/:id', async (req, res) => {
        try {
            await firebaseDb.collection('carne_solicitacoes').doc(req.params.id).delete();
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    // =====================================================
    // ROTAS DE INADIMPLENTES
    // =====================================================
    
    app.get('/api/relatorio/inadimplentes', async (req, res) => {
        const dias = parseInt(req.query.dias) || 5;
        try {
            const limite = new Date();
            limite.setDate(limite.getDate() - dias);
            
            const snapshot = await firebaseDb.collection('clientes')
                .where('status', '==', 'pendente')
                .get();
            
            const inadimplentes = [];
            
            for (const doc of snapshot.docs) {
                const cliente = doc.data();
                const atualizadoEm = new Date(cliente.atualizado_em || cliente.criado_em);
                const diasPendente = Math.floor((Date.now() - atualizadoEm) / (1000 * 60 * 60 * 24));
                
                if (diasPendente > dias) {
                    let base_nome = null;
                    if (cliente.base_id) {
                        const baseDoc = await firebaseDb.collection('bases').doc(cliente.base_id).get();
                        if (baseDoc.exists) {
                            base_nome = baseDoc.data().nome;
                        }
                    }
                    
                    inadimplentes.push({
                        id: doc.id,
                        nome: cliente.nome,
                        telefone: cliente.telefone,
                        plano: cliente.plano,
                        dia_vencimento: cliente.dia_vencimento,
                        atualizado_em: cliente.atualizado_em,
                        base_nome,
                        dias_pendente: diasPendente
                    });
                }
            }
            
            inadimplentes.sort((a, b) => b.dias_pendente - a.dias_pendente);
            
            res.json(inadimplentes);
        } catch(e) { 
            res.json([]); 
        }
    });

    // =====================================================
    // ROTAS DE EXPORTAÇÃO - CORRIGIDA!
    // =====================================================
    
    app.get('/api/exportar/clientes', async (req, res) => {
        try {
            const clientesSnapshot = await firebaseDb.collection('clientes').get(); // CORRIGIDO: sem where
            
            const clientes = await Promise.all(clientesSnapshot.docs.map(async doc => {
                const cliente = doc.data();
                
                let base_nome = null;
                if (cliente.base_id) {
                    const baseDoc = await firebaseDb.collection('bases').doc(String(cliente.base_id)).get();
                    if (baseDoc.exists) {
                        base_nome = baseDoc.data().nome;
                    }
                }
                
                return {
                    nome: cliente.nome,
                    cpf: cliente.cpf,
                    telefone: cliente.telefone,
                    endereco: cliente.endereco,
                    numero_casa: cliente.numero,
                    plano: cliente.plano,
                    forma_pagamento: cliente.forma_pagamento,
                    status: cliente.status,
                    observacao: cliente.observacao,
                    pppoe: cliente.senha,
                    dia_vencimento: cliente.dia_vencimento,
                    base: base_nome,
                    criado_em: cliente.criado_em,
                    atualizado_em: cliente.atualizado_em
                };
            }));
            
            clientes.sort((a, b) => {
                if (a.base !== b.base) return (a.base || '').localeCompare(b.base || '');
                return (a.nome || '').localeCompare(b.nome || '');
            });
            
            res.json(clientes);
        } catch(e) { 
            console.error('Erro ao exportar clientes:', e);
            res.status(500).json({ erro: e.message }); 
        }
    });

    // =====================================================
    // ROTAS DE PLANILHA (JME) - CORRIGIDA!
    // =====================================================
    
    app.get('/api/planilha/resumo', async (req, res) => {
        try {
            const result = {};
            
            for (const dia of ['10', '20', '30']) {
                const clientesSnapshot = await firebaseDb.collection('clientes')
                    .where('dia_vencimento', '==', parseInt(dia)) // CORRIGIDO
                    .get();
                
                const pagos = clientesSnapshot.docs.filter(doc => doc.data().status === 'pago').length;
                const pendentes = clientesSnapshot.docs.filter(doc => doc.data().status !== 'pago').length;
                
                const clientes = clientesSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        nome: data.nome,
                        telefone: data.telefone,
                        status: data.status,
                        forma_pagamento: data.forma_pagamento,
                        baixa_sgp: data.baixa_sgp || 0
                    };
                }).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
                
                result[dia] = { 
                    pagos, 
                    pendentes, 
                    total: pagos + pendentes, 
                    clientes 
                };
            }
            
            res.json(result);
        } catch(e) {
            console.error('Erro no resumo da planilha:', e);
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
    
    app.post('/api/admin/limpar-estado', async (req, res) => {
        const { numero } = req.body || {};
        if (!numero) return res.status(400).json({ erro: 'numero obrigatório' });
        
        try {
            const atendimentoQuery = await firebaseDb.collection('atendimento_humano')
                .where('numero', '==', numero)
                .get();
            
            const batch = firebaseDb.batch();
            atendimentoQuery.docs.forEach(doc => batch.delete(doc.ref));
            
            const estadoQuery = await firebaseDb.collection('estados_v2')
                .where('numero', '==', numero)
                .get();
            
            estadoQuery.docs.forEach(doc => batch.delete(doc.ref));
            
            await batch.commit();
            
            state.limpar(numero);
            if (ctx.cancelarTimerInatividade) ctx.cancelarTimerInatividade(numero);
            
            console.log(`🧹 Estado de ${numero} limpo via API`);
            res.json({ ok: true, mensagem: `Estado de ${numero} limpo com sucesso` });
        } catch(e) {
            res.status(500).json({ erro: e.message });
        }
    });

    app.post('/api/sgp/confirmar', async (req, res) => {
        try {
            const { nome } = req.body;
            if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });

            const clientes = await banco.buscarClientePorNome(nome.trim());
            const cliente = clientes && clientes.length > 0 ? clientes[0] : null;

            if (!cliente) {
                return res.status(404).json({ erro: 'Cliente não encontrado' });
            }

            await firebaseDb.collection('clientes').doc(cliente.id).update({
                baixa_sgp: 1,
                atualizado_em: new Date().toISOString()
            });

            res.json({ sucesso: true });
        } catch(e) {
            res.status(500).json({ erro: e.message });
        }
    });

    // =====================================================
    // ROTAS DE MONITORAMENTO
    // =====================================================

    // ── Últimos cadastrados ────────────────────────────────────────
    app.get('/api/clientes/recentes', async (req, res) => {
        const limite = parseInt(req.query.limite) || 50;
        try {
            // Sem orderBy para não precisar de índice — ordena em memória
            const snap = await firebaseDb.collection('clientes').get();
            const clientes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Enriquece com nome da base
            const basesSnap = await firebaseDb.collection('bases').get();
            const baseMap = {};
            basesSnap.docs.forEach(d => { baseMap[d.id] = d.data().nome; });

            clientes.forEach(c => {
                c.base_nome = baseMap[String(c.base_id)] || null;
            });

            // Ordena por criado_em desc em memória
            clientes.sort((a, b) => {
                const ta = a.criado_em || '';
                const tb = b.criado_em || '';
                return tb.localeCompare(ta);
            });

            res.json(clientes.slice(0, limite));
        } catch(e) {
            res.status(500).json({ erro: e.message });
        }
    });

    // ── Desconectar WhatsApp ────────────────────────────────────────
    app.post('/api/whatsapp/desconectar', async (req, res) => {
        try {
            await client.logout();
            res.json({ ok: true });
        } catch(e) {
            res.status(500).json({ ok: false, erro: e.message });
        }
    });

    app.get('/api/health', (req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memoria: process.memoryUsage(),
            botAtivo,
            conexaoWhatsApp: !!botIniciadoEm
        });
    });

    app.get('/api/metricas', async (req, res) => {
        try {
            const hoje = new Date().toISOString().split('T')[0];
            const umaHoraAtras = new Date(Date.now() - 3600000).toISOString();
            
            const ultimaHoraSnapshot = await firebaseDb.collection('log_bot')
                .where('criado_em', '>=', umaHoraAtras)
                .get();
            
            const atendimentosHojeSnapshot = await firebaseDb.collection('log_atendimentos')
                .where('iniciado_em', '>=', hoje)
                .get();
            
            const metricas = {
                bot: {
                    ativo: botAtivo,
                    iniciadoEm: botIniciadoEm,
                    uptime: botIniciadoEm ? Math.floor((Date.now() - botIniciadoEm) / 1000) : 0
                },
                banco: {
                    tipo: 'Firebase Firestore',
                    colecoes: ['bases', 'clientes', 'promessas', 'logs', 'config']
                },
                atendimentos: {
                    ativos: state?.stats?.()?.atendimentoHumano || 0,
                    totalHoje: atendimentosHojeSnapshot.size
                },
                mensagens: {
                    ultimaHora: ultimaHoraSnapshot.size
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

    app.get('/api/metricas/fluxos', async (req, res) => {
        try {
            console.log('📊 Rota /api/metricas/fluxos chamada');
            
            const seteDiasAtras = new Date();
            seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
            
            const snapshot = await firebaseDb.collection('log_bot')
                .where('criado_em', '>=', seteDiasAtras.toISOString())
                .get();
            
            const fluxosMap = new Map();
            const clientesUnicosMap = new Map();
            
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const intencao = data.intencao || 'OUTRO';
                
                fluxosMap.set(intencao, (fluxosMap.get(intencao) || 0) + 1);
                
                if (!clientesUnicosMap.has(intencao)) {
                    clientesUnicosMap.set(intencao, new Set());
                }
                clientesUnicosMap.get(intencao).add(data.numero);
            });
            
            const fluxos = Array.from(fluxosMap.entries()).map(([intencao, total]) => ({
                intencao,
                total,
                clientes_unicos: clientesUnicosMap.get(intencao)?.size || 0,
            }));
            
            fluxos.sort((a, b) => b.total - a.total);
            
            console.log('✅ Fluxos encontrados:', fluxos.length);

            res.json({
                fluxos,
                total: fluxos.reduce((acc, f) => acc + f.total, 0)
            });

        } catch (error) {
            console.error('❌ ERRO NA ROTA:', error);
            res.status(500).json({ 
                erro: error.message,
                stack: error.stack
            });
        }
    });

    app.get('/api/logs/erros', async (req, res) => {
        const { limit = 50 } = req.query;
        try {
            const snapshot = await firebaseDb.collection('log_bot')
                .where('tipo', '==', 'erro')
                .orderBy('criado_em', 'desc')
                .limit(parseInt(limit))
                .get();
            
            const erros = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json(erros);
        } catch (error) {
            try {
                const snapshot = await firebaseDb.collection('log_bot')
                    .orderBy('criado_em', 'desc')
                    .limit(parseInt(limit) * 2)
                    .get();
                
                const erros = snapshot.docs
                    .filter(doc => {
                        const data = doc.data();
                        return data.conteudo?.toLowerCase().includes('error') || 
                               data.conteudo?.toLowerCase().includes('exception');
                    })
                    .slice(0, parseInt(limit))
                    .map(doc => ({ id: doc.id, ...doc.data() }));
                
                res.json(erros);
            } catch (e) {
                res.status(500).json({ erro: e.message });
            }
        }
    });

    app.get('/api/metricas/fila', (req, res) => {
        res.json({
            mensagem: 'Métricas de fila disponíveis apenas em tempo real',
        });
    });

    // =====================================================
    // IMPORTAR ROTAS ADICIONAIS
    // =====================================================
    
    require('./agendamentos')(app, ctx);
    require('./instalacoes-agendadas')(app, ctx);
    require('./paginacao')(app, ctx);
    require('./alertas')(app, ctx);
    require('./backup')(app, ctx);

    // =====================================================
    // FALLBACK PARA REACT ROUTER - VERSÃO CORRIGIDA
    // =====================================================
    app.use((req, res, next) => {
        if (req.path.startsWith('/api/')) {
            return next();
        }
        
        const indexPath = path.join(__dirname, '../frontend/dist/index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.status(404).json({ 
                status: 'API JMENET online', 
                versao: '1.0',
                erro: 'Frontend não encontrado. Execute npm run build na pasta frontend.'
            });
        }
    });
};