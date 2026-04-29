---
name: seguranca-segredos-painel-admin
description: Hardening de segurança para jme-bot: segredos (Firebase), rotação de chaves, riscos de expor VITE_ADMIN_API_KEY, proteção de endpoints /api, e RemoteAuth session. Use quando o usuário mencionar segurança, vazamento, .env, credenciais, API key, painel admin, autenticação, ou deploy.
---

# Segurança — Segredos e Painel Admin (jme-bot)

## Regras rápidas

- **`VITE_*` no frontend NÃO é segredo**: qualquer usuário do painel extrai do bundle.
- `ADMIN_API_KEY` só é barreira se o painel não for público.
- **GROQ/IA foi removido** — não há mais `GROQ_API_KEY`.

## Checklist de segredos

- [ ] `.env` não deve ser commitado (`.gitignore`)
- [ ] `FIREBASE_CREDENTIALS_JSON` em Railway secrets
- [ ] `ADMIN_API_KEY` definido em produção
- [ ] `ALLOWED_ORIGINS` com URLs corretas (Vercel + Railway)
- [ ] `firebasekey.json` não commitado

## Rotação (quando suspeitar de vazamento)

1. Gerar nova service account no Firebase
2. Atualizar `FIREBASE_CREDENTIALS_JSON` nos Railway secrets
3. Deploy
4. Revogar chave antiga
5. Verificar logs por uso indevido

## Proteção do painel/API

### Nível 1 (rápido)
- Basic auth no proxy/edge ou IP allowlist
- `ADMIN_API_KEY` como camada extra

### Nível 2 (recomendado)
- Login com sessão (cookie HttpOnly) + JWT

## Riscos específicos

### `/qr` — Risco crítico
Qualquer pessoa com acesso pode assumir o número WhatsApp.
**Sempre proteger**: IP whitelist, Basic Auth, ou desativar quando não usar.

### Sessão WhatsApp via RemoteAuth
- Sessão zipada no Firebase Storage (`whatsapp_session/`)
- Não há segredo nisso — é o funcionamento normal do RemoteAuth
- Risco real: expor o bucket publicly — garantir que seja privado
- Em caso de vazamento de sessão: deletar zip do Storage + escanear QR novamente

## Variáveis obrigatórias por ambiente

| Variável | Desenvolvimento | Produção |
|----------|----------------|----------|
| `FIREBASE_CREDENTIALS_JSON` | Local .env | Railway secrets |
| `ADMIN_API_KEY` | Local .env | Railway secrets |
| `ALLOWED_ORIGINS` | `http://localhost:3001` | URLs Vercel + Railway |
| `PORT` | 3001 | 8080 (Railway) |

---

**Última atualização**: 2026-04-29
