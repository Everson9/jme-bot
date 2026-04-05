'use strict';

function validarSchema(schema) {
    return (req, res, next) => {
        if (!schema || typeof schema !== 'object') return next();

        const erros = [];
        const body = req.body || {};

        // Trim campos marcados
        for (const campo of Object.keys(schema)) {
            if (schema[campo].trim && typeof body[campo] === 'string') {
                req.body[campo] = body[campo].trim();
            }
        }

        for (const campo of Object.keys(schema)) {
            const regras = schema[campo];
            const valor = req.body[campo];

            if (regras.required && (valor === undefined || valor === null || valor === '')) {
                erros.push(campo + ' eh obrigatorio');
                continue;
            }

            if (valor === undefined || valor === null) continue;

            if (regras.type && typeof valor !== regras.type) {
                erros.push(campo + ' deve ser do tipo ' + regras.type);
            }

            if (Array.isArray(regras.enum) && !regras.enum.includes(valor)) {
                erros.push(campo + ' deve ser um de: ' + regras.enum.join(', '));
            }

            if (typeof regras.min === 'number' && typeof valor === 'number' && valor < regras.min) {
                erros.push(campo + ' deve ser >= ' + regras.min);
            }

            if (typeof regras.max === 'number' && typeof valor === 'number' && valor > regras.max) {
                erros.push(campo + ' deve ser <= ' + regras.max);
            }
        }

        if (erros.length > 0) return res.status(400).json({ erros });
        next();
    };
}

module.exports = validarSchema;
