// helpers/banco.js
module.exports = function criarBancoHelpers(firebaseDb, banco) {
    // banco = suas funções Firebase do database/funcoes-firebase.js
    
    async function buscarStatusCliente(numero) {
        try {
            // Usa a função do banco que já está no Firebase
            return await banco.buscarStatusCliente(numero);
        } catch(e) {
            console.error('Erro em buscarStatusCliente (helper):', e);
            return null;
        }
    }

    async function buscarClientePorNome(nome) {
        try {
            return await banco.buscarClientePorNome(nome);
        } catch(e) {
            console.error('Erro em buscarClientePorNome (helper):', e);
            return [];
        }
    }

    async function buscarClientePorCPF(cpf) {
        try {
            return await banco.buscarClientePorCPF(cpf);
        } catch(e) {
            console.error('Erro em buscarClientePorCPF (helper):', e);
            return null;
        }
    }

    async function buscarClientePorTelefone(telefone) {
        try {
            return await banco.buscarClientePorTelefone(telefone);
        } catch(e) {
            console.error('Erro em buscarClientePorTelefone (helper):', e);
            return null;
        }
    }

    async function buscarPromessa(nome) {
        try {
            return await banco.buscarPromessa(nome);
        } catch(e) {
            console.error('Erro em buscarPromessa (helper):', e);
            return null;
        }
    }

    return {
        buscarStatusCliente,
        buscarClientePorNome,
        buscarClientePorCPF,
        buscarClientePorTelefone,
        buscarPromessa
    };
};