'use strict';
const fs = require('fs');
const path = require('path');

const BUCKET = 'jme-bot.firebasestorage.app';
const STORAGE_PATH = 'whatsapp_session/RemoteAuth.zip';
const COLECAO = 'whatsapp_sessions';

function sessionId(session) {
    return path.basename(session).replace(/[^a-zA-Z0-9_-]/g, '_') || 'default';
}

class FirestoreStore {
    constructor({ db, admin }) {
        this.db = db;
        this.bucket = admin.storage().bucket(BUCKET);
    }

    async sessionExists({ session }) {
        const [exists] = await this.bucket.file(STORAGE_PATH).exists();
        return exists;
    }

    async save({ session }) {
        const zipPath = `${session}.zip`;
        await this.bucket.upload(zipPath, { destination: STORAGE_PATH });
        await this.db.collection(COLECAO).doc(sessionId(session)).set({
            salvo_em: new Date().toISOString(),
        });
        console.log('☁️  Sessão salva no Storage com sucesso.');
    }

    async extract({ session, path: destPath }) {
    // Garante que o diretório existe antes de baixar
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    await this.bucket.file(STORAGE_PATH).download({ destination: destPath });
    console.log('📥 Sessão extraída do Storage.');
}

    async delete({ session }) {
        await this.bucket.file(STORAGE_PATH).delete().catch(() => {});
        await this.db.collection(COLECAO).doc(sessionId(session)).delete().catch(() => {});
    }
}

module.exports = FirestoreStore;