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

async function dbSalvarHistorico(numero, role, content) {
  try {
    const historicoRef = db.collection('historico_conversa').doc();
    await historicoRef.set({
      numero,
      role,
      content,
      criado_em: Timestamp.now()
    });

    // Manter apenas os últimos 20 registros
    const snapshot = await db.collection('historico_conversa')
      .where('numero', '==', numero)
      .orderBy('criado_em', 'desc')
      .offset(20)
      .get();

    const batch = db.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  } catch (error) {
    console.error('Erro em dbSalvarHistorico:', error);
  }
}

async function dbCarregarHistorico(numero) {
  try {
    const snapshot = await db.collection('historico_conversa')
      .where('numero', '==', numero)
      .orderBy('criado_em', 'asc')
      .get();

    return snapshot.docs.map(doc => ({
      role: doc.data().role,
      content: doc.data().content,
      criado_em: fromFirestoreDate(doc.data().criado_em)
    }));
  } catch (error) {
    console.error('Erro em dbCarregarHistorico:', error);
    return [];
  }
}

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
// CLIENTES DA BASE (AGORA USANDO 'clientes')
// =====================================================

async function buscarStatusCliente(numero) {
  try {
    const numeroBusca = numero.replace('@c.us', '').replace(/^55/, '');
    
    const snapshot = await db.collection('clientes')  // ← MUDADO DE clientes_base PARA clientes
      .where('telefone', '>=', numeroBusca.slice(-8))
      .where('telefone', '<=', numeroBusca.slice(-8) + '\uf8ff')
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const cliente = snapshot.docs[0].data();
    return {
      nome: cliente.nome || null,
      status: cliente.status === 'pago' ? 'pago' : 'pendente',
      aba: `Data ${cliente.dia_vencimento || ''}`
    };
  } catch (error) {
    console.error('Erro em buscarStatusCliente:', error);
    return null;
  }
}

async function buscarClientePorNome(nome) {
  try {
    const snapshot = await db.collection('clientes')  // ← MUDADO DE clientes_base PARA clientes
      .where('nome', '>=', nome)
      .where('nome', '<=', nome + '\uf8ff')
      .limit(5)
      .get();

    return snapshot.docs.map(doc => doc.data());
  } catch (error) {
    console.error('Erro em buscarClientePorNome:', error);
    return [];
  }
}

async function buscarClientePorCPF(cpf) {
  try {
    const cpfLimpo = cpf.replace(/\D/g, '');
    
    const snapshot = await db.collection('clientes')  // ← MUDADO DE clientes_base PARA clientes
      .where('cpf', '==', cpfLimpo)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].data();
  } catch (error) {
    console.error('Erro em buscarClientePorCPF:', error);
    return null;
  }
}

async function buscarClientePorTelefone(telefone) {
  try {
    if (!telefone) return null;
    
    const telefoneStr = String(telefone);
    if (telefoneStr.length < 8) return null;
    
    const snapshot = await db.collection('clientes')
      .where('telefone', '>=', telefoneStr.slice(-8))
      .where('telefone', '<=', telefoneStr.slice(-8) + '\uf8ff')
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    
    // ✅ RETORNA O CLIENTE COMPLETO COM ID
    const doc = snapshot.docs[0];
    return { 
      id: doc.id, 
      ...doc.data() 
    };  // ← ISSO É IMPORTANTE!
    
  } catch (error) {
    console.error('Erro em buscarClientePorTelefone:', error);
    return null;
  }
}

// =====================================================
// PROMESSAS
// =====================================================

async function buscarPromessa(nome) {
  try {
    const snapshot = await db.collection('promessas')
      .where('nome', '>=', nome)
      .where('nome', '<=', nome + '\uf8ff')
      .where('status', '==', 'pendente')
      .orderBy('criado_em', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].data();
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
    const semanaAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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
  dbSalvarHistorico,
  dbCarregarHistorico,
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