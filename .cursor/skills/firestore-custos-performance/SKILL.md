---
name: firestore-custos-performance
description: Otimização de custo e performance no Firestore para o jme-bot. Use quando o usuário mencionar lentidão, custo alto, leituras demais, scans, endpoints que carregam muitos clientes/históricos, paginação, índices, ou otimização de queries do Firestore.
---

# Firestore — Custos e Performance (jme-bot)

## Objetivo

Reduzir leituras e latência (principalmente em endpoints do painel) sem quebrar a lógica de status/ciclo.

## Onde costuma ficar caro neste projeto

- Funções que fazem `db.collection('clientes').get()` e filtram em memória.
- Listagens que percorrem clientes e leem `historico_pagamentos` (subcoleção) para muitos clientes.
- Endpoints de dashboard que fazem múltiplas queries por base/cliente.

## Heurística rápida: o que procurar

### “Scan” (alto custo)

- `collection('X').get()` sem `where/limit` (principalmente `clientes`, `promessas`, `historico_conversa`)
- Loops que fazem `await ...doc(id)...get()` para N clientes sem limite de concorrência

### “N+1”

- Para cada cliente, buscar base/histórico individualmente.

## Estratégia padrão (ordem recomendada)

### 1) Reduzir leituras do histórico

Preferir:
- Ler **apenas 1 doc** do ciclo necessário:
  - `historico_pagamentos/{MM-YYYY}`

Evitar:
- `historico_pagamentos.get()` (subcoleção inteira) em listagens.

### 2) Materializar status do ciclo (quando fizer sentido)

Opções:
- Campo `status_ciclo_atual` no documento do cliente, atualizado quando:
  - baixa pagamento
  - reverter baixa
  - promessa criada/cancelada
  - virada de ciclo (job diário)

Trade-off:
- Mais escrita (barata e previsível) para menos leitura em dashboard.

### 3) Paginação e limites

Para endpoints que listam muitos docs:
- Sempre usar `limit` (ex.: 50/100/200)
- Implementar paginação com `startAfter` (cursor) e `orderBy`
- Evitar carregar “tudo” e filtrar no frontend

### 4) Índices

Se aparecer erro de índice composto:
- Criar índice necessário (documentar no repositório).

## Checklist por endpoint (como otimizar sem quebrar)

1. Medir:
   - Quantos clientes a base tem?
   - Quantas leituras por request?
2. Substituir “scan” por query:
   - usar `where('base_id','==',...)`
   - usar `orderBy` + `limit`
3. Reduzir histórico:
   - buscar doc do mês/ciclo necessário
4. Validar:
   - status do cliente bate com o painel (pago/pendente/inadimplente/promessa)
   - mês de referência exibido corretamente

## Saída esperada (quando aplicar esta skill)

Entregar:
- lista de hotspots (arquivo + função + padrão caro)
- proposta de mudança mínima (low-risk)
- validação manual sugerida (rotas e telas)

