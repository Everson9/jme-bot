const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// =====================================================
// CONFIGURAÇÃO - PREENCHA COM SEUS NÚMEROS!
// =====================================================

// 📱 SEU NÚMERO PESSOAL (o celular que você vai usar para testar)
const MEU_NUMERO_SIMULADOR = '558186650773@c.us';  // ← SEU NÚMERO!

// 🤖 NÚMERO DO BOT (onde está rodando o index.js)
const NUMERO_DO_BOT = '558187500456@c.us';  // ← NÚMERO DO BOT!

// =====================================================

// Configuração do debounce do bot (igual ao index.js)
const DEBOUNCE_CONFIG = {
    TEXTO: 12000,  // 12 segundos
    AUDIO: 10000,
    MIDIA: 6000
};

// =====================================================
// CENÁRIOS DE TESTE
// =====================================================
const CENARIOS = [
    {
        id: 1,
        nome: '🔧 Suporte Técnico Básico',
        descricao: 'Cliente com problema de internet (fluxo normal)',
        msgs: [
            { texto: 'minha internet caiu', atraso: 2000 },
            { texto: 'já reiniciei e não voltou', atraso: 3000 },
            { texto: 'luz vermelha piscando', atraso: 3000 },
            { texto: 'Rua Teste, 123, Centro', atraso: 3000 },
            { texto: '2', atraso: 3000 },
            { texto: '1', atraso: 3000 },
        ]
    },
    {
        id: 2,
        nome: '💰 Financeiro',
        descricao: 'Cliente quer pagar',
        msgs: [
            { texto: 'quanto tá minha conta', atraso: 2000 },
            { texto: '1', atraso: 2000 },
        ]
    },
    {
        id: 3,
        nome: '🤝 Promessa de Pagamento',
        descricao: 'Cliente promete pagar',
        msgs: [
            { texto: 'vou pagar dia 25', atraso: 2000 },
            { texto: 'sim', atraso: 2000 },
        ]
    },
    {
        id: 4,
        nome: '🤯 CLIENTE CONFUSO - MULTIPLOS ASSUNTOS',
        descricao: 'Internet + Promessa + Assunto Pessoal (TESTE CRÍTICO)',
        msgs: [
            // Primeiro bloco (mensagens rápidas para testar debounce)
            { 
                texto: 'minha internet caiu e eu vou pagar dia 20, minha filha tá doente também', 
                atraso: 500 
            },
            { 
                texto: 'já reiniciei umas 3 vezes e não voltou', 
                atraso: 800 
            },
            { 
                texto: 'minha filha tá com febre, nem tive tempo de mexer nisso direito', 
                atraso: 700 
            },
            { 
                texto: 'não consigo tirar foto agora, tô no hospital', 
                atraso: 900 
            },
            
            // Aguarda o debounce (12s) + 3s extra
            { 
                texto: 'as luzes tão tudo vermelha piscando', 
                atraso: 15000  // 15s depois da última
            },
            
            // AGORA O BOT DEVE PERGUNTAR O NOME
            { 
                texto: 'João Silva',  // ← NOME CORRETO
                atraso: 3000 
            },
            
            // Depois pede endereço
            { 
                texto: 'Rua das Flores, 123, Centro', 
                atraso: 3000 
            },
            
            // Escolhe dia
            { 
                texto: '2', 
                atraso: 3000 
            },
            
            // Escolhe período
            { 
                texto: '1', 
                atraso: 3000 
            },
        ]
    },
    {
        id: 5,
        nome: '❌ Cancelamento',
        descricao: 'Cliente quer cancelar',
        msgs: [
            { texto: 'quero cancelar', atraso: 2000 },
            { texto: '1', atraso: 2000 },
            { texto: 'sim', atraso: 2000 },
        ]
    },
    {
        id: 6,
        nome: '👤 Novo Cliente',
        descricao: 'Quer contratar internet (fluxo completo)',
        msgs: [
            { texto: 'quero contratar internet', atraso: 2000 },
            { texto: '1', atraso: 2000 },
            { texto: '1', atraso: 2000 },
            { texto: 'João Teste Silva', atraso: 2000 },
            { texto: '12345678901', atraso: 2000 },
            { texto: 'Rua Teste, 456', atraso: 2000 },
            { texto: '10', atraso: 2000 },
            { texto: 'segunda e quarta de manhã', atraso: 2000 },
            { texto: 'sim', atraso: 2000 },
        ]
    },
    {
        id: 7,
        nome: '⚡ TESTE DE CONCORRÊNCIA',
        descricao: 'Instruções para testar 2 clientes',
        msgs: []  // Especial
    }
];

