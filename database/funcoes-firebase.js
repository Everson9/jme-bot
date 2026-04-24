// database/funcoes-firebase.js
const { db } = require('../config/firebase');
const { Timestamp } = require('firebase-admin/firestore');

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

function toFirestoreDate(data) {
  return data ? Timestamp.fromDate(new Date(data)) : null;
}

function fromFirestoreDate(timestamp) {
  return timestamp ? timestamp.toDate().toISOString() : null;
}

// =====================================================
// HISTÓRICO DE CONVERSA
// =====================================================

async function dbLimparHistorico(numero) {
  try {
    const snapshot = await db.collection('historico_conversa')
      .where('numero', '==', numero)
      .get();

    const batch = db.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(`🧹 Histórico de ${numero} limpo`);
  } catch (error) {
    console.error('Erro em dbLimparHistorico:', error);
  }
}

// =====================================================
// ATENDIMENTO HUMANO
// =====================================================

async function dbSalvarAtendimentoHumano(numero) {
  try {
    await db.collection('atendimento_humano').doc(numero).set({
      numero,
      desde: Date.now()
    });
  } catch (error) {
    console.error('Erro em dbSalvarAtendimentoHumano:', error);
  }
}

async function dbRemoverAtendimentoHumano(numero) {
  try {
    await db.collection('atendimento_humano').doc(numero).delete();
  } catch (error) {
    console.error('Erro em dbRemoverAtendimentoHumano:', error);
  }
}

async function dbCarregarAtendimentosHumanos() {
  try {
    const snapshot = await db.collection('atendimento_humano').get();
    return snapshot.docs.map(doc => ({
      numero: doc.id,
      desde: doc.data().desde
    }));
  } catch (error) {
    console.error('Erro em dbCarregarAtendimentosHumanos:', error);
    return [];
  }
}

// =====================================================
// CHAMADOS
// =====================================================

async function dbAbrirChamado(numero, nome, motivo) {
  try {
    // Verifica se já existe chamado aberto
    const snapshot = await db.collection('chamados')
      .where('numero', '==', numero)
      .where('status', 'in', ['aberto', 'em_atendimento'])
      .limit(1)
      .get();

    if (!snapshot.empty) {
      return snapshot.docs[0].id;
    }

    const chamadoRef = await db.collection('chamados').add({
      numero,
      nome: nome || null,
      motivo: motivo || 'Atendimento solicitado',
      status: 'aberto',
      aberto_em: Date.now(),
      assumido_em: null,
      fechado_em: null
    });

    console.log(`🎫 Chamado #${chamadoRef.id} aberto — ${numero}`);
    return chamadoRef.id;
  } catch (error) {
    console.error('Erro em dbAbrirChamado:', error);
  }
}

async function dbListarChamados(status = null) {
  try {
    let query = db.collection('chamados').orderBy('aberto_em', 'desc');
    
    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.limit(100).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Erro em dbListarChamados:', error);
    return [];
  }
}

async function dbAtualizarChamado(id, status) {
  try {
    const chamadoRef = db.collection('chamados').doc(id);
    const agora = Date.now();

    if (status === 'em_atendimento') {
      await chamadoRef.update({
        status,
        assumido_em: agora
      });
    } else if (status === 'fechado') {
      await chamadoRef.update({
        status,
        fechado_em: agora
      });
    } else {
      await chamadoRef.update({ status });
    }
  } catch (error) {
    console.error('Erro em dbAtualizarChamado:', error);
  }
}

// =====================================================
// LOGS (COBRANÇAS, COMPROVANTES, ATENDIMENTOS)
// =====================================================

async function dbLogCobranca(numero, nome, dataVencimento) {
  try {
    await db.collection('log_cobrancas').add({
      numero,
      nome,
      data_vencimento: dataVencimento,
      enviado_em: Timestamp.now()
    });
  } catch (error) {
    console.error('Erro em dbLogCobranca:', error);
  }
}

async function dbLogComprovante(numero) {
  try {
    await db.collection('log_comprovantes').add({
      numero,
      recebido_em: Timestamp.now()
    });
  } catch (error) {
    console.error('Erro em dbLogComprovante:', error);
  }
}

