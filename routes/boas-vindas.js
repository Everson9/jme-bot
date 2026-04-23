// routes/boas-vindas.js

module.exports = function setupBoasVindasRoutes(app, ctx) {
    const { db: firebaseDb, client } = ctx;

    // ─────────────────────────────────────────────────────
    // BOAS-VINDAS
    // ─────────────────────────────────────────────────────
    app.post('/api/boas-vindas/enviar', async (req, res) => {
        const { cliente_id, mensagem, solicitar_carne, obs_carne, carne_arquivo_base64, carne_arquivo_nome, carne_arquivo_tipo } = req.body || {};
        try {
            const cliDoc = await firebaseDb.collection('clientes').doc(cliente_id).get();
            if (!cliDoc.exists) return res.status(404).json({ erro: 'Cliente não encontrado' });
            const cli = cliDoc.data();
            const telefone = cli.telefone || null;
            if (!telefone) return res.status(400).json({ erro: 'Cliente sem telefone' });
            const numero = (telefone.replace(/\D/g,'').startsWith('55') ? telefone.replace(/\D/g,'') : '55' + telefone.replace(/\D/g,'')) + '@c.us';

            const msgBoasVindas = mensagem ||
                `🤖 *Assistente JMENET*\n\nOlá, *${(cli.nome || 'Cliente').split(' ')[0]}*! 🎉 Seja bem-vindo(a) à JMENET!\n\n📡 Plano: ${cli.plano || 'Não informado'}\n📅 Vencimento: Todo dia ${cli.dia_vencimento || '10'}\n\nQualquer dúvida é só chamar! 😊`;

            await client.sendMessage(numero, msgBoasVindas);

            if (carne_arquivo_base64 && carne_arquivo_nome) {
                try {
                    const { MessageMedia } = require('whatsapp-web.js');
                    const media = new MessageMedia(carne_arquivo_tipo || 'application/pdf', carne_arquivo_base64, carne_arquivo_nome);
                    await client.sendMessage(numero, media);
                } catch(fileErr) {
                    console.error('Erro ao enviar carnê:', fileErr.message);
                }
            }

            if (solicitar_carne) {
                const anteriories = await firebaseDb.collection('carne_solicitacoes')
                    .where('cliente_id', '==', cliente_id)
                    .where('status', '==', 'solicitado').get();
                const batch = firebaseDb.batch();
                anteriories.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();

                await firebaseDb.collection('carne_solicitacoes').add({
                    cliente_id, nome: cli.nome || null, numero: cli.telefone || null,
                    endereco: cli.endereco || null, origem: 'painel', status: 'solicitado',
                    observado: obs_carne || 'Solicitado via painel na boas-vindas',
                    solicitado_em: new Date().toISOString()
                });
            }

            res.json({ ok: true });
        } catch(e) { res.status(500).json({ erro: e.message }); }
    });

    app.post('/api/boas-vindas/manual', async (req, res) => {
        const { telefone, mensagem } = req.body || {};
        if (!telefone) return res.status(400).json({ erro: 'Telefone é obrigatório' });
        if (!mensagem) return res.status(400).json({ erro: 'Mensagem é obrigatória' });
        try {
            const numero = (telefone.replace(/\D/g,'').startsWith('55') ? telefone.replace(/\D/g,'') : '55' + telefone.replace(/\D/g,'')) + '@c.us';
            await client.sendMessage(numero, mensagem);
            res.json({ ok: true });
        } catch(e) { res.status(500).json({ erro: e.message }); }
    });
};