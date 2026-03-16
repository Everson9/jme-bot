// tests/carga.js
const { log, esperar } = require('./util');

// Simula vários clientes ao mesmo tempo
async function testarCarga(quantidade = 3) {
    log(`🚀 Iniciando teste de carga com ${quantidade} clientes`, 'sucesso');
    
    const clientes = [];
    for (let i = 0; i < quantidade; i++) {
        clientes.push({
            id: i,
            numero: `cliente_${i}@c.us`,
            fluxo: Math.random() > 0.5 ? 'suporte' : 'financeiro'
        });
    }
    
    const promessas = clientes.map(cliente => {
        return new Promise(resolve => {
            setTimeout(() => {
                log(`✅ Cliente ${cliente.id} processado`, 'sucesso');
                resolve();
            }, Math.random() * 2000);
        });
    });
    
    await Promise.all(promessas);
    log(`🏁 Teste de carga concluído!`, 'sucesso');
}

testarCarga(5);