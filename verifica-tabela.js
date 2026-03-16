// verifica-tabela.js
const Database = require('better-sqlite3');
const db = new Database('jmenet.db');

console.log('🔍 VERIFICANDO TABELAS EXISTENTES:\n');

// Lista todas as tabelas
const tabelas = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    ORDER BY name
`).all();

console.log('📋 Tabelas encontradas:');
tabelas.forEach(t => console.log(`   - ${t.name}`));

// Verifica especificamente instalacoes_agendadas
const temTabela = tabelas.some(t => t.name === 'instalacoes_agendadas');

console.log('\n🔎 Verificando instalacoes_agendadas:');
if (temTabela) {
    console.log('✅ Tabela instalacoes_agendadas EXISTE!');
    
    // Mostra estrutura da tabela
    const colunas = db.prepare("PRAGMA table_info(instalacoes_agendadas)").all();
    console.log('\n📊 Estrutura da tabela:');
    colunas.forEach(col => {
        console.log(`   - ${col.name} (${col.type}) ${col.notnull ? 'NOT NULL' : ''}`);
    });
} else {
    console.log('❌ Tabela instalacoes_agendadas NÃO EXISTE!');
    console.log('\n🔧 Será necessário criar a tabela.');
}

db.close();
