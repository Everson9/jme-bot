# JME-BOT — Contexto para o Claude

## Stack
- Backend: Node.js + Express 5 + whatsapp-web.js → Railway
- Frontend: React + Vite → Vercel
- Banco: Firebase Firestore
- Auth WhatsApp: RemoteAuth + FirestoreStore → Firebase Storage

---

## Arquivos críticos do projeto
Leia APENAS os que forem relevantes para a tarefa. Não escaneie o projeto.

| Arquivo | Quando ler |
|---|---|
| `index.js` | Entry point — Express + WhatsApp client, RemoteAuth, timers |
| `services/cobrancaService.js` | Lógica de disparo de cobranças (modo busca e modo lista) |
| `services/adminService.js` | Verificação automática, calendário, votação de admins |
| `services/FirestoreStore.js` | Store customizado para RemoteAuth — sessão no Firebase Storage |
| `services/whatsappService.js` | Envio com comTimeout e retry |
| `middleware/timers.js` | Timers em background (2h, 3h, 08h BRT) |
| `database/funcoes-firebase.js` | Queries de clientes, histórico, logs |
| `routes/index.js` | Todas as rotas (19 arquivos) |

---

## ⚠️ Arquivos OBSOLETOS (não existem mais)
- `middleware/Mensagem.js` — NÃO existe mais (sem atendimento automático)
- `middleware/comprovante.js` — NÃO existe
- `services/fluxoService.js` — NÃO existe
- `stateManager.js` — NÃO existe
- `services/groqService.js` — NÃO existe (Groq/IA removido)
- Pasta `fluxos/` — removida

---

## Documentação (ler só quando pedido)

| Arquivo | Conteúdo |
|---|---|
| `docs/History.md` | Histórico completo de sessões, bugs corrigidos, mapa de funções |
| `docs/RULES.md` | Regras consolidadas — ler antes de mexer em Firestore, cobrança ou produção |
| `docs/DECISIONS.md` | Decisões técnicas e motivações |
| `docs/PATTERNS.md` | Padrões de código (queries, timeout, status) |
| `docs/PENDING.md` | Pendências priorizadas |
| `docs/API.md` | Documentação da API REST |
| `docs/ARCHITECTURE.md` | Arquitetura do sistema |

---

## Skills disponíveis

| Skill | Quando usar |
|---|---|
| Firestore performance | Lentidão, custo alto, otimização de queries |
| Segurança e segredos | Secrets, .env, API key, deploy |
| Runbook de produção | Bot offline, QR code, SSE, incidente |

---

## Regras invioláveis

1. NUNCA `db.collection('clientes').get()` sem `where` + `limit` — scan total
2. `dispararCobrancaReal` sempre recebe `ADMINISTRADORES` como 6º parâmetro
3. Campo `status` do cliente é string: `'pago'` | `'pendente'` | `'isento'` | `'promessa'` | `'cancelado'`
4. Campo `telefones` é array; `telefone` (string) é legado — tratar os dois
5. Dashboard usa campo `status` direto — não buscar histórico em listagens
6. Nunca commitar `.env` ou credenciais
7. SEMPRE usar `comTimeout` em chamadas WhatsApp

---

## Context & Token Management
- **DO NOT** read the entire project directory on startup.
- **GUIDE BY DOCUMENTATION:** Always check `docs/` and `RULES.md` before exploring source code.
- **RESTRICTED FOLDERS:** Never read `node_modules` or `dist`.
- **WAIT FOR PERMISSION:** If a task requires reading more than 5 files at once, ask for confirmation.
