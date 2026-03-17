// database/agendamentos-firebase.js
module.exports = function criarAgendamentosFirebase(firebaseDb) {
    
    const LIMITES = {
        manha: 3,   // máximo 3 clientes por manhã
        tarde: 3,   // máximo 3 clientes por tarde
        noite: 2    // máximo 2 clientes por noite
    };
    
    function inicializarTabela() {
        console.log('✅ Firebase pronto para agendamentos');
        return Promise.resolve();
    }

    async function verificarDisponibilidade(data, periodo) {
        try {
            const agendamentosSnapshot = await firebaseDb.collection('agendamentos')
                .where('data', '==', data)
                .where('periodo', '==', periodo)
                .where('status', '==', 'agendado')
                .get();
            
            const total = agendamentosSnapshot.size;
            
            return {
                disponivel: total < LIMITES[periodo],
                vagas: LIMITES[periodo] - total,
                total: total
            };
        } catch (error) {
            console.error('Erro em verificarDisponibilidade:', error);
            return { disponivel: false, vagas: 0, total: 0 };
        }
    }

    async function listarHorariosDisponiveis(data) {
        try {
            const horarios = [];
            for (const periodo of ['manha', 'tarde', 'noite']) {
                const { disponivel, vagas } = await verificarDisponibilidade(data, periodo);
                horarios.push({
                    periodo,
                    disponivel,
                    vagas,
                    label: periodo === 'manha' ? '🌅 Manhã' : periodo === 'tarde' ? '☀️ Tarde' : '🌙 Noite'
                });
            }
            return horarios;
        } catch (error) {
            console.error('Erro em listarHorariosDisponiveis:', error);
            return [];
        }
    }

    async function criarAgendamento(data, periodo, clienteNome, numero, endereco, clienteId = null) {
        try {
            const { disponivel } = await verificarDisponibilidade(data, periodo);
            if (!disponivel) {
                return { sucesso: false, motivo: 'Horário lotado' };
            }

            // Verificar se já existe agendamento para este número na mesma data
            const existenteSnapshot = await firebaseDb.collection('agendamentos')
                .where('data', '==', data)
                .where('numero', '==', numero)
                .where('status', '==', 'agendado')
                .get();

            if (!existenteSnapshot.empty) {
                return { sucesso: false, motivo: 'Cliente já possui agendamento nesta data' };
            }

            const agendamentoRef = await firebaseDb.collection('agendamentos').add({
                data: data,
                periodo: periodo,
                cliente_id: clienteId || null,
                cliente_nome: clienteNome,
                numero: numero,
                endereco: endereco,
                status: 'agendado',
                criado_em: new Date().toISOString()
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
    }

    async function listarAgendamentosDoDia(data) {
        try {
            const snapshot = await firebaseDb.collection('agendamentos')
                .where('data', '==', data)
                .where('status', '==', 'agendado')
                .orderBy('periodo')
                .orderBy('criado_em')
                .get();
            
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Erro em listarAgendamentosDoDia:', error);
            return [];
        }
    }

    async function listarAgendamentosPorPeriodo(data, periodo) {
        try {
            const snapshot = await firebaseDb.collection('agendamentos')
                .where('data', '==', data)
                .where('periodo', '==', periodo)
                .where('status', '==', 'agendado')
                .orderBy('criado_em')
                .get();
            
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Erro em listarAgendamentosPorPeriodo:', error);
            return [];
        }
    }

    async function cancelarAgendamento(id) {
        try {
            await firebaseDb.collection('agendamentos').doc(id).update({
                status: 'cancelado'
            });
            return { sucesso: true };
        } catch (error) {
            console.error('Erro em cancelarAgendamento:', error);
            return { sucesso: false };
        }
    }

    async function clienteTemAgendamento(numero, data = null) {
        try {
            let query = firebaseDb.collection('agendamentos')
                .where('numero', '==', numero)
                .where('status', '==', 'agendado');
            
            if (data) {
                query = query.where('data', '==', data);
            }
            
            const snapshot = await query.limit(1).get();
            return !snapshot.empty;
        } catch (error) {
            console.error('Erro em clienteTemAgendamento:', error);
            return false;
        }
    }

    function formatarDataParaBanco(dataStr) {
        // Recebe "DD/MM" e retorna "YYYY-MM-DD"
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
        listarAgendamentosPorPeriodo,
        clienteTemAgendamento,
        cancelarAgendamento,
        formatarDataParaBanco,
        LIMITES
    };
};