async function dbIniciarAtendimento(numero) {
  try {
    const snapshot = await db.collection('log_atendimentos')
      .where('numero', '==', numero)
      .where('encerrado_em', '==', null)
      .limit(1)
      .get();

    if (snapshot.empty) {
      await db.collection('log_atendimentos').add({
        numero,
        iniciado_em: Timestamp.now(),
        encerrado_em: null,
        motivo_encerramento: null
      });
    }
  } catch (error) {
    console.error('Erro em dbIniciarAtendimento:', error);
  }
}

async function dbEncerrarAtendimento(numero, motivo = 'inatividade') {
  try {
    const snapshot = await db.collection('log_atendimentos')
      .where('numero', '==', numero)
      .where('encerrado_em', '==', null)
      .get();

    const batch = db.batch();
    snapshot.forEach(doc => {
      batch.update(doc.ref, {
        encerrado_em: Timestamp.now(),
        motivo_encerramento: motivo
      });
    });
    await batch.commit();
  } catch (error) {
    console.error('Erro em dbEncerrarAtendimento:', error);
  }
}

// =====================================================
// NOVOS CLIENTES (INSTALAÇÕES)
// =====================================================

async function dbSalvarNovoCliente(numero, dados) {
  try {
    await db.collection('novos_clientes').add({
      numero,
      nome: dados.nome || null,
      cpf: dados.cpf || null,
      endereco: dados.endereco || null,
      telefone: dados.telefone || null,
      plano: dados.plano || null,
      roteador: dados.roteador || null,
      data_vencimento: dados.data_vencimento || null,
      disponibilidade: dados.disponibilidade || null,
      status: 'solicitado',
      cadastrado_em: Timestamp.now()
    });
  } catch (error) {
    console.error('Erro em dbSalvarNovoCliente:', error);
  }
}

// =====================================================
// CLIENTES DA BASE (BUSCAS — SEM SCAN TOTAL)
// =====================================================

// ✅ CORRIGIDO: usa array-contains em vez de scan total
async function buscarStatusCliente(numero) {
  try {
    const numeroBusca = numero.replace('@c.us', '').replace(/^55/, '');

    // Monta variantes do número (com/sem 55, com/sem 9º dígito)
    const variantes = new Set();
    variantes.add(numeroBusca);
    variantes.add('55' + numeroBusca);
    // com/sem 9º dígito (DDD + 9 dígitos → DDD + 8 dígitos e vice-versa)
    if (numeroBusca.length === 11) {
      const sem9 = numeroBusca.slice(0, 2) + numeroBusca.slice(3);
      variantes.add(sem9);
      variantes.add('55' + sem9);
    }
    if (numeroBusca.length === 10) {
      const com9 = numeroBusca.slice(0, 2) + '9' + numeroBusca.slice(2);
      variantes.add(com9);
      variantes.add('55' + com9);
    }

    // Tenta array-contains para cada variante (campo telefones é array)
    for (const v of variantes) {
      const snap = await db.collection('clientes')
        .where('telefones', 'array-contains', v)
        .limit(1)
        .get();
      if (!snap.empty) {
        const c = { id: snap.docs[0].id, ...snap.docs[0].data() };
        return {
          id: c.id,
          nome: c.nome || null,
          status: c.status === 'pago' ? 'pago' : 'pendente',
          aba: `Data ${c.dia_vencimento || ''}`,
          dia_vencimento: c.dia_vencimento || null,
        };
      }
    }

    // Fallback: campo telefone string legado (clientes antigos com campo singular)
    for (const v of variantes) {
      const snap = await db.collection('clientes')
        .where('telefone', '==', v)
        .limit(1)
        .get();
      if (!snap.empty) {
        const c = { id: snap.docs[0].id, ...snap.docs[0].data() };
        return {
          id: c.id,
          nome: c.nome || null,
          status: c.status === 'pago' ? 'pago' : 'pendente',
          aba: `Data ${c.dia_vencimento || ''}`,
          dia_vencimento: c.dia_vencimento || null,
        };
      }
    }

    // Fallback final: sufixo dos últimos 8 dígitos (scan limitado)
    // Usado apenas se os campos telefone/telefones não existirem padronizados
    const sufixo = numeroBusca.slice(-8);
    const snapFallback = await db.collection('clientes').limit(500).get();
    let clienteEncontrado = null;
    snapFallback.docs.forEach(doc => {
      const c = doc.data();
      const tel = (c.telefone || '').replace(/\D/g, '');
      if (tel && tel.slice(-8) === sufixo) {
        clienteEncontrado = { id: doc.id, ...c };
      }
    });
    if (!clienteEncontrado) return null;
    return {
      id: clienteEncontrado.id,
      nome: clienteEncontrado.nome || null,
      status: clienteEncontrado.status === 'pago' ? 'pago' : 'pendente',
      aba: `Data ${clienteEncontrado.dia_vencimento || ''}`,
      dia_vencimento: clienteEncontrado.dia_vencimento || null,
    };
  } catch (error) {
    console.error('Erro em buscarStatusCliente:', error);
    return null;
  }
}

