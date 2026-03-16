// config/database.js
const Database = require('better-sqlite3');
const path = require('path');

// Variável para armazenar a conexão global (opcional, mas útil)
let db = null;

function criarTabelas(caminhoBanco = 'jmenet.db') {
    // Se já existe uma conexão, use-a
    if (db) return db;
    
    // Cria nova conexão com o caminho especificado
    db = new Database(caminhoBanco);
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS historico_conversa (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS atendimento_humano (
            numero TEXT PRIMARY KEY,
            desde INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS log_cobrancas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT,
            nome TEXT NOT NULL,
            data_vencimento TEXT NOT NULL,
            enviado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS log_comprovantes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT,
            recebido_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS log_atendimentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT,
            iniciado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            encerrado_em DATETIME,
            motivo_encerramento TEXT
        );

        CREATE TABLE IF NOT EXISTS novos_clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT,
            nome TEXT,
            cpf TEXT,
            endereco TEXT,
            telefone TEXT,
            plano TEXT,
            roteador TEXT,
            data_vencimento INTEGER,
            disponibilidade TEXT,
            obs TEXT,
            status TEXT DEFAULT 'solicitado',
            confirmado_em DATETIME,
            finalizado_em DATETIME,
            cadastrado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS chamados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT,
            nome TEXT,
            motivo TEXT,
            status TEXT DEFAULT 'aberto',
            aberto_em INTEGER,
            assumido_em INTEGER,
            fechado_em INTEGER
        );

        CREATE TABLE IF NOT EXISTS bases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL UNIQUE,
            descricao TEXT,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS datas_base (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            base_id INTEGER NOT NULL,
            dia INTEGER NOT NULL,
            FOREIGN KEY (base_id) REFERENCES bases(id) ON DELETE CASCADE,
            UNIQUE(base_id, dia)
        );

        CREATE TABLE IF NOT EXISTS clientes_base (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            base_id INTEGER NOT NULL,
            dia_vencimento INTEGER NOT NULL,
            nome TEXT NOT NULL,
            cpf TEXT,
            endereco TEXT,
            numero TEXT,
            telefone TEXT,
            senha TEXT,
            status TEXT DEFAULT 'pendente',
            observacao TEXT,
            forma_pagamento TEXT,
            baixa_sgp INTEGER DEFAULT 0,
            plano TEXT,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (base_id) REFERENCES bases(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS cancelamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER,
            base_id INTEGER,
            nome TEXT NOT NULL,
            cpf TEXT,
            telefone TEXT,
            numero_whatsapp TEXT,
            endereco TEXT,
            numero TEXT,
            senha TEXT,
            plano TEXT,
            forma_pagamento TEXT,
            baixa_sgp INTEGER DEFAULT 0,
            dia_vencimento INTEGER,
            observacao TEXT,
            motivo TEXT,
            motivo_detalhado TEXT,
            solicitado_via TEXT DEFAULT 'whatsapp',
            status TEXT DEFAULT 'solicitado',
            notificado_adm INTEGER DEFAULT 0,
            solicitado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            confirmado_em DATETIME
        );


        CREATE TABLE IF NOT EXISTS agendamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            data TEXT NOT NULL,
            periodo TEXT NOT NULL,
            cliente_id INTEGER,
            cliente_nome TEXT NOT NULL,
            numero TEXT NOT NULL,
            endereco TEXT NOT NULL,
            status TEXT DEFAULT 'agendado',
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(data, periodo, numero)
        );

        CREATE TABLE IF NOT EXISTS promessas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT,
            nome TEXT,
            data_promessa TEXT NOT NULL,
            data_vencimento_original TEXT,
            status TEXT DEFAULT 'pendente',
            notificado INTEGER DEFAULT 0,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            cobrado_em DATETIME,
            pago_em DATETIME
        );

        CREATE TABLE IF NOT EXISTS configuracoes (
            chave TEXT PRIMARY KEY,
            valor TEXT NOT NULL,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS log_bot (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT,
            direcao TEXT NOT NULL,
            tipo TEXT,
            conteudo TEXT,
            intencao TEXT,
            etapa TEXT,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS log_correcoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            log_id INTEGER,
            mensagem TEXT NOT NULL,
            classificou_como TEXT,
            correto_seria TEXT NOT NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS carne_solicitacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER,
            numero TEXT,
            nome TEXT,
            endereco TEXT,
            observacao TEXT,
            origem TEXT DEFAULT 'whatsapp',
            status TEXT DEFAULT 'solicitado',
            solicitado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            impresso_em DATETIME,
            entregue_em DATETIME
        );

        CREATE TABLE IF NOT EXISTS estados_conversa (
            numero TEXT PRIMARY KEY,
            tipo TEXT NOT NULL,
            estado_json TEXT NOT NULL,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS historico_pagamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER NOT NULL,
            referencia TEXT NOT NULL,
            data_vencimento TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pendente',
            forma_pagamento TEXT,
            valor REAL,
            pago_em DATETIME,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cliente_id) REFERENCES clientes_base(id) ON DELETE CASCADE,
            UNIQUE(cliente_id, referencia)
        );

        CREATE TABLE IF NOT EXISTS instalacoes_agendadas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT NOT NULL,
            nome TEXT NOT NULL,
            data TEXT NOT NULL,
            endereco TEXT NOT NULL,
            observacao TEXT,
            status TEXT DEFAULT 'agendado',
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            confirmado_em DATETIME,
            concluido_em DATETIME
        );

        CREATE TABLE IF NOT EXISTS notificacoes_rede (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT NOT NULL,
            situacao_rede TEXT,
            notificado INTEGER DEFAULT 0,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(numero, situacao_rede)
        );
    `);

    // Índices para performance
    db.exec(`CREATE INDEX IF NOT EXISTS idx_log_bot_numero ON log_bot(numero)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_log_bot_criado ON log_bot(criado_em)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_hp_cliente ON historico_pagamentos(cliente_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_hp_ref ON historico_pagamentos(referencia)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_promessas_status ON promessas(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data)`);

    // Cria a base JME se não existir
    const baseJME = db.prepare('SELECT id FROM bases WHERE nome = ?').get('JME');
    if (!baseJME) {
        const r = db.prepare('INSERT INTO bases (nome, descricao) VALUES (?, ?)').run('JME', 'Base principal');
        db.prepare('INSERT OR IGNORE INTO datas_base (base_id, dia) VALUES (?, ?)').run(r.lastInsertRowid, 10);
        db.prepare('INSERT OR IGNORE INTO datas_base (base_id, dia) VALUES (?, ?)').run(r.lastInsertRowid, 20);
        db.prepare('INSERT OR IGNORE INTO datas_base (base_id, dia) VALUES (?, ?)').run(r.lastInsertRowid, 30);
        console.log('✅ Base JME criada no banco!');
    }

    console.log('✅ Banco de dados SQLite iniciado!');
    return db;
}

function dbGetConfig(chave, padrao = '') {
    // Usa a conexão global 'db' (certifique-se de que criarTabelas já foi chamada)
    if (!db) {
        console.error('❌ Banco não inicializado. Chame criarTabelas primeiro.');
        return padrao;
    }
    const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave);
    return row ? row.valor : padrao;
}

function dbSetConfig(chave, valor) {
    if (!db) {
        console.error('❌ Banco não inicializado. Chame criarTabelas primeiro.');
        return;
    }
    db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES (?, ?, CURRENT_TIMESTAMP)').run(chave, valor);
}

module.exports = { criarTabelas, dbGetConfig, dbSetConfig };