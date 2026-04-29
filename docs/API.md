# API Documentation - JME-BOT

## 🔐 Autenticação

Todos os endpoints `/api/*` (exceto `/qr`, `/api/status`, `/api/status-stream`, `/api/health`) requerem:

```http
x-api-key: YOUR_ADMIN_API_KEY
```

**⚠️ Em produção, SEMPRE defina `ADMIN_API_KEY` no `.env` (Railway secrets)!**

## 📡 Base URL

```
Desenvolvimento: http://localhost:3001
Produção (Railway): https://jme-bot-backend-production.up.railway.app
```

---

## Endpoints Públicos (sem autenticação)

### `GET /qr`

QR Code PNG para conectar WhatsApp.

**⚠️ Risco crítico: exposto publicamente → qualquer pessoa pode assumir o número. Proteger com IP whitelist ou proxy auth em produção.**

**Response**: Imagem PNG

---

### `GET /api/status-stream`

Stream SSE de status em tempo real.

**Response**: `text/event-stream`

```json
data: {"online":true,"iniciadoEm":"2026-04-29T10:00:00.000Z","botAtivo":true,"situacaoRede":"normal"}

data: {"online":false}

data: {"botAtivo":false}
```

---

### `GET /api/status`

Status do bot.

**Response**:
```json
{
  "botAtivo": true,
  "online": true,
  "iniciadoEm": "2026-04-29T10:00:00.000Z",
  "situacaoRede": "normal",
  "previsaoRetorno": "sem previsão"
}
```

---

## Clientes

### `GET /api/clientes`

Lista clientes com paginação e filtros.

**Query params**:
- `page` (number, default: 1)
- `limit` (number, default: 50, max: 200)
- `base_id` (string)
- `status` (string): `pago`, `pendente`, `isento`, `promessa`, `cancelado`
- `nome` (string) — busca por nome (usa `buscarClientePorNome`, limit 500)

**Response**:
```json
{
  "clientes": [
    {
      "id": "cliente123",
      "nome": "João Silva",
      "cpf": "123.456.789-00",
      "telefones": ["5581999999999"],
      "telefone": "5581999999999",
      "endereco": { "rua": "...", "numero": "...", "bairro": "...", "cidade": "...", "uf": "PE", "cep": "50000-000" },
      "plano": { "nome": "100 Mega", "valor": 79.90 },
      "base_id": "base1",
      "status": "pendente",
      "dia_vencimento": 10,
      "data_cadastro": "2024-01-15T10:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 150, "pages": 3 }
}
```

**⚠️ Nota**: `buscarClientePorNome` usa `limit(500)` — não escala para bases grandes.

---

### `GET /api/clientes/:id`

Busca cliente por ID.

**Response**: Documento cliente completo com subcoleção `historico_pagamentos`.

---

### `POST /api/clientes`

Cria novo cliente.

**Body**:
```json
{
  "nome": "João Silva",
  "cpf": "12345678900",
  "telefones": ["5581999999999"],
  "endereco": { "rua": "...", "numero": "...", "bairro": "...", "cidade": "...", "uf": "PE", "cep": "50000-000" },
  "plano": { "nome": "100 Mega", "valor": 79.90 },
  "base_id": "base1",
  "dia_vencimento": 10
}
```

**Response**: `201 Created` com `{ id: "novoId" }`

---

### `PUT /api/clientes/:id`

Atualiza campos de cliente.

---

### `DELETE /api/clientes/:id`

Soft delete (marca `status: 'cancelado'`).

---

### `GET /api/clientes/buscar`

Busca por telefone (tenta variantes com/sem 55, com/sem 9º dígito).

**Query**: `telefone` (string)

---

### `GET /api/bases`

Lista todas as bases.

---

## Cobrança

### `POST /api/cobrar/manual`

Dispara cobrança manual para todos os clientes de um dia de vencimento.

**Body**:
```json
{
  "data": "10",
  "tipo": "lembrete"
}
```

`data`: `"10"`, `"20"` ou `"30"`
`tipo`: `"lembrete"`, `"atraso"`, `"atraso_final"`, `"reconquista"`, `"reconquista_final"` (opcional, default `"auto"`)

**Fluxo**:
1. Verifica se já foi disparado hoje (via `log_cobrancas`)
2. `dispararCobrancaReal` em modo **BUSCA** (busca todos os clientes do dia, filtra e envia)
3. Relatório para admins via WhatsApp

**Response**:
```json
{ "ok": true, "mensagem": "Disparo iniciado", "logId": "logId" }
```

---

### `GET /api/cobrar/agenda`

Retorna agenda de cobranças do mês atual (quais dias já tiveram disparo).

**Response**:
```json
{
  "agenda": {
    "9": [{ "data": "10", "tipo": "lembrete", "clientes": 25, "status": "realizado" }],
    "13": [{ "data": "10", "tipo": "atraso", "clientes": 12, "status": "realizado" }]
  },
  "diaAtual": 14,
  "mes": 4,
  "ano": 2026,
  "pendencia": null
}
```

---

## Promessas

### `GET /api/promessas`

Lista promessas.

**Query**:
- `status` (string): `pendente`, `pago`, `cancelada`

---

### `POST /api/promessas`

Cria promessa.

