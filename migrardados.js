// migrar-dados.js
const { db: firebaseDb } = require('./config/firebase');
const Database = require('better-sqlite3');
const path = require('path');

// Conecta ao SQLite antigo
const sqliteDb = new Database('./jmenet.db');

async function migrar() {
  console.log('🚀 Iniciando migração de dados...\n');

  // =====================================================
  // 1. MIGRAR BASES
  // =====================================================
  console.log('📁 Migrando bases...');
  const bases = sqliteDb.prepare('SELECT * FROM bases').all();
  
  for (const base of bases) {
    const baseRef = await firebaseDb.collection('bases').doc(base.id.toString()).set({
      nome: base.nome,
      descricao: base.descricao,
      criado_em: base.criado_em
    });
    
    // Migrar datas_base (subcoleção)
    const datas = sqliteDb.prepare('SELECT * FROM datas_base WHERE base_id = ?').all(base.id);
    for (const data of datas) {
      await firebaseDb.collection('bases').doc(base.id.toString())
        .collection('datas_base').doc(data.id.toString())
        .set({ dia: data.dia });
    }
    console.log(`   ✅ Base ${base.nome} (${datas.length} dias)`);
  }

  // =====================================================
  // 2. MIGRAR CLIENTES (para coleção 'clientes')
  // =====================================================
  console.log('\n👥 Migrando clientes...');
  const clientes = sqliteDb.prepare('SELECT * FROM clientes_base').all();
  
  for (const cliente of clientes) {
    await firebaseDb.collection('clientes').doc(cliente.id.toString()).set({
      base_id: cliente.base_id.toString(),
      nome: cliente.nome,
      cpf: cliente.cpf,
      telefone: cliente.telefone,
      endereco: cliente.endereco,
      numero: cliente.numero,
      senha: cliente.senha,
      dia_vencimento: cliente.dia_vencimento,
      status: cliente.status,
      plano: cliente.plano,
      forma_pagamento: cliente.forma_pagamento,
      observacao: cliente.observacao,
      baixa_sgp: cliente.baixa_sgp || 0,
      criado_em: cliente.criado_em,
      atualizado_em: cliente.atualizado_em
    });
    
    // Migrar histórico de pagamentos (subcoleção)
    const historico = sqliteDb.prepare('SELECT * FROM historico_pagamentos WHERE cliente_id = ?').all(cliente.id);
    for (const hist of historico) {
      await firebaseDb.collection('clientes').doc(cliente.id.toString())
        .collection('historico_pagamentos').doc(hist.referencia)
        .set({
          referencia: hist.referencia,
          data_vencimento: hist.data_vencimento,
          status: hist.status,
          forma_pagamento: hist.forma_pagamento,
          valor: hist.valor,
          pago_em: hist.pago_em,
          criado_em: hist.criado_em
        });
    }
  }
  console.log(`   ✅ ${clientes.length} clientes migrados`);

  // =====================================================
  // 3. MIGRAR PROMESSAS
  // =====================================================
  console.log('\n🤝 Migrando promessas...');
  const promessas = sqliteDb.prepare('SELECT * FROM promessas').all();
  
  for (const promessa of promessas) {
    await firebaseDb.collection('promessas').doc(promessa.id.toString()).set({
      numero: promessa.numero,
      nome: promessa.nome,
      data_promessa: promessa.data_promessa,
      data_vencimento_original: promessa.data_vencimento_original,
      status: promessa.status,
      notificado: promessa.notificado || 0,
      criado_em: promessa.criado_em,
      cobrado_em: promessa.cobrado_em,
      pago_em: promessa.pago_em
    });
  }
  console.log(`   ✅ ${promessas.length} promessas migradas`);

  // =====================================================
  // 4. MIGRAR CANCELAMENTOS
  // =====================================================
  console.log('\n❌ Migrando cancelamentos...');
  const cancelamentos = sqliteDb.prepare('SELECT * FROM cancelamentos').all();
  
  for (const canc of cancelamentos) {
    await firebaseDb.collection('cancelamentos').doc(canc.id.toString()).set({
      cliente_id: canc.cliente_id?.toString(),
      base_id: canc.base_id?.toString(),
      nome: canc.nome,
      cpf: canc.cpf,
      telefone: canc.telefone,
      numero_whatsapp: canc.numero_whatsapp,
      endereco: canc.endereco,
      numero: canc.numero,
      senha: canc.senha,
      plano: canc.plano,
      forma_pagamento: canc.forma_pagamento,
      baixa_sgp: canc.baixa_sgp || 0,
      dia_vencimento: canc.dia_vencimento,
      observacao: canc.observacao,
      motivo: canc.motivo,
      motivo_detalhado: canc.motivo_detalhado,
      solicitado_via: canc.solicitado_via,
      status: canc.status,
      notificado_adm: canc.notificado_adm || 0,
      solicitado_em: canc.solicitado_em,
      confirmado_em: canc.confirmado_em
    });
  }
  console.log(`   ✅ ${cancelamentos.length} cancelamentos migrados`);

  // =====================================================
  // 5. MIGRAR AGENDAMENTOS
  // =====================================================
  console.log('\n📅 Migrando agendamentos...');
  const agendamentos = sqliteDb.prepare('SELECT * FROM agendamentos').all();
  
  for (const age of agendamentos) {
    await firebaseDb.collection('agendamentos').doc(age.id.toString()).set({
      data: age.data,
      periodo: age.periodo,
      cliente_id: age.cliente_id?.toString(),
      cliente_nome: age.cliente_nome,
      numero: age.numero,
      endereco: age.endereco,
      status: age.status,
      criado_em: age.criado_em
    });
  }
  console.log(`   ✅ ${agendamentos.length} agendamentos migrados`);

  // =====================================================
  // 6. MIGRAR INSTALAÇÕES AGENDADAS
  // =====================================================
  console.log('\n🔧 Migrando instalações agendadas...');
  const instalacoes = sqliteDb.prepare('SELECT * FROM instalacoes_agendadas').all();
  
  for (const inst of instalacoes) {
    await firebaseDb.collection('instalacoes_agendadas').doc(inst.id.toString()).set({
      numero: inst.numero,
      nome: inst.nome,
      data: inst.data,
      endereco: inst.endereco,
      observacao: inst.observacao,
      status: inst.status,
      criado_em: inst.criado_em,
      confirmado_em: inst.confirmado_em,
      concluido_em: inst.concluido_em
    });
  }
  console.log(`   ✅ ${instalacoes.length} instalações migradas`);

  // =====================================================
  // 7. MIGRAR CARNÊ SOLICITAÇÕES
  // =====================================================
  console.log('\n📋 Migrando solicitações de carnê...');
  const carnes = sqliteDb.prepare('SELECT * FROM carne_solicitacoes').all();
  
  for (const carne of carnes) {
    await firebaseDb.collection('carne_solicitacoes').doc(carne.id.toString()).set({
      cliente_id: carne.cliente_id?.toString(),
      numero: carne.numero,
      nome: carne.nome,
      endereco: carne.endereco,
      observacao: carne.observacao,
      origem: carne.origem,
      status: carne.status,
      solicitado_em: carne.solicitado_em,
      impresso_em: carne.impresso_em,
      entregue_em: carne.entregue_em
    });
  }
  console.log(`   ✅ ${carnes.length} solicitações de carnê migradas`);

  // =====================================================
  // 8. MIGRAR CHAMADOS
  // =====================================================
  console.log('\n🎫 Migrando chamados...');
  const chamados = sqliteDb.prepare('SELECT * FROM chamados').all();
  
  for (const cham of chamados) {
    await firebaseDb.collection('chamados').doc(cham.id.toString()).set({
      numero: cham.numero,
      nome: cham.nome,
      motivo: cham.motivo,
      status: cham.status,
      aberto_em: cham.aberto_em,
      assumido_em: cham.assumido_em,
      fechado_em: cham.fechado_em
    });
  }
  console.log(`   ✅ ${chamados.length} chamados migrados`);

  // =====================================================
  // 9. MIGRAR NOVOS CLIENTES
  // =====================================================
  console.log('\n🆕 Migrando novos clientes...');
  const novos = sqliteDb.prepare('SELECT * FROM novos_clientes').all();
  
  for (const novo of novos) {
    await firebaseDb.collection('novos_clientes').doc(novo.id.toString()).set({
      numero: novo.numero,
      nome: novo.nome,
      cpf: novo.cpf,
      endereco: novo.endereco,
      telefone: novo.telefone,
      plano: novo.plano,
      roteador: novo.roteador,
      data_vencimento: novo.data_vencimento,
      disponibilidade: novo.disponibilidade,
      obs: novo.obs,
      status: novo.status,
      confirmado_em: novo.confirmado_em,
      finalizado_em: novo.finalizado_em,
      cadastrado_em: novo.cadastrado_em
    });
  }
  console.log(`   ✅ ${novos.length} novos clientes migrados`);

  // =====================================================
  // 10. MIGRAR LOGS (opcional - pode pular se for muito grande)
  // =====================================================
  console.log('\n📄 Migrando logs (pode ser demorado)...');
  
  const logsBot = sqliteDb.prepare('SELECT * FROM log_bot LIMIT 1000').all();
  for (const log of logsBot) {
    await firebaseDb.collection('log_bot').add({
      numero: log.numero,
      direcao: log.direcao,
      tipo: log.tipo,
      conteudo: log.conteudo,
      intencao: log.intencao,
      etapa: log.etapa,
      criado_em: log.criado_em
    });
  }
  console.log(`   ✅ ${logsBot.length} logs do bot migrados`);

  const logsCobrancas = sqliteDb.prepare('SELECT * FROM log_cobrancas LIMIT 500').all();
  for (const log of logsCobrancas) {
    await firebaseDb.collection('log_cobrancas').add({
      numero: log.numero,
      nome: log.nome,
      data_vencimento: log.data_vencimento,
      enviado_em: log.enviado_em
    });
  }
  console.log(`   ✅ ${logsCobrancas.length} logs de cobranças migrados`);

  const logsComprovantes = sqliteDb.prepare('SELECT * FROM log_comprovantes LIMIT 500').all();
  for (const log of logsComprovantes) {
    await firebaseDb.collection('log_comprovantes').add({
      numero: log.numero,
      recebido_em: log.recebido_em
    });
  }
  console.log(`   ✅ ${logsComprovantes.length} logs de comprovantes migrados`);

  const logsAtendimentos = sqliteDb.prepare('SELECT * FROM log_atendimentos LIMIT 500').all();
  for (const log of logsAtendimentos) {
    await firebaseDb.collection('log_atendimentos').add({
      numero: log.numero,
      iniciado_em: log.iniciado_em,
      encerrado_em: log.encerrado_em,
      motivo_encerramento: log.motivo_encerramento
    });
  }
  console.log(`   ✅ ${logsAtendimentos.length} logs de atendimentos migrados`);

  // =====================================================
  // 11. MIGRAR CONFIGURAÇÕES
  // =====================================================
  console.log('\n⚙️ Migrando configurações...');
  const configs = sqliteDb.prepare('SELECT * FROM configuracoes').all();
  
  for (const config of configs) {
    await firebaseDb.collection('config').doc(config.chave).set({
      valor: config.valor,
      atualizado_em: config.atualizado_em
    });
  }
  console.log(`   ✅ ${configs.length} configurações migradas`);

  console.log('\n🎉🎉🎉 MIGRAÇÃO CONCLUÍDA! 🎉🎉🎉');
}

// Executar migração
migrar().catch(console.error);