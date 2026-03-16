// database/criar_tabela_instalacoes.js
const Database = require('better-sqlite3');
const db = new Database('jmenet.db');

console.log('📦 Criando tabela de instalações agendadas...');

db.exec(`
    CREATE TABLE IF NOT EXISTS instalacoes_agendadas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT NOT NULL,
        nome TEXT NOT NULL,
        data TEXT NOT NULL,
        endereco TEXT NOT NULL,
        status TEXT DEFAULT 'agendado',
        observacao TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        confirmado_em DATETIME,
        concluido_em DATETIME
    );
`);

console.log('✅ Tabela criada!');