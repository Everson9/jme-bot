require('dotenv').config();

fetch('https://api.cerebras.ai/v1/models', {
    headers: { 'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}` }
})
.then(r => r.json())
.then(data => {
    console.log("Modelos disponíveis:");
    data.data?.forEach(m => console.log(" -", m.id));
})
.catch(console.error);
