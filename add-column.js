// add-column.js
const Database = require('better-sqlite3');
const db = new Database('jmenet.db');

try {
    // Verifica se a coluna já existe
    const tableInfo = db.prepare("PRAGMA table_info(log_bot)").all();
    const hasIntencao = tableInfo.some(col => col.name === 'intencao');
    
    if (!hasIntencao) {
        db.exec("ALTER TABLE log_bot ADD COLUMN intencao TEXT");
        console.log('✅ Coluna "intencao" adicionada com sucesso!');
    } else {
        console.log('ℹ️ Coluna "intencao" já existe.');
    }
    
    // Lista as colunas pra confirmar
    console.log('\n📋 Colunas da tabela log_bot:');
    db.prepare("PRAGMA table_info(log_bot)").all().forEach(col => {
        console.log(`   - ${col.name} (${col.type})`);
    });
    
} catch (error) {
    console.error('❌ Erro:', error.message);
}