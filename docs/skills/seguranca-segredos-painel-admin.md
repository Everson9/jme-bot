---
name: seguranca-segredos-painel-admin
description: Hardening de segurança para jme-bot: segredos (Firebase/Groq), rotação de chaves, riscos de expor VITE_ADMIN_API_KEY, proteção de endpoints /api, e recomendações práticas (proxy auth, allowlist IP, sessão). Use quando o usuário mencionar segurança, vazamento, .env, credenciais, API key, painel admin, autenticação, ou deploy.
---

# Segurança — Segredos e Painel Admin (jme-bot)

## Regras rápidas (o que não confundir)

- **`VITE_*` no frontend NÃO é segredo**: qualquer usuário do painel consegue extrair do bundle.
- `ADMIN_API_KEY` só é “barreira” se o painel não for público; não substitui login.

## Checklist de segredos

- [ ] `.env` não deve ser commitado (ver `.gitignore`)
- [ ] `FIREBASE_CREDENTIALS_JSON` deve estar só no ambiente (Railway secrets)
- [ ] `GROQ_API_KEY` idem
- [ ] `ADMIN_API_KEY` definido em produção (senão API fica aberta)
- [ ] `ALLOWED_ORIGINS` configurado com as URLs corretas (Vercel + Railway)

## Rotação (quando suspeitar de vazamento)

1. Gerar novas chaves (Firebase service account + provedor LLM).
2. Atualizar secrets no provedor de deploy.
3. Fazer deploy.
4. Revogar/invalidar chaves antigas.
5. Verificar logs por uso indevido.

## Proteção do painel/API (ordem de custo/benefício)

### Nível 1 (rápido)

- Proteger o painel e `/api` com **basic auth** no proxy/edge, ou **allowlist IP**.
- Manter `ADMIN_API_KEY` como camada extra.

### Nível 2 (recomendado)

- Implementar **login** (sessão com cookie HttpOnly) e autorização básica.

## Sinais de risco no projeto

- API key no frontend.
- Endpoints administrativos expostos via `/api/*`.
- QR (`/qr`) público pode permitir takeover de sessão se exposto em produção.

## Ações recomendadas específicas

- Em produção, restringir acesso ao `GET /qr`.
- Garantir `ADMIN_API_KEY` sempre setado em produção.
- Documentar variáveis obrigatórias por ambiente.

