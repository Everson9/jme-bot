# AGENTS.md — JME-BOT

> Guia central para qualquer IA que entrar neste projeto.
> Lido automaticamente por Claude Code, Cursor, Gemini CLI, Copilot, Windsurf e Cline.
> **Não contém lógica — aponta para os arquivos reais.**

---

## O que é este projeto?

Bot de WhatsApp com painel de controle para gestão de clientes de provedor de internet (ISP).
Stack: Node.js + Express + whatsapp-web.js + Firestore + React (Vite) + Groq/Gemini.

---

## Antes de qualquer tarefa, leia:

| O que você precisa entender | Onde está |
|---|---|
| Arquitetura geral e fluxos | `docs/ARCHITECTURE.md` |
| Endpoints da API | `docs/API.md` |
| Índices do Firestore | `docs/FIRESTORE_INDEXES.md` |
| Histórico e decisões técnicas | `docs/History.md` |
| Segurança e variáveis de ambiente | `docs/SECURITY.md` |
| Como contribuir e padrões de código | `docs/CONTRIBUTING.md` |
| Versões e mudanças | `docs/CHANGELOG.md` |

---

## Skills — leia a skill antes de mexer na área correspondente:

| Área | Skill |
|---|---|
| Fluxos de atendimento, StateManager, identificação de clientes | `skills/diagnostico-atendimento-fluxos/SKILL.md` |
| Queries, índices, custo e performance do Firestore | `skills/firestore-custos-performance/SKILL.md` |
| Segredos, credenciais, painel admin, deploy | `skills/seguranca-segredos-painel-admin/SKILL.md` |
| Bot offline, QR code, SSE, variáveis de ambiente, incidentes | `skills/runbook-producao-jme-bot/SKILL.md` |

---

## Regras de comportamento

- Agir como **desenvolvedor principal** — breve e direto
- Se encontrar código que fere as regras de performance do Firestore, **apontar imediatamente**
- Consultar `docs/History.md` antes de implementar algo novo para entender decisões anteriores

### Regra de finalização (obrigatório)

Ao completar qualquer tarefa importante:
1. Listar o que foi feito com a data atual
2. Marcar pendências concluídas
3. Perguntar: *"Deseja que eu registre essas alterações no History.md agora?"*

---

## Padrões de commit

```
feat | fix | docs | refactor | perf | test | chore
```

---

*Repositório: github.com/Everson9/jme-bot*