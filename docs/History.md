# Histórico de Desenvolvimento - JME-BOT

## Status Atual (2026-04-22)
- ✅ Sistema de cobrança automática FUNCIONANDO
- ✅ Cobrança D3 corrigida — `[object Object]` resolvido
- ✅ Relatório pós-cobrança chegando nos admins
- ✅ Frontend (Vercel) funcionando
- ✅ Backend (Railway) estável — sessão persistente via LocalAuth
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
- ✅ **Migração do Fly.io para Railway** — resolvido problema de memória (Railway com 512MB ainda é limite, mas funcionou após ajustes)
- ✅ **Timeout no WhatsApp messaging corrigido** — `comTimeout` helper implementado
- ✅ **Rotas modularizadas** — 12 arquivos separados para melhor manutenção
- ✅ **Package.json limpo** — 9 dependências e 1 devDependency removidos
- ✅ **Arquivos obsoletos deletados** — limpeza completa do projeto
- ⚠️ `buscarClientePorNome` ainda usa scan com limit(500)
- ⏳ Migration do campo `telefones` (array) pendente

## Stack
- **Backend**: Node.js + Express + whatsapp-web.js → **Railway** (anteriormente Fly.io)
- **Frontend**: React + Vite → Vercel
- **Banco**: Firebase Firestore
- **Auth WhatsApp**: LocalAuth em `/data/.wwebjs_auth`

## Decisões Técnicas
- **Sessão WhatsApp**: LocalAuth — sessão salva localmente em `/data/.wwebjs_auth`
- **Padrão de Status**: Campo `status` string no documento do cliente
- **Telefone**: Campo `telefones` é array — campo legado `telefone` (string) ainda existe em clientes antigos
- **Dashboard**: Usa campo `status` direto (O(n))
- **Debounce**: 12 segundos
- **dispararCobrancaReal**: assinatura `(client, firebaseDb, data, tipo, clientesFiltrados, ADMINISTRADORES)` — wrappers em `timers.js` e `routes/index.js` já passam todos os parâmetros corretamente
- **Timeout WhatsApp**: `comTimeout` helper com 30s para `sendMessage`, 15s para `getNumberId` e `isRegisteredUser`
- **Rotas**: Modularizadas em 12 arquivos separados por funcionalidade

---

## Sessão 2026-04-22 — Limpeza e Modularização

### Problemas identificados
1. Arquivos obsoletos acumulados no projeto (fluxos, middleware, services deletados)
2. `package.json` com dependências não utilizadas
3. `routes/index.js` com ~800 linhas, difícil de manter
4. Timeout no WhatsApp messaging causando travamentos (Runtime.callFunctionOn)

### Soluções implementadas

#### 1. Deleção de arquivos obsoletos
Arquivos deletados:
- `database/database.js` — substituído por `database/funcoes-firebase.js`
- `migrardados.js` — script de migração antigo
- `fluxos/cancelamento.js` — fluxo integrado no bot
- `fluxos/financeiro.js` — fluxo integrado no bot
- `fluxos/novoCliente.js` — fluxo integrado no bot
- `fluxos/promessa.js` — fluxo integrado no bot
- `fluxos/suporte.js` — fluxo integrado no bot
- `middleware/Mensagem.js` — fluxo integrado no bot
- `middleware/comprovante.js` — fluxo integrado no bot
- `services/FirestoreStore.js` — não usado (LocalAuth em vez de RemoteAuth)
- `services/audioService.js` — não utilizado
- `services/fluxoService.js` — fluxo integrado no bot
- `services/groqService.js` — não utilizado
- `services/midiaService.js` — não utilizado
- `stateManager.js` — estado integrado no bot

#### 2. Limpeza do package.json
Dependências removidas:
- `axios`, `body-parser`, `helmet`, `morgan`, `multer`, `node-cron`, `puppeteer`, `sharp`, `uuid`
- DevDependency removida: `nodemon`

