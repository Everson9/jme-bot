// database/funcoes.js
module.exports = function criarFuncoesBanco(db) {
    
    function dbSalvarHistorico(numero, role, content) {
        db.prepare('INSERT INTO historico_conversa (numero, role, content) VALUES (?, ?, ?)').run(numero, role, content);
        db.prepare(`
            DELETE FROM historico_conversa WHERE numero = ? AND id NOT IN (
                SELECT id FROM historico_conversa WHERE numero = ? ORDER BY id DESC LIMIT 20
            )
        `).run(numero, numero);
    }

    function dbCarregarHistorico(numero) {
        return db.prepare('SELECT role, content, criado_em FROM historico_conversa WHERE numero = ? ORDER BY id ASC').all(numero);
    }

    function dbLimparHistorico(numero) {
        db.prepare('DELETE FROM historico_conversa WHERE numero = ?').run(numero);
    }

    function dbSalvarAtendimentoHumano(numero) {
        db.prepare('INSERT OR REPLACE INTO atendimento_humano (numero, desde) VALUES (?, ?)').run(numero, Date.now());
    }

    function dbRemoverAtendimentoHumano(numero) {
        db.prepare('DELETE FROM atendimento_humano WHERE numero = ?').run(numero);
    }

    function dbCarregarAtendimentosHumanos() {
        return db.prepare('SELECT numero, desde FROM atendimento_humano').all();
    }

    function dbAbrirChamado(numero, nome, motivo) {
        const chamadoAberto = db.prepare('SELECT id FROM chamados WHERE numero = ? AND status != ?').get(numero, 'fechado');
        if (chamadoAberto) return chamadoAberto.id;
        const r = db.prepare('INSERT INTO chamados (numero, nome, motivo, aberto_em) VALUES (?, ?, ?, ?)')
            .run(numero, nome || null, motivo || 'Atendimento solicitado', Date.now());
        console.log(`🎫 Chamado #${r.lastInsertRowid} aberto — ${numero}`);
        return r.lastInsertRowid;
    }

    function dbListarChamados(status = null) {
        if (status) return db.prepare('SELECT * FROM chamados WHERE status = ? ORDER BY aberto_em DESC').all(status);
        return db.prepare('SELECT * FROM chamados ORDER BY aberto_em DESC LIMIT 100').all();
    }

    function dbAtualizarChamado(id, status) {
        const agora = Date.now();
        if (status === 'em_atendimento') 
            db.prepare('UPDATE chamados SET status = ?, assumido_em = ? WHERE id = ?').run(status, agora, id);
        else if (status === 'fechado') 
            db.prepare('UPDATE chamados SET status = ?, fechado_em = ? WHERE id = ?').run(status, agora, id);
        else 
            db.prepare('UPDATE chamados SET status = ? WHERE id = ?').run(status, id);
    }

    function dbLogCobranca(numero, nome, dataVencimento) {
        db.prepare('INSERT INTO log_cobrancas (numero, nome, data_vencimento) VALUES (?, ?, ?)').run(numero, nome, dataVencimento);
    }

    function dbLogComprovante(numero) {
        db.prepare('INSERT INTO log_comprovantes (numero) VALUES (?)').run(numero);
    }

    function dbIniciarAtendimento(numero) {
        const existe = db.prepare('SELECT id FROM log_atendimentos WHERE numero = ? AND encerrado_em IS NULL').get(numero);
        if (!existe) {
            db.prepare('INSERT INTO log_atendimentos (numero) VALUES (?)').run(numero);
        }
    }

    function dbEncerrarAtendimento(numero, motivo = 'inatividade') {
        db.prepare(`
            UPDATE log_atendimentos SET encerrado_em = CURRENT_TIMESTAMP, motivo_encerramento = ?
            WHERE numero = ? AND encerrado_em IS NULL
        `).run(motivo, numero);
    }

    function dbSalvarNovoCliente(numero, dados) {
        db.prepare(`
            INSERT INTO novos_clientes (numero, nome, cpf, endereco, telefone, plano, roteador, data_vencimento, disponibilidade)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(numero, dados.nome || null, dados.cpf || null, dados.endereco || null,
               dados.telefone || null, dados.plano || null, dados.roteador || null,
               dados.data_vencimento || null, dados.disponibilidade || null);
    }

    function dbRelatorio() {
        const hoje = new Date().toISOString().split('T')[0];
        const semanaAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const atendimentosHoje = db.prepare(`SELECT COUNT(*) as total FROM log_atendimentos WHERE DATE(iniciado_em) = ?`).get(hoje);
        const atendimentosSemana = db.prepare(`SELECT COUNT(*) as total FROM log_atendimentos WHERE DATE(iniciado_em) >= ?`).get(semanaAtras);
        const horarioPico = db.prepare(`
            SELECT strftime('%H', iniciado_em) as hora, COUNT(*) as total 
            FROM log_atendimentos GROUP BY hora ORDER BY total DESC LIMIT 1
        `).get();
        const maisAtendidos = db.prepare(`
            SELECT numero, COUNT(*) as total FROM log_atendimentos 
            GROUP BY numero ORDER BY total DESC LIMIT 5
        `).all();
        const cobrancasHoje = db.prepare(`SELECT COUNT(*) as total FROM log_cobrancas WHERE DATE(enviado_em) = ?`).get(hoje);
        const comprovantesHoje = db.prepare(`SELECT COUNT(*) as total FROM log_comprovantes WHERE DATE(recebido_em) = ?`).get(hoje);
        const novosClientes = db.prepare(`SELECT COUNT(*) as total FROM novos_clientes WHERE DATE(cadastrado_em) >= ?`).get(semanaAtras);

        return { atendimentosHoje, atendimentosSemana, horarioPico, maisAtendidos, cobrancasHoje, comprovantesHoje, novosClientes };
    }

    function dbLog(numero, direcao, tipo, conteudo, extras = {}) {
    try {
        db.prepare(`INSERT INTO log_bot (numero, direcao, tipo, conteudo, intencao, etapa)
                    VALUES (?, ?, ?, ?, ?, ?)`)
          .run(numero, direcao, tipo,
               typeof conteudo === 'string' ? conteudo.substring(0, 500) : String(conteudo),
               extras.intencao || null, extras.etapa || null);
    } catch(e) {}
}
    const criarAgendamentos = require('./agendamentos');
const agendamentos = criarAgendamentos(db);
agendamentos.inicializarTabela();


    function buscarStatusCliente(numero) {
        try {
            const numeroBusca = numero.replace('@c.us', '').replace(/^55/, '');
            const cliente = db.prepare(`
                SELECT nome, status, dia_vencimento
                FROM clientes_base
                WHERE replace(replace(telefone, '-', ''), ' ', '') LIKE ?
                ORDER BY id DESC LIMIT 1
            `).get('%' + numeroBusca.slice(-8));
            if (!cliente) return null;
            return {
                nome: cliente.nome || null,
                status: cliente.status === 'pago' ? 'pago' : 'pendente',
                aba: `Data ${cliente.dia_vencimento || ''}`,
            };
        } catch(e) {
            return null;
        }
    }

    function buscarClientePorNome(nome) {
        return db.prepare(`
            SELECT nome, status, dia_vencimento, telefone, base_id, cpf
            FROM clientes_base
            WHERE LOWER(nome) LIKE LOWER(?)
            LIMIT 5
        `).all('%' + nome.trim() + '%');
    }

    function buscarClientePorCPF(cpf) {
        return db.prepare(`
            SELECT nome, status, dia_vencimento, telefone, base_id, cpf
            FROM clientes_base
            WHERE cpf = ? OR REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?
            LIMIT 1
        `).get(cpf, cpf);
    }

    function buscarClientePorTelefone(telefone) {
        return db.prepare(`
            SELECT nome, status, dia_vencimento, telefone, base_id, cpf
            FROM clientes_base
            WHERE REPLACE(REPLACE(REPLACE(telefone, '-', ''), ' ', ''), '()', '') LIKE ?
            LIMIT 1
        `).get('%' + telefone.slice(-8));
    }

    function buscarPromessa(nome) {
        return db.prepare(`
            SELECT data_promessa FROM promessas 
            WHERE LOWER(nome) LIKE LOWER(?) AND status = 'pendente'
            ORDER BY criado_em DESC
            LIMIT 1
        `).get('%' + nome + '%');
    }

    return {
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
        dbRelatorio,
        buscarStatusCliente,
        buscarClientePorNome,
        buscarClientePorCPF,
        buscarClientePorTelefone,
        buscarPromessa,
        dbLog,
        agendamentos
    };
};