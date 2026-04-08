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
│  │  State Manager              │   │
│  │  Fluxos (Suporte/Financeiro)│   │
│  │  Services (IA, Mensagens)   │   │
│  └─────────────────────────────┘   │
└────────┬───────────────────┬────────┘
         │                   │
         ↓                   ↓
┌────────────────┐   ┌──────────────┐
│   Firestore    │   │  Groq API    │
│   (Database)   │   │  (LLM/IA)    │
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
- Executar fluxos de atendimento
- Gerenciar estado das conversas
- Servir API REST para o painel admin
- Enviar eventos SSE em tempo real

**Stack**:
- Express 5
- whatsapp-web.js
- Firebase Admin SDK
- Groq SDK (LLM)
- pdf-parse (extração de dados)

**Estrutura de Pastas**:
```
.
├── index.js              # Entry point principal
├── stateManager.js       # Gerenciador de estado
├── config/
│   └── firebase.js       # Configuração Firebase
├── fluxos/               # Lógica de fluxos de atendimento
│   ├── suporte.js
│   ├── financeiro.js
│   ├── promessa.js
│   ├── novoCliente.js
│   └── cancelamento.js
├── services/             # Serviços de negócio
│   ├── fluxoService.js
│   ├── mensagemService.js
│   ├── cobrancaService.js
│   ├── groqService.js
│   └── whatsappService.js
├── middleware/           # Middlewares
│   ├── Mensagem.js       # Roteamento de mensagens
│   ├── comprovante.js    # Processamento de comprovantes
│   ├── timers.js         # Timers e agendamentos
│   └── auth.js           # Autenticação API
├── routes/               # Rotas da API REST
│   ├── index.js
│   ├── agendamentos.js
│   └── backup.js
├── database/             # Camada de dados
│   ├── funcoes-firebase.js
│   └── agendamentos-firebase.js
└── helpers/              # Utilitários
    ├── identificacao.js
    ├── banco.js
    └── util.js
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
  status: "ativo" | "inativo" | "suspenso",
  inadimplente: boolean,
  data_cadastro: timestamp,
  
  // Subcoleção
  historico_pagamentos/{MM-YYYY}: {
    pago: boolean,
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

#### Collection: `agendamentos`
```javascript
{
  id: string,
  cliente_id: string,
  tipo: "instalacao" | "suporte" | "visita",
  data_agendamento: timestamp,
  status: "pendente" | "concluido" | "cancelado",
  descricao: string
}
```

#### Collection: `historico_conversa`
```javascript
{
  id: string,
  cliente_id: string,
  telefone: string,
  mensagem: string,
  tipo: "recebida" | "enviada",
  timestamp: timestamp,
  fluxo: string
}
```

### 4. Groq API (IA)

**Uso**:
- Classificação de intenções do usuário
- Extração de dados de comprovantes (via OCR/visão)
- Análise de sentimento (futuro)

**Modelo**: `llama-3.3-70b-versatile`

## 🔄 Fluxos Principais

### Fluxo 1: Recebimento de Mensagem

```
WhatsApp → Bot recebe mensagem
    ↓
Middleware Mensagem.js (roteamento)
    ↓
Verifica se há fluxo ativo (StateManager)
    ↓
┌─────────────────────────────────────┐
│  SIM: Continua fluxo ativo          │
│  NÃO: Classifica intenção (Groq)    │
└─────────────────────────────────────┘
    ↓
Executa fluxo apropriado
    ↓
Envia resposta via WhatsApp
    ↓
Atualiza Firestore (se necessário)
    ↓
Emite evento SSE para painel
```

### Fluxo 2: Consulta de Situação

```
Cliente: "Oi"
    ↓
Bot: Menu inicial
    ↓
Cliente: "2" (Consultar situação)
    ↓
Bot: "Me informe seu nome"
    ↓
Cliente: "João Silva"
    ↓
Busca no Firestore (helpers/identificacao.js)
    ↓
┌─────────────────────────────────────┐
│  Encontrou 1: Mostra situação       │
│  Encontrou N: Pede CPF              │
│  Não encontrou: Pede CPF/telefone   │
└─────────────────────────────────────┘
    ↓
Consulta historico_pagamentos
    ↓
Retorna status: Pago / Pendente / Atrasado
```

### Fluxo 3: Processamento de Comprovante

```
Cliente envia PDF/imagem
    ↓
middleware/comprovante.js detecta mídia
    ↓
┌─────────────────────────────────────┐
│  PDF: pdf-parse extrai texto        │
│  Imagem: Groq Vision extrai dados   │
└─────────────────────────────────────┘
    ↓
Extrai: valor, data, banco
    ↓
Identifica cliente (por contexto do fluxo)
    ↓
Registra pagamento no Firestore
    ↓
Atualiza status_ciclo_atual
    ↓
Confirma para o cliente
```

### Fluxo 4: Dashboard em Tempo Real (SSE)

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
   - Groq API Key protegida
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
   - Cache de dados de cliente em memória (StateManager)
   - Queries específicas por ciclo (não busca todo histórico)

2. **Backend**
   - Debounce de mensagens (evita loops)
   - Timers para expiração de fluxos
   - Reuso de conexão WhatsApp (LocalAuth)

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

Ver [SKILL: Firestore Performance](../.cursor/skills/firestore-custos-performance/SKILL.md)

## 🚀 Deploy

### Backend (Fly.io)

- Volume persistente em `/data` para sessão WhatsApp
- Variáveis de ambiente via `fly secrets`
- Auto-scaling desabilitado (stateful)
- Health check em `/api/health`

### Frontend (Vercel)

- Build estático otimizado
- CDN global
- Variáveis `VITE_*` em build time
- Auto-deploy no push para `main`

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
- [ ] Webhooks de pagamento
- [ ] TTL em historico_conversa

### Médio Prazo
- [ ] Multi-tenancy (múltiplas empresas)
- [ ] Autenticação JWT no painel
- [ ] Relatórios personalizados
- [ ] Integração com ERPs

### Longo Prazo
- [ ] Microserviços (separar bot de API)
- [ ] Cache distribuído (Redis)
- [ ] Filas (Bull/RabbitMQ)
- [ ] IA generativa para respostas

---

**Última atualização**: 2024-05-20
**Revisado por**: Equipe JME.NET
