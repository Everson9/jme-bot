// config/firebase.js
const admin = require('firebase-admin');
const serviceAccount = require('../firebasekey.json');

// Inicializa o Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// Cria a instância do Firestore
const db = admin.firestore();

// Exporta APENAS o db (NÃO exportar nada mais)
module.exports = { db };