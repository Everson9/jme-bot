// database/agendamentos.js
module.exports = function criarAgendamentos(db) {
    
    const LIMITES = {
        manha: 3,   // máximo 3 clientes por manhã
        tarde: 3,   // máximo 3 clientes por tarde
        noite: 2    // máximo 2 clientes por noite
    };
    

    function inicializarTabela() {
        db.exec(`
            CREATE TABLE IF NOT EXISTS agendamentos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data TEXT NOT NULL,
                periodo TEXT NOT NULL,
                cliente_id INTEGER,
                cliente_nome TEXT NOT NULL,
                numero TEXT NOT NULL,
                endereco TEXT NOT NULL,
                status TEXT DEFAULT 'agendado',
                criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(data, periodo, numero)
            );

            CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data);
            CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);
        `);
        console.log('✅ Tabela de agendamentos criada');
    }

    function verificarDisponibilidade(data, periodo) {
        const count = db.prepare(`
            SELECT COUNT(*) as total FROM agendamentos 
            WHERE data = ? AND periodo = ? AND status = 'agendado'
        `).get(data, periodo).total;
        
        return {
            disponivel: count < LIMITES[periodo],
            vagas: LIMITES[periodo] - count,
            total: count
        };
    }

    function listarHorariosDisponiveis(data) {
        const horarios = [];
        for (const periodo of ['manha', 'tarde', 'noite']) {
            const { disponivel, vagas } = verificarDisponibilidade(data, periodo);
            horarios.push({
                periodo,
                disponivel,
                vagas,
                label: periodo === 'manha' ? '🌅 Manhã' : periodo === 'tarde' ? '☀️ Tarde' : '🌙 Noite'
            });
        }
        return horarios;
    }

    function criarAgendamento(data, periodo, clienteNome, numero, endereco, clienteId = null) {
        const { disponivel } = verificarDisponibilidade(data, periodo);
        if (!disponivel) {
            return { sucesso: false, motivo: 'Horário lotado' };
        }

        const result = db.prepare(`
            INSERT INTO agendamentos (data, periodo, cliente_id, cliente_nome, numero, endereco)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(data, periodo, clienteId, clienteNome, numero, endereco);

        return { 
            sucesso: true, 
            id: result.lastInsertRowid,
            mensagem: `Agendado para ${data} (${periodo})`
        };
    }

    function listarAgendamentosDoDia(data) {
        return db.prepare(`
            SELECT * FROM agendamentos 
            WHERE data = ? AND status = 'agendado'
            ORDER BY periodo, criado_em
        `).all(data);
    }

    function cancelarAgendamento(id) {
        db.prepare(`UPDATE agendamentos SET status = 'cancelado' WHERE id = ?`).run(id);
    }

    function formatarDataParaBanco(dataStr) {
        const [dia, mes] = dataStr.split('/');
        const ano = new Date().getFullYear();
        return `${ano}-${mes}-${dia}`;
    }

    return {
        inicializarTabela,
        verificarDisponibilidade,
        listarHorariosDisponiveis,
        criarAgendamento,
        listarAgendamentosDoDia,
        cancelarAgendamento,
        formatarDataParaBanco,
        LIMITES
    };
};