class Simulador {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth({ 
                clientId: 'simulador',
                dataPath: './.wwebjs_auth_simulador'
            }),
            puppeteer: {
                headless: false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
                ]
            }
        });
        
        this.conectado = false;
        this.ultimaMensagem = null;
    }

    async iniciar() {
        this.client.on('qr', (qr) => {
            console.log('\n📱 ESCANEIE ESTE QR CODE COM SEU CELULAR PESSOAL:');
            console.log(`📱 Este QR code é para o número: ${MEU_NUMERO_SIMULADOR}`);
            qrcode.generate(qr, { small: true });
        });

        this.client.on('ready', () => {
            this.conectado = true;
            console.log('\n✅ SIMULADOR CONECTADO!');
            console.log(`📱 Enviando mensagens COMO: ${MEU_NUMERO_SIMULADOR}`);
            console.log(`🤖 Enviando mensagens PARA: ${NUMERO_DO_BOT}`);
            this.mostrarMenu();
        });

        this.client.on('message', (msg) => {
            if (msg.from === NUMERO_DO_BOT) {
                const agora = new Date().toLocaleTimeString();
                console.log(`\n📥 [${agora}] RESPOSTA DO BOT:`);
                console.log(`   "${msg.body.substring(0, 100)}${msg.body.length > 100 ? '...' : ''}"`);
                this.ultimaMensagem = msg;
            }
        });

        this.client.on('disconnected', (reason) => {
            this.conectado = false;
            console.log(`\n❌ Simulador desconectado: ${reason}`);
        });

        await this.client.initialize();
    }

    mostrarMenu() {
        console.log('\n' + '='.repeat(60));
        console.log('🤖 SIMULADOR DE TESTES - JMENET');
        console.log('='.repeat(60));
        console.log(`📱 Enviando como: ${MEU_NUMERO_SIMULADOR}`);
        console.log(`🤖 Enviando para: ${NUMERO_DO_BOT}`);
        console.log(`⏱️  Debounce do bot: ${DEBOUNCE_CONFIG.TEXTO/1000}s`);
        console.log('='.repeat(60));
        
        CENARIOS.forEach(cenario => {
            console.log(`${cenario.id}. ${cenario.nome}`);
            console.log(`   📝 ${cenario.descricao}`);
        });
        
        console.log('='.repeat(60));
        console.log('L. 🧹 LIMPAR HISTÓRICO DO CLIENTE');
        console.log('D. 📊 MOSTRAR ÚLTIMA RESPOSTA');
        console.log('0. Sair');
        console.log('='.repeat(60));
        console.log('💡 DICA: Para testar Marine, mude MEU_NUMERO_SIMULADOR');
        console.log('   para o número dela no topo do arquivo!');
        console.log('='.repeat(60));
    }

    async executarCenario(id) {
        if (!this.conectado) {
            console.log('❌ Simulador não está conectado!');
            return;
        }

        const cenario = CENARIOS.find(c => c.id === id);
        if (!cenario) {
            console.log('❌ Cenário inválido');
            return;
        }

        if (id === 7) {
            console.log('\n⚡ TESTE DE CONCORRÊNCIA');
            console.log('='.repeat(50));
            console.log('Para testar concorrência:');
            console.log('1. Execute este simulador 3 vezes em terminais diferentes');
            console.log('2. Em cada um, mude MEU_NUMERO_SIMULADOR para um número diferente');
            console.log('3. Todos enviem para o mesmo BOT');
            console.log('4. Todos tentem agendar o MESMO dia/período');
            this.mostrarMenu();
            return;
        }

        console.log(`\n🎬 Executando: ${cenario.nome}`);
        console.log(`📝 ${cenario.descricao}`);
        console.log(`📊 Total de mensagens: ${cenario.msgs.length}\n`);

        for (let i = 0; i < cenario.msgs.length; i++) {
            const passo = cenario.msgs[i];
            
            console.log(`📤 [${i+1}/${cenario.msgs.length}] "${passo.texto}"`);
            
            try {
                // ENVIA PARA O NÚMERO DO BOT!
                await this.client.sendMessage(NUMERO_DO_BOT, passo.texto);
            } catch (err) {
                console.log(`   ❌ Erro ao enviar: ${err.message}`);
            }
            
            if (i < cenario.msgs.length - 1) {
                const proximoAtraso = passo.atraso || 2000;
                console.log(`   ⏳ Aguardando ${proximoAtraso/1000}s...`);
                await new Promise(r => setTimeout(r, proximoAtraso));
            }
        }
        
        console.log(`\n✅ Cenário concluído!`);
        console.log(`⏰ ${new Date().toLocaleTimeString()} - Aguardando respostas do bot...`);
        
        if (id === 4) {
            console.log('\n🔍 VERIFIQUE:');
            console.log('1. O bot juntou as 4 primeiras mensagens? (debounce)');
            console.log('2. Detectou SUPORTE + PROMESSA?');
            console.log('3. Perguntou o nome?');
            console.log('4. Após agendar, voltou para a promessa pendente?');
        }
        
        this.mostrarMenu();
    }

    async limparHistorico() {
        if (!this.conectado) {
            console.log('❌ Simulador não está conectado!');
            return;
        }

        console.log('\n🧹 Limpando histórico do cliente...');
        console.log(`   Número: ${MEU_NUMERO_SIMULADOR}`);
        
        try {
            const response = await fetch('http://localhost:3001/api/admin/limpar-estado', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ numero: MEU_NUMERO_SIMULADOR })
            });
            
            if (response.ok) {
                console.log('✅ Histórico e estado limpos com sucesso!');
                this.ultimaMensagem = null;
            } else {
                const erro = await response.text();
                console.log('❌ Erro ao limpar histórico:', erro);
            }
        } catch (error) {
            console.log('❌ Erro de conexão com o bot:', error.message);
            console.log('   Certifique-se de que o bot está rodando em http://localhost:3001');
        }
        
        this.mostrarMenu();
    }

    mostrarUltimaResposta() {
        if (this.ultimaMensagem) {
            console.log('\n📥 ÚLTIMA RESPOSTA DO BOT:');
            console.log(`"${this.ultimaMensagem.body}"`);
        } else {
            console.log('\n❌ Nenhuma resposta recebida ainda');
        }
        this.mostrarMenu();
    }
}

// =====================================================
// INICIAR SIMULADOR
// =====================================================
const sim = new Simulador();
sim.iniciar();

process.stdin.on('data', async (data) => {
    const escolha = data.toString().trim().toUpperCase();
    
    if (escolha === '0') {
        console.log('👋 Encerrando simulador...');
        process.exit();
    }
    
    if (escolha === 'L') {
        await sim.limparHistorico();
        return;
    }
    
    if (escolha === 'D') {
        sim.mostrarUltimaResposta();
        return;
    }
    
    const numero = parseInt(escolha);
    if (!isNaN(numero) && numero >= 1 && numero <= CENARIOS.length) {
        await sim.executarCenario(numero);
    } else {
        console.log('❌ Opção inválida');
        sim.mostrarMenu();
    }
});

console.log('🚀 Inicializando simulador...');
console.log(`📱 Este simulador enviará mensagens COMO: ${MEU_NUMERO_SIMULADOR}`);
console.log(`🤖 As mensagens serão enviadas PARA: ${NUMERO_DO_BOT}`);
console.log('📌 Escaneie o QR code com o WhatsApp do seu número pessoal!');