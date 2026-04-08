# API Documentation - JME-BOT

## 🔐 Autenticação

Todos os endpoints `/api/*` (exceto `/api/health` e `/api/status`) requerem autenticação via header:

```http
x-api-key: YOUR_ADMIN_API_KEY
```

**⚠️ Em produção, SEMPRE defina `ADMIN_API_KEY` no .env!**

## 📡 Base URL

```
Desenvolvimento: http://localhost:3001
Produção: https://seu-dominio.fly.dev
```

---

## Endpoints

### 🏥 Health & Status

#### `GET /api/health`

Health check do serviço.

**Autenticação**: Não requerida

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-05-20T10:30:00.000Z",
  "uptime": 3600
}
```

---

#### `GET /api/status`

Status detalhado do bot WhatsApp.

**Autenticação**: Não requerida

**Response**:
```json
{
  "online": true,
  "iniciadoEm": "2024-05-20T10:00:00.000Z",
  "qrCode": null,
  "sessaoAtiva": true
}
```

---

#### `GET /api/status-stream`

Stream SSE (Server-Sent Events) de status em tempo real.

**Autenticação**: Não requerida

**Response**: `text/event-stream`

**Exemplo**:
```
data: {"online":true,"iniciadoEm":"2024-05-20T10:00:00.000Z"}

