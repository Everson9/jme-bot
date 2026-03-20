// services/sseService.js

class SSEService {
    constructor() {
        this.clients = [];
        this.currentStatus = null;
    }

    init(ctx) { this.ctx = ctx; }

    addClient(res) {
        this.clients.push(res);
        console.log(`📡 SSE: Cliente conectado. Total: ${this.clients.length}`);
    }

    removeClient(res) {
        this.clients = this.clients.filter(client => client !== res);
        console.log(`📡 SSE: Cliente desconectado. Total: ${this.clients.length}`);
    }

    // Notifica o front que um recurso específico mudou
    // O front escuta o evento e recarrega apenas aquela página/dado
    // Exemplo: sseService.notificar('clientes') → front recarrega clientes
    // Exemplo: sseService.notificar('chamados') → front recarrega chamados
    notificar(recurso) {
        const data = `event: update\ndata: ${JSON.stringify({ recurso, ts: Date.now() })}\n\n`;
        this.clients.forEach(client => {
            try { client.write(data); } catch(_) {}
        });
        console.log(`📡 SSE: notificação [${recurso}]`);
    }

    // Pega o status atual
    getCurrentStatus() {
        return {
            botAtivo: this.ctx?.botAtivo || false,
            online: this.ctx?.botIniciadoEm ? true : false,
            iniciadoEm: this.ctx?.botIniciadoEm || null,
            atendimentosAtivos: this.ctx?.state?.stats()?.atendimentoHumano || 0,
            situacaoRede: this.ctx?.situacaoRede || 'normal',
            previsaoRetorno: this.ctx?.previsaoRetorno || 'sem previsão',
        };
    }

    // Envia atualização para todos os clientes
    broadcast() {
        const status = this.getCurrentStatus();
        
        // Só envia se mudou
        if (JSON.stringify(status) === JSON.stringify(this.currentStatus)) {
            return; // Nada mudou
        }
        
        this.currentStatus = status;
        const data = `data: ${JSON.stringify(status)}\n\n`;
        
        this.clients.forEach(client => {
            try {
                client.write(data);
            } catch (err) {
                console.error('📡 SSE: Erro ao enviar para cliente', err);
            }
        });
        
        console.log('📡 SSE: Broadcast enviado');
    }

    // Middleware para a rota SSE
    handleConnection(req, res) {
        // Configura headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });

        // Envia status inicial
        const initialStatus = this.getCurrentStatus();
        res.write(`data: ${JSON.stringify(initialStatus)}\n\n`);

        // Adiciona cliente
        this.addClient(res);

        // Remove quando desconectar
        req.on('close', () => {
            this.removeClient(res);
        });
    }
}

// Exporta uma única instância (singleton)
module.exports = new SSEService();