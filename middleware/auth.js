'use strict';

// =====================================================
// AUTH — API Key Middleware
// Protege endpoints administrativos com API key simples.
// Se ADMIN_API_KEY não estiver definida, passa sem autenticar (modo dev).
// =====================================================

const ROTAS_PUBLICAS = [
    '/health',
    '/status-stream',
    '/status',
];

function requireAuth(req, res, next) {
    // Se não tem chave configurada, permite tudo (modo desenvolvimento)
    if (!process.env.ADMIN_API_KEY) return next();

    // /qr fica fora do prefixo /api — trata pelo originalUrl
    const fullPath = req.originalUrl.split('?')[0];
    if (fullPath === '/qr') return next();

    // Rotas públicas não precisam de auth
    if (ROTAS_PUBLICAS.some(r => req.path === r || req.path.startsWith(r + '/'))) {
        return next();
    }

    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ erro: 'Autenticação requerida' });
    if (apiKey !== process.env.ADMIN_API_KEY) return res.status(403).json({ erro: 'Chave inválida' });

    next();
}

module.exports = requireAuth;