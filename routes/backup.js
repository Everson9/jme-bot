// routes/backup.js
module.exports = function setupRotasBackup(app, ctx) {
    // Rota informativa
    app.get('/api/admin/backup-info', (req, res) => {
        res.json({
            ok: true,
            mensagem: 'Backups são gerenciados automaticamente pelo Firebase Console',
            link: 'https://console.firebase.google.com/project/SEU-PROJETO/firestore/backups',
            instrucoes: 'Acesse o console do Firebase para gerenciar seus backups'
        });
    });

    // Opcional: redirecionar tentativas de POST para informação
    app.post('/api/admin/backup', (req, res) => {
        res.json({
            ok: false,
            mensagem: 'Backup manual desabilitado. Use o backup automático do Firebase Console.',
            link: 'https://console.firebase.google.com/project/SEU-PROJETO/firestore/backups'
        });
    });
};