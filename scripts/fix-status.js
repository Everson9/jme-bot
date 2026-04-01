// scripts/fix-status.js
// Script para corrigir o status dos clientes baseado no histórico de pagamentos

const { db } = require('../config/firebase');

function calcularStatusCliente(cliente) {
    const hoje = new Date();
    const vencimento = cliente.dia_vencimento;
    
    if (!vencimento) return 'pendente';
    
    const mesAtual = `${hoje.getMonth() + 1}/${hoje.getFullYear()}`;
    const historico = cliente.historico_pagamentos || {};
    
    // Já pagou este mês?
    if (historico[mesAtual]?.status === 'pago') {
        return 'pago';
    }
    
    // Pagou adiantado (mês que vem)?
    const mesQueVem = `${hoje.getMonth() + 2}/${hoje.getFullYear()}`;
    if (historico[mesQueVem]?.status === 'pago') {
        return 'pago';
    }
    
    // Venceu e não pagou?
    if (hoje.getDate() >= vencimento) {
        return 'pendente';
    }
    
    return 'em_dia';
}

async function corrigirStatusClientes() {
    console.log('🔧 Iniciando correção de status dos clientes...\n');
    
    const clientesSnapshot = await db.collection('clientes').get();
    console.log(`📊 Total de clientes encontrados: ${clientesSnapshot.size}\n`);
    
    let corrigidos = 0;
    let pago = 0;
    let pendente = 0;
    let em_dia = 0;
    
    for (const doc of clientesSnapshot.docs) {
        const cliente = doc.data();
        const statusAntigo = cliente.status;
        const statusNovo = calcularStatusCliente(cliente);
        
        if (statusAntigo !== statusNovo) {
            await doc.ref.update({ 
                status: statusNovo,
                atualizado_em: new Date().toISOString()
            });
            corrigidos++;
            console.log(`   🔄 ${cliente.nome || doc.id}: ${statusAntigo} → ${statusNovo}`);
        } else {
            console.log(`   ✅ ${cliente.nome || doc.id}: ${statusAntigo} (já correto)`);
        }
        
        // Contadores para resumo
        if (statusNovo === 'pago') pago++;
        else if (statusNovo === 'pendente') pendente++;
        else if (statusNovo === 'em_dia') em_dia++;
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📋 RESUMO DA CORREÇÃO:');
    console.log('='.repeat(50));
    console.log(`   ✅ Clientes corrigidos: ${corrigidos}`);
    console.log(`   💰 Clientes pagos: ${pago}`);
    console.log(`   ⏰ Clientes pendentes: ${pendente}`);
    console.log(`   📅 Clientes em dia: ${em_dia}`);
    console.log('='.repeat(50));
    console.log('\n✅ Correção concluída!');
    
    process.exit();
}

corrigirStatusClientes().catch(err => {
    console.error('❌ Erro na correção:', err);
    process.exit(1);
});