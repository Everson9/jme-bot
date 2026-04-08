'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STATE MANAGER — Gerenciador de Estado Centralizado
// Versão adaptada para Firebase (sem SQLite)
//
// Estrutura de um estado:
// {
//   fluxo: 'suporte'|'financeiro'|'novoCliente'|'promessa'|'comprovantePendente'|null,
//   etapa: string|null,
//   dados: {},                     ← dados coletados no fluxo (nome, endereço, plano...)
//   atendimentoHumano: false,      ← atendente assumiu
//   atendimentoHumanoDesde: null,  ← timestamp para expiração
//   clienteEmSuporte: false,       ← protege timer de inatividade
//   aguardandoEscolha: false,      ← aguardando escolha de pagamento
//   atualizadoEm: timestamp
// }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// OBS: o fluxo de "admin assumiu" configura timer de 2h (middleware/Mensagem.js).
// Mantemos a expiração alinhada para evitar o bot "voltar" no meio do atendimento humano.
const TEMPO_EXPIRACAO_HUMANO = 2 * 60 * 60 * 1000; // 2 horas

class StateManager {
    constructor(db = null) {
        this._db = db; // Pode ser null (Firebase não usa SQLite)
        this._map = new Map();
        this._timers = new Map();
        
        // Se tiver SQLite, tenta carregar, senão só avisa
        if (this._db) {
            this._garantirTabela();
            this._carregar();
        } else {
            console.log('ℹ️ StateManager rodando sem persistência (modo Firebase)');
        }
    }

