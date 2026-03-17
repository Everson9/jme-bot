// services/audioService.js
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');

async function transcreverAudio(msg, groqApiKey) {
    try {
        const media = await msg.downloadMedia();
        if (!media?.data) return null;

        const audioBuffer = Buffer.from(media.data, 'base64');
        const tmpPath = path.join(__dirname, '../audio_tmp_' + Date.now() + '.ogg');
        fs.writeFileSync(tmpPath, audioBuffer);

        const groq = new Groq({ apiKey: groqApiKey });
        const transcricao = await groq.audio.transcriptions.create({
            file: fs.createReadStream(tmpPath),
            model: 'whisper-large-v3',
            language: 'pt',
        });

        fs.unlinkSync(tmpPath);
        return transcricao.text;
    } catch (e) {
        console.error("Erro na transcrição:", e);
        return null;
    }
}

module.exports = { transcreverAudio };