// ✅ CORRIGIDO: usa where('cpf') em vez de scan total
async function buscarClientePorCPF(cpf) {
  console.log(`🔍 Buscando cliente por CPF`);
  try {
    const cpfBusca = cpf.replace(/\D/g, '');
    if (cpfBusca.length !== 11) return null;

    // Tenta CPF apenas dígitos
    const snap1 = await db.collection('clientes')
      .where('cpf', '==', cpfBusca)
      .limit(1)
      .get();
    if (!snap1.empty) {
      console.log(`   ✅ Cliente encontrado pelo CPF`);
      return { id: snap1.docs[0].id, ...snap1.docs[0].data() };
    }

    // Fallback: CPF formatado (ex: "123.456.789-00")
    const cpfFormatado = cpfBusca.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    const snap2 = await db.collection('clientes')
      .where('cpf', '==', cpfFormatado)
      .limit(1)
      .get();
    if (!snap2.empty) {
      console.log(`   ✅ Cliente encontrado pelo CPF formatado`);
      return { id: snap2.docs[0].id, ...snap2.docs[0].data() };
    }

    return null;
  } catch (error) {
    console.error('Erro em buscarClientePorCPF:', error);
    return null;
  }
}

// ✅ CORRIGIDO: usa array-contains em vez de scan total
async function buscarClientePorTelefone(telefone) {
  console.log(`🔍 Buscando cliente por telefone`);
  try {
    let num = telefone.replace(/\D/g, '');
    if (num.startsWith('55')) num = num.substring(2);

    // Monta variantes
    const variantes = new Set([num, '55' + num]);
    if (num.length === 11) {
      const sem9 = num.slice(0, 2) + num.slice(3);
      variantes.add(sem9);
      variantes.add('55' + sem9);
    }
    if (num.length === 10) {
      const com9 = num.slice(0, 2) + '9' + num.slice(2);
      variantes.add(com9);
      variantes.add('55' + com9);
    }

    // Tenta campo telefones (array)
    for (const v of variantes) {
      const snap = await db.collection('clientes')
        .where('telefones', 'array-contains', v)
        .limit(1)
        .get();
      if (!snap.empty) {
        console.log(`   ✅ Cliente encontrado pelo telefone (array)`);
        return { id: snap.docs[0].id, ...snap.docs[0].data() };
      }
    }

    // Fallback: campo telefone string legado
    for (const v of variantes) {
      const snap = await db.collection('clientes')
        .where('telefone', '==', v)
        .limit(1)
        .get();
      if (!snap.empty) {
        console.log(`   ✅ Cliente encontrado pelo telefone (legado)`);
        return { id: snap.docs[0].id, ...snap.docs[0].data() };
      }
    }

    return null;
  } catch (error) {
    console.error('Erro em buscarClientePorTelefone:', error);
    return null;
  }
}

