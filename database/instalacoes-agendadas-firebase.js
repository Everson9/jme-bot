// database/instalacoes-agendadas-firebase.js
module.exports = function criarInstalacoesAgendadasFirebase(firebaseDb) {
    
    async function criarTabela() {
        console.log('✅ Firebase pronto para instalações agendadas');
        // Não precisa criar tabela, apenas garantir que a coleção existe
        return Promise.resolve();
    }

    async function criarInstalacaoAgendada(dados) {
        try {
            const { numero, nome, data, endereco, observacao = '' } = dados;
            
            const instalacaoRef = await firebaseDb.collection('instalacoes_agendadas').add({
                numero: numero,
                nome: nome,
                data: data,
                endereco: endereco,
                observacao: observacao,
                status: 'agendado',
                criado_em: new Date().toISOString(),
                confirmado_em: null,
                concluido_em: null
            });
            
            return { 
                sucesso: true, 
                id: instalacaoRef.id 
            };
        } catch (error) {
            console.error('Erro em criarInstalacaoAgendada:', error);
            return { sucesso: false, erro: error.message };
        }
    }

    async function listarInstalacoesAgendadas(status = null) {
        try {
            let query = firebaseDb.collection('instalacoes_agendadas');
            
            if (status) {
                query = query.where('status', '==', status);
            }
            
            const snapshot = await query
                .orderBy('data', 'asc')
                .orderBy('criado_em', 'desc')
                .get();
            
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Erro em listarInstalacoesAgendadas:', error);
            return [];
        }
    }

    async function listarInstalacoesDoDia(data) {
        try {
            const snapshot = await firebaseDb.collection('instalacoes_agendadas')
                .where('data', '==', data)
                .where('status', 'in', ['agendado', 'confirmado'])
                .orderBy('criado_em')
                .get();
            
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Erro em listarInstalacoesDoDia:', error);
            return [];
        }
    }

    async function confirmarInstalacao(id) {
        try {
            await firebaseDb.collection('instalacoes_agendadas').doc(id).update({
                status: 'confirmado',
                confirmado_em: new Date().toISOString()
            });
            return { sucesso: true };
        } catch (error) {
            console.error('Erro em confirmarInstalacao:', error);
            return { sucesso: false };
        }
    }

    async function concluirInstalacao(id) {
        try {
            await firebaseDb.collection('instalacoes_agendadas').doc(id).update({
                status: 'concluido',
                concluido_em: new Date().toISOString()
            });
            return { sucesso: true };
        } catch (error) {
            console.error('Erro em concluirInstalacao:', error);
            return { sucesso: false };
        }
    }

    async function cancelarInstalacao(id) {
        try {
            await firebaseDb.collection('instalacoes_agendadas').doc(id).update({
                status: 'cancelado'
            });
            return { sucesso: true };
        } catch (error) {
            console.error('Erro em cancelarInstalacao:', error);
            return { sucesso: false };
        }
    }

    async function buscarInstalacaoPorId(id) {
        try {
            const doc = await firebaseDb.collection('instalacoes_agendadas').doc(id).get();
            if (!doc.exists) return null;
            return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error('Erro em buscarInstalacaoPorId:', error);
            return null;
        }
    }

    return {
        criarTabela,
        criarInstalacaoAgendada,
        listarInstalacoesAgendadas,
        listarInstalacoesDoDia,
        confirmarInstalacao,
        concluirInstalacao,
        cancelarInstalacao,
        buscarInstalacaoPorId
    };
};