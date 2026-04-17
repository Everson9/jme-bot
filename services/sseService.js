// services/sseService.js

class SSEService {
    constructor() {
        this.clients = [];
        this.heartbeats = new Map(); // armazena intervalos por cliente
        this.maxClients = 5;
    }

    init(ctx) { this.ctx = ctx; }

    // Remove clientes mortos antes de qualquer operação
    _cleanDeadClients() {
        const before = this.clients.length;
        this.clients = this.clients.filter(client => {
            try {
                // Verifica se o socket ainda está vivo
                return client && !client.destroyed && !client.writableEnded && client.socket && !client.socket.destroyed;
            } catch(e) {
                return false;
            }
        });
        
        // Limpa heartbeats dos clientes mortos
        for (const [client, interval] of this.heartbeats) {
            if (!this.clients.includes(client)) {
                clearInterval(interval);
                this.heartbeats.delete(client);
            }
        }
        
        if (before !== this.clients.length) {
            console.log(`📡 SSE: Limpeza automática - ${before} → ${this.clients.length} clientes`);
        }
    }

    addClient(res) {
        this._cleanDeadClients();
        
        // Limite máximo
        if (this.clients.length >= this.maxClients) {
            console.warn(`📡 SSE: Limite de ${this.maxClients} conexões atingido, rejeitando`);
            try { res.end(); } catch(e) {}
            return false;
        }
        
        this.clients.push(res);
        console.log(`📡 SSE: Cliente conectado. Total: ${this.clients.length}`);
        return true;
    }

    removeClient(res) {
        this.clients = this.clients.filter(client => client !== res);
        
        // Limpa heartbeat deste cliente
        if (this.heartbeats.has(res)) {
            clearInterval(this.heartbeats.get(res));
            this.heartbeats.delete(res);
        }
        
        console.log(`📡 SSE: Cliente desconectado. Total: ${this.clients.length}`);
    }

    notificar(recurso) {
        this._cleanDeadClients(); // limpa antes de notificar
        
        if (this.clients.length === 0) return;
        
        const data = `event: update\ndata: ${JSON.stringify({ recurso, ts: Date.now() })}\n\n`;
        let removidos = 0;
        
        this.clients.forEach(client => {
            try {
                client.write(data);
            } catch(e) {
                removidos++;
                this.removeClient(client);
            }
        });
        
        if (removidos > 0) console.log(`📡 SSE: ${removidos} clientes mortos removidos`);
        console.log(`📡 SSE: notificação [${recurso}] para ${this.clients.length} clientes`);
    }

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

    broadcast() {
        this._cleanDeadClients(); // limpa antes de broadcast
        
        const status = this.getCurrentStatus();
        const data = `data: ${JSON.stringify(status)}\n\n`;
        let removidos = 0;
        
        this.clients.forEach(client => {
            try {
                client.write(data);
            } catch(e) {
                removidos++;
                this.removeClient(client);
            }
        });
        
        if (removidos > 0) console.log(`📡 SSE: ${removidos} clientes mortos removidos no broadcast`);
        console.log(`📡 SSE broadcast: online=${status.online} botAtivo=${status.botAtivo}`);
    }

    handleConnection(req, res) {
        // Headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        // Envia status inicial
        const initialStatus = this.getCurrentStatus();
        res.write(`data: ${JSON.stringify(initialStatus)}\n\n`);

        // Adiciona cliente
        const added = this.addClient(res);
        if (!added) {
            res.status(429).end();
            return;
        }

        // Heartbeat mais longo (30s) e com cleanup automático
        const heartbeat = setInterval(() => {
            try {
                if (res.destroyed || res.writableEnded) {
                    clearInterval(heartbeat);
                    this.removeClient(res);
                    return;
                }
                const status = this.getCurrentStatus();
                res.write(`data: ${JSON.stringify(status)}\n\n`);
            } catch(e) {
                clearInterval(heartbeat);
                this.removeClient(res);
            }
        }, 30000); // 30 segundos (era 15)
        
        this.heartbeats.set(res, heartbeat);

        // Remove quando desconectar
        req.on('close', () => {
            clearInterval(heartbeat);
            this.heartbeats.delete(res);
            this.removeClient(res);
        });
    }
}

module.exports = new SSEService();