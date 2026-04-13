// FirestoreStore.js - VERSÃO CORRIGIDA
class FirestoreStore {
    constructor(options) {
        this.db = options.db;
        this.collection = options.collection || 'whatsapp_sessions';
    }

    // NOVA FUNÇÃO: Remove caracteres inválidos para ID do Firestore
    _sanitizeSessionId(sessionId) {
        return sessionId
            .replace(/\//g, '_')      // Substitui / por _
            .replace(/\.\./g, '_')    // Substitui .. por _
            .replace(/^\./, '_')      // Substitui . inicial por _
            .replace(/\.$/, '_')      // Substitui . final por _
            .replace(/[^\w\-_]/g, '_') // Outros caracteres inválidos
            .substring(0, 1500);      // Limita tamanho
    }

    async sessionExists(options) {
        const sessionId = this._sanitizeSessionId(options.session);
        const doc = await this.db.collection(this.collection).doc(sessionId).get();
        return doc.exists;
    }

    async save(options) {
        const sessionId = this._sanitizeSessionId(options.session);
        const data = {
            session: sessionId,
            data: options.data,
            timestamp: new Date()
        };
        await this.db.collection(this.collection).doc(sessionId).set(data);
        console.log(`💾 Sessão salva no Firestore: ${sessionId}`);
    }

    async load(options) {
        const sessionId = this._sanitizeSessionId(options.session);
        const doc = await this.db.collection(this.collection).doc(sessionId).get();
        if (!doc.exists) return null;
        return doc.data().data;
    }

    async delete(options) {
        const sessionId = this._sanitizeSessionId(options.session);
        await this.db.collection(this.collection).doc(sessionId).delete();
    }
}

module.exports = { FirestoreStore };