    // ─── Banco ───────────────────────────────────────────
    _garantirTabela() {
        // Se não tem banco, ignora
        if (!this._db) return;
        
        try {
            this._db.exec(`
                CREATE TABLE IF NOT EXISTS estados_v2 (
                    numero      TEXT PRIMARY KEY,
                    estado_json TEXT NOT NULL,
                    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } catch (e) {
            console.error('StateManager._garantirTabela:', e.message);
        }
    }

    _carregar() {
        // Se não tem banco, ignora
        if (!this._db) return;
        
        try {
            const rows = this._db.prepare('SELECT numero, estado_json FROM estados_v2').all();
            let count = 0;
            const deletar = [];
            for (const row of rows) {
                try {
                    const entry = JSON.parse(row.estado_json);
                    const vazio = !entry.fluxo && !entry.atendimentoHumano && !entry.clienteEmSuporte && !entry.aguardandoEscolha;
                    if (vazio) {
                        deletar.push(row.numero);
                        continue;
                    }
                    this._map.set(row.numero, { ...this._default(), ...entry });
                    count++;
                } catch (_) {
                    deletar.push(row.numero);
                }
            }
            // Limpa entradas vazias herdadas do banco antigo
            if (deletar.length > 0) {
                const stmt = this._db.prepare('DELETE FROM estados_v2 WHERE numero = ?');
                for (const n of deletar) stmt.run(n);
                console.log(`🧹 StateManager: ${deletar.length} entrada(s) vazia(s) removida(s) do banco`);
            }
            if (count > 0) console.log(`♻️  StateManager: ${count} estado(s) restaurado(s)`);
        } catch (e) {
            console.error('StateManager._carregar:', e.message);
        }
    }

    _persistir(numero) {
        // Se não tem banco, não persiste (Firebase)
        if (!this._db) return;
        
        const entry = this._map.get(numero);
        if (!entry) return;
        try {
            this._db.prepare(`
                INSERT INTO estados_v2 (numero, estado_json, atualizado_em)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(numero) DO UPDATE SET
                    estado_json   = excluded.estado_json,
                    atualizado_em = CURRENT_TIMESTAMP
            `).run(numero, JSON.stringify(entry));
        } catch (e) {
            console.error('StateManager._persistir:', e.message);
        }
    }

    // ─── Helpers internos ────────────────────────────────
    _default() {
        return {
            fluxo: null,
            etapa: null,
            dados: {},
            atendimentoHumano: false,
            atendimentoHumanoDesde: null,
            clienteEmSuporte: false,
            aguardandoEscolha: false,
            atualizadoEm: Date.now(),
        };
    }

    _entry(numero) {
        if (!this._map.has(numero)) {
            this._map.set(numero, this._default());
        }
        return this._map.get(numero);
    }

    // Leitura sem criar registro — não polui o mapa com estados vazios
    _get(numero) {
        return this._map.get(numero) || this._default();
    }

    // ─── Fluxo ───────────────────────────────────────────

    /** Inicia um novo fluxo */
    iniciar(numero, fluxo, etapa, dados = {}) {
        const e = this._entry(numero);
        e.fluxo = fluxo;
        e.etapa = etapa;
        e.dados = dados;
        e.atualizadoEm = Date.now();
        this._persistir(numero); // Só persiste se tiver SQLite
        console.log(`📌 state.iniciar [${numero.slice(-8)}] fluxo=${fluxo} etapa=${etapa}`);
        return this;
    }

    /** Avança para próxima etapa (mesmo fluxo), fazendo merge nos dados */
    avancar(numero, etapa, dadosExtras = {}) {
        const e = this._entry(numero);
        e.etapa = etapa;
        e.dados = { ...e.dados, ...dadosExtras };
        e.atualizadoEm = Date.now();
        this._persistir(numero);
        return this;
    }

    /** Atualiza só os dados sem mudar etapa */
    atualizar(numero, dadosExtras) {
        const e = this._entry(numero);
        e.dados = { ...e.dados, ...dadosExtras };
        e.atualizadoEm = Date.now();
        this._persistir(numero);
        return this;
    }

    /** Encerra o fluxo ativo (mantém outras flags); remove do banco se ficou vazio) */
    encerrarFluxo(numero) {
        const e = this._map.get(numero);
        if (!e) return this;
        e.fluxo = null;
        e.etapa = null;
        e.dados = {};
        e.aguardandoEscolha = false;
        e.atualizadoEm = Date.now();
        this._limparSeVazio(numero);
        return this;
    }

    /** Deleta do mapa e banco se o estado ficou completamente vazio */
    _limparSeVazio(numero) {
        const e = this._map.get(numero);
        if (!e) return;
        const vazio = !e.fluxo && !e.atendimentoHumano && !e.clienteEmSuporte && !e.aguardandoEscolha;
        if (vazio) {
            this._map.delete(numero);
            // Só tenta deletar do banco se tiver SQLite
            if (this._db) {
                try { this._db.prepare('DELETE FROM estados_v2 WHERE numero = ?').run(numero); } catch (_) {}
            }
        } else {
            this._persistir(numero);
        }
    }

    /** Reset completo de tudo (usado em !reset) */
    limpar(numero) {
        this._map.delete(numero);
        if (this._db) {
            try { this._db.prepare('DELETE FROM estados_v2 WHERE numero = ?').run(numero); } catch (_) {}
        }
        return this;
    }

    // ─── Getters de fluxo ────────────────────────────────

    hasFluxo(numero)        { return this._get(numero).fluxo !== null; }
    getFluxo(numero)        { return this._get(numero).fluxo; }
    getEtapa(numero)        { return this._get(numero).etapa; }
    getDados(numero)        { return this._get(numero).dados; }

    isFluxo(numero, fluxo)  { return this._get(numero).fluxo === fluxo; }

    /** Retorna se há qualquer estado ativo (fluxo, humano ou comprovante pendente) */
    hasAtivo(numero) {
        const e = this._get(numero);
        return !!e.fluxo || this.isAtendimentoHumano(numero);
    }

    // ─── Atendimento Humano ──────────────────────────────

    setAtendimentoHumano(numero, ativo) {
        const e = this._entry(numero);
        e.atendimentoHumano      = ativo;
        e.atendimentoHumanoDesde = ativo ? Date.now() : null;
        e.atualizadoEm           = Date.now();
        // Quando humano assume, limpa fluxo ativo do bot
        if (ativo) {
            e.fluxo  = null;
            e.etapa  = null;
            e.dados  = {};
            e.aguardandoEscolha = false;
            this._persistir(numero);
        } else {
            // Humano liberou — remove do banco se não há mais nada ativo
            this._limparSeVazio(numero);
        }
        return this;
    }

    isAtendimentoHumano(numero) {
        const e = this._map.get(numero);
        if (!e || !e.atendimentoHumano || !e.atendimentoHumanoDesde) return false;
        const expirou = (Date.now() - e.atendimentoHumanoDesde) >= TEMPO_EXPIRACAO_HUMANO;
        if (expirou) {
            // Auto-expira — limpa tudo se não há mais nada ativo
            e.atendimentoHumano      = false;
            e.atendimentoHumanoDesde = null;
            this._limparSeVazio(numero);
            return false;
        }
        return true;
    }

    getAtendimentoHumanoDesde(numero) {
        return this._entry(numero).atendimentoHumanoDesde;
    }

    // ─── Cliente em Suporte ──────────────────────────────

    setClienteEmSuporte(numero, ativo) {
        const e          = this._entry(numero);
        e.clienteEmSuporte = ativo;
        e.atualizadoEm   = Date.now();
        this._persistir(numero);
        return this;
    }

    isClienteEmSuporte(numero) {
        return this._get(numero).clienteEmSuporte === true;
    }

    // ─── Aguardando Escolha de Pagamento ─────────────────

    setAguardandoEscolha(numero, ativo) {
        const e             = this._entry(numero);
        e.aguardandoEscolha = ativo;
        e.atualizadoEm      = Date.now();
        this._persistir(numero);
        return this;
    }

    isAguardandoEscolha(numero) {
        return this._get(numero).aguardandoEscolha === true;
    }

    // ─── Timers de Inatividade ───────────────────────────

    /** Inicia um timer de inatividade para um cliente */
    iniciarTimer(numero, callback, tempo = 10 * 60 * 1000) {
        this.cancelarTimer(numero);
        
        // ✅ VERIFICA SE CALLBACK É FUNÇÃO
        if (typeof callback !== 'function') {
            console.log(`⚠️ Timer para ${numero} ignorado: callback não é função`);
            return;
        }
        
        const timer = setTimeout(() => {
            try {
                callback(numero);
            } catch (e) {
                console.error(`❌ Erro no timer callback para ${numero}:`, e);
            }
            this._timers?.delete(numero);
        }, tempo);
        
        // Garante que o Map de timers existe
        if (!this._timers) this._timers = new Map();
        this._timers.set(numero, timer);
    }

    /** Cancela um timer de inatividade */
    cancelarTimer(numero) {
        if (this._timers?.has(numero)) {
            clearTimeout(this._timers.get(numero));
            this._timers.delete(numero);
        }
    }

    // ─── Controle de Erros ───────────────────────────────

    incrementarErros(numero) {
        const entry = this._entry(numero);
        entry.errosConsecutivos = (entry.errosConsecutivos || 0) + 1;
        entry.ultimoErro = Date.now();
        this._persistir(numero);
        return entry.errosConsecutivos;
    }

    resetarErros(numero) {
        const entry = this._entry(numero);
        entry.errosConsecutivos = 0;
        entry.ultimoErro = null;
        this._persistir(numero);
    }

    getErros(numero) {
        return this._get(numero).errosConsecutivos || 0;
    }

    // ─── API / Painel ────────────────────────────────────

    /** Retorna todos os estados ativos para o painel */
    todos(apenasRecentes = true) {
        const result = [];
        const limite = apenasRecentes ? Date.now() - (2 * 60 * 60 * 1000) : 0; // 2h
        for (const [numero, entry] of this._map) {
            if (entry.fluxo || entry.atendimentoHumano) {
                // Só inclui se tiver atividade nas últimas 2h
                if (apenasRecentes && entry.atualizadoEm < limite) continue;
                result.push({ numero, ...entry });
            }
        }
        return result.sort((a, b) => b.atualizadoEm - a.atualizadoEm);
    }

    /** Estatísticas resumidas para dashboard */
    stats() {
        const ativos = [...this._map.values()];
        const fluxos = ['suporte', 'financeiro', 'novoCliente', 'promessa', 'comprovantePendente'];
        const porFluxo = {};
        for (const f of fluxos) {
            porFluxo[f] = ativos.filter(e => e.fluxo === f).length;
        }
        return {
            total: ativos.filter(e => e.fluxo).length,
            atendimentoHumano: ativos.filter(e => e.atendimentoHumano).length,
            porFluxo,
        };
    }

    /** Retorna estado completo de um número (para debug/painel) */
    inspecionar(numero) {
        const e = this._map.get(numero);
        if (!e) return null;
        return {
            numero,
            ...e,
            atendimentoHumanoExpiracao: e.atendimentoHumanoDesde
                ? new Date(e.atendimentoHumanoDesde + TEMPO_EXPIRACAO_HUMANO).toLocaleString('pt-BR')
                : null,
        };
    }
}

module.exports = StateManager;