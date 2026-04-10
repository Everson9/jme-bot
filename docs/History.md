# Histórico de Desenvolvimento - JME-BOT

## Status Atual (2026-04-10)
- ✅ Sistema de cobrança automática FUNCIONANDO
- ✅ Frontend (Vercel) funcionando
- ✅ Backend (Fly.io) estável — região: gru (São Paulo)
- ✅ Relatório pós-cobrança enviado para admins via WhatsApp
- ✅ SSE estabilizado (sem acúmulo de conexões)
- ✅ Botão toggle do bot corrigido (401 resolvido)
- ⚠️ Sistema com lentidão — causa ainda não identificada (possível regressão em otimizações do Firestore)

## Stack
- **Backend**: Node.js + Express + whatsapp-web.js → Fly.io (gru)
- **Frontend**: React + Vite → Vercel
- **Banco**: Firebase Firestore
- **IA**: Groq (llama-3.3-70b-versatile)
- **Auth WhatsApp**: LocalAuth persistido em `/data/.wwebjs_auth` (volume Fly.io)

## Decisões Técnicas
- **IA Engine**: Groq API (fallback com retry progressivo)
- **Regras de Projeto**: `.cursor/rules/SKILL.md` para guiar a IA
- **Padrão de Status**: Campo `status` como string ('pago', 'pendente', 'isento') no histórico de pagamentos
- **Telefone**: Campo `telefones` é array — sempre normalizar para string antes de usar

---

## Correções Aplicadas — Sessão 2026-04-09 / 2026-04-10

### 1. Sistema de Status e Frontend
✅ Inconsistência no campo de status (`pago: true` → `status: 'pago'`)
✅ Frontend mostrava status incorretos
✅ Interface "Ciclo atual" vs "Mês corrente" corrigida
✅ ADMIN_PHONE sem 9º dígito corrigido

### 2. Cobrança Automática — 3 bugs encadeados

#### Bug 1 — adminService.js
`verificarCobrancasAutomaticas` recebia `dispararCobrancaReal` como wrapper mas chamava passando `client, firebaseDb` extras, invertendo todos os parâmetros.

```js
// ERRADO
await dispararCobrancaReal(client, firebaseDb, cobranca.dataVenc, cobranca.tipo, cobranca.clientes);

// CORRETO
await dispararCobrancaReal(cobranca.dataVenc, cobranca.tipo, cobranca.clientes, ADMINISTRADORES);
```

#### Bug 2 — middleware/timers.js
Wrapper não repassava `clientes` nem `ADMINISTRADORES`.

```js
// ERRADO
(data, tipo) => dispararCobrancaReal(client, firebaseDb, data, tipo)

// CORRETO
(data, tipo, clientes) => dispararCobrancaReal(client, firebaseDb, data, tipo, clientes, ADMINISTRADORES)
```

#### Bug 3 — cobrancaService.js
Campo `telefone` (string) vs `telefones` (array) — todos os clientes eram descartados.

```js
// CORRETO
const tel = Array.isArray(cliente.telefones)
    ? cliente.telefones[0]
    : cliente.telefone;
if (!tel) continue;
clientesValidos.push({ ...cliente, telefone: tel });
```

### 3. Relatório pós-cobrança
`dispararCobrancaReal` passou a aceitar `ADMINISTRADORES` como 6º parâmetro e envia relatório ao final:
```
📊 COBRANÇA CONCLUÍDA
✅ Enviadas: X
❌ Falhas: Y
👥 Total: Z
⚠️ Não entregues: [lista]
```

### 4. Puppeteer — crash loop no Fly.io
`ProtocolError: Runtime.callFunctionOn timed out` derrubava o processo.

**Correção no client:**
```js
puppeteer: {
    headless: true,
    protocolTimeout: 120000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-zygote']
}
```

**Retry automático:**
```js
async function inicializarWhatsApp(tentativa = 1) {
    try {
        await client.initialize();
    } catch (err) {
        const delay = Math.min(tentativa * 30000, 300000);
        setTimeout(() => inicializarWhatsApp(tentativa + 1), delay);
    }
}
```

**Captura global de erros (evita crash por `auth timeout`):**
```js
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ UnhandledRejection capturado:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
    console.error('⚠️ UncaughtException capturado:', err.message);
});
```

### 5. PayloadTooLargeError
```js
// ANTES
app.use(express.json());

// DEPOIS
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
```

### 6. SSE — acúmulo de conexões
`onerror` disparava múltiplas reconexões simultâneas.

```js
let _reconectando = false;

_es.onerror = () => {
    if (_reconectando) return;
    _reconectando = true;
    _es?.close(); _es = null;
    setTimeout(() => { _reconectando = false; getSSE(); }, 5000);
};
```