Dependências finais: `cors`, `dotenv`, `express`, `firebase-admin`, `qrcode`, `whatsapp-web.js`

#### 3. Modularização de routes/index.js
Rotas divididas em 12 arquivos:
- `routes/bot.js` — horário, status, rede, ciclo-info, health, metrics, whatsapp
- `routes/clientes.js` — clientes, bases, histórico
- `routes/cobranca.js` — cobrança, promessas, carnê
- `routes/dashboard.js` — resumo-bases, caixa-hoje, alertas, fluxo-clientes
- `routes/logs.js` — logs de cobranças, comprovantes, bot, correções, stats
- `routes/chamados.js` — listagem, assumir, fechar chamados
- `routes/cancelamentos.js` — CRUD de cancelamentos
- `routes/instalacoes.js` — CRUD de instalações
- `routes/relatorios.js` — relatórios, inadimplentes, gráficos, exportar, planilha
- `routes/admin.js` — limpar-estado, SGP, clientes recentes, baixa retroativa
- `routes/boas-vindas.js` — envio de boas-vindas
- `routes/migracao.js` — migração de planilhas

#### 4. Correção de timeout no WhatsApp messaging
Adicionado helper `comTimeout` em `services/whatsappService.js`:
- `sendMessage`: 30s timeout
- `getNumberId`: 15s timeout
- `isRegisteredUser`: 15s timeout

Aplicado em:
- `enviarMensagemSegura` — todas as tentativas de envio
- `cobrancaService.js` — envio de formas de pagamento

### Status atual
- ✅ Projeto limpo sem arquivos obsoletos
- ✅ Package.json com apenas dependências necessárias
- ✅ Rotas organizadas em arquivos menores
- ✅ Timeout no WhatsApp corrigido
- ✅ Todas as verificações de sintaxe passaram

---

## Sessão 2026-04-17 — Correções de Cobrança e Mensagens

### Problemas identificados
1. Clientes com `status: 'promessa'` estavam sendo cobrados
2. Mensagens de cobrança muito genéricas (todos os tipos usavam o mesmo texto)
3. Chaves PIX falsas no `mensagemService.js`
4. Erro ao salvar sessão no Storage (arquivo zip não existia)

### Soluções implementadas

#### 1. Correção no `cobrancaService.js`
Adicionadas verificações para não cobrar clientes com:
- `status === 'promessa'`
- Promessa ativa na collection `promessas`

#### 2. Melhoria no `mensagemService.js`
Mensagens personalizadas por tipo de cobrança:
- `lembrete` → 🔔 Lembrete (D-1)
- `atraso` → ⚠️ Atraso (D+3)
- `atraso_final` → 🔴 Atraso Final (D+5)
- `reconquista` → 💙 Reativação (D+7)
- `reconquista_final` → 💔 Última Chance (D+10)

Adicionado branding `🤖 JMENET TELECOM` no topo de todas as mensagens.
Chaves PIX reais: `jmetelecomnt@gmail.com` e `+55 81 98750-0456`.

#### 3. Correção no `FirestoreStore.js`
Adicionada verificação `fs.existsSync(zipPath)` antes do upload para evitar erro `ENOENT`.

### Status atual
- ✅ Cobrança automática funcionando
- ✅ Clientes com promessa não são cobrados
- ✅ Mensagens personalizadas por tipo
- ✅ Chaves PIX corretas
- ✅ Sessão salva no Storage sem erros

---

## Sessão 2026-04-16 — Migração para Railway

### Problema original
Fly.io com 256MB de RAM era insuficiente para rodar o Chromium. O plano gratuito não permitia 1GB sem pagamento.

### Solução implementada
Migração para Railway com trial de $5 e 512MB de RAM.

