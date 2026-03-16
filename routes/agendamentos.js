// routes/agendamentos.js
module.exports = function setupRotasAgendamentos(app, ctx) {
    const { db, banco } = ctx;

    // Listar agendamentos com filtros
    app.get('/api/agendamentos', (req, res) => {
        try {
            const { data, status } = req.query;
            let sql = 'SELECT * FROM agendamentos WHERE 1=1';
            const params = [];
            
            // CORREÇÃO: Aspas duplas por fora, aspas simples no 'now' por dentro para o SQLite
            if (data === 'hoje') {
                sql += " AND data = date('now')";
            } else if (data === 'amanha') {
                sql += " AND data = date('now', '+1 day')";
            } else if (data === 'semana') {
                sql += " AND data BETWEEN date('now') AND date('now', '+7 days')";
            }
            
            if (status && status !== 'todos') {
                sql += ' AND status = ?';
                params.push(status);
            }
            
            sql += ' ORDER BY data ASC, periodo ASC';
            
            const agendamentos = db.prepare(sql).all(...params);
            res.json(agendamentos);
        } catch (error) {
            console.error('Erro ao listar agendamentos:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    // Ver disponibilidade para os próximos dias
    app.get('/api/agendamentos/disponibilidade', (req, res) => {
        try {
            const dias = [];
            const hoje = new Date();
            
            for (let i = 0; i < 14; i++) { // Próximos 14 dias
                const data = new Date(hoje);
                data.setDate(hoje.getDate() + i);
                
                // Pula domingo
                if (data.getDay() === 0) continue;
                
                const dataBanco = data.toISOString().split('T')[0];
                const diaSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][data.getDay()];
                
                const manha = banco.agendamentos.verificarDisponibilidade(dataBanco, 'manha');
                const tarde = banco.agendamentos.verificarDisponibilidade(dataBanco, 'tarde');
                
                // Só mostra se tiver pelo menos 1 vaga
                if (manha.disponivel || tarde.disponivel) {
                    dias.push({
                        data: dataBanco,
                        label: `${diaSemana} ${data.getDate()}/${data.getMonth()+1}`,
                        vagas: {
                            manha: manha.vagas,
                            tarde: tarde.vagas
                        }
                    });
                }
                
                if (dias.length >= 7) break; // Mostra no máximo 7 dias
            }
            
            const hojeStr = new Date().toISOString().split('T')[0];
            const amanhaStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
            
            res.json({
                hoje: db.prepare("SELECT COUNT(*) as total FROM agendamentos WHERE data = date('now') AND status = 'agendado'").get().total,
                amanha: db.prepare("SELECT COUNT(*) as total FROM agendamentos WHERE data = date('now', '+1 day') AND status = 'agendado'").get().total,
                semana: db.prepare("SELECT COUNT(*) as total FROM agendamentos WHERE data BETWEEN date('now') AND date('now', '+7 days') AND status = 'agendado'").get().total,
                proximosDias: dias
            });
        } catch (error) {
            console.error('Erro ao ver disponibilidade:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    // Marcar como concluído
    app.post('/api/agendamentos/:id/concluir', (req, res) => {
        try {
            db.prepare("UPDATE agendamentos SET status = 'concluido' WHERE id = ?").run(req.params.id);
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });

    // Cancelar agendamento
    app.post('/api/agendamentos/:id/cancelar', (req, res) => {
        try {
            db.prepare("UPDATE agendamentos SET status = 'cancelado' WHERE id = ?").run(req.params.id);
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });
};