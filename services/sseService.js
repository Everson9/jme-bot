// services/sseService.js

class SSEService {
    constructor() {
        this.clients = [];
        this.currentStatus = null;
    }

    init(ctx) { this.ctx = ctx; }

    addClient(res) {
        // Limpa conexões mortas antes de adicionar nova
        this.clients = this.clients.filter(c => {
            try { return !c.destroyed && !c.writableEnded; } catch(_) { return false; }
        });
        // Limite de segurança — evita acúmulo infinito
        if (this.clients.length >= 10) {
            console.warn(`📡 SSE: Limite de 10 conexões atingido — removendo a mais antiga`);
            try { this.clients[0].end(); } catch(_) {}
            this.clients.shift();
        }
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
            motivoRede: this.ctx?.motivoRede || '',
        };
    }

    // Envia atualização para todos os clientes
    broadcast() {
        const status = this.getCurrentStatus();
        this.currentStatus = status;
        const data = `data: ${JSON.stringify(status)}\n\n`;
        this.clients.forEach(client => {
            try { client.write(data); } catch(_) {}
        });
        console.log(`📡 SSE broadcast: online=${status.online} botAtivo=${status.botAtivo}`);
    }

    // Middleware para a rota SSE
    handleConnection(req, res) {
        // Headers necessários — X-Accel-Buffering desativa buffer do nginx/Render
        // que quebra SSE com HTTP/2
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Render/nginx: não bufferiza
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.flushHeaders(); // força envio imediato dos headers

        // Envia status inicial
        const initialStatus = this.getCurrentStatus();
        res.write(`data: ${JSON.stringify(initialStatus)}\n\n`);

        // Adiciona cliente
        this.addClient(res);

        // Heartbeat a cada 15s — envia status atual (não só ping)
        // Garante que o front sempre tem o estado correto mesmo após reconexão
        const heartbeat = setInterval(() => {
            try {
                const status = this.getCurrentStatus();
                res.write(`data: ${JSON.stringify(status)}\n\n`);
            } catch(_) {
                clearInterval(heartbeat);
                this.removeClient(res);
            }
        }, 15000);

        // Remove quando desconectar
        req.on('close', () => {
            clearInterval(heartbeat);
            this.removeClient(res);
        });
    }
}

// Exporta uma única instância (singleton)
module.exports = new SSEService();