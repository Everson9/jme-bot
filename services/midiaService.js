// services/midiaService.js
const pdfParse = require('pdf-parse');
const { groqChatFallback } = require('./groqService'); // ← AGORA ESTÁ CERTO

async function analisarImagem(msg, groqChatFallback) {
    try {
        if (typeof msg.downloadMedia !== 'function') return null;
        const media = await msg.downloadMedia();
        if (!media?.data) return null;

        if (media.mimetype === 'application/pdf') {
            try {
                const pdfBuffer = Buffer.from(media.data, 'base64');
                const pdfData = await pdfParse(pdfBuffer);
                const prompt = `Analise o texto extraído de um comprovante de pagamento e extraia as informações em JSON.
                Responda apenas com o JSON, sem explicações.
                
                Texto: "${pdfData.text.substring(0, 2000)}"
                
                Formato esperado:
                {
                    "categoria": "comprovante",
                    "valido": true/false,
                    "valor": 123.45,
                    "data": "DD/MM/AAAA",
                    "motivo_invalido": "se houver"
                }`;
                
                const resp = await groqChatFallback([{ role: 'user', content: prompt }], 0.1);
                const clean = resp.replace(/```json|```/g, '').trim();
                return JSON.parse(clean);
            } catch (pdfErr) {
                return { categoria: 'comprovante', valido: false, motivo_invalido: 'PDF inválido' };
            }
        }

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                max_tokens: 300,
                messages: [{
                    role: "user",
                    content: [
                        { type: "image_url", image_url: { url: `data:${media.mimetype};base64,${media.data}` } },
                        { type: "text", text: `Responda SOMENTE com um JSON válido, sem texto antes ou depois, sem markdown.
Se for comprovante de pagamento PIX ou transferência:
{"categoria":"comprovante","valido":true,"valor":0.00,"data":"DD/MM/AAAA"}
Se NÃO for comprovante:
{"categoria":"outro","valido":false}` }
                    ]
                }]
            })
        });
        
        const data = await response.json();
        const texto = data.choices?.[0]?.message?.content || '';
        // Extrai só o JSON mesmo que venha com texto ao redor
        const jsonMatch = texto.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        return JSON.parse(jsonMatch[0]);
        
    } catch (e) {
        console.error("Erro na análise:", e);
        return null;
    }
}

module.exports = { analisarImagem };