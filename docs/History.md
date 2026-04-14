# Histórico de Desenvolvimento - JME-BOT

## Status Atual (2026-04-14)
- ✅ Sistema de cobrança automática FUNCIONANDO
- ✅ Cobrança D3 corrigida — `[object Object]` resolvido
- ✅ Relatório pós-cobrança chegando nos admins
- ✅ Frontend (Vercel) funcionando
- ✅ Backend (Fly.io) estável — região: gru (São Paulo)
- ✅ SSE estabilizado (sem acúmulo de conexões)
- ✅ Botão toggle do bot corrigido (401 resolvido)
- ✅ Scans completos do Firestore eliminados (resolvido 2026-04-10)
- ✅ Menu duplicado no Mensagem.js corrigido
- ✅ !cobrar passando ADMINISTRADORES corretamente
- ✅ Fluxo de comprovante com nome não encontrado corrigido (loop infinito eliminado)
- ✅ Busca tolerante de nome para banco importado de planilha implementada
- ✅ Chrome zumbi + lock file resolvidos
- ✅ WhatsApp desconectado — reconexão automática em 30s
- ✅ UnhandledRejection capturado globalmente
- ✅ Retry automático no debounce para ProtocolError
- ✅ CORS dinâmico via env + secret configurado
- ✅ Puppeteer protocolTimeout = 240s
- ✅ RemoteAuth + Firebase Storage implementado — sessão salva e extraída com sucesso
- ⚠️ **PROBLEMA ABERTO**: `client.initialize()` trava após extract da sessão do Storage — `Execution context was destroyed` durante `inject` não é capturado pelo `catch`, processo fica pendurado indefinidamente sem pedir QR nem fazer retry
- ⚠️ `buscarClientePorNome` ainda usa scan com limit(500)
- ⏳ Migration do campo `telefones` (array) pendente

## Stack
- **Backend**: Node.js + Express + whatsapp-web.js → Fly.io
- **Frontend**: React + Vite → Vercel
- **Banco**: Firebase Firestore
- **Storage**: Firebase Storage (sessão WhatsApp em `whatsapp_session/RemoteAuth.zip`)
- **IA**: Groq (llama-3.3-70b-versatile)
- **Auth WhatsApp**: RemoteAuth com `services/FirestoreStore.js` customizado

## Decisões Técnicas
- **Sessão WhatsApp**: RemoteAuth + Firebase Storage — sobrescreve sempre o mesmo arquivo, sem acúmulo
- **IA Engine**: Groq API (fallback com retry progressivo)
- **Padrão de Status**: Campo `status` string no documento do cliente
- **Telefone**: Campo `telefones` é array — campo legado `telefone` (string) ainda existe em clientes antigos
- **Dashboard**: Usa campo `status` direto (O(n))
- **Debounce**: 12 segundos
- **dispararCobrancaReal**: assinatura `(client, firebaseDb, data, tipo, clientesFiltrados, ADMINISTRADORES)` — wrappers em `timers.js` e `routes/index.js` já passam todos os parâmetros corretamente

---

## Sessão 2026-04-13/14 — RemoteAuth + Firebase Storage

### Problema original
Bot não reconectava após restart do Fly.io. `LocalAuth` corrompida a cada crash abrupto do container. Exigia `rm -rf session` manual + novo QR.

### Solução implementada
Migração para `RemoteAuth` com store customizado (`services/FirestoreStore.js`) salvando sessão no Firebase Storage.

### Status atual da implementação
- ✅ `extract()` funcionando — `📥 Sessão extraída do Storage.` aparece nos logs
- ✅ `save()` funcionando — `☁️ Sessão salva no Storage com sucesso.` aparece após QR
- ❌ **Problema em aberto**: após o extract, `client.initialize()` trava com `Execution context was destroyed` durante o `inject` — o erro é capturado pelo `unhandledRejection` global mas **não** pelo `catch` do `inicializarWhatsApp`, então o processo fica pendurado sem fazer retry nem pedir QR

### Correção implementada mas não testada ainda
`Promise.race` com timeout de 3 minutos no `inicializarWhatsApp` para forçar retry quando travar:

```js
await Promise.race([
    client.initialize(),
    new Promise((_, reject) =>
        setTimeout(() => reject(new Error('initialize timeout após 3min')), 3 * 60 * 1000)
    )
]);
```

Com isso o fluxo esperado:
```
restart → extract sessão do Storage → initialize trava → timeout 3min
    → inicializarWhatsApp(2) → limpa Storage + Firestore → pede QR
    → escaneia QR → save no Storage → sistema online
```

### Arquivos alterados nessa sessão

| Arquivo | Caminho | Alteração |
|---|---|---|
| `index.js` | `index.js` | RemoteAuth, FirestoreStore, auto-recovery, Promise.race |
| `FirestoreStore.js` | `services/FirestoreStore.js` | Store customizado com Firebase Storage |
| `firebase.js` | `config/firebase.js` | Exporta `admin` além do `db` |
| `Dockerfile` | `Dockerfile` | `WORKDIR /app` (era `/opt/render/project/src`) |

---

