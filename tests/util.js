// tests/util.js
const fs = require('fs');
const path = require('path');

// Cores para console
const cores = {
    verde: '\x1b[32m',
    vermelho: '\x1b[31m',
    amarelo: '\x1b[33m',
    azul: '\x1b[34m',
    reset: '\x1b[0m'
};

function log(mensagem, tipo = 'info') {
    const data = new Date().toLocaleTimeString();
    switch(tipo) {
        case 'sucesso':
            console.log(`${cores.verde}[${data}] ✅ ${mensagem}${cores.reset}`);
            break;
        case 'erro':
            console.log(`${cores.vermelho}[${data}] ❌ ${mensagem}${cores.reset}`);
            break;
        case 'aviso':
            console.log(`${cores.amarelo}[${data}] ⚠️ ${mensagem}${cores.reset}`);
            break;
        case 'passo':
            console.log(`${cores.azul}[${data}] 🔄 ${mensagem}${cores.reset}`);
            break;
        default:
            console.log(`[${data}] ${mensagem}`);
    }
}

function salvarLog(conteudo) {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
    
    const nomeArquivo = `teste_${new Date().toISOString().split('T')[0]}.log`;
    fs.appendFileSync(path.join(logsDir, nomeArquivo), 
        `${new Date().toISOString()}\n${conteudo}\n${'-'.repeat(50)}\n`);
}

function esperar(ms) {
    return new Promise(r => setTimeout(r, ms));
}

module.exports = { log, salvarLog, esperar, cores };