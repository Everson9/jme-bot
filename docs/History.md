# Histórico de Desenvolvimento - JME-BOT

## Status Atual (2026-04-29)

- ✅ Sistema de cobrança automática FUNCIONANDO
- ✅ RemoteAuth + Firebase Storage — sessão persiste entre deploys
- ✅ Frontend (Vercel) + Backend (Railway) estáveis
- ✅ SSE estabilizado (sem acúmulo de conexões)
- ✅ Cobrança com filtros: promessa, carnê, cancelado, histórico
- ✅ Votação de admins via WhatsApp para disparos automáticos
- ✅ Relatório pós-cobrança nos admins
- ✅ Rotas modularizadas em 19 arquivos
- ✅ Timers: cobrança (2h), limpeza (3h), promessas (08h BRT)
- ✅ Kill zombie browser antes de iniciar
- ✅ Reconexão automática com backoff exponencial
- ✅ ComTimeout em todas as chamadas WhatsApp
- ⚠️ `buscarClientePorNome` usa `limit(500)` — não escala
- ⚠️ N+1 query em `adminService.js` — loop sequencial `historico_pagamentos`
- ⚠️ Migration campo `telefones` (array) pendente para clientes legados

## Stack

- **Backend**: Node.js + Express 5 + whatsapp-web.js → **Railway**
- **Frontend**: React + Vite → **Vercel**
- **Banco**: Firebase Firestore
- **Auth WhatsApp**: `RemoteAuth` + `FirestoreStore` → Firebase Storage
- **Sessão**: zip em `whatsapp_session/` no bucket `jmenet.appspot.com`

## Infraestrutura de Sessão WhatsApp

```
RemoteAuth (whatsapp-web.js)
    ↓ save()
FirestoreStore.save({ session })
    ↓ archiver zip
    ↓ upload
Firebase Storage: whatsapp_session/{sessionName}.zip
    ↓ extract()
FirestoreStore.extract({ session, path })
    ↓ download + unzip
/wwebjs_auth/ (temporário local)
```

- `backupSyncIntervalMs`: 43200000 (12h)
- Se servidor reiniciar antes do próximo sync: sessão no Storage pode estar 12h desatualizada
- Em caso de desconexão: `FirestoreStore.delete()` remove a sessão do Storage e reinicia com QR

---

## Sessão 2026-04-29 — Auditoria de Documentação

### Problema
Documentação desatualizada: mencionava LocalAuth, atendimento automático, fluxes removidos, stack antiga.

### Correções aplicadas
- `ARCHITECTURE.md`: 19 rotas (não 12), RemoteAuth+Storage, sem chatbot, sem Groq, sem pdf-parse, Express 5
- `API.md`: removido `/api/health`, atualizado com rotas reais (19 arquivos), tipos de cobrança corretos
- `CHANGELOG.md`: notas de deploy Railway, RemoteAuth rollout
- `History.md`: removida menção a LocalAuth como principal, atualizado mapa de arquivos
- `rules.md`: `dispararCobrancaReal` com 6 parâmetros, backupSyncIntervalMs = 12h
- `PATTERNS.md`: comTimeout em todas as chamadas WhatsApp
- `Pending.md`: atualizado com N+1 query, RemoteAuth como resolvido
- `SECURITY.md`: atualizado para RemoteAuth, sessão via Storage

### Mapa de arquivos atual

| Arquivo | Última modificação |
|---------|-------------------|
| `index.js` | 2026-04-24 |
| `services/FirestoreStore.js` | 2026-04-24 |
| `services/cobrancaService.js` | 2026-04-22 |
| `services/adminService.js` | 2026-04-22 |
| `services/whatsappService.js` | 2026-04-22 |
| `middleware/timers.js` | 2026-04-22 |
| `routes/index.js` | 2026-04-22 |

---

## Sessão 2026-04-24 — RemoteAuth + Firebase Storage (segunda tentativa)

### Problema
LocalAuth causava lock files entre deploys no Railway. Sessão ficava em volume efêmero — ao fazer deploy, volume era recriado e QR code necessário.

### Solução implementada
RemoteAuth com `FirestoreStore.js` customizado:
- `sessionExists({ session })` — verifica zip no Firebase Storage
- `save({ session })` — RemoteAuth já zipa; upload para `whatsapp_session/{sessionName}.zip`
- `extract({ session, path })` — baixa zip, dezipa para path do RemoteAuth
- `delete({ session })` — remove do Storage
- `backupSyncIntervalMs`: 43200000 (12h)

### Dependências adicionadas
- `archiver: ^7.0.1` — zip em Node.js puro
- `fs-extra: ^11.3.1` — RemoteAuth requer
- `unzipper: ^0.12.3` — RemoteAuth requer para extração

### Resultado
✅ Sessão persiste no Firebase Storage — redeploy não exige QR code
✅ Lock files eliminados
✅ `remote_session_saved` logado no console a cada sync

---

## Sessão 2026-04-22 — Limpeza e Modularização

### Alterações
- 19 arquivos de rotas (não 12): adicionados `agendamentos.js`, `instalacoes-agendadas.js`, `paginacao.js`, `alertas.js`, `backup.js`
- Package.json limpo: removidas dependências não utilizadas
- Helper `comTimeout` em todas as chamadas WhatsApp
- `express: ^5.2.1` (confirmado)

---

## Sessão 2026-04-17 — Correções de Cobrança

- Clientes com `status: 'promessa'` não são cobrados
- Verificação de promessa ativa na collection `promessas`
- Mensagens personalizadas por tipo de cobrança
- Chaves PIX reais: `jmetelecomnt@gmail.com` e `+55 81 98750-0456`

---

## Sessão 2026-04-16 — Migração para Railway

Fly.io 256MB insuficiente → Railway com 512MB trial.

---

## Pendências

1. **`buscarClientePorNome`** — `limit(500)` + range query — não escala
2. **N+1 query em adminService.js** — loop sequencial `historico_pagamentos`
3. **Migration `telefones`** — clientes legados têm só `telefone` (string), não `telefones` (array)
4. **Rate limiting na API**
5. **TTL em `historico_conversa`**
6. **Autenticação JWT no painel**

---

| Módulo | Status |
|--------|--------|
| Cobrança automática D-1/D+3/D+5/D+7/D+10 | ✅ Funcionando |
| Votação de admins | ✅ Funcionando |
| RemoteAuth + Firebase Storage | ✅ Funcionando |
| ComTimeout WhatsApp | ✅ Corrigido |
| Rotas modularizadas (19) | ✅ Concluído |
| SSE | ✅ Estável |
| CORS dinâmico | ✅ Configurado |
| Package.json limpo | ✅ Concluído |
| buscarClientePorNome | ⚠️ limit(500) |
| N+1 historico_pagamentos | ⚠️ Sequencial |
| Migration telefones | ⏳ Pendente |
| Rate limiting | ⏳ Pendente |
| TTL historico_conversa | ⏳ Pendente |
| JWT painel | ⏳ Pendente |

---

**Última atualização**: 2026-04-29
**Revisado por**: Auditoria técnica — código real vs documentação
