# Pendências — JME-BOT

Em ordem de prioridade. Atualizar conforme for resolvendo.

---

## 🔴 Alta Prioridade

### N+1 Query em `adminService.js`
**Problema**: Loop sequencial consultando `historico_pagamentos` para cada cliente dentro do loop de verificação de cobrança automática.
```js
// problema: para N clientes, faz N queries sequenciais
for (const doc of clientesDocs) {
    const historicoDoc = await firebaseDb.collection('clientes').doc(doc.id)
        .collection('historico_pagamentos').doc(cicloRef.docId).get();
}
```
**Impacto**: A cada ciclo de verificação, faz N leituras sequenciais (pior caso: todos os clientes pendentes).
**Solução**: Usar `Promise.all` com batch de queries ou buscar todos os históricos de uma vez com `in` query.

---

## 🟡 Média Prioridade

### Migration campo `telefones` (array)
**Problema**: Clientes importados de planilha têm só `telefone` (string). Buscas por `array-contains` sempre caem no fallback, fazendo queries extras.
**Solução**: Script de migration — para cada cliente sem `telefones`, criar array com o valor de `telefone`.
**Impacto**: Elimina fallback nas buscas, reduz leituras.

### `buscarClientePorNome` — limit(500)
**Problema**: Usa scan com `limit(500)` + range query por inicial. Não escala acima de 500 clientes.
**Solução**:
1. Salvar campo `nome_normalizado` (lowercase, sem acentos)
2. Criar índice `orderBy('nome_normalizado')`
3. Usar range query `startAt / endAt`

### TTL em `historico_conversa`
**Problema**: Cresce indefinidamente.
**Solução**: Job periódico no `timers.js` ou TTL nativo do Firestore (90 dias).

---

## 🟢 Baixa Prioridade

### Rate limiting na API
**Problema**: API sem proteção contra abuso.
**Solução**: `express-rate-limit`.

### Autenticação JWT no painel
**Problema**: `VITE_ADMIN_API_KEY` no bundle — usuário extrai do código.
**Solução**: Login com sessão (cookie HttpOnly) ou JWT.

### Logs estruturados (Winston)
**Problema**: `console.log` puro, difícil de filtrar em produção.
**Solução**: Winston com níveis e saída JSON.

---

## ✅ Resolvido (não reabrir)

- ~~Scans completos do Firestore~~ — resolvido 2026-04-10
- ~~N+1 no dashboard~~ — resolvido 2026-04-10
- ~~Menu duplicado~~ — resolvido 2026-04-10
- ~~Loop infinito no fluxo de comprovante~~ — resolvido 2026-04-11
- ~~!cobrar sem ADMINISTRADORES~~ — resolvido 2026-04-11
- ~~Clientes com status promessa sendo cobrados~~ — resolvido 2026-04-17
- ~~Mensagens de cobrança genéricas~~ — resolvido 2026-04-17
- ~~SSE acúmulo de conexões~~ — resolvido 2026-04-09
- ~~Toggle bot 401~~ — resolvido 2026-04-09
- ~~Puppeteer crash loop~~ — resolvido 2026-04-09
- ~~Lock files entre deploys (LocalAuth)~~ — resolvido 2026-04-24
- ~~Sessão WhatsApp não persistia entre deploys~~ — resolvido 2026-04-24 (RemoteAuth + Storage)
- ~~Timeout no WhatsApp messaging~~ — resolvido 2026-04-22 (comTimeout helper)
- ~~Rotas desorganizadas em routes/index.js~~ — resolvido 2026-04-22
- ~~Package.json com dependências não utilizadas~~ — resolvido 2026-04-22
- ~~Arquivos obsoletos~~ — resolvido 2026-04-22
- ~~Erro ao salvar sessão no Storage (ENOENT)~~ — resolvido 2026-04-17

---

**Última atualização**: 2026-04-29