**Body**:
```json
{
  "cliente_id": "cliente123",
  "nome": "João Silva",
  "numero": "5581999999999",
  "data_promessa": "2026-05-05",
  "observacao": "Recebe dia 5"
}
```

---

### `POST /api/promessas/:id/pago`

Marca promessa como paga. Atualiza `status` do cliente para `pago` e insere registro em `historico_pagamentos`.

---

### `POST /api/promessas/:id/cancelar`

Cancela promessa. Restaura `status` do cliente para `pendente` se necessário.

---

### `DELETE /api/promessas/:id`

Remove promessa.

---

### `POST /api/promessas/verificar`

Dispara verificação de promessas vencidas (muda status para `vencida` e clientes de `promessa` → `pendente`).

---

## Carnê

### `GET /api/carne`

Lista solicitações de carnê.

**Query**: `status` (opcional)

---

### `POST /api/carne`

Solicita carnê para cliente.

**Body**:
```json
{
  "cliente_id": "cliente123",
  "nome": "João Silva",
  "numero": "5581999999999",
  "endereco": "Rua das Flores 123, Centro",
  "observacao": "Cliente preferiu carnê físico"
}
```

---

### `POST /api/carne/:id/imprimir`

Marca carnê como impresso.

---

### `POST /api/carne/:id/entregar`

Marca como entregue. Envia notificação WhatsApp para o cliente.

---

### `DELETE /api/carne/:id`

Remove solicitação de carnê.

---

## Agendamentos

### `GET /api/agendamentos`

Lista agendamentos.

**Query**:
- `data_inicio`, `data_fim` (date)
- `status`: `pendente`, `concluido`, `cancelado`
- `tipo`: `instalacao`, `suporte`, `visita`

---

### `POST /api/agendamentos`

Cria agendamento.

---

### `PUT /api/agendamentos/:id`

Atualiza agendamento.

---

## Instalações Agendadas

### `GET /api/instalacoes-agendadas`

Lista instalações pendentes.

**Query**: `status`, `base_id`

---

### `POST /api/instalacoes-agendadas`

Cria instalação agendada.

---

### `PUT /api/instalacoes-agendadas/:id`

Atualiza.

---

## Dashboard

### `GET /api/dashboard/resumo-bases`

Estatísticas por base.

---

### `GET /api/dashboard/caixa-hoje`

Movimentação do dia.

---

### `GET /api/dashboard/alertas`

Alertas ativos (clientes sem telefone, promessas, inadimplência).

---

### `GET /api/dashboard/fluxo-clientes`

Fluxo de clientes (novos, cancelados, reactivados no período).

---

## Relatórios

### `GET /api/relatorios/inadimplentes`

Lista inadimplentes por base.

**Query**: `base_id`

---

### `GET /api/relatorios/estatisticas`

Estatísticas gerais.

---

### `GET /api/relatorios/grafico`

Dados para gráficos (arrecadação por dia/mês).

---

### `GET /api/relatorios/exportar`

Exporta clientes em JSON.

---

### `GET /api/relatorios/planilha`

Exporta clientes em formato planilha.

---

## Admin

### `GET /api/admin/clientes-recentes`

Lista clientes modificados recentemente.

---

### `POST /api/admin/baixa-retroativa`

Baixa pagamento de ciclo anterior manualmente.

---

### `GET /api/admin/sgp`

Dados do SGP.

---

### `POST /api/admin/isentar-mensalidade`

Isenta mês de entrada para novo cliente.

---

## Logs

### `GET /api/logs/cobrancas`

Logs de cobranças.

---

### `GET /api/logs/comprovantes`

Logs de comprovantes.

---

### `GET /api/logs/bot`

Logs gerais do bot.

---

### `GET /api/logs/estatisticas`

Estatísticas de logs.

---

## Bot

### `GET /api/bot/horario`

Horário de funcionamento.

---

### `PUT /api/bot/horario`

Atualiza horário.

---

### `GET /api/bot/rede`

Status da rede.

---

### `PUT /api/bot/rede`

Atualiza status da rede.

---

### `POST /api/bot/toggle`

Liga/desliga bot.

---

### `GET /api/bot/ciclo-info`

Informações do ciclo de cobrança atual.

---

## Cancelamentos

### `GET /api/cancelamentos`

Lista cancelamentos.

---

### `POST /api/cancelamentos`

Cria registro de cancelamento.

---

### `DELETE /api/cancelamentos/:id`

Remove cancelamento.

---

## Boas-Vindas

### `POST /api/boas-vindas/enviar`

Envia mensagem de boas-vindas para cliente.

---

## Alertas

### `GET /api/alertas`

Lista alertas.

---

### `POST /api/alertas/:id/reconhecer`

Marca alerta como reconhecido.

---

## Backup

### `GET /api/backup/clientes`

Exporta clientes em JSON.

---

### `POST /api/backup/restore`

Restaura clientes de backup.

---

## Migração

### `POST /api/migracao/executar`

Executa migração de planilha de clientes.

---

## Paginação

### `GET /api/paginacao/:colecao`

Paginação genérica.

---

## ⚠️ Códigos de Erro

| Código | Descrição |
|--------|-----------|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request — dados inválidos |
| 401 | Unauthorized — API Key inválida |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Internal Server Error |
| 503 | Service Unavailable — bot offline |

---

**Última atualização**: 2026-04-29
