# Arquitetura do JME-BOT

## 🏗️ Visão Geral

O JME-BOT é uma aplicação distribuída composta por três componentes principais:

```
┌─────────────────┐
│   WhatsApp      │
│   Business      │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────────┐
│         Bot Backend                 │
│  (Node.js + Express + whatsapp.js) │
│  ┌─────────────────────────────┐   │
│  │  Services (Mensagens,       │   │
│  │  Cobrança, WhatsApp)         │   │
│  └─────────────────────────────┘   │
└────────┬───────────────────┬────────┘
         │                   │
         ↓                   ↓
┌────────────────┐   ┌──────────────┐
│   Firestore    │   │  SSE Stream  │
│   (Database)   │   │  (Real-time) │
└────────────────┘   └──────────────┘
         ↑
         │ (SSE + REST)
         │
┌────────────────────────────────┐
│     Painel Admin (React)       │
│  Dashboard | Clientes | Stats  │
└────────────────────────────────┘
```

## 📦 Componentes

### 1. Bot Backend (Node.js)

**Localização**: Raiz do projeto (`index.js`)

**Responsabilidades**:
- Gerenciar conexão WhatsApp via `whatsapp-web.js`
- Processar mensagens recebidas
- Executar cobranças automáticas
- Servir API REST para o painel admin
- Enviar eventos SSE em tempo real

**Stack**:
- Express 5
- whatsapp-web.js
- Firebase Admin SDK
- pdf-parse (extração de dados)

**Estrutura de Pastas**:
```
.
├── index.js              # Entry point principal
├── config/
│   └── firebase.js       # Configuração Firebase
├── services/             # Serviços de negócio
│   ├── mensagemService.js
│   ├── cobrancaService.js
│   ├── whatsappService.js
│   ├── adminService.js
│   ├── statusService.js
│   └── sseService.js
├── middleware/           # Middlewares
│   ├── timers.js         # Timers e agendamentos
│   └── auth.js           # Autenticação API
├── routes/               # Rotas da API REST (12 arquivos)
│   ├── index.js
│   ├── bot.js
│   ├── clientes.js
│   ├── cobranca.js
│   ├── dashboard.js
│   ├── logs.js
│   ├── chamados.js
│   ├── cancelamentos.js
│   ├── instalacoes.js
│   ├── relatorios.js
│   ├── admin.js
│   ├── boas-vindas.js
│   └── migracao.js
├── database/             # Camada de dados
│   └── funcoes-firebase.js
└── helpers/              # Utilitários
    └── banco.js
```

### 2. Painel Admin (React)

**Localização**: `frontend/`

**Responsabilidades**:
- Interface de gerenciamento
- Dashboard com métricas em tempo real
- CRUD de clientes, promessas, agendamentos
- Visualização de histórico
- Backup e exportação

**Stack**:
- React 18 + Vite
- React Router DOM
- Recharts (gráficos)
- Server-Sent Events (atualização em tempo real)

**Estrutura**:
```
frontend/
├── src/
│   ├── main.jsx          # Entry point
│   ├── App.jsx           # App principal com rotas
│   ├── pages/            # Páginas
│   │   ├── dashboard.jsx
│   │   ├── clientes.jsx
│   │   ├── promessas.jsx
│   │   └── agendamentos.jsx
│   ├── components/       # Componentes reutilizáveis
│   │   ├── TopNav.jsx
│   │   ├── StatusBadge.jsx
│   │   └── Pagination.jsx
│   ├── contexts/         # Context API
│   │   ├── ThemeContext.jsx
│   │   └── NotificationContext.jsx
│   ├── hooks/            # Custom hooks
│   │   ├── useFetch.js
│   │   ├── usePagination.js
│   │   └── useSSEData.js
│   ├── api/              # Cliente API
│   │   └── client.js
│   └── utils/            # Utilitários
│       └── formatadores.js
└── public/
```

### 3. Firestore (Banco de Dados)

**Schema Principais**:

#### Collection: `clientes`
```javascript
{
  id: string,
  nome: string,
  cpf: string,
  telefones: string[],
  endereco: {
    rua, numero, bairro, cidade, uf, cep
  },
  plano: {
    nome, valor, vencimento
  },
  base_id: string,
  status: "pago" | "pendente" | "isento" | "promessa" | "cancelado",
  dia_vencimento: number,
  data_cadastro: timestamp,

  // Subcoleção
  historico_pagamentos/{MM-YYYY}: {
    status: "pago" | "pendente" | "isento",
    data_pagamento: timestamp,
    valor: number,
    forma_pagamento: string
  }
}
```

