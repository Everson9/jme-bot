# Histórico de Desenvolvimento - JME-BOT

## Status Atual (2026-04-12)
- ✅ Sistema de cobrança automática FUNCIONANDO
- ✅ Frontend (Vercel) funcionando
- ✅ Backend (Fly.io) estável — região: gru (São Paulo)
- ✅ Relatório pós-cobrança enviado para admins via WhatsApp
- ✅ SSE estabilizado (sem acúmulo de conexões)
- ✅ Botão toggle do bot corrigido (401 resolvido)
- ✅ Scans completos do Firestore eliminados (causa raiz da lentidão — resolvido 2026-04-10)
- ✅ Menu duplicado no Mensagem.js corrigido
- ✅ !cobrar passando ADMINISTRADORES corretamente (relatório pós-cobrança funcionando)
- ✅ Fluxo de comprovante com nome não encontrado corrigido (loop infinito eliminado)
- ✅ Busca tolerante de nome para banco importado de planilha implementada
- ✅ Chrome zumbi + lock file resolvidos — bot reconecta sozinho após crash/restart
- ✅ WhatsApp desconectado — reconexão automática em 30s implementada
- ✅ UnhandledRejection capturado globalmente — processo não cai mais por auth timeout
- ⚠️ `buscarClientePorNome` ainda usa scan com limit(500) — solução definitiva: campo `nome_normalizado` + índice Firestore
- ⏳ Migration do campo `telefones` (array) pendente — clientes antigos têm só `telefone` (string)

## Stack
- **Backend**: Node.js + Express + whatsapp-web.js → Fly.io
- **Frontend**: React + Vite → Vercel
- **Banco**: Firebase Firestore
- **IA**: Groq (llama-3.3-70b-versatile)
- **Auth WhatsApp**: LocalAuth persistido em `/data/.wwebjs_auth` (volume Fly.io)

## Decisões Técnicas
- **IA Engine**: Groq API (fallback com retry progressivo)
- **Padrão de Status**: Campo `status` como string ('pago', 'pendente', 'isento', 'promessa', 'cancelado') no documento do cliente — mantido atualizado por todas as operações de baixa/reverter
- **Telefone**: Campo `telefones` é array — sempre normalizar para string antes de usar. Campo legado `telefone` (string) ainda existe em clientes antigos — todas as buscas tratam os dois
- **Dashboard**: Usa campo `status` direto (O(n)) em vez de buscar histórico de cada cliente (O(3n))
- **Debounce**: 12 segundos — acumula mensagens consecutivas do mesmo remetente antes de processar. Timer reinicia a cada nova mensagem. Intencional para UX.

---

## Sessão 2026-04-12 — Estabilidade do WhatsApp e Deploy no Fly.io

### Problema reportado
Bot parou de funcionar do nada. Logs mostravam loop infinito de erros:
```
❌ Erro ao inicializar WhatsApp (tentativa 1): Runtime.callFunctionOn timed out.
❌ Erro ao inicializar WhatsApp (tentativa 2): The browser is already running for /data/.wwebjs_auth/session.
```

### Causa raiz
1. **Tentativa 1**: Chrome demorou mais que o `protocolTimeout` padrão (~30s) para responder — provavelmente restart de infraestrutura do Fly.io que matou o container abruptamente.
2. **Tentativas 2+**: O processo Chrome ficou como zumbi (não morreu com o timeout) e o lock file `SingletonLock` ficou gravado no volume persistente `/data`. Cada tentativa de reconexão encontrava o lock e falhava imediatamente.

### Correções aplicadas em `index.js`

#### 1. `killZombieBrowser()` — limpeza antes de cada inicialização
```js
async function killZombieBrowser() {
    const patterns = ['.wwebjs_auth', 'chromium-browser', '\\.local-chromium'];
    for (const p of patterns) {
        try { execSync(`pkill -f "${p}" 2>/dev/null || true`); } catch (_) {}
    }
    const lockPath = path.join(DATA_PATH, '.wwebjs_auth', 'session', 'SingletonLock');
    try {
        if (fs.existsSync(lockPath)) { fs.unlinkSync(lockPath); console.log('🧹 Lock file removido.'); }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 3000));
}
```

Chamado **sempre** na tentativa 1 também — cobre restart abrupto do container com lock file sujo no volume.

#### 2. Reconexão automática no evento `disconnected`
```js
client.on('disconnected', async (reason) => {
    console.log('WhatsApp desconectado:', reason);
    botIniciadoEm = null;
    sseService.broadcast();
    console.log('🔄 Reconectando em 30s...');
    await new Promise(r => setTimeout(r, 30000));
    inicializarWhatsApp();
});
```

#### 3. `unhandledRejection` global — processo não cai mais
```js
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ UnhandledRejection capturado:', reason);
});
```

Resolve o crash por `auth timeout` quando o QR expira sem ser escaneado.

#### 4. `auth_failure` handler
```js
client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação WhatsApp:', msg);
});
```

