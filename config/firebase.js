// config/firebase.js
const admin = require('firebase-admin');

let serviceAccount;
let db;

// Verifica se está em produção (Railway)
if (process.env.NODE_ENV === 'production') {
    // Na Railway: pega da variável de ambiente
    console.log('🔥 Firebase: Modo produção (Railway)');
    
    const credsJson = process.env.FIREBASE_CREDENTIALS_JSON;
    if (!credsJson) {
        throw new Error('❌ FIREBASE_CREDENTIALS_JSON não configurado na Railway');
    }
    
    try {
        serviceAccount = JSON.parse(credsJson);
    } catch (e) {
        throw new Error('❌ Erro ao parsear FIREBASE_CREDENTIALS_JSON: ' + e.message);
    }
    
} else {
    // Em desenvolvimento: usa o arquivo local
    console.log('🔥 Firebase: Modo desenvolvimento (local)');
    serviceAccount = require('../firebasekey.json');
}

// Inicializa o Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

// Cria a instância do Firestore
db = admin.firestore();

// Exporta APENAS o db
module.exports = { db };