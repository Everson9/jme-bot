# RULES — JME-BOT

Regras consolidadas. Leia antes de mexer em fluxos, Firestore, segurança ou produção.

Para detalhes: skills correspondentes em `docs/skills/`.

---

## 1. Firestore — Custos e Performance

> Skill: `docs/skills/firestorecustosperformance.md`

### PROIBIDO
- `db.collection('clientes').get()` sem `where` + `limit` — scan total, trava o bot
- Loop `for...of` com `await doc(id).get()` para N clientes em série
- Buscar subcoleção `historico_pagamentos` inteira

### Correto
```js
// CERTO — 1 leitura, só o ciclo necessário
const hDoc = await db.collection('clientes').doc(id)
    .collection('historico_pagamentos').doc(cicloRef.docId).get();

// ERRADO — N leituras, todo o histórico
const hist = await db.collection('clientes').doc(id)
    .collection('historico_pagamentos').get();
```

### Quando usar status vs histórico
- Listagens/dashboard: campo `status` do documento (O(n)) — nunca buscar histórico
- Consulta individual: buscar 1 doc do ciclo atual
- Índice: criar no console Firebase e documentar em `docs/FIRESTORE_INDEXES.md`

---

## 2. Cobrança Automática

### Calendário de Disparo
```
Dia 10: D-1=9, D+3=13, D+5=15, D+7=17, D+10=20
Dia 20: D-1=19, D+3=23, D+5=25, D+7=27, D+10=30
Dia 30: D-1=29, D+3=3(+1m), D+5=5(+1m), D+7=7(+1m), D+10=10(+1m)
```

### Filtros aplicados
1. `status === 'cancelado'` → nunca cobrar
2. `status === 'promessa'` → nunca cobrar
3. promessa ativa na collection `promessas` → nunca cobrar
4. carnê pendente em `carne_solicitacoes` → nunca cobrar
5. histórico do ciclo = `pago` ou `isento` → não cobrar
6. já cobrado hoje (`log_cobrancas`) → não cobrar novamente

### Assinatura — `dispararCobrancaReal`
```js
// 6 parâmetros — ADMINISTRADORES SEMPRE como 6º
dispararCobrancaReal(client, firebaseDb, data, tipo, clientesFiltrados, ADMINISTRADORES)
```
- `data`: "10" | "20" | "30"
- `tipo`: "lembrete" | "atraso" | "atraso_final" | "reconquista" | "reconquista_final"
- `clientesFiltrados`: `null` = modo busca (busca do banco), `array` = modo lista (já filtrado)

### Wrappers corretos
```js
// timers.js
(data, tipo, clientes) => dispararCobrancaReal(client, firebaseDb, data, tipo, clientes, ADMINISTRADORES)

// routes/index.js (ctxRotas)
dispararCobrancaReal: (d, t) => dispararCobrancaReal(client, firebaseDb, d, t, null, ADMINISTRADORES)
```

---

## 3. WhatsApp Session

> ⚠️ Sessão persistente via RemoteAuth + Firebase Storage — NÃO é mais LocalAuth

- Pasta `.wwebjs_auth` é **temporária** (criada pelo RemoteAuth para extração do zip)
- Sessão real: `whatsapp_session/{sessionName}.zip` no Firebase Storage bucket `jmenet.appspot.com`
- `backupSyncIntervalMs`: 43200000 (12h)
- **Risco**: se servidor reiniciar antes do próximo sync, sessão no Storage pode estar desatualizada (até 12h)
- Em desconexão: `FirestoreStore.delete()` remove sessão do Storage e reinicia com QR

### Timeout em chamadas WhatsApp
```js
const { comTimeout } = require('./services/whatsappService');

await comTimeout(client.sendMessage(numero, mensagem), 30000, 'sendMessage');
await comTimeout(client.getNumberId(numero), 15000, 'getNumberId');
await comTimeout(client.isRegisteredUser(numero), 15000, 'isRegisteredUser');
```

---

## 4. Segurança e Segredos

> Skill: `docs/skills/seguranca-segredos-painel-admin.md`

### Variáveis críticas (Railway)
```
FIREBASE_CREDENTIALS_JSON — se vazio, banco não conecta
ADMIN_API_KEY — se vazio, API fica aberta
ALLOWED_ORIGINS — URLs separadas por vírgula
PORT — Railway define 8080 automaticamente
```

### Endpoint /qr — risco crítico
Qualquer pessoa pode assumir o número WhatsApp.
**Sempre proteger**: IP whitelist ou Basic Auth no proxy.

### Nunca commitar
- `.env`
- `firebasekey.json`
- Qualquer credencial no código

---

## 5. Produção e Deploy

> Skill: `docs/skills/runbook-producao-jme-bot.md`

### Triagem rápida
1. `GET /api/status` — bot online? `botAtivo`?
2. Se offline: `GET /qr` + checar logs
3. Se painel não atualiza: SSE `/api/status-stream` + CORS
4. Verificar variáveis de ambiente no Railway

### Bot offline
1. QR disponível: escanear
2. QR 404: cliente WhatsApp ainda não emitiu QR → ver logs
3. Reconecta em loop: sessão corrompida no Storage → deletar sessão manualmente
4. Matéria: `killZombieBrowser()` roda antes de toda inicialização

### Checklist antes de deploy
- [ ] Nenhuma credencial no código
- [ ] `ADMIN_API_KEY` definido no Railway
- [ ] `/qr` protegido
- [ ] Testar `GET /api/status` após deploy

---

## 6. Status do Cliente

Campo `status` é **string**: `'pago'` | `'pendente'` | `'isento'` | `'promessa'` | `'cancelado'`

Campo `telefones` é **array**; campo legado `telefone` (string) ainda existe em clientes antigos — tratar os dois em buscas.

---

**Última atualização**: 2026-04-29