#### 5. Removido `--single-process` e `--max-old-space-size=256`
Essas flags causavam falha silenciosa: o Chrome conectava no celular mas os eventos (`ready`, etc.) nunca disparavam para o Node.js. Com 1GB de RAM no Fly não são necessárias.

### Correções no `fly.toml`

#### Restart automático adicionado
```toml
[[restart]]
  policy = "always"
  max_retries = 10
```

Garante que qualquer crash ou restart do Fly sobe o container automaticamente.

**Nota**: sintaxe `[[restart]]` (duplo colchete) — a sintaxe `[restart]` (colchete simples) causa erro de validação na versão atual do flyctl.

### Problemas de deploy encontrados e resolvidos

| Problema | Causa | Solução |
|---|---|---|
| `npx fly` falhava no Windows | Wrapper npm usa sintaxe Unix (`DEBUG=no`) | Instalar flyctl nativo via PowerShell |
| `flyctl login` não reconhecido | Comando mudou na versão nova | Usar `flyctl auth login` |
| `[restart]` inválido no toml | flyctl espera array | Trocar para `[[restart]]` |
| Health check derrubando máquina | grace_period curto demais para Chrome subir | Removido por ora (Chrome demora 2-3min para inicializar) |
| QR expirou → processo caiu | `auth timeout` sem catch | `unhandledRejection` global |
| `--single-process` → sem eventos | Flag incompatível com eventos do Node | Removida |

### Ciclo de resiliência completo após correções

```
Crash/restart do container
    ↓
[[restart]] policy=always → Fly sobe container
    ↓
killZombieBrowser() → limpa lock file + processos zumbi
    ↓
client.initialize() → conecta com sessão salva no volume
    ↓ (se WhatsApp desconectar remotamente)
client.on('disconnected') → aguarda 30s → inicializarWhatsApp()
    ↓ (se QR expirar sem escanear)
unhandledRejection → loga, não cai → retry com backoff
```

---

## Sessão 2026-04-11 — Correções adicionais

### Bug 1 — !cobrar sem ADMINISTRADORES (relatório não chegava)
`Mensagem.js` chamava `dispararCobrancaReal` sem passar `ADMINISTRADORES`, então o relatório pós-cobrança nunca era enviado via WhatsApp quando admin usava `!cobrar` manualmente.

```js
// ANTES
const total = await dispararCobrancaReal(client, firebaseDb, data, args[2] || null);
client.sendMessage(deQuem, `✅ Cobrança dia ${data}: ${total} mensagens`); // redundante

// DEPOIS
await dispararCobrancaReal(client, firebaseDb, data, args[2] || null, null, ADMINISTRADORES);
// relatório completo já é enviado internamente pelo dispararCobrancaReal
```

### Bug 2 — Loop infinito no fluxo de comprovante com nome não encontrado
`confirmarNomeComprovante` em `comprovante.js` não atualizava `tentativasNome` quando não achava o cliente, então repetia a mesma mensagem "Tive um erro ao validar seu nome" infinitamente a cada nova digitação.

**Correção**: refatoração completa do `comprovante.js` com:
- Gerenciamento explícito de tentativas via `state.getDados`
- Novo fluxo com etapas: `nome` → `cpf` (desambiguação de múltiplos) → atendente
- Busca tolerante para nomes de banco importado de planilha
- Menu de opções quando não acha na 1ª vez: "1️⃣ Tentar outro nome / 2️⃣ Chamar atendente"
- Router central `confirmarNomeComprovanteRouter` que decide o caminho baseado na etapa atual

### Bug 3 — Busca de nome intolerante a nomes parciais/planilha
**Correção**: `buscarNomeToleranteComprovante` em `comprovante.js` — quando `buscarClientePorNome` retorna vazio, tenta automaticamente:
1. Só o primeiro token ("Viviane")
2. Primeiro + último token ("Viviane Santos")

Filtra falsos positivos: só retorna se pelo menos metade dos tokens digitados existem no nome do cliente.

---

## Sessão 2026-04-10 — Diagnóstico e Correção de Performance

### Problema reportado
Cliente digitou mensagem às 17:51, foi respondida às 18:00 (~9 minutos de delay). Menu apareceu duplicado.

### Causa raiz identificada
5 scans completos da coleção `clientes` em sequência por mensagem recebida. Com Railway → Firestore, cada scan levava 3–8s. Mais 12s de debounce = latência total de ~25–30s no pior caso.

### Correções aplicadas

#### Bug 1 — Scans completos no Firestore
Todas as funções de busca em `funcoes-firebase.js` faziam `db.collection('clientes').get()` sem filtro.

```js
// ANTES — scan de TODOS os clientes
const snapshot = await db.collection('clientes').get();

// DEPOIS — query indexada
const snap = await db.collection('clientes')
    .where('telefones', 'array-contains', v).limit(1).get();
```

Funções corrigidas: `buscarStatusCliente`, `buscarClientePorCPF`, `buscarClientePorTelefone`, `buscarClientePorNome` (parcial — limit 500), `buscarPromessa` (limit 100).