## Sessão 2026-04-13 — Cobrança D3 com [object Object]

### Problema
Cobrança D3 e disparo manual retornavam `dia [object Object], tipo: [object Object]` — 0 clientes encontrados mesmo com pendentes.

### Causa raiz
**Bug 1 — `routes/index.js`**: `/api/cobrar/manual` chamava `ctx.dispararCobrancaReal(client, firebaseDb, data, tipo)` mas `ctx.dispararCobrancaReal` já é wrapper com `client` e `firebaseDb` internos. Resultado: `client` virava `data`, `firebaseDb` virava `tipo`.

```js
// ANTES — errado
const total = await ctx.dispararCobrancaReal(client, firebaseDb, data, tipo || null);
// DEPOIS — correto
const total = await ctx.dispararCobrancaReal(data, tipo || null);
```

**Bug 2 — `timers.js`**: callback não passava `ADMINISTRADORES`.

```js
// ANTES
(data, tipo, clientes) => dispararCobrancaReal(client, firebaseDb, data, tipo, clientes)
// DEPOIS
(data, tipo, clientes) => dispararCobrancaReal(client, firebaseDb, data, tipo, clientes, ADMINISTRADORES)
```

---

## Sessão 2026-04-13 — CORS + protocolTimeout

- `fly secrets set ALLOWED_ORIGINS=https://jme-bot.vercel.app`
- `protocolTimeout` aumentado de 120000 para 240000

---

## Sessão 2026-04-12 — Retry no debounce (ProtocolError)

Retry de 5s no debounce do `Mensagem.js` para `ProtocolError` — mensagem não é mais perdida silenciosamente.

---

## Sessão 2026-04-12 — Estabilidade WhatsApp + Fly.io

- `killZombieBrowser()` antes de cada inicialização
- Reconexão automática no `disconnected` (30s)
- `unhandledRejection` global
- `[[restart]] policy=always` no `fly.toml`
- Removido `--single-process` e `--max-old-space-size=256`

---

## Sessão 2026-04-11

- `!cobrar` sem `ADMINISTRADORES` — corrigido em `Mensagem.js`
- Loop infinito no fluxo de comprovante — refatoração completa do `comprovante.js`
- Busca tolerante de nome (`buscarNomeToleranteComprovante`)

---

## Sessão 2026-04-10 — Performance Firestore

5 scans completos por mensagem causavam ~9min de delay. Todas as funções de busca migradas para queries indexadas. N+1 no dashboard corrigido.

---

## Arquivos e Localizações

| Arquivo | Caminho | Última atualização |
|---|---|---|
| `index.js` | `index.js` | 2026-04-14 |
| `FirestoreStore.js` | `services/FirestoreStore.js` | 2026-04-14 |
| `firebase.js` | `config/firebase.js` | 2026-04-13 |
| `Dockerfile` | `Dockerfile` | 2026-04-13 |
| `timers.js` | `middleware/timers.js` | 2026-04-13 |
| `routes/index.js` | `routes/index.js` | 2026-04-13 |
| `Mensagem.js` | `middleware/Mensagem.js` | 2026-04-12 |
| `comprovante.js` | `middleware/comprovante.js` | 2026-04-11 |
| `funcoes-firebase.js` | `database/funcoes-firebase.js` | 2026-04-10 |
| `fluxoService.js` | `services/fluxoService.js` | 2026-04-10 |

---

## Pendências

1. **CRÍTICO**: `client.initialize()` trava após extract — `Promise.race` com timeout implementado mas não testado. Próximo passo: fazer restart e verificar se timeout dispara após 3min e aciona `inicializarWhatsApp(2)`
2. **Migration `telefones`** — clientes importados da planilha têm só `telefone` (string)
3. **`buscarClientePorNome`** — ainda usa `limit(500)`
4. **Rate limiting na API**
5. **TTL em `historico_conversa`**
6. **Autenticação JWT no painel**
7. **Health check Fly.io** — reativar com `grace_period = "180s"`

---

## Status dos Módulos

| Módulo | Status |
|--------|--------|
| Frontend (painel admin) | ✅ Funcional |
| Cobrança automática D1/D3 | ✅ Funcionando |
| Relatório pós-cobrança | ✅ Corrigido |
| Toggle do bot | ✅ Corrigido |
| SSE | ✅ Estabilizado |
| CORS dinâmico | ✅ Configurado |
| RemoteAuth — save/extract | ✅ Funcionando |
| RemoteAuth — initialize após extract | ⚠️ Trava, Promise.race implementado não testado |
| Buscas Firestore | ✅ Sem scan total |
| Dashboard | ✅ Sem N+1 |
| Comprovante — fluxo de nome | ✅ Sem loop |
| buscarClientePorNome | ⚠️ Parcial (limit 500) |
| Migration campo telefones | ⏳ Pendente |
| Rate limiting | ⏳ Pendente |
| TTL historico_conversa | ⏳ Pendente |
| JWT painel | ⏳ Pendente |
| Health check Fly.io | ⏳ Pendente |

---

**Última atualização**: 2026-04-14
**Responsável**: Equipe JMENET