#### Collection: `promessas`
```javascript
{
  id: string,
  cliente_id: string,
  base_id: string,
  valor: number,
  data_promessa: date,
  ativa: boolean,
  cumprida: boolean,
  observacao: string,
  criada_em: timestamp
}
```

#### Collection: `carne_solicitacoes`
```javascript
{
  id: string,
  cliente_id: string,
  status: "solicitado" | "impresso" | "entregue",
  data_solicitacao: timestamp
}
```

#### Collection: `log_cobrancas`
```javascript
{
  id: string,
  numero: string,
  nome: string,
  data_vencimento: string,
  data_envio: string,
  tipo: string,
  status: "enviado" | "falha",
  enviado_em: timestamp
}
```

## 🔄 Fluxos Principais

### Fluxo 1: Cobrança Automática

```
Timer dispara (D-1, D+3, D+5, D+7, D+10)
    ↓
adminService filtra clientes elegíveis
    ↓
Verifica promessas ativas
    ↓
Verifica histórico de pagamentos
    ↓
cobrancaService envia mensagens
    ↓
Relatório enviado para admins via WhatsApp
```

### Fluxo 2: Dashboard em Tempo Real (SSE)

```
Frontend conecta em /api/status-stream
    ↓
Backend mantém conexão SSE aberta
    ↓
Eventos emitidos quando:
  - Bot conecta/desconecta WhatsApp
  - Nova mensagem recebida
  - Cliente identificado
  - Promessa criada
  - Agendamento criado
    ↓
Frontend recebe evento
    ↓
Atualiza UI sem recarregar página
```

## 🔐 Segurança

### Camadas de Proteção

1. **API Key** (`ADMIN_API_KEY`)
   - Header `x-api-key` obrigatório
   - Validado em `middleware/auth.js`

2. **Ambiente de Variáveis**
   - Credenciais Firebase em secrets
   - Nunca commitadas no Git

3. **Proteção QR Code**
   - Endpoint `/qr` deve ser protegido em produção
   - Recomendado: Basic Auth no proxy/IP whitelist

4. **Sanitização**
   - Inputs validados antes de queries
   - XSS prevention no frontend

## ⚡ Performance

### Otimizações Implementadas

1. **Firestore**
   - Índices compostos para queries frequentes
   - Paginação com `limit()` e cursors
   - Queries específicas por ciclo (não busca todo histórico)
   - Sempre `where` + `limit` (nunca scan total)

2. **Backend**
   - Timeout em chamadas WhatsApp (comTimeout helper)
   - Reuso de conexão WhatsApp (LocalAuth)
   - Rotas modularizadas em 12 arquivos

3. **Frontend**
   - Lazy loading de páginas
   - Memoização de componentes pesados
   - SSE para updates (vs polling)
   - Build otimizado com Vite

### Pontos de Atenção

⚠️ **Gargalos potenciais**:
- `historico_conversa` pode crescer muito (considerar TTL)
- Queries sem índice em produção
- Scan de `clientes` sem filtro de base
- N+1 ao buscar histórico de múltiplos clientes

Ver [SKILL: Firestore Performance](docs/skills/firestorecustosperformance.md)

## 🚀 Deploy

### Backend (Railway)

- Build Command: `npm install && npx puppeteer browsers install chrome`
- Start Command: `node index.js`
- Variáveis de ambiente configuradas no dashboard
- Porta definida automaticamente (Railway usa 8080)
- Sessão WhatsApp persistente via LocalAuth em `/data/.wwebjs_auth`

### Frontend (Vercel)

- Build estático otimizado
- CDN global
- Variáveis `VITE_*` em build time
- Auto-deploy no push para `main`
- `VITE_API_URL` deve apontar para o backend (Railway)

## 📊 Monitoramento

### Métricas Importantes

1. **WhatsApp**
   - Status conexão (online/offline)
   - Tempo de uptime
   - Mensagens processadas/min

2. **Firestore**
   - Reads/dia (custo)
   - Writes/dia
   - Latência de queries

3. **API**
   - Requests/min
   - Erros 5xx
   - Latência p95

4. **Frontend**
   - Conexões SSE ativas
   - Tempo de carregamento

## 🔄 Próximas Melhorias

### Curto Prazo
- [ ] Rate limiting na API
- [ ] Logs estruturados (Winston)
- [ ] TTL em historico_conversa

### Médio Prazo
- [ ] Autenticação JWT no painel
- [ ] Relatórios personalizados
- [ ] Integração com ERPs

### Longo Prazo
- [ ] Microserviços (separar bot de API)
- [ ] Cache distribuído (Redis)
- [ ] Filas (Bull/RabbitMQ)

---

**Última atualização**: 2026-04-22
**Revisado por**: Equipe JME.NET