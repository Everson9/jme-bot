# CURRENT STATE

## Estado atual (2026)

- Projeto ativo em produção
- Não utiliza IA em funcionalidades principais
- Atendimento automático antigo removido/despriorizado

**Core atual:**
- Cobrança automática (D-1, D+3, D+5, D+7, D+10)
- Painel admin React (dashboard SSE)
- Gestão de clientes e bases
- Promessas de pagamento
- Carnês
- Agendamentos
- Relatórios
- Automação WhatsApp (envio — não recebe)

## Arquitetura

**Backend**: Node.js + Express 5 + whatsapp-web.js
**Banco**: Firebase Firestore + Firebase Storage
**Auth WhatsApp**: RemoteAuth + FirestoreStore → zip em `whatsapp_session/`
**Frontend**: React + Vite + Vercel
**Infra**: Railway (backend) + Vercel (frontend)

**Dependências-chave**: `archiver`, `fs-extra`, `unzipper` (RemoteAuth), `qrcode`, `cors`, `firebase-admin`

## Pontos técnicos conhecidos

- **N+1 query**: `adminService.js` faz loop sequencial de `historico_pagamentos` por cliente
- **Fallback limit(500)**: `buscarClientePorNome` e buscas sem filtro usam limit 500
- **Sessão desatualizada**: se Railway reiniciar antes do sync (12h), sessão no Storage pode ter até 12h de diferença
- **historico_conversa**: sem TTL, cresce indefinidamente

## Ler depois

1. **AI_HANDOFF.md** — contexto rápido para IAs
2. **ARCHITECTURE.md** — visão completa, o que existe e o que não existe
2. **API.md** — todos os endpoints REST
3. **PATTERNS.md** — padrões de código (queries, comTimeout, dispararCobrancaReal)
4. **PENDING.md** — pendências priorizadas e gargalos

## Regras rápidas

1. `db.collection('clientes').get()` sem `where` + `limit` = scan total — nunca fazer
2. `dispararCobrancaReal` recebe `ADMINISTRADORES` como 6º parâmetro
3. Status cliente: `'pago'` | `'pendente'` | `'isento'` | `'promessa'` | `'cancelado'`
4. `telefones` é array; `telefone` (string) é legado — tratar os dois
5. Sempre usar `comTimeout` em chamadas WhatsApp

---

**Última atualização**: 2026-04-29
