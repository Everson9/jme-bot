// helpers/banco.js
module.exports = function criarBancoHelpers(db, state) {
    
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
        buscarStatusCliente,
        buscarClientePorNome,
        buscarClientePorCPF,
        buscarClientePorTelefone,
        buscarPromessa
    };
};