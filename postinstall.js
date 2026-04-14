#!/usr/bin/env node
/**
 * postinstall.js
 *
 * Adiciona retry automático em exposeFunctionIfAbsent do whatsapp-web.js.
 * Executado automaticamente após "npm install" no deploy (Fly.io).
 *
 * Corrige: "Execution context was destroyed, most likely because of a navigation"
 */

const fs = require('fs');
const path = require('path');

const ARQUIVO = path.join(
    __dirname,
    'node_modules',
    'whatsapp-web.js',
    'src',
    'util',
    'Puppeteer.js'
);

if (!fs.existsSync(ARQUIVO)) {
    console.log('[postinstall] whatsapp-web.js não encontrado, pulando patch.');
    process.exit(0);
}

const original = fs.readFileSync(ARQUIVO, 'utf8');

// Já foi patchado? Não faz nada.
if (original.includes('exposeFunctionIfAbsent_PATCHED')) {
    console.log('[postinstall] Patch já aplicado, nada a fazer.');
    process.exit(0);
}

// Substitui a função inteira por uma versão com retry
const FUNCAO_ORIGINAL = /async function exposeFunctionIfAbsent\s*\([\s\S]*?\n\}/;

const FUNCAO_NOVA = `async function exposeFunctionIfAbsent(page, name, fn) { // exposeFunctionIfAbsent_PATCHED
    const MAX_TENTATIVAS = 3;
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
        try {
            const existe = await page.evaluate(n => window[n] !== undefined, name);
            if (!existe) await page.exposeFunction(name, fn);
            return;
        } catch (err) {
            const ehContextoDestruido =
                err.message?.includes('Execution context was destroyed') ||
                err.message?.includes('context was destroyed') ||
                err.message?.includes('most likely because of a navigation');

            if (ehContextoDestruido && tentativa < MAX_TENTATIVAS) {
                console.warn('[wwebjs-patch] Contexto destruído durante inject, retry ' + tentativa + '/' + (MAX_TENTATIVAS - 1) + '...');
                await new Promise(r => setTimeout(r, 1500 * tentativa));
                continue;
            }
            throw err;
        }
    }
}`;

if (!FUNCAO_ORIGINAL.test(original)) {
    console.warn('[postinstall] ⚠️  Padrão da função não encontrado — versão do whatsapp-web.js pode ter mudado.');
    console.warn('[postinstall] Arquivo não modificado.');
    process.exit(0);
}

const patchado = original.replace(FUNCAO_ORIGINAL, FUNCAO_NOVA);
fs.writeFileSync(ARQUIVO, patchado, 'utf8');
console.log('[postinstall] ✅ Patch aplicado em whatsapp-web.js/src/util/Puppeteer.js');