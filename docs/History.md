# Histórico de Desenvolvimento - JME-BOT

## Status Atual (2026-04-11)
- ✅ Sistema de cobrança automática FUNCIONANDO
- ✅ Frontend (Vercel) funcionando
- ✅ Backend (Railway) estável — região: gru (São Paulo)
- ✅ Relatório pós-cobrança enviado para admins via WhatsApp
- ✅ SSE estabilizado (sem acúmulo de conexões)
- ✅ Botão toggle do bot corrigido (401 resolvido)
- ✅ Scans completos do Firestore eliminados (causa raiz da lentidão — resolvido 2026-04-10)
- ✅ Menu duplicado no Mensagem.js corrigido
- ✅ !cobrar passando ADMINISTRADORES corretamente (relatório pós-cobrança funcionando)
- ✅ Fluxo de comprovante com nome não encontrado corrigido (loop infinito eliminado)
- ✅ Busca tolerante de nome para banco importado de planilha implementada
- ⚠️ `buscarClientePorNome` ainda usa scan com limit(500) — solução definitiva: campo `nome_normalizado` + índice Firestore
- ⏳ Migration do campo `telefones` (array) pendente — clientes antigos têm só `telefone` (string)

## Stack
- **Backend**: Node.js + Express + whatsapp-web.js → Railway
- **Frontend**: React + Vite → Vercel
- **Banco**: Firebase Firestore
- **IA**: Groq (llama-3.3-70b-versatile)
- **Auth WhatsApp**: LocalAuth persistido em `/data/.wwebjs_auth` (volume Railway)

## Decisões Técnicas
- **IA Engine**: Groq API (fallback com retry progressivo)
- **Padrão de Status**: Campo `status` como string ('pago', 'pendente', 'isento', 'promessa', 'cancelado') no documento do cliente — mantido atualizado por todas as operações de baixa/reverter
- **Telefone**: Campo `telefones` é array — sempre normalizar para string antes de usar. Campo legado `telefone` (string) ainda existe em clientes antigos — todas as buscas tratam os dois
- **Dashboard**: Usa campo `status` direto (O(n)) em vez de buscar histórico de cada cliente (O(3n))
- **Debounce**: 12 segundos — acumula mensagens consecutivas do mesmo remetente antes de processar. Timer reinicia a cada nova mensagem. Intencional para UX.

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

**Causa raiz**: a função era chamada dentro de `try/catch` no `Mensagem.js` e o catch exibia a mensagem genérica de erro. `buscarClientePorNome` lançava exceção pela query de range, o catch capturava e respondia sempre a mesma coisa.

**Correção**: refatoração completa do `comprovante.js` com:
- Gerenciamento explícito de tentativas via `state.getDados`
- Novo fluxo com etapas: `nome` → `cpf` (desambiguação de múltiplos) → atendente
- Busca tolerante para nomes de banco importado de planilha
- Menu de opções quando não acha na 1ª vez: "1️⃣ Tentar outro nome / 2️⃣ Chamar atendente"
- Router central `confirmarNomeComprovanteRouter` que decide o caminho baseado na etapa atual

### Bug 3 — Busca de nome intolerante a nomes parciais/planilha
Banco importado de planilha pode ter só primeiro nome, ou nome sem conectores (da/de/do). Cliente que digita "Viviane Rodrigues dos Santos" não achava "Viviane Santos" cadastrado.

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
Quatro endpoints faziam loop individual de histórico por cliente:
- `GET /api/bases` — N+1 histórico por cliente
- `GET /api/dashboard/resumo-bases` — duas queries idênticas + N históricos
- `GET /api/dashboard/fluxo-clientes` — loop serial `for...of await` por cliente
- `GET /api/relatorio/inadimplentes` — scan total + histórico individual

Todos corrigidos para usar campo `status` direto do documento (O(n) em vez de O(3n)).

---

## Arquivos Entregues e Localizações

| Arquivo entregue | Caminho no projeto | Última atualização |
|---|---|---|
| `Mensagem.js` | `middleware/Mensagem.js` | 2026-04-11 |
| `comprovante.js` | `middleware/comprovante.js` | 2026-04-11 |
| `funcoes-firebase.js` | `database/funcoes-firebase.js` | 2026-04-10 |
| `fluxoService.js` | `services/fluxoService.js` | 2026-04-10 |
| `routes-index.js` | `routes/index.js` | 2026-04-10 |

