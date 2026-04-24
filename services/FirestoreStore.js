// services/FirestoreStore.js
// Store customizado para RemoteAuth — salva sessão no Firebase Storage

const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET || 'jmenet.appspot.com';
const REMOTE_PATH = 'whatsapp_session/RemoteAuth-jme-bot.zip';

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
        this.remotePath = REMOTE_PATH;
    }

    // Verifica se existe sessão no Firebase Storage
    async sessionExists() {
        try {
            const b = getBucket();
            const file = b.file(this.remotePath);
            const [exists] = await file.exists();
            console.log(`🔍 Session exists: ${exists}`);
            return exists;
        } catch (e) {
            console.log(`⚠️ Erro ao verificar sessão: ${e.message}`);
            return false;
        }
    }

    // Salva sessão local no Firebase Storage
    async save(session) {
        const sessionDir = session?.session || session?.zipPath || session?.path;
        console.log(`💾 Save chamado com sessionDir: ${sessionDir}`);
        try {
            if (!sessionDir || !fs.existsSync(sessionDir)) {
                console.log(`⚠️ Diretório não encontrado: ${sessionDir}`);
                return;
            }
            const zipPath = `${sessionDir}.zip`;
            await new Promise((resolve, reject) => {
                const output = fs.createWriteStream(zipPath);
                const archive = archiver('zip', { zlib: { level: 9 } });
                output.on('close', resolve);
                archive.on('error', reject);
                archive.pipe(output);
                archive.directory(sessionDir, false);
                archive.finalize();
            });
            if (!fs.existsSync(zipPath)) {
                console.log(`⚠️ Zip não foi criado: ${zipPath}`);
                return;
            }
            const b = getBucket();
            await b.upload(zipPath, {
                destination: this.remotePath,
                metadata: { contentType: 'application/zip' },
            });
            // Limpa zip local
            fs.unlinkSync(zipPath);
            console.log(`💾 Sessão salva no Firebase Storage: ${this.remotePath}`);
        } catch (e) {
            console.log(`⚠️ Erro ao salvar sessão: ${e.message}`);
        }
    }

    // Extrai sessão do Firebase Storage para local
    async extract() {
        try {
            const localTmp = path.join('/tmp', 'RemoteAuth-jme-bot.zip');
            const b = getBucket();
            const file = b.file(this.remotePath);
            await file.download({ destination: localTmp });
            console.log(`📥 Sessão extraída do Firebase Storage: ${localTmp}`);
            return localTmp;
        } catch (e) {
            console.log(`⚠️ Erro ao extrair sessão: ${e.message}`);
            return null;
        }
    }

    // Remove sessão do Firebase Storage
    async delete() {
        try {
            const b = getBucket();
            const file = b.file(this.remotePath);
            await file.delete();
            console.log(`🗑️ Sessão removida do Firebase Storage`);
        } catch (e) {
            if (e.code !== 404) {
                console.log(`⚠️ Erro ao remover sessão: ${e.message}`);
            }
        }
    }
}

module.exports = FirestoreStore;
