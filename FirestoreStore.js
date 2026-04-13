'use strict';
const fs = require('fs');

const COLECAO = 'whatsapp_sessions';

class FirestoreStore {
    constructor({ db }) { this.db = db; }

    async sessionExists({ session }) {
        const doc = await this.db.collection(COLECAO).doc(session).get();
        return doc.exists;
    }

    async save({ session }) {}

    async extract({ session, path: destPath }) {
        const doc = await this.db.collection(COLECAO).doc(session).get();
        if (!doc.exists) throw new Error('Sessão não encontrada no Firestore');
        fs.writeFileSync(destPath, Buffer.from(doc.data().data, 'base64'));
    }

    async delete({ session }) {
        await this.db.collection(COLECAO).doc(session).delete().catch(() => {});
    }
}

module.exports = FirestoreStore;