#### Bug 2 — Scan redundante em fluxoService.js
Após identificar cliente por telefone, o código fazia `buscarClientePorNome` de novo para obter o objeto completo. Removido — `buscarStatusCliente` já retorna `id` junto.

#### Bug 3 — Menu duplicado no Mensagem.js
Nos blocos `fluxoAtivo === 'menu'` e `fluxoAtivo === 'menu_financeiro'`, quando o texto não era reconhecido, o código chamava `state.encerrarFluxo` + `state.iniciar` antes de reenviar o menu, causando dois envios. Corrigido: texto não reconhecido apenas reenvia sem alterar o estado.

#### Bug 4 — N+1 nos endpoints do painel (routes/index.js)
Quatro endpoints faziam loop individual de histórico por cliente. Todos corrigidos para usar campo `status` direto do documento (O(n) em vez de O(3n)).

---

## Arquivos Entregues e Localizações

| Arquivo entregue | Caminho no projeto | Última atualização |
|---|---|---|
| `index.js` | `index.js` | 2026-04-12 |
| `Mensagem.js` | `middleware/Mensagem.js` | 2026-04-11 |
| `comprovante.js` | `middleware/comprovante.js` | 2026-04-11 |
| `funcoes-firebase.js` | `database/funcoes-firebase.js` | 2026-04-10 |
| `fluxoService.js` | `services/fluxoService.js` | 2026-04-10 |
| `routes-index.js` | `routes/index.js` | 2026-04-10 |

---

## Pendências / Próximos Passos

1. **Migration `telefones` (array)** — clientes importados da planilha têm só campo `telefone` (string). As buscas por `array-contains` funcionam mas sempre caem no fallback. Script de migration: para cada cliente sem `telefones`, criar array com o valor de `telefone`. ~10 linhas, alto impacto.

2. **Solução definitiva para `buscarClientePorNome`** — salvar campo `nome_normalizado` em cada documento cliente e criar índice `orderBy('nome_normalizado')` no Firestore. Enquanto isso, `limit(500)` está funcional mas não escala bem acima de 500 clientes.

3. **Rate limiting na API** — não implementado.

4. **TTL em `historico_conversa`** — cresce indefinidamente. `dbSalvarHistorico` faz uma query extra a cada save para limpar. Necessário TTL nativo do Firestore ou job periódico.

5. **Autenticação JWT no painel** — ainda só API key no bundle (não é segredo real).

6. **Health check no Fly.io** — removido temporariamente. Reativar com `grace_period = "180s"` quando o bot estiver estável por alguns dias.

---

## Status dos Módulos

| Módulo | Status |
|--------|--------|
| Frontend (painel admin) | ✅ Funcional |
| Cobrança automática | ✅ Funcionando |
| Relatório pós-cobrança (!cobrar) | ✅ Corrigido (2026-04-11) |
| Toggle do bot | ✅ Corrigido |
| SSE | ✅ Estabilizado |
| Puppeteer/WhatsApp — crash loop | ✅ Resolvido (2026-04-12) |
| Puppeteer/WhatsApp — lock file zumbi | ✅ Resolvido (2026-04-12) |
| WhatsApp — reconexão automática | ✅ Implementado (2026-04-12) |
| Buscas Firestore (bot) | ✅ Corrigido (sem scan total) |
| Dashboard (painel) | ✅ Corrigido (sem N+1) |
| Comprovante — fluxo de nome | ✅ Corrigido (sem loop, busca tolerante) |
| buscarClientePorNome | ⚠️ Parcial (limit 500, sem índice) |
| Migration campo telefones | ⏳ Pendente |
| Rate limiting na API | ⏳ Pendente |
| TTL em historico_conversa | ⏳ Pendente |
| Autenticação JWT no painel | ⏳ Pendente |
| Health check Fly.io | ⏳ Reativar após estabilização |

---

## Correções Anteriores (Sessão 2026-04-09)

### 1. Sistema de Status e Frontend
✅ Inconsistência no campo de status (`pago: true` → `status: 'pago'`)
✅ Frontend mostrava status incorretos
✅ Interface "Ciclo atual" vs "Mês corrente" corrigida
✅ ADMIN_PHONE sem 9º dígito corrigido

### 2. Cobrança Automática — 3 bugs encadeados
✅ `adminService.js` — parâmetros invertidos no wrapper
✅ `timers.js` — wrapper não repassava `clientes` nem `ADMINISTRADORES`
✅ `cobrancaService.js` — campo `telefone` (string) vs `telefones` (array) descartava todos os clientes

### 3. Puppeteer — crash loop
`protocolTimeout: 120000` + retry automático com backoff progressivo.

### 4. PayloadTooLargeError
```js
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
```

### 5. SSE — acúmulo de conexões
Flag `_reconectando` no frontend evita múltiplas reconexões simultâneas.

### 6. Toggle do bot — 401
`toggleBot` no `App.jsx` não passava o header de autenticação.

---

**Última atualização**: 2026-04-12
**Responsável**: Equipe JMENET