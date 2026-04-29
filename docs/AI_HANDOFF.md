# AI HANDOFF

## O que este projeto é

Sistema interno de automação operacional via WhatsApp para provedora JME.NET.

## O que NÃO é

- Não é chatbot IA
- Não usa LLM em produção
- Não possui atendimento automático ativo como core

## Core atual

- Cobrança automática (D-1, D+3, D+5, D+7, D+10) com votação de admins
- Painel admin React (dashboard SSE)
- Gestão de clientes e bases
- Promessas de pagamento
- Carnês
- Agendamentos
- Relatórios

## Stack

- **Backend**: Node.js + Express 5 + whatsapp-web.js
- **Banco**: Firebase Firestore + Firebase Storage
- **Auth WhatsApp**: RemoteAuth + FirestoreStore → zip em `whatsapp_session/`
- **Frontend**: React + Vite (painel admin na Vercel)
- **Infra**: Railway (backend) + Vercel (frontend)

## Ler primeiro

1. `docs/CURRENT_STATE.md` — resumo rápido do estado atual
2. `docs/ARCHITECTURE.md` — arquitetura, o que existe e o que não existe
3. `docs/API.md` — todos os endpoints REST
4. `docs/PATTERNS.md` — padrões de código (queries, comTimeout, dispararCobrancaReal)
5. `docs/PENDING.md` — pendências e gargalos

## Pendência principal

**N+1 query em `adminService.js`**: loop sequencial consultando `historico_pagamentos` por cliente. Solução: `Promise.all` com batch de queries ou `in` query.

## Regras não negociáveis

1. `db.collection('clientes').get()` sem `where` + `limit` = scan total
2. `dispararCobrancaReal` — 6 parâmetros, `ADMINISTRADORES` sempre como último
3. Status cliente: `'pago'` | `'pendente'` | `'isento'` | `'promessa'` | `'cancelado'`
4. `telefones` é array; `telefone` (string) é legado — tratar os dois
5. Sempre `comTimeout` em chamadas WhatsApp
