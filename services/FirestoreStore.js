'use strict';
const fs = require('fs');
const path = require('path');

const BUCKET = 'jme-bot.firebasestorage.app';
const STORAGE_PATH = 'whatsapp_session/RemoteAuth.zip';
const COLECAO = 'whatsapp_sessions';

// Throttle: tempo mínimo entre saves (5 minutos)
const MIN_SAVE_INTERVAL = 30 * 60 * 1000; // 5 minutos
// Debounce: tempo para acumular múltiplos saves (2 segundos)
const DEBOUNCE_DELAY = 2000;

function sessionId(session) {
    return path.basename(session).replace(/[^a-zA-Z0-9_-]/g, '_') || 'default';
}

class FirestoreStore {
    constructor({ db, admin }) {
        this.db = db;
        this.bucket = admin.storage().bucket(BUCKET);
        this._ultimoSave = 0;          // timestamp do último save
        this._saveTimeout = null;       // timeout do debounce
        this._pendingSession = null;    // sessão pendente para debounce
    }

    async sessionExists({ session }) {
        const [exists] = await this.bucket.file(STORAGE_PATH).exists();
        return exists;
    }

    async save({ session }) {
        const agora = Date.now();

        // THROTTLE: se já salvou nos últimos 5 minutos, ignora
        if (this._ultimoSave && (agora - this._ultimoSave) < MIN_SAVE_INTERVAL) {
            console.log('⏭️  Save ignorado (throttle 5min)');
            return;
        }

        // Debounce: acumula chamadas e só executa a última após o delay
        this._pendingSession = session;
        
        if (this._saveTimeout) {
            clearTimeout(this._saveTimeout);
            console.log('⏱️  Save reagendado (debounce)');
        } else {
            console.log('📝 Save agendado (debounce 2s)');
        }

        this._saveTimeout = setTimeout(async () => {
            const sessionToSave = this._pendingSession;
            const zipPath = `${sessionToSave}.zip`;
            
            try {
                await this.bucket.upload(zipPath, { destination: STORAGE_PATH });
                await this.db.collection(COLECAO).doc(sessionId(sessionToSave)).set({
                    salvo_em: new Date().toISOString(),
                });
                this._ultimoSave = Date.now();
                console.log('☁️  Sessão salva no Storage com sucesso (throttled).');
            } catch (err) {
                console.error('❌ Erro ao salvar sessão:', err.message);
            }
            
            this._saveTimeout = null;
            this._pendingSession = null;
        }, DEBOUNCE_DELAY);
    }

    async extract({ session, path: destPath }) {
        // Garante que o diretório existe antes de baixar
        const dir = path.dirname(destPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        try {
            await this.bucket.file(STORAGE_PATH).download({ destination: destPath });
            console.log('📥 Sessão extraída do Storage.');
        } catch (err) {
            console.log('⚠️ Nenhuma sessão encontrada no Storage (primeira execução)');
        }
    }

    async delete({ session }) {
        await this.bucket.file(STORAGE_PATH).delete().catch(() => {});
        await this.db.collection(COLECAO).doc(sessionId(session)).delete().catch(() => {});
        console.log('🗑️ Sessão removida do Storage');
    }
}

module.exports = FirestoreStore;