---

## Mapa dos Arquivos Vistos

### `middleware/Mensagem.js`
Roteador principal de mensagens WhatsApp.
- `MENU_PRINCIPAL` e `MENU_FINANCEIRO` — constantes de string no topo
- `configurarMensagens(client, ctx, handlers)` — função única exportada, inicializa todos os handlers
- `fotosPendentes: Map` — armazena mídia recebida aguardando contexto de fluxo
- `debounceMensagens: Map` — debounce de **12 segundos** que acumula mensagens do mesmo remetente. Timer reinicia a cada nova mensagem. Intencional para UX.
- `processarTexto(deQuem, texto, midias)` — função interna que roteia para o fluxo correto baseado em `state.getFluxo`
- Handler `message_create` — detecta quando admin responde no chat do cliente, ativa `atendimentoHumano`, inicia timer de 2h
- Handler `message` — ponto de entrada de todas as mensagens dos clientes. Processa mídia imediatamente (comprovante), depois entra no debounce
- Fluxos tratados: `consulta_situacao`, `aguardando_nome_comprovante`, `suporte`, `financeiro`, `promessa`, `cancelamento`, `novoCliente`, `menu_financeiro`, `menu`
- Comandos admin: `!sim/!nao/!cobrar-sim/!cobrar-nao`, `!bot on/off`, `!status`, `!rede`, `!cobrar 10|20|30`, `!assumir`, `!liberar`, `!listar`, `!ajuda`
- ✅ `!cobrar` passa `ADMINISTRADORES` corretamente para `dispararCobrancaReal`

### `middleware/comprovante.js`
Processamento de comprovantes, consulta de situação, ações admin.
- `setupComprovante(client, firebaseDb, banco, state, ADMINISTRADORES, sseService, P, criarUtils, groqChatFallback, analisarImagem)` — função única exportada
- `processarMidiaAutomatico(deQuem, msg, fotosPendentes)` — tenta baixa automática pelo telefone. Se falhar, inicia fluxo `aguardando_nome_comprovante` com `tentativasNome: 0`
- `confirmarNomeComprovanteRouter(deQuem, texto)` — **ponto de entrada chamado pelo Mensagem.js**. Roteia baseado em `state.getEtapa`: `nome` ou `cpf`
- `confirmarNomeComprovante(deQuem, nomeDigitado)` — etapa `nome`. Usa `buscarNomeToleranteComprovante`. Se não achar na 1ª vez: menu com opção 1 (tentar de novo) ou 2 (atendente). Se não achar na 2ª vez: chama atendente
- `_confirmarCpfComprovante(deQuem, cpfDigitado)` — etapa `cpf` (quando achou múltiplos por nome). Até 2 tentativas, depois atendente
- `buscarNomeToleranteComprovante(nomeDigitado)` — tenta nome completo → só 1º token → 1º+último token. Filtra falso positivo por proporção de tokens
- `_darBaixaPorCliente(deQuem, cliente, dados)` — baixa efetiva compartilhada por todos os caminhos
- `_chamarAtendente(deQuem, dados, nomeDigitado)` — abre chamado e encerra fluxo
- `abrirChamadoComMotivo(deQuem, nome, motivo, extras)` — seta humano, salva no banco, notifica admins
- `detectarAcaoAdmin(para, textoAdmin)` — detecta padrões de promessa e visita no texto do admin, registra automaticamente
- `consultarSituacao(deQuem, textoCliente)` — 3 etapas: `aguardando_dados` (CPF ou nome) → `aguardando_cpf` → `aguardando_telefone`. Exibe status com ciclo correto

