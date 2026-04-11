# JME-BOT — Contexto para o Claude

## Stack
- Backend: Node.js + Express + whatsapp-web.js → Railway (gru)
- Frontend: React + Vite → Vercel
- Banco: Firebase Firestore
- IA: Groq (llama-3.3-70b-versatile)
- Auth WhatsApp: LocalAuth em `/data/.wwebjs_auth`

---



## Arquivos críticos do projeto
Leia APENAS os que forem relevantes para a tarefa. Não escaneie o projeto.

| Arquivo | Quando ler |
|---|---|
| `middleware/Mensagem.js` | Fluxo de mensagens, menus, debounce, comandos admin |
| `middleware/comprovante.js` | Comprovantes, consulta de situação, busca de nome |
| `database/funcoes-firebase.js` | Qualquer query Firestore, busca de cliente |
| `routes/index.js` | Endpoints da API, dashboard, cobrança, promessas, bases |
| `services/adminService.js` | Cobrança automática, calendário, votação de admins |
| `services/fluxoService.js` | Orquestrador Groq, identificação de clientes |
| `middleware/timers.js` | Timers em background, wrappers de disparo |
| `stateManager.js` | Estado em memória, estrutura por número de telefone |

---

## Documentação (ler só quando pedido)

| Arquivo | Conteúdo |
|---|---|
| `docs/History.md` | Histórico completo de sessões, bugs corrigidos, mapa de funções |
| `docs/RULES.md` | Regras consolidadas — ler antes de mexer em fluxos, Firestore, segurança ou produção |
| `docs/DECISIONS.md` | Decisões técnicas e motivações — ler antes de "melhorar" algo |
| `docs/PATTERNS.md` | Exemplos de código certo/errado para os padrões do projeto |
| `docs/PENDING.md` | Pendências priorizadas com scripts prontos |
| `docs/PROMPTS.md` | Como fazer prompts eficientes neste projeto |
| `docs/API.md` | Documentação da API REST |
| `docs/ARCHITECTURE.md` | Arquitetura do sistema |

---

## Skills disponíveis
Ler quando o problema se enquadrar na área da skill.

| Skill | Caminho | Quando usar |
|---|---|---|
| Diagnóstico de fluxos | `docs/skills/Diagnosticoatendimento.md` | Fluxo quebrando, menu do nada, cliente não identificado, comprovante PDF |
| Firestore performance | `docs/skills/firestorecustosperformance.md` | Lentidão, custo alto, muitas leituras, otimização de queries |
| Segurança e segredos | `docs/skills/seguranca-segredos-painel-admin.md` | Secrets, .env, API key, painel admin, deploy |
| Runbook de produção | `docs/skills/runbook-producao-jme-bot.md` | Bot offline, QR code, SSE, variáveis de ambiente, incidente |

---

## Regras invioláveis

1. NUNCA `db.collection('clientes').get()` sem `where` + `limit` — causa scan total e lentidão grave
2. `dispararCobrancaReal` sempre recebe `ADMINISTRADORES` como 6 parametro
3. Debounce de 12s em `Mensagem.js` e intencional — não alterar
4. Campo `status` do cliente e string: 'pago'|'pendente'|'isento'|'promessa'|'cancelado'
5. Campo `telefones` e array; `telefone` (string) e legado — tratar os dois em buscas
6. Dashboard usa campo `status` direto — não adicionar busca de historico em listagens
7. Nunca commitar `.env` ou credenciais no codigo

## Context & Token Management
- **DO NOT** read the entire project directory on startup.
- **GUIDE BY DOCUMENTATION:** Always check `docs/` and `RULES.md` before exploring source code.
- **RESTRICTED FOLDERS:** Never read `node_modules` or `dist`.
- **SPECIFIC QUERIES:** Use `grep` or `find` for specific terms instead of reading full files if you only need to locate a function.
- **WAIT FOR PERMISSION:** If a task requires reading more than 5 files at once, ask for confirmation to avoid token spikes.