### Desafios encontrados
1. **Permissão de escrita**: `DATA_PATH` ajustado para `/data` (Railway) ou `/tmp/data` (Render)
2. **Firebase Storage**: Service account precisou de papel `Storage Admin` no Google Cloud IAM
3. **CORS**: Necessário adicionar `https://*.vercel.app` para permitir previews do Vercel
4. **Chrome/Chromium**: Railway não tem Chromium pré-instalado; usado `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false` e instalado via build

### Configuração final Railway
- **Build Command**: `npm install && npx puppeteer browsers install chrome`
- **Variáveis críticas**: `NODE_ENV=production`, `FIREBASE_CREDENTIALS_JSON`, `ALLOWED_ORIGINS`
- **Porta**: Railway define automaticamente (8080)

### Status atual
- ✅ Backend rodando em `https://jme-bot-backend-production.up.railway.app`
- ✅ Frontend no Vercel apontando para Railway
- ✅ Sessão WhatsApp persistente via LocalAuth

---

## Sessão 2026-04-13/14 — RemoteAuth + Firebase Storage
Tentativa de usar RemoteAuth com Firebase Storage para persistir sessão. Abandonado em 2026-04-22 — migrado de volta para LocalAuth que é mais simples e estável no Railway.

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
| `index.js` | `index.js` | 2026-04-22 |
| `timers.js` | `middleware/timers.js` | 2026-04-13 |
| `routes/index.js` | `routes/index.js` | 2026-04-22 |
| `routes/bot.js` | `routes/bot.js` | 2026-04-22 |
| `routes/clientes.js` | `routes/clientes.js` | 2026-04-22 |
| `routes/cobranca.js` | `routes/cobranca.js` | 2026-04-22 |
| `routes/dashboard.js` | `routes/dashboard.js` | 2026-04-22 |
| `routes/logs.js` | `routes/logs.js` | 2026-04-22 |
| `routes/chamados.js` | `routes/chamados.js` | 2026-04-22 |
| `routes/cancelamentos.js` | `routes/cancelamentos.js` | 2026-04-22 |
| `routes/instalacoes.js` | `routes/instalacoes.js` | 2026-04-22 |
| `routes/relatorios.js` | `routes/relatorios.js` | 2026-04-22 |
| `routes/admin.js` | `routes/admin.js` | 2026-04-22 |
| `routes/boas-vindas.js` | `routes/boas-vindas.js` | 2026-04-22 |
| `routes/migracao.js` | `routes/migracao.js` | 2026-04-22 |
| `whatsappService.js` | `services/whatsappService.js` | 2026-04-22 |
| `cobrancaService.js` | `services/cobrancaService.js` | 2026-04-22 |
| `funcoes-firebase.js` | `database/funcoes-firebase.js` | 2026-04-10 |

---

## Pendências

1. **Migration `telefones`** — clientes importados da planilha têm só `telefone` (string)
2. **`buscarClientePorNome`** — ainda usa `limit(500)`
3. **Rate limiting na API**
4. **TTL em `historico_conversa`**
5. **Autenticação JWT no painel**

---

| Módulo | Status |
|--------|--------|
| Frontend (painel admin) | ✅ Funcional |
| Cobrança automática D1/D3 | ✅ Funcionando |
| Relatório pós-cobrança | ✅ Corrigido |
| Toggle do bot | ✅ Corrigido |
| SSE | ✅ Estabilizado |
| CORS dinâmico | ✅ Configurado |
| LocalAuth | ✅ Funcionando |
| Buscas Firestore | ✅ Sem scan total |
| Dashboard | ✅ Sem N+1 |
| Timeout WhatsApp | ✅ Corrigido |
| Rotas modularizadas | ✅ Concluído |
| Package.json limpo | ✅ Concluído |
| buscarClientePorNome | ⚠️ Parcial (limit 500) |
| Migration campo telefones | ⏳ Pendente |
| Rate limiting | ⏳ Pendente |
| TTL historico_conversa | ⏳ Pendente |
| JWT painel | ⏳ Pendente |

**Última atualização**: 2026-04-22

**Responsável**: Equipe JMENET