// ✅ CORRIGIDO: scan com limit(500) + range query por inicial para reduzir leituras
// Nota: para eliminar o scan completamente, salve campo nome_normalizado nos docs
// e crie índice orderBy('nome_normalizado'). Enquanto isso, limit(500) já é muito melhor.
async function buscarClientePorNome(nome) {
  try {
    const STOP = new Set(['da','de','do','das','dos','e']);
    const norm = (s) => (s || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const termoBusca = norm(nome);
    if (!termoBusca || termoBusca.length < 2) return [];

    const tokensBusca = termoBusca
      .split(' ')
      .map(t => t.trim())
      .filter(Boolean)
      .filter(t => !STOP.has(t));

    const buscaCurta = tokensBusca.length === 0 || (tokensBusca.length === 1 && tokensBusca[0].length <= 3);

    // Tenta range query pelo primeiro token (requer índice em 'nome' — se falhar, usa limit)
    let snapshot;
    const primeiro = tokensBusca[0] || termoBusca;
    const primeiraLetraMaiuscula = primeiro.charAt(0).toUpperCase();
    try {
      snapshot = await db.collection('clientes')
        .orderBy('nome')
        .startAt(primeiraLetraMaiuscula)
        .endAt(primeiraLetraMaiuscula + '\uf8ff')
        .limit(200)
        .get();
    } catch {
      // Sem índice de nome: fallback com limit para não fazer scan ilimitado
      snapshot = await db.collection('clientes').limit(500).get();
    }

    const resultados = [];

    snapshot.docs.forEach(doc => {
      const cliente = doc.data();
      if (!cliente.nome) return;

      const nomeClienteNorm = norm(cliente.nome);
      if (!nomeClienteNorm) return;

      // Match por substring completo
      if (nomeClienteNorm.includes(termoBusca)) {
        resultados.push({ id: doc.id, ...cliente, _score: 100 });
        return;
      }

      // Match por tokens
      if (!buscaCurta) {
        const tokensNome = nomeClienteNorm
          .split(' ')
          .map(t => t.trim())
          .filter(Boolean)
          .filter(t => !STOP.has(t));

        const ok = tokensBusca.every(tb =>
          tokensNome.some(tn => tn === tb || tn.startsWith(tb) || tn.includes(tb))
        );
        if (ok) {
          const prefixBoost = tokensBusca.every(tb => tokensNome.some(tn => tn.startsWith(tb))) ? 15 : 0;
          resultados.push({ id: doc.id, ...cliente, _score: 60 + tokensBusca.length * 5 + prefixBoost });
        }
      } else {
        const tb = tokensBusca[0] || termoBusca;
        if (nomeClienteNorm.includes(tb)) {
          resultados.push({ id: doc.id, ...cliente, _score: 40 });
        }
      }
    });

    resultados.sort((a, b) => (b._score || 0) - (a._score || 0));
    resultados.forEach(r => { try { delete r._score; } catch (_) {} });
    return resultados;
  } catch (error) {
    console.error('Erro em buscarClientePorNome:', error);
    return [];
  }
}

// =====================================================
// PROMESSAS
// =====================================================

async function buscarPromessa(nome) {
  try {
    const nomeNorm = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Pega só as primeiras 3 letras do nome normalizado para limitar o scan
    // A maioria das bases tem poucas promessas ativas — limit(100) é seguro
    const snapshot = await db.collection('promessas')
      .where('status', '==', 'pendente')
      .limit(100)
      .get();

    if (snapshot.empty) return null;

    let melhor = null;
    snapshot.docs.forEach(doc => {
      const p = doc.data();
      if (!p.nome) return;
      const pNorm = p.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (pNorm.includes(nomeNorm) || nomeNorm.includes(pNorm)) {
        melhor = p;
      }
    });

    return melhor;
  } catch (error) {
    console.error('Erro em buscarPromessa:', error);
    return null;
  }
}

// =====================================================
// RELATÓRIOS
// =====================================================

async function dbRelatorio() {
  try {
    const hoje = new Date().toISOString().split('T')[0];

    const atendimentosHojeSnapshot = await db.collection('log_atendimentos')
      .where('iniciado_em', '>=', new Date(hoje))
      .get();

    const cobrancasHojeSnapshot = await db.collection('log_cobrancas')
      .where('enviado_em', '>=', new Date(hoje))
      .get();

    const comprovantesHojeSnapshot = await db.collection('log_comprovantes')
      .where('recebido_em', '>=', new Date(hoje))
      .get();

    return {
      atendimentosHoje: { total: atendimentosHojeSnapshot.size },
      cobrancasHoje: { total: cobrancasHojeSnapshot.size },
      comprovantesHoje: { total: comprovantesHojeSnapshot.size }
    };
  } catch (error) {
    console.error('Erro em dbRelatorio:', error);
    return {};
  }
}

// =====================================================
// LOG DO BOT
// =====================================================

async function dbLog(numero, direcao, tipo, conteudo, extras = {}) {
  try {
    await db.collection('log_bot').add({
      numero,
      direcao,
      tipo,
      conteudo: typeof conteudo === 'string' ? conteudo.substring(0, 500) : String(conteudo),
      intencao: extras.intencao || null,
      etapa: extras.etapa || null,
      criado_em: Timestamp.now()
    });
  } catch (error) {
    console.error('Erro em dbLog:', error);
  }
}

// =====================================================
// AGENDAMENTOS
// =====================================================

const agendamentos = {
  LIMITES: {
    manha: 3,
    tarde: 3,
    noite: 2
  },

  async verificarDisponibilidade(data, periodo) {
    try {
      const snapshot = await db.collection('agendamentos')
        .where('data', '==', data)
        .where('periodo', '==', periodo)
        .where('status', '==', 'agendado')
        .get();

      const count = snapshot.size;
      
      return {
        disponivel: count < this.LIMITES[periodo],
        vagas: this.LIMITES[periodo] - count,
        total: count
      };
    } catch (error) {
      console.error('Erro em verificarDisponibilidade:', error);
      return { disponivel: false, vagas: 0, total: 0 };
    }
  },

  async listarHorariosDisponiveis(data) {
    const horarios = [];
    for (const periodo of ['manha', 'tarde', 'noite']) {
      const { disponivel, vagas } = await this.verificarDisponibilidade(data, periodo);
      horarios.push({
        periodo,
        disponivel,
        vagas,
        label: periodo === 'manha' ? '🌅 Manhã' : periodo === 'tarde' ? '☀️ Tarde' : '🌙 Noite'
      });
    }
    return horarios;
  },

  async criarAgendamento(data, periodo, clienteNome, numero, endereco, clienteId = null) {
    try {
      const { disponivel } = await this.verificarDisponibilidade(data, periodo);
      if (!disponivel) {
        return { sucesso: false, motivo: 'Horário lotado' };
      }

      const agendamentoRef = await db.collection('agendamentos').add({
        data,
        periodo,
        cliente_id: clienteId,
        cliente_nome: clienteNome,
        numero,
        endereco,
        status: 'agendado',
        criado_em: Timestamp.now()
      });

      return { 
        sucesso: true, 
        id: agendamentoRef.id,
        mensagem: `Agendado para ${data} (${periodo})`
      };
    } catch (error) {
      console.error('Erro em criarAgendamento:', error);
      return { sucesso: false, motivo: 'Erro interno' };
    }
  },

  async listarAgendamentosDoDia(data) {
    try {
      const snapshot = await db.collection('agendamentos')
        .where('data', '==', data)
        .where('status', '==', 'agendado')
        .orderBy('periodo')
        .get();

      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.error('Erro em listarAgendamentosDoDia:', error);
      return [];
    }
  },

  async cancelarAgendamento(id) {
    try {
      await db.collection('agendamentos').doc(id).update({
        status: 'cancelado'
      });
    } catch (error) {
      console.error('Erro em cancelarAgendamento:', error);
    }
  },

  formatarDataParaBanco(dataStr) {
    const [dia, mes] = dataStr.split('/');
    const ano = new Date().getFullYear();
    return `${ano}-${mes}-${dia}`;
  }
};

// =====================================================
// EXPORTAÇÃO
// =====================================================

module.exports = {
  dbLimparHistorico,
  dbSalvarAtendimentoHumano,
  dbRemoverAtendimentoHumano,
  dbCarregarAtendimentosHumanos,
  dbAbrirChamado,
  dbListarChamados,
  dbAtualizarChamado,
  dbLogCobranca,
  dbLogComprovante,
  dbIniciarAtendimento,
  dbEncerrarAtendimento,
  dbSalvarNovoCliente,
  buscarStatusCliente,
  buscarClientePorNome,
  buscarClientePorCPF,
  buscarClientePorTelefone,
  buscarPromessa,
  dbRelatorio,
  dbLog,
  agendamentos
};