### 7. Toggle do bot — 401
`toggleBot` no `App.jsx` não passava o header de autenticação.

```js
// ERRADO
await fetch(API + "/api/bot/toggle", { method: "POST" });

// CORRETO
await fetch(API + "/api/bot/toggle", { method: "POST", headers: authHeaders() });
```

---

## Arquitetura da Cobrança Automática

```
timers.js (a cada 2h)
    ↓
verificarCobrancasAutomaticas (adminService.js)
    ↓ busca clientes por dia_vencimento
    ↓ verifica histórico do ciclo (getCicloCobranca)
    ↓ filtra: cancelados, carnê pendente, já pagaram
    ↓
perguntarAdmins → votação via WhatsApp (!sim / !nao) — timeout: 60min
    ↓ aprovado
dispararCobrancaReal (cobrancaService.js)
    ↓ normaliza telefone (array → string)
    ↓ tenta com/sem 9º dígito
    ↓ envia mensagem + PIX (setTimeout 1s)
    ↓ registra log_cobrancas
    ↓ delay 2s entre clientes
    ↓
Relatório para admins (enviadas / falhas / não entregues)
```

## Calendário de Cobranças

| Vencimento | Lembrete | Atraso | Atraso Final | Reconquista | Reconquista Final |
|------------|----------|--------|--------------|-------------|-------------------|
| Dia 10 | Dia 9 | Dia 13 | Dia 15 | Dia 17 | Dia 20 |
| Dia 20 | Dia 19 | Dia 23 | Dia 25 | Dia 27 | Dia 30 |
| Dia 30 | Dia 29 | Dia 3+1m | Dia 5+1m | Dia 7+1m | Dia 10+1m |

**Recuperação de fim de semana**: Segunda-feira verifica disparos perdidos de sábado e domingo.

---

## Assinaturas de Funções Críticas

```js
// cobrancaService.js
async function dispararCobrancaReal(client, firebaseDb, data, tipo = null, clientesFiltrados = null, ADMINISTRADORES = [])

// adminService.js — chama assim (sem client/firebaseDb, são do closure do wrapper)
await dispararCobrancaReal(cobranca.dataVenc, cobranca.tipo, cobranca.clientes, ADMINISTRADORES)

// timers.js — wrapper correto
(data, tipo, clientes) => dispararCobrancaReal(client, firebaseDb, data, tipo, clientes, ADMINISTRADORES)

// index.js — wrappers corretos
dispararCobrancaReal: (d, t) => dispararCobrancaReal(client, firebaseDb, d, t, null, ADMINISTRADORES)
```

---

## Arquivos Modificados na Sessão

| Arquivo | Mudanças |
|---------|---------|
| `services/cobrancaService.js` | Bug telefone, relatório final, ADMINISTRADORES como parâmetro |
| `services/adminService.js` | Chamada do wrapper corrigida |
| `middleware/timers.js` | Wrapper corrigido (clientes + ADMINISTRADORES) |
| `index.js` | protocolTimeout, retry, unhandledRejection, PayloadTooLarge, ADMINISTRADORES nos wrappers |
| `frontend/src/hooks/useSSEData.js` | Fix reconexão SSE (_reconectando flag) |
| `frontend/src/App.jsx` | authHeaders() no toggleBot |

---

## Status dos Módulos

| Módulo | Status |
|--------|--------|
| Frontend (painel admin) | ✅ Funcional |
| Status dos clientes | ⏳ pendente verificar |
| ADMIN_PHONE | ✅ Funcional |
| Cobrança automática | ✅ Funcionando |
| Relatório pós-cobrança | ✅ Implementado |
| Toggle do bot | ✅ Corrigido |
| SSE | ✅ Estabilizado |
| Puppeteer/WhatsApp | ✅ Estável (retry automático) |
| Performance/Lentidão | ⚠️ Investigar |
| Rate limiting na API | ⏳ Pendente |
| TTL em historico_conversa | ⏳ Pendente |
| Autenticação JWT no painel | ⏳ Pendente |
| Mensagem.js — ADMINISTRADORES | ⏳ Pendente verificar |
| routes/index.js — ADMINISTRADORES | ⏳ Pendente verificar |

---

## Pendências / Próximos Passos

1. **URGENTE**: Identificar causa da lentidão (rodar `git diff HEAD~1 --name-only`)
2. Verificar `middleware/Mensagem.js` linha 253 — passar `ADMINISTRADORES` no dispararCobrancaReal
3. Verificar `routes/index.js` — confirmar ADMINISTRADORES repassado
4. Implementar rate limiting na API
5. Implementar TTL em `historico_conversa`
6. Autenticação JWT no painel admin

---

**Última atualização**: 2026-04-10
**Responsável**: Equipe JMENET