### `database/funcoes-firebase.js`
Camada de acesso ao Firestore. Todas as buscas de cliente sem scan total.
- `dbSalvarHistorico / dbCarregarHistorico / dbLimparHistorico` — max 20 mensagens por número, ordena em memória
- `dbSalvarAtendimentoHumano / dbRemoverAtendimentoHumano / dbCarregarAtendimentosHumanos`
- `dbAbrirChamado` — verifica duplicata antes de criar
- `dbListarChamados / dbAtualizarChamado`
- `dbLogCobranca / dbLogComprovante / dbIniciarAtendimento / dbEncerrarAtendimento / dbLog / dbSalvarNovoCliente`
- **`buscarStatusCliente(numero)`** — `where('telefones', 'array-contains', v)` com variantes (com/sem 55, com/sem 9º dígito). Fallback campo `telefone` string legado. Fallback final scan com `limit(500)`. Retorna `{ id, nome, status, aba, dia_vencimento }`
- **`buscarClientePorNome(nome)`** — scan com `limit(500)` + range query por inicial de letra. Match por substring e tokens com STOP words. ⚠️ Solução definitiva pendente: campo `nome_normalizado` + índice
- **`buscarClientePorCPF(cpf)`** — `where('cpf', '==', cpfBusca)`. Fallback CPF formatado com pontuação
- **`buscarClientePorTelefone(telefone)`** — `where('telefones', 'array-contains', v)` com variantes. Fallback campo `telefone` legado
- **`buscarPromessa(nome)`** — `where('status', '==', 'pendente').limit(100)`, match normalizado em memória
- `agendamentos` — objeto com `verificarDisponibilidade`, `listarHorariosDisponiveis`, `criarAgendamento`, `listarAgendamentosDoDia`, `cancelarAgendamento`

### `services/fluxoService.js`
Orquestrador de mensagens com classificador Groq.
- `processarMensagem(deQuem, msg, ctx)` — fluxo: expiração de sessão → humano → fluxo ativo → busca por telefone → intenções Groq → despacha
- Clientes identificados por telefone têm `clienteId` salvo no state — sem re-busca posterior
- `handleIdentificacao` — 3 etapas: nome → CPF (até 3 tentativas) → telefone (até 2) → transfere para humano
- `delegarParaFluxo` — despacha para handler correto
- `responderComIA` — Groq para resposta livre. Não responde ≤2 palavras sem pergunta
- `processarAposIdentificacao` — busca promessa, verifica suspensão, inicia fluxo adequado
- Usa `processingLock: Map` + `filaEspera: Map` para evitar processamento paralelo do mesmo número

### `routes/index.js`
API REST completa.
- `GET/POST /api/horario` e `/api/horario/cobranca`
- `GET /api/status`, `POST /api/bot/toggle`, `GET /api/estados`
- `GET/POST /api/rede`, `GET /api/ciclo-info`
- `GET /api/clientes/buscar`, `/busca-global`, `/recentes`
- `GET/POST/DELETE /api/bases`, `GET /api/bases/:id/clientes`
- Histórico/Pagamentos: `GET /historico`, `POST /historico/:ref/pagar`, `POST /historico/:ref/reverter`
- `POST /api/cobrar/manual`, `GET /api/cobrar/agenda`
- `GET/POST /api/promessas`, `POST /:id/pago`, `POST /:id/cancelar`
- Dashboard ✅ corrigido (sem N+1): `resumo-bases`, `caixa-hoje`, `alertas`, `fluxo-clientes`
- `GET /api/relatorio/inadimplentes` ✅ corrigido — `where('status','==','pendente')` direto
- Chamados, cancelamentos, instalações, carnê, boas-vindas, admin, migração, métricas

### `stateManager.js`
Gerenciador de estado em memória (sem persistência SQLite no modo Firebase).
- `TEMPO_EXPIRACAO_HUMANO = 2h`
- Estrutura: `{ fluxo, etapa, dados, atendimentoHumano, atendimentoHumanoDesde, clienteEmSuporte, aguardandoEscolha, atualizadoEm }`
- `iniciar / avancar / atualizar / encerrarFluxo / limpar`
- `setAtendimentoHumano / isAtendimentoHumano` — auto-expira em 2h
- `iniciarTimer(numero, callback, tempo)` — timer de inatividade por cliente
- `todos()` — estados ativos das últimas 2h para o painel
- `stats()` — resumo para dashboard

### `services/adminService.js`
Lógica de cobrança automática. Não precisou de alterações nesta sessão.
- `getCicloCobranca(diaVencimento, tipo, hojeBr)` — lembrete = mês atual; demais = `getCicloAtual`
- `perguntarAdmins(...)` — votação via WhatsApp com `onSnapshot`, timeout 60min
- `verificarCobrancasAutomaticas(...)` — roda a cada 2h, janela 11h–17h seg–sab. Calendário fixo de disparos. Filtra cancelados e quem tem carnê pendente
- ✅ `ADMINISTRADORES` é passado como parâmetro corretamente. O problema era no `Mensagem.js` (já corrigido)

### `middleware/timers.js`
Timers em background. Não precisou de alterações.
- Timer de cobrança: primeira execução após 10s, depois a cada 2h
- Wrapper correto: `(data, tipo, clientes) => dispararCobrancaReal(client, firebaseDb, data, tipo, clientes, ADMINISTRADORES)`
- Timer de limpeza de logs: hora 3h, limpa coleções com mais de 1 mês
- Timer de promessas do dia: notifica admins às 08h BRT

### `helpers/identificacao.js`
Fluxo de identificação para o sistema com Groq (fluxoService). Não precisou de alterações.
- 3 etapas: `aguardando_nome` → `aguardando_cpf` (até 3 tentativas) → `aguardando_telefone` (até 2)
- Após todas as falhas: `setAtendimentoHumano` + abre chamado + mensagem ao cliente

---

## Arquitetura da Cobrança Automática

```
timers.js (a cada 2h)
    ↓
verificarCobrancasAutomaticas (adminService.js)
    ↓ busca clientes por dia_vencimento (where query, não scan)
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

// Mensagem.js — !cobrar (CORRIGIDO em 2026-04-11)
await dispararCobrancaReal(client, firebaseDb, data, args[2] || null, null, ADMINISTRADORES);

// adminService.js — chama assim (client/firebaseDb ficam no closure do wrapper)
await dispararCobrancaReal(cobranca.dataVenc, cobranca.tipo, cobranca.clientes);

// timers.js — wrapper CORRETO
(data, tipo, clientes) => dispararCobrancaReal(client, firebaseDb, data, tipo, clientes, ADMINISTRADORES)

// routes/index.js — wrapper correto
dispararCobrancaReal: (d, t) => dispararCobrancaReal(client, firebaseDb, d, t, null, ADMINISTRADORES)
```

---

## Pendências / Próximos Passos

1. **Migration `telefones` (array)** — clientes importados da planilha têm só campo `telefone` (string). As buscas por `array-contains` funcionam mas sempre caem no fallback. Script de migration: para cada cliente sem `telefones`, criar array com o valor de `telefone`. ~10 linhas, alto impacto.

2. **Solução definitiva para `buscarClientePorNome`** — salvar campo `nome_normalizado` em cada documento cliente e criar índice `orderBy('nome_normalizado')` no Firestore. Enquanto isso, `limit(500)` está funcional mas não escala bem acima de 500 clientes.

3. **Rate limiting na API** — não implementado.

4. **TTL em `historico_conversa`** — cresce indefinidamente. `dbSalvarHistorico` faz uma query extra a cada save para limpar. Necessário TTL nativo do Firestore ou job periódico.

5. **Autenticação JWT no painel** — ainda só API key no bundle (não é segredo real).

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

## Status dos Módulos

| Módulo | Status |
|--------|--------|
| Frontend (painel admin) | ✅ Funcional |
| Cobrança automática | ✅ Funcionando |
| Relatório pós-cobrança (!cobrar) | ✅ Corrigido (2026-04-11) |
| Toggle do bot | ✅ Corrigido |
| SSE | ✅ Estabilizado |
| Puppeteer/WhatsApp | ✅ Estável (retry automático) |
| Buscas Firestore (bot) | ✅ Corrigido (sem scan total) |
| Dashboard (painel) | ✅ Corrigido (sem N+1) |
| Comprovante — fluxo de nome | ✅ Corrigido (sem loop, busca tolerante) |
| buscarClientePorNome | ⚠️ Parcial (limit 500, sem índice) |
| Migration campo telefones | ⏳ Pendente |
| Rate limiting na API | ⏳ Pendente |
| TTL em historico_conversa | ⏳ Pendente |
| Autenticação JWT no painel | ⏳ Pendente |

---

**Última atualização**: 2026-04-11
**Responsável**: Equipe JMENET