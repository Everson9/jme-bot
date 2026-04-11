# RULES — JME-BOT

Regras consolidadas do projeto. Leia este arquivo quando:
- For fazer qualquer alteração em fluxos de atendimento
- For otimizar queries Firestore
- For mexer em segurança, secrets ou painel admin
- For fazer deploy ou diagnosticar problemas de producao

Para detalhes completos de cada area, leia a skill correspondente em `docs/skills/`.

---

## 1. Firestore — Custos e Performance

> Skill completa: `docs/skills/firestorecustosperformance.md`

### PROIBIDO
- `db.collection('clientes').get()` sem `where/limit` — scan total, trava o bot
- Loop `for...of` com `await doc(id).get()` para N clientes em serie
- Buscar subcoleção `historico_pagamentos` inteira em vez do doc do ciclo

### Correto
```js
// CERTO — 1 leitura, so o ciclo necessario
const hDoc = await db.collection('clientes').doc(id)
    .collection('historico_pagamentos').doc(cicloRef.docId).get();

// ERRADO — N leituras, todo o historico
const hist = await db.collection('clientes').doc(id)
    .collection('historico_pagamentos').get();
```

### Quando usar status direto vs historico
- Listagens e dashboard: campo `status` do documento (O(n)) — nunca historico
- Consulta individual de cliente: pode buscar 1 doc do ciclo atual
- Indice composto: criar no console Firebase e documentar em `docs/FIRESTORE_INDEXES.md`

---

## 2. Fluxos de Atendimento

> Skill completa: `docs/skills/Diagnosticoatendimento.md`

### Arquivos-chave por area
| Problema | Arquivo |
|---|---|
| Roteamento de mensagens | `middleware/Mensagem.js` |
| Estado por numero | `stateManager.js` |
| Comprovantes e consulta | `middleware/comprovante.js` |
| Identificacao nome/CPF/tel | `helpers/identificacao.js` + `services/fluxoService.js` |
| Queries de busca | `database/funcoes-firebase.js` |

### Falhas mais comuns

**Menu aparece do nada**
- PDF sem legenda em fluxo ativo cai no fallback de menu
- Fix: checar `if (fluxoAtivo && !texto.trim()) return;` antes do fallback

**Loop infinito no fluxo**
- Fluxo nao atualiza `tentativas` no state — repete mesma mensagem
- Fix: sempre `state.atualizar(deQuem, { tentativas: n+1 })` antes de responder

**Nome nao encontrado (banco de planilha)**
- Banco importado pode ter so primeiro nome ou sem conectores (da/de/do)
- Fix: tentar variantes — nome completo, so 1 token, 1 token + ultimo token
- Se multiplos resultados: pedir CPF

**Admin assume e bot interfere**
- Divergencia de expiracao entre StateManager (2h) e timer em Mensagem.js (2h)
- Fix: manter os dois alinhados em exatamente 2h

### Checklist de diagnostico
- [ ] Tipo da mensagem: texto, foto, PDF, sem legenda?
- [ ] Qual fluxo ativo? (`state.getFluxo`)
- [ ] Tem atendimento humano? (`state.isAtendimentoHumano`)
- [ ] Ocorre apos quanto tempo? (timer/expiracao)

---

## 3. Seguranca e Secrets

> Skill completa: `docs/skills/seguranca-segredos-painel-admin.md`

### Regras rapidas
- `VITE_*` no frontend NAO E SEGREDO — usuario extrai do bundle
- `ADMIN_API_KEY` so e barreira se o painel nao for publico
- `.env` nunca commitado — verificar `.gitignore` sempre

### Variaveis criticas (Railway secrets)
```
FIREBASE_CREDENTIALS_JSON  — se vazio, banco nao conecta
GROQ_API_KEY               — se vazio, classificacao de intencao falha
ADMIN_API_KEY              — se vazio, API fica aberta
PORT                       — padrao 3001
```

### Endpoint /qr — risco critico
Qualquer pessoa com acesso pode assumir o numero WhatsApp.
Em producao: proteger com IP whitelist ou Basic Auth no proxy.

### Rotacao de secrets (se suspeitar de vazamento)
1. Gerar novas chaves (Firebase + Groq)
2. Atualizar nos secrets do Railway
3. Deploy
4. Revogar chaves antigas
5. Verificar logs por uso indevido

---

## 4. Producao e Deploy

> Skill completa: `docs/skills/runbook-producao-jme-bot.md`

### Triagem rapida — nesta ordem
1. `GET /api/health` — servico esta respondendo?
2. `GET /api/status` — `online: true`? `botAtivo: true`?
3. Se `online: false` — checar `GET /qr` e logs
4. Se painel nao atualiza — checar SSE `/api/status-stream` e CORS
5. Confirmar variaveis de ambiente no Railway

### Bot offline
1. `GET /api/status` — checar `online` e `iniciadoEm`
2. Se `online: false` — abrir `GET /qr` e escanear
3. Se `/qr` retorna 404 — cliente WhatsApp nao emitiu QR ainda, ver logs
4. Reconecta e cai em loop — suspeitar de sessao corrompida em `/data/.wwebjs_auth`
5. Apagar sessao e ultimo recurso — fazer backup antes

### Checklist antes de deploy
- [ ] Nenhuma credencial no codigo
- [ ] `ADMIN_API_KEY` definido no Railway
- [ ] `/qr` protegido
- [ ] Testar `GET /api/health` apos deploy

---

## 5. Regras Gerais

### Nunca alterar sem ler DECISIONS.md
- Debounce de 12s em Mensagem.js
- Campo `status` no documento cliente
- Assinatura de `dispararCobrancaReal`
- Queries de listagem no dashboard

### Ao criar novo endpoint
- Seguir `docs/PATTERNS.md`
- Adicionar em `docs/API.md`
- Verificar se precisa de indice novo no Firestore

### Ao corrigir um bug
- Documentar em `docs/History.md` com antes/depois
- Se muda comportamento intencional: atualizar `docs/DECISIONS.md`
- Se resolve pendencia: marcar como concluido em `docs/PENDING.md`

### Assinatura critica — dispararCobrancaReal
```js
// Sempre o 6 parametro e ADMINISTRADORES
dispararCobrancaReal(client, firebaseDb, data, tipo, clientesFiltrados, ADMINISTRADORES)

// timers.js
(data, tipo, clientes) => dispararCobrancaReal(client, firebaseDb, data, tipo, clientes, ADMINISTRADORES)

// Mensagem.js — !cobrar
await dispararCobrancaReal(client, firebaseDb, data, args[2] || null, null, ADMINISTRADORES);
```