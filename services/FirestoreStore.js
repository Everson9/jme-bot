// services/FirestoreStore.js
// Store customizado para RemoteAuth — salva sessão no Firebase Storage

const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET || 'jmenet.appspot.com';

let admin;
let bucket;

function getBucket() {
    if (!bucket) {
        admin = admin || require('../config/firebase').admin;
        bucket = admin.storage().bucket(BUCKET_NAME);
    }
    return bucket;
}

class FirestoreStore {
    constructor() {
        // remotePath é montado dinamicamente por session
    }

    remotePathFor(session) {
        // session pode vir como path completo, extrair só o nome final
        const sessionName = path.basename(session);
        return `whatsapp_session/${sessionName}.zip`;
    }

    // Verifica se existe sessão no Firebase Storage
    async sessionExists({ session }) {
        try {
            const b = getBucket();
            const file = b.file(this.remotePathFor(session));
            const [exists] = await file.exists();
            console.log(`🔍 Session exists [${session}]: ${exists}`);
            return exists;
        } catch (e) {
            console.log(`⚠️ Erro ao verificar sessão: ${e.message}`);
            return false;
        }
    }

    // Salva sessão (já zipada pelo RemoteAuth) no Firebase Storage
    async save({ session }) {
        const sessionDir = session;
        const zipPath = `${sessionDir}.zip`;
        console.log(`💾 Save chamado — sessionDir: ${sessionDir}, zipPath: ${zipPath}`);
        try {
            if (!fs.existsSync(sessionDir)) {
                console.log(`⚠️ Diretório não encontrado: ${sessionDir}`);
                return;
            }
            if (!fs.existsSync(zipPath)) {
                console.log(`⚠️ Zip não existe: ${zipPath}`);
                return;
            }
            const stat = fs.statSync(zipPath);
            console.log(`📦 Zip existe: ${stat.size} bytes`);

            const b = getBucket();
            await b.upload(zipPath, {
                destination: this.remotePathFor(session),
                metadata: { contentType: 'application/zip' },
            });
            console.log(`💾 Sessão salva no Firebase Storage: ${this.remotePathFor(session)}`);
        } catch (e) {
            console.log(`⚠️ Erro ao salvar sessão: ${e.message}`);
        }
    }

    // Extrai sessão do Firebase Storage e dezipa para o diretório
    async extract({ session, path: compressedSessionPath }) {
        try {
            const localZip = compressedSessionPath || path.join('/tmp', `${session}.zip`);
            const b = getBucket();
            const file = b.file(this.remotePathFor(session));
            await file.download({ destination: localZip });
            console.log(`📥 Sessão extraída para: ${localZip}`);
            return localZip;
        } catch (e) {
            console.log(`⚠️ Erro ao extrair sessão: ${e.message}`);
            return null;
        }
    }

    // Remove sessão do Firebase Storage
    async delete({ session }) {
        try {
            const b = getBucket();
            const file = b.file(this.remotePathFor(session));
            await file.delete();
            console.log(`🗑️ Sessão removida do Firebase Storage: ${this.remotePathFor(session)}`);
        } catch (e) {
            if (e.code !== 404) {
                console.log(`⚠️ Erro ao remover sessão: ${e.message}`);
            }
        }
    }
}

module.exports = FirestoreStore;
