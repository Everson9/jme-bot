---
name: diagnostico-atendimento-fluxos
description: Diagnosticar e corrigir problemas de lógica de atendimento no bot (perda de fluxo, menu reaparecendo, debounce, timers, atendimento humano, identificação por nome/CPF/telefone, comprovante PDF/foto). Use quando o usuário mencionar fluxo quebrando, menu do nada, não encontra cliente, admin assumiu e bot interferiu, ou comprovante PDF.
---

# Diagnóstico — Atendimento e Fluxos (jme-bot)

## Objetivo

Encontrar rapidamente a causa quando o bot “perde o contexto” e volta menu, ou falha em identificar cliente.

## Arquivos-chave

- **Roteamento WhatsApp (principal)**: `middleware/Mensagem.js`
- **Estado**: `stateManager.js`
- **Comprovantes + consulta situação**: `middleware/comprovante.js`
- **Identificação (nome/CPF/telefone)**: `helpers/identificacao.js` e/ou lógica em `services/fluxoService.js`
- **Busca no Firestore**: `database/funcoes-firebase.js`

## Checklist de reprodução (sempre coletar)

- [ ] Tipo da mensagem: texto, foto, PDF (`msg.type === 'document'`), sem legenda?
- [ ] O cliente estava em qual fluxo (`state.getFluxo`)?
- [ ] Existe atendimento humano ativo (`state.isAtendimentoHumano`)?
- [ ] O problema ocorre após quanto tempo (timer/expiração)?

## Padrões de falha comuns e correções

### A) “Menu aparece do nada”

Investigar:
- Mensagem vazia em fluxo ativo (ex.: PDF sem texto/legenda).
- Fluxo ativo não tratado no roteador e cai no fallback de menu.

Correção típica:
- Não resetar menu quando `fluxoAtivo` e `texto` vazio; manter fluxo.
- Adicionar `case`/handler para o fluxo específico no roteador.

### B) Admin assume e bot manda menu

Investigar:
- Divergência entre tempo de expiração de humano (`StateManager`) e timers no handler admin.

Correção típica:
- Alinhar expiração (ex.: 2h em ambos), e garantir que mensagens não sejam processadas quando humano ativo.

### C) “Não encontra o nome”

Investigar:
- Normalização: acentos, conectores (da/de/do), ordem de palavras, nome incompleto.

Correção típica:
- Match por tokens, ignorar stopwords (`da`, `de`, `do`, `dos`, `das`, `e`).
- Se houver múltiplos matches, pedir CPF (não mostrar lista pública por padrão).

### D) Consulta de situação sem “segunda chance”

Investigar:
- Fluxo encerrado cedo demais no roteador.

Correção típica:
- Implementar etapas: nome/CPF → CPF → telefone → humano.
- Não encerrar fluxo antes de terminar as tentativas.

## Critério de “pronto”

- PDF sem legenda não quebra fluxo.
- Nome parcial (ex.: sem “da/de”) encontra cliente com alta taxa de acerto.
- Admin assumiu: bot não interfere.
- Consulta situação: pelo menos 2 caminhos de fallback antes de transferir.

