---
name: diagnostico-atendimento-fluxos
description: LEGADO — Não há mais atendimento automático via WhatsApp. Este documento está obsoleto e será removido. O bot apenas envia mensagens (cobranças, notificações) — não processa mensagens recebidas.
---

# ⚠️ AVISO — Skill Obsoleta

**Esta skill está desatualizada. O bot NÃO possui mais atendimento automático via WhatsApp.**

## O que mudou

O bot JME-BOT **não processa mensagens recebidas**. Não existe mais:

- `client.on('message')` handler
- Fluxos de atendimento automático
- Menus interativos via WhatsApp
- Identificação automática de clientes por nome/CPF/telefone via WhatsApp
- Estado de conversa (`stateManager.js`)
- middleware/Mensagem.js
- middleware/comprovante.js
- services/fluxoService.js
- helpers/identificacao.js

## Estado atual

O WhatsApp é usado exclusivamente para:
- **Envio** de mensagens de cobrança (timer automático a cada 2h)
- **Envio** de notificações de promessas do dia (08h BRT)
- **Votação** de cobranças entre admins (!sim / !nao via WhatsApp)
- **Relatórios** pós-cobrança para admins
- **Notificações** de carnê, boas-vindas, etc.

## Se precisar diagnosticar problemas

Para problemas atuais, use:
- `GET /api/status` — status do bot
- `GET /api/cobrar/agenda` — cronograma de cobranças
- `GET /api/logs/cobrancas` — logs de envio
- `services/cobrancaService.js` — lógica de disparo
- `services/adminService.js` — verificação automática e votação
- `middleware/timers.js` — timers em background

---

**Última atualização**: 2026-04-29
**Status**: OBSOLETO — não há mais atendimento automático
