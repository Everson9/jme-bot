---
name: runbook-producao-jme-bot
description: Runbook operacional para o jme-bot (WhatsApp + Express + Firestore + painel React). Use quando o usuário mencionar produção, deploy (Fly/Render), variáveis de ambiente, bot offline, QR code, SSE, sessão do WhatsApp, reiniciar serviço, logs ou indisponibilidade.
---

# Runbook de Produção — jme-bot

## Objetivo

Guiar diagnóstico e recuperação do serviço (bot + API + painel) com mínimo risco.

## Contexto do projeto (essencial)

- **Backend**: `index.js` (Express + WhatsApp client).
- **Plataforma atual**: **Railway** (anteriormente Fly.io)
- **Sessão WhatsApp**: `RemoteAuth` com Firebase Storage (não depende de volume local)
- **Endpoints úteis**:
  - `GET /api/health` (saúde)
  - `GET /api/status` (status resumido)
  - `GET /api/status-stream` (SSE)
  - `GET /qr` (PNG do QR)

## Checklist rápido (triagem)

- [ ] Confirmar se o serviço está respondendo em `GET /api/health`
- [ ] Confirmar se `GET /api/status` mostra `online=true`
- [ ] Se `online=false`, checar `GET /qr` e logs de reconexão
- [ ] Se painel não atualiza, checar SSE (`/api/status-stream`) e CORS
- [ ] Confirmar variáveis críticas no ambiente de deploy

## Variáveis de ambiente críticas

- **Firebase**
  - `FIREBASE_CREDENTIALS_JSON` (produção) — necessário para RemoteAuth
- **LLM (fallback/extração)**
  - `GROQ_API_KEY`
- **Admin API**
  - `ADMIN_API_KEY` (se vazio, **API fica aberta**)
- **CORS**
  - `ALLOWED_ORIGINS` (ex: `https://jme-bot.vercel.app,https://*.vercel.app`)
- **Porta**
  - `PORT` (Railway define 8080 automaticamente)

## Playbooks

### Bot offline / WhatsApp desconectado

1. Verificar `GET /api/status` (`online` e `iniciadoEm`).
2. Se `online=false`, abrir `GET /qr`.
3. Se `GET /qr` retorna 404:
   - O cliente do WhatsApp pode não ter emitido QR ainda; checar logs do processo.
4. Se `GET /qr` retorna PNG:
   - Escanear QR com o WhatsApp correto.
5. Se reconecta e cai em loop:
   - Suspeitar de sessão corrompida no volume `/data`.
   - Priorizar backup/inspeção antes de apagar (apagar sessão deve ser último recurso).

### Painel “travado” / não atualiza status em tempo real

1. Confirmar `GET /api/status-stream` responde com `text/event-stream`.
2. Confirmar headers para SSE (sem buffer) estão presentes.
3. Checar se há proxy/infra cortando conexões longas (timeout).
4. Se precisar, orientar o usuário a recarregar o painel e observar reconexão SSE.

### API recusando (401/403) ou aberta demais

1. Se `ADMIN_API_KEY` não está definida:
   - O middleware permite tudo (modo dev).
2. Se está definida:
   - O frontend envia `x-api-key` (mas **não é segredo** se está no bundle).
3. Recomendação mínima:
   - Definir `ADMIN_API_KEY` em produção.
   - Proteger painel/API por rede (allowlist IP / basic auth no proxy) quando possível.

## Pós-incidente

- [ ] Registrar causa raiz (ex.: sessão WhatsApp, env faltando, timeout SSE)
- [ ] Se envolveu segredo: rotacionar chaves e invalidar as antigas
- [ ] Adicionar verificação automatizada (healthcheck) ou alerta