data: {"online":false,"qrCode":"data:image/png;base64,..."}
```

---

### 👥 Clientes

#### `GET /api/clientes`

Lista todos os clientes com paginação.

**Query Params**:
- `page` (number, default: 1)
- `limit` (number, default: 50, max: 200)
- `base_id` (string, optional) - Filtrar por base
- `status` (string, optional) - Filtrar por status
- `inadimplente` (boolean, optional) - Filtrar inadimplentes

**Response**:
```json
{
  "clientes": [
    {
      "id": "cliente123",
      "nome": "João Silva",
      "cpf": "123.456.789-00",
      "telefones": ["5581999999999"],
      "base_id": "base1",
      "status": "ativo",
      "inadimplente": false,
      "data_cadastro": "2024-01-15T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}
```

---

#### `GET /api/clientes/:id`

Busca cliente por ID.

**Response**:
```json
{
  "id": "cliente123",
  "nome": "João Silva",
  "cpf": "123.456.789-00",
  "telefones": ["5581999999999"],
  "endereco": {
    "rua": "Rua das Flores",
    "numero": "123",
    "bairro": "Centro",
    "cidade": "Recife",
    "uf": "PE",
    "cep": "50000-000"
  },
  "plano": {
    "nome": "100 Mega",
    "valor": 79.90,
    "vencimento": 10
  },
  "base_id": "base1",
  "status": "ativo",
  "inadimplente": false,
  "historico_pagamentos": []
}
```

---

#### `POST /api/clientes`

Cria novo cliente.

**Body**:
```json
{
  "nome": "João Silva",
  "cpf": "12345678900",
  "telefones": ["5581999999999"],
  "base_id": "base1",
  "plano": {
    "nome": "100 Mega",
    "valor": 79.90,
    "vencimento": 10
  }
}
```

**Response**: `201 Created`

---

#### `PUT /api/clientes/:id`

Atualiza cliente existente.

**Body**: Campos a atualizar

**Response**: `200 OK`

---

#### `DELETE /api/clientes/:id`

Remove cliente (soft delete - marca como inativo).

**Response**: `204 No Content`

---

### 💰 Promessas

#### `GET /api/promessas`

Lista promessas com filtros.

**Query Params**:
- `ativa` (boolean) - Apenas ativas
- `base_id` (string) - Filtrar por base
- `cliente_id` (string) - Filtrar por cliente

**Response**:
```json
{
  "promessas": [
    {
      "id": "promessa123",
      "cliente_id": "cliente123",
      "cliente_nome": "João Silva",
      "valor": 79.90,
      "data_promessa": "2024-05-25",
      "observacao": "Recebe dia 25",
      "ativa": true,
      "cumprida": false,
      "criada_em": "2024-05-20T10:00:00.000Z"
    }
  ]
}
```

---

#### `POST /api/promessas`

Cria nova promessa de pagamento.

**Body**:
```json
{
  "cliente_id": "cliente123",
  "valor": 79.90,
  "data_promessa": "2024-05-25",
  "observacao": "Recebe dia 25"
}
```

**Response**: `201 Created`

---

#### `PUT /api/promessas/:id/cumprir`

Marca promessa como cumprida.

**Response**: `200 OK`

---

#### `DELETE /api/promessas/:id`

Cancela promessa.

**Response**: `204 No Content`

---

### 📅 Agendamentos

#### `GET /api/agendamentos`

Lista agendamentos.

**Query Params**:
- `data_inicio` (date) - Data inicial
- `data_fim` (date) - Data final
- `status` (string) - pendente, concluido, cancelado
- `tipo` (string) - instalacao, suporte, visita

**Response**:
```json
{
  "agendamentos": [
    {
      "id": "agend123",
      "cliente_id": "cliente123",
      "cliente_nome": "João Silva",
      "tipo": "suporte",
      "data_agendamento": "2024-05-21T14:00:00.000Z",
      "descricao": "Problema de conexão",
      "status": "pendente",
      "criado_em": "2024-05-20T10:00:00.000Z"
    }
  ]
}
```

---

#### `POST /api/agendamentos`

Cria novo agendamento.

**Body**:
```json
{
  "cliente_id": "cliente123",
  "tipo": "suporte",
  "data_agendamento": "2024-05-21T14:00:00.000Z",
  "descricao": "Problema de conexão"
}
```

**Response**: `201 Created`

---

#### `PUT /api/agendamentos/:id`

Atualiza agendamento.

**Response**: `200 OK`

---

### 🛠️ Instalações Agendadas

#### `GET /api/instalacoes-agendadas`

Lista instalações agendadas.

**Query Params**:
- `status` (string)
- `base_id` (string)

**Response**:
```json
{
  "instalacoes": [
    {
      "id": "inst123",
      "nome": "Maria Santos",
      "telefone": "5581988888888",
      "endereco": "Rua das Palmeiras, 456",
      "data_agendamento": "2024-05-22T09:00:00.000Z",
      "status": "pendente",
      "base_id": "base1"
    }
  ]
}
```

---

### 📊 Dashboard

#### `GET /api/dashboard/stats`

Estatísticas gerais do dashboard.

**Response**:
```json
{
  "clientes_ativos": 150,
  "inadimplentes": 12,
  "promessas_ativas": 8,
  "agendamentos_hoje": 5,
  "receita_mes": 11985.00,
  "taxa_inadimplencia": 8.0
}
```

---

#### `GET /api/dashboard/bases`

Estatísticas por base.

**Response**:
```json
{
  "bases": [
    {
      "base_id": "base1",
      "nome": "Boa Viagem",
      "total_clientes": 80,
      "inadimplentes": 6,
      "receita_mes": 6392.00
    }
  ]
}
```

---

### 💸 Cobrança

#### `POST /api/cobranca/enviar`

Envia cobrança manual para cliente.

**Body**:
```json
{
  "cliente_id": "cliente123",
  "mensagem_personalizada": "Olá! Seu boleto está disponível..."
}
```

**Response**: `200 OK`

---

#### `POST /api/cobranca/automatica`

Dispara cobrança automática para inadimplentes.

**Body**:
```json
{
  "base_id": "base1",
  "dias_atraso_minimo": 5
}
```

**Response**:
```json
{
  "enviadas": 12,
  "falhas": 1,
  "detalhes": []
}
```

---

### 📄 Backup

#### `GET /api/backup/clientes`

Exporta todos os clientes em JSON.

**Response**: Arquivo JSON para download

---

#### `GET /api/backup/completo`

Backup completo do banco de dados.

**Response**: Arquivo JSON com todas as coleções

---

### 🖼️ QR Code

#### `GET /qr`

Retorna QR Code para conectar WhatsApp.

**Autenticação**: Não requerida

**⚠️ Deve ser protegido em produção!**

**Response**: Imagem PNG do QR Code

---

### 📝 Logs

#### `GET /api/logs`

Retorna logs do sistema.

**Query Params**:
- `level` (string) - error, warn, info
- `limit` (number) - Máximo de linhas

**Response**:
```json
{
  "logs": [
    {
      "timestamp": "2024-05-20T10:30:00.000Z",
      "level": "info",
      "message": "Cliente identificado: João Silva"
    }
  ]
}
```

---

## 🔄 Webhooks (Futuro)

### `POST /webhook/pagamento`

Recebe notificação de pagamento de gateway.

**Status**: Em desenvolvimento

---

## ⚠️ Códigos de Erro

| Código | Descrição |
|--------|-----------|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request - Dados inválidos |
| 401 | Unauthorized - API Key inválida |
| 403 | Forbidden - Sem permissão |
| 404 | Not Found - Recurso não encontrado |
| 409 | Conflict - Conflito (ex: CPF duplicado) |
| 500 | Internal Server Error |
| 503 | Service Unavailable - Bot offline |

---

## 📚 Exemplos de Uso

### JavaScript/Fetch

```javascript
const response = await fetch('https://seu-dominio.fly.dev/api/clientes', {
  headers: {
    'x-api-key': 'YOUR_API_KEY'
  }
});

const data = await response.json();
```

### cURL

```bash
curl -H "x-api-key: YOUR_API_KEY" \
  https://seu-dominio.fly.dev/api/clientes
```

### React (Frontend)

```javascript
import { apiClient } from './api/client';

const clientes = await apiClient.get('/clientes');
```

---

## 🚀 Rate Limiting

**Atualmente não implementado**, mas recomendado para produção:

- 100 requests/minuto por IP
- 1000 requests/hora por API Key

---

## 📖 Versionamento

API atual: **v1** (implícito, sem prefixo)

Futuras versões usarão prefixo: `/api/v2/...`

---

**Última atualização**: 2024-05-20
