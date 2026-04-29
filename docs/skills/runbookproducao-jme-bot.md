---
name: runbook-producao-jme-bot
description: Runbook operacional para o jme-bot (WhatsApp + Express + Firestore + painel React). Use quando o usuário mencionar produção, deploy, variáveis de ambiente, bot offline, QR code, SSE, sessão do WhatsApp, reiniciar serviço, logs ou indisponibilidade.
---

# Runbook de Produção — jme-bot

## Contexto do projeto

- **Backend**: `index.js` (Express 5 + whatsapp-web.js)
- **Plataforma**: Railway
- **Sessão WhatsApp**: `RemoteAuth` + Firebase Storage (`whatsapp_session/*.zip`)
- **Frontend**: React + Vite na Vercel

## Endpoints úteis

| Endpoint | Descrição |
|----------|-----------|
| `GET /api/status` | Status resumido do bot |
| `GET /api/status-stream` | SSE em tempo real |
| `GET /qr` | QR Code PNG |

## Checklist rápido (triagem)

1. `GET /api/status` — `online: true`?
2. Se `online: false` → `GET /qr` + checar logs Railway
3. Se painel não atualiza → SSE `/api/status-stream` + CORS
4. Confirmar variáveis no Railway

## Variáveis de ambiente críticas

| Variável | Obrigatória | Observação |
|----------|-------------|------------|
| `FIREBASE_CREDENTIALS_JSON` | Sim | Service account JSON ( Railway secrets) |
| `ADMIN_API_KEY` | Sim (produção) | Se vazia, API fica aberta |
| `ALLOWED_ORIGINS` | Sim | URLs separadas por vírgula |
| `PORT` | Não | Railway define 8080 |
| `FIREBASE_STORAGE_BUCKET` | Não | Default: `jmenet.appspot.com` |

## Playbooks

### Bot offline / WhatsApp desconectado

1. Verificar `GET /api/status` (`online` e `iniciadoEm`)
2. Se `online=false`:
   - `GET /qr` retorna PNG → escanear com WhatsApp
   - `GET /qr` retorna 404 → cliente ainda não emitiu QR, ver logs
3. Reconexão em loop:
   - Sessão corrompida no Firebase Storage
   - Solução: deletar manualmente o zip `whatsapp_session/RemoteAuth-jme-bot.zip` do Storage
   - OU: via API deletar sessão e esperar novo QR

### QR Code não carrega

1. Cliente WhatsApp ainda não emitiu QR (normal nos primeiros segundos)
2. Aguardar 30s e tentar novamente
3. Ver logs Railway por erros `initialize()`

### Painel não atualiza em tempo real

1. `GET /api/status-stream` responde como `text/event-stream`?
2. Proxy/infra cortando conexões longas (timeout)?
3. Recarregar painel e observar reconexão SSE

### Sessão WhatsApp desatualizada após reinício

- `backupSyncIntervalMs` = 12h
- Se Railway reiniciar antes do próximo sync: sessão no Storage pode ter até 12h de diferença
- Solução: força novo sync ao reconectar (RemoteAuth faz automaticamente)

### API retornando 401

- `ADMIN_API_KEY` não está definida no Railway
- Definir valor forte nos Railway secrets

## Pós-incidente

- [ ] Registrar causa raiz
- [ ] Se envolveu segredo: rotacionar chaves
- [ ] Adicionar healthcheck ou alerta se não houver

---

**Última atualização**: 2026-04-29
