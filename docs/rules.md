# RULES — JME-BOT

Regras consolidadas do projeto. Leia este arquivo quando:
- For otimizar queries Firestore
- For mexer em segurança, secrets ou painel admin
- For fazer deploy ou diagnosticar problemas de produção

Para detalhes completos de cada área, leia a skill correspondente em `docs/skills/`.

---

## 1. Firestore — Custos e Performance

> Skill completa: `docs/skills/firestorecustosperformance.md`

### PROIBIDO
- `db.collection('clientes').get()` sem `where/limit` — scan total, trava o bot
- Loop `for...of` com `await doc(id).get()` para N clientes em série
- Buscar subcoleção `historico_pagamentos` inteira em vez do doc do ciclo

### Correto
```js
// CERTO — 1 leitura, só o ciclo necessário
const hDoc = await db.collection('clientes').doc(id)
    .collection('historico_pagamentos').doc(cicloRef.docId).get();

// ERRADO — N leituras, todo o histórico
const hist = await db.collection('clientes').doc(id)
    .collection('historico_pagamentos').get();
```

### Quando usar status direto vs histórico
- Listagens e dashboard: campo `status` do documento (O(n)) — nunca histórico
- Consulta individual de cliente: pode buscar 1 doc do ciclo atual
- Índice composto: criar no console Firebase e documentar em `docs/FIRESTORE_INDEXES.md`

---

## 2. Segurança e Secrets

> Skill completa: `docs/skills/seguranca-segredos-painel-admin.md`

### Regras rápidas
- `VITE_*` no frontend NÃO É SEGREDO — usuário extrai do bundle
- `ADMIN_API_KEY` só é barreira se o painel não for público
- `.env` nunca commitado — verificar `.gitignore` sempre

### Variáveis críticas (Railway secrets)
```
FIREBASE_CREDENTIALS_JSON — se vazio, banco não conecta
ADMIN_API_KEY — se vazio, API fica aberta
ALLOWED_ORIGINS — URLs permitidas (ex: https://jme-bot.vercel.app,https://*.vercel.app)
PORT — Railway define automaticamente (8080)
```

### Endpoint /qr — risco crítico
Qualquer pessoa com acesso pode assumir o número WhatsApp.
Em produção: proteger com IP whitelist ou Basic Auth no proxy.

### Rotação de secrets (se suspeitar de vazamento)
1. Gerar novas chaves (Firebase)
2. Atualizar nos secrets do Railway
3. Deploy
4. Revogar chaves antigas
5. Verificar logs por uso indevido

---

## 3. Produção e Deploy

> Skill completa: `docs/skills/runbook-producao-jme-bot.md`

### Triagem rápida — nesta ordem
1. `GET /api/health` — serviço está respondendo?
2. `GET /api/status` — `online: true`? `botAtivo: true`?
3. Se `online: false` — checar `GET /qr` e logs
4. Se painel não atualiza — checar SSE `/api/status-stream` e CORS
5. Confirmar variáveis de ambiente no Railway

### Bot offline
1. `GET /api/status` — checar `online` e `iniciadoEm`
2. Se `online: false` — abrir `GET /qr` e escanear
3. Se `/qr` retorna 404 — cliente WhatsApp não emitiu QR ainda, ver logs
4. Reconecta e cai em loop — suspeitar de sessão corrompida em `/data/.wwebjs_auth`
5. Apagar sessão é último recurso — fazer backup antes

### Checklist antes de deploy
- [ ] Nenhuma credencial no código
- [ ] `ADMIN_API_KEY` definido no Railway
- [ ] `/qr` protegido
- [ ] Testar `GET /api/health` após deploy

---

## 4. Regras Gerais

### Nunca alterar sem ler DECISIONS.md
- Campo `status` no documento cliente
- Assinatura de `dispararCobrancaReal`
- Queries de listagem no dashboard
- LocalAuth para sessão WhatsApp

### Ao criar novo endpoint
- Seguir `docs/PATTERNS.md`
- Adicionar em `docs/API.md`
- Verificar se precisa de índice novo no Firestore

### Ao corrigir um bug
- Documentar em `docs/History.md` com antes/depois
- Se muda comportamento intencional: atualizar `docs/DECISIONS.md`
- Se resolve pendência: marcar como concluído em `docs/PENDING.md`

### Assinatura crítica — dispararCobrancaReal
```js
// Sempre o 6 parâmetro é ADMINISTRADORES
dispararCobrancaReal(client, firebaseDb, data, tipo, clientesFiltrados, ADMINISTRADORES)

// timers.js
(data, tipo, clientes) => dispararCobrancaReal(client, firebaseDb, data, tipo, clientes, ADMINISTRADORES)

// routes/index.js
dispararCobrancaReal: (d, t) => dispararCobrancaReal(client, firebaseDb, d, t, null, ADMINISTRADORES)
```

### Timeout em chamadas WhatsApp
```js
// Sempre usar comTimeout em todas as chamadas
const { comTimeout } = require('./services/whatsappService');

await comTimeout(client.sendMessage(numero, mensagem), 30000, 'sendMessage');
await comTimeout(client.getNumberId(numero), 15000, 'getNumberId');
await comTimeout(client.isRegisteredUser(numero), 15000, 'isRegisteredUser');
```