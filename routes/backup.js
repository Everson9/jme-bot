// routes/backup.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const stream = require('stream');

module.exports = function setupRotasBackup(app, ctx) {
    const { db } = ctx; // se precisar do banco para algo

    // Configuração do Google Drive
    const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
    
    // Caminho para as credenciais (você vai colocar no Railway)
    const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || '/etc/secrets/credentials.json';

    // Função para autenticar no Google Drive
    async function authenticateGoogle() {
        try {
            // Se as credenciais estiverem em variável de ambiente (string JSON)
            if (process.env.GOOGLE_CREDENTIALS) {
                const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
                const auth = new google.auth.GoogleAuth({
                    credentials,
                    scopes: SCOPES,
                });
                return auth.getClient();
            }
            
            // Se as credenciais estiverem em arquivo
            const auth = new google.auth.GoogleAuth({
                keyFile: CREDENTIALS_PATH,
                scopes: SCOPES,
            });
            return auth.getClient();
        } catch (error) {
            console.error('❌ Erro ao autenticar no Google Drive:', error);
            throw error;
        }
    }

    // Função para fazer upload para o Drive
    async function uploadToDrive(filePath, fileName) {
        try {
            const auth = await authenticateGoogle();
            const drive = google.drive({ version: 'v3', auth });
            
            // ID da pasta no Google Drive (você vai colocar aqui)
            const PASTA_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || 'ID_DA_SUA_PASTA_AQUI';
            
            // Cria um stream de leitura do arquivo
            const buffer = fs.createReadStream(filePath);
            
            console.log(`📤 Enviando ${fileName} para o Google Drive...`);
            
            // Configura o upload
            const response = await drive.files.create({
                requestBody: {
                    name: fileName,
                    parents: [PASTA_ID],
                    description: `Backup automático do JMENET - ${new Date().toLocaleString()}`,
                },
                media: {
                    mimeType: 'application/x-sqlite3',
                    body: buffer,
                },
            });
            
            console.log(`✅ Backup enviado para o Drive: ${fileName}`);
            
            // Opcional: tornar o arquivo público? (comente se não quiser)
            // await drive.permissions.create({
            //     fileId: response.data.id,
            //     requestBody: {
            //         role: 'reader',
            //         type: 'anyone',
            //     },
            // });
            
            return response.data;
        } catch (error) {
            console.error('❌ Erro ao enviar para o Drive:', error);
            throw error;
        }
    }

    // Função para limpar backups antigos do Drive (manter só os últimos N)
    async function cleanupOldBackups(keepLast = 7) {
        try {
            const auth = await authenticateGoogle();
            const drive = google.drive({ version: 'v3', auth });
            const PASTA_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || 'ID_DA_SUA_PASTA_AQUI';
            
            // Lista arquivos na pasta de backup
            const response = await drive.files.list({
                q: `'${PASTA_ID}' in parents and name contains 'backup-'`,
                orderBy: 'createdTime desc',
                fields: 'files(id, name, createdTime)',
                pageSize: 50,
            });
            
            const files = response.data.files;
            console.log(`📋 Encontrados ${files.length} backups no Drive`);
            
            // Se tiver mais que 'keepLast' arquivos, deleta os mais antigos
            if (files.length > keepLast) {
                const toDelete = files.slice(keepLast);
                for (const file of toDelete) {
                    await drive.files.delete({ fileId: file.id });
                    console.log(`🗑️ Backup antigo deletado do Drive: ${file.name}`);
                }
            }
        } catch (error) {
            console.error('Erro ao limpar backups antigos do Drive:', error);
        }
    }

    // =====================================================
    // ROTA DE BACKUP (agora dentro do arquivo separado)
    // =====================================================
    app.post('/api/admin/backup', async (req, res) => {
        try {
            // 1. Cria o backup local
            const backupDir = path.join(__dirname, '../backups');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            const data = new Date();
            const nomeArquivo = `backup-${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}.db`;
            const caminhoBackup = path.join(backupDir, nomeArquivo);

            // Copia o banco de dados (ajuste o caminho se necessário)
            const dbPath = process.env.DB_PATH || './jmenet.db';
            fs.copyFileSync(dbPath, caminhoBackup);

            console.log(`✅ Backup local criado: ${nomeArquivo}`);

            // 2. Tenta enviar para o Google Drive (se configurado)
            let driveInfo = null;
            if (process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.GOOGLE_CREDENTIALS) {
                try {
                    driveInfo = await uploadToDrive(caminhoBackup, nomeArquivo);
                    // Limpa backups antigos do Drive (mantém últimos 7)
                    await cleanupOldBackups(7);
                } catch (driveError) {
                    console.error('⚠️ Backup local criado, mas falha no upload para Drive:', driveError);
                }
            }

            // 3. Limpa backups locais antigos (manter últimos 7)
            const arquivos = fs.readdirSync(backupDir)
                .filter(f => f.startsWith('backup-') && f.endsWith('.db'))
                .map(f => ({ 
                    nome: f, 
                    path: path.join(backupDir, f), 
                    time: fs.statSync(path.join(backupDir, f)).mtime.getTime() 
                }))
                .sort((a, b) => b.time - a.time);

            if (arquivos.length > 7) {
                arquivos.slice(7).forEach(f => {
                    fs.unlinkSync(f.path);
                    console.log(`🗑️ Backup local antigo deletado: ${f.nome}`);
                });
            }

            res.json({ 
                ok: true, 
                mensagem: `Backup criado: ${nomeArquivo}`,
                arquivo: nomeArquivo,
                tamanho: fs.statSync(caminhoBackup).size,
                drive: driveInfo ? { id: driveInfo.id, nome: driveInfo.name } : null
            });

        } catch (error) {
            console.error('❌ Erro ao criar backup:', error);
            res.status(500).json({ erro: error.message });
        }
    });

    // Rota opcional para listar backups (útil para o frontend)
    app.get('/api/admin/backups', (req, res) => {
        try {
            const backupDir = path.join(__dirname, '../backups');
            if (!fs.existsSync(backupDir)) {
                return res.json([]);
            }

            const backups = fs.readdirSync(backupDir)
                .filter(f => f.startsWith('backup-') && f.endsWith('.db'))
                .map(f => {
                    const stats = fs.statSync(path.join(backupDir, f));
                    return {
                        nome: f,
                        tamanho: stats.size,
                        criadoEm: stats.mtime,
                        data: stats.mtime.toISOString().split('T')[0]
                    };
                })
                .sort((a, b) => b.criadoEm - a.criadoEm);

            res.json(backups);
        } catch (error) {
            res.status(500).json({ erro: error.message });
        }
    });
};