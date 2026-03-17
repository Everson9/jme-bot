// teste-firebase.js
const { db } = require('./config/firebase');

async function testar() {
  try {
    // Lista todas as coleções
    const collections = await db.listCollections();
    console.log('📚 Coleções encontradas:');
    collections.forEach(col => console.log(`   - ${col.id}`));
    
    // Tenta buscar clientes
    const clientes = await db.collection('clientes_base').limit(5).get();
    console.log(`\n👥 Clientes na base: ${clientes.size}`);
    
    // Tenta buscar bases
    const bases = await db.collection('bases').get();
    console.log(`📁 Bases encontradas: ${bases.size}`);
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

testar();