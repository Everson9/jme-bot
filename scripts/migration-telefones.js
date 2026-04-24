// scripts/migration-telefones.js
// Uso: node scripts/migration-telefones.js
// Teste: node scripts/migration-telefones.js --dry-run

require('dotenv').config();

const { db } = require('../config/firebase');

const BATCH_SIZE = 400;

async function migrationTelefones(dryRun = false) {
    console.log('='.repeat(60));
    console.log(`🔄 MIGRAÇÃO: telefone (string) → telefones (array)`);
    console.log(`🧪 Modo DRY_RUN: ${dryRun ? 'SIM' : 'NÃO'}`);
    console.log('='.repeat(60));

    try {
        // Busca clientes que NÃO têm o campo telefones (array)
        // Firestore não suporta where('telefones', '==', null) diretamente,
        // então buscamos todos e filtramos em memória
        console.log('\n📥 Buscando clientes...');
        const snapshot = await db.collection('clientes').get();

        console.log(`📊 Total de clientes na base: ${snapshot.size}`);

        // Filtra clientes que têm telefone (string) mas não têm telefones (array)
        const clientesParaMigrar = [];
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const temTelefoneString = data.telefone && typeof data.telefone === 'string' && data.telefone.trim() !== '';
            const temTelefonesArray = data.telefones && Array.isArray(data.telefones) && data.telefones.length > 0;

            if (temTelefoneString && !temTelefonesArray) {
                clientesParaMigrar.push({
                    id: doc.id,
                    nome: data.nome || 'Sem nome',
                    telefone: data.telefone
                });
            }
        });

        console.log(`🎯 Clientes para migrar: ${clientesParaMigrar.length}`);

        if (clientesParaMigrar.length === 0) {
            console.log('\n✅ Nenhum cliente precisa de migração.');
            return;
        }

        if (dryRun) {
            console.log('\n🧪 DRY RUN — O que seria feito:');
            console.log('─'.repeat(60));
            clientesParaMigrar.forEach(c => {
                console.log(`   ${c.nome || 'Sem nome'} (${c.id}): telefones = ["${c.telefone}"]`);
            });
            console.log('─'.repeat(60));
            console.log(`\n📊 Total: ${clientesParaMigrar.length} clientes seriam atualizados.`);
            console.log('🧪 Nenhuma alteração foi feita (modo DRY_RUN).');
            return;
        }

        // Executa a migração em batches
        console.log('\n💾 Iniciando migração em batches...');
        let atualizados = 0;
        let erros = 0;
        let batchCount = 0;

        for (let i = 0; i < clientesParaMigrar.length; i += BATCH_SIZE) {
            const lote = clientesParaMigrar.slice(i, i + BATCH_SIZE);
            batchCount++;

            console.log(`\n📦 Batch ${batchCount}: ${lote.length} clientes`);

            const batch = db.batch();

            lote.forEach(cliente => {
                const docRef = db.collection('clientes').doc(cliente.id);
                batch.update(docRef, {
                    telefones: [cliente.telefone]
                });
            });

            try {
                await batch.commit();
                atualizados += lote.length;
                console.log(`   ✅ Batch ${batchCount} concluído: ${lote.length} atualizados`);
            } catch (error) {
                erros += lote.length;
                console.error(`   ❌ Erro no batch ${batchCount}:`, error.message);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('📊 RESUMO DA MIGRAÇÃO');
        console.log('='.repeat(60));
        console.log(`✅ Atualizados com sucesso: ${atualizados}`);
        console.log(`❌ Erros: ${erros}`);
        console.log(`📊 Total processado: ${clientesParaMigrar.length}`);
        console.log('='.repeat(60));

        if (erros > 0) {
            console.log('\n⚠️ Houve erros. Verifique os logs acima.');
            process.exit(1);
        } else {
            console.log('\n🎉 Migração concluída com sucesso!');
        }

    } catch (error) {
        console.error('\n❌ ERRO FATAL NA MIGRAÇÃO:', error);
        process.exit(1);
    }
}

// Verifica argumento --dry-run
const dryRun = process.argv.includes('--dry-run');

migrationTelefones(dryRun);