# Arquitetura do JME-BOT

## 🏗️ Visão Geral

O JME-BOT é uma aplicação distribuída com três componentes:

```
┌─────────────────┐
│   WhatsApp      │
│   Business      │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────────┐
│         Bot Backend                 │
│  (Node.js + Express 5 + whatsapp.js)│
│  ┌─────────────────────────────┐   │
│  │  Services (Cobrança, SSE,  │   │
│  │  WhatsApp, Status)          │   │
│  └─────────────────────────────┘   │
└────────┬───────────────────┬────────┘
         │                   │
         ↓                   ↓
┌────────────────┐   ┌──────────────┐
│   Firestore    │   │  SSE Stream   │
│   Database     │   │  (Real-time) │
└────────────────┘   └──────────────┘
         ↑
         │ (SSE + REST)
         │
┌────────────────────────────────┐
│     Painel Admin (React)       │
│  Dashboard | Clientes | Stats   │
└────────────────────────────────┘
```

**IMPORTANTE**: O bot NÃO possui fluxo de atendimento automático via WhatsApp. Não há `client.on('message')`, menus automáticos, chatbot ou estados de conversa. O WhatsApp é usado exclusivamente para envio de mensagens (cobranças, notificações). O painel admin é a interface principal de operação.

## 📦 Componentes

### 1. Bot Backend (Node.js)

**Localização**: `index.js` (entry point)

**Responsabilidades**:
- Manter conexão WhatsApp via `whatsapp-web.js` + `RemoteAuth`
- Persistir sessão no Firebase Storage (zip)
- Executar timers em background (cobranças automáticas, limpeza, notificações)
- Servir API REST para o painel admin
- Enviar eventos SSE em tempo real
- **NÃO processa mensagens recebidas** (sem chatbot, sem atendimento automático)

**Stack**:
- Node.js
- Express 5
- whatsapp-web.js (RemoteAuth strategy)
- Firebase Admin SDK
- archiver (zip para sessão)
- fs-extra / unzipper (RemoteAuth requirements)
- qrcode

**Dependências** (`package.json`):
```
archiver, cors, dotenv, express, firebase-admin,
fs-extra, qrcode, unzipper, whatsapp-web.js
```

**Estrutura de Pastas**:
```
.
├── index.js                    # Entry point — Express + WhatsApp client
├── config/
│   └── firebase.js             # Firebase Admin SDK
├── services/
│   ├── FirestoreStore.js       # RemoteAuth store — salva sessão no Storage
│   ├── adminService.js         # Votação de admins + verificação automática
│   ├── cobrancaService.js      # Disparo de cobranças (lista filtrada ou busca)
│   ├── mensagemService.js      # Geração de mensagens de cobrança/PIX
│   ├── sseService.js           # Server-Sent Events em tempo real
│   ├── statusService.js        # Ciclos de cobrança, deveSerCobrado
│   ├── utilsService.js         # Utilitários gerais
│   └── whatsappService.js      # Envio seguro com timeout (comTimeout)
├── middleware/
│   ├── auth.js                # Autenticação API via x-api-key
│   └── timers.js               # Timers em background (2h, diário, 08h BRT)
├── routes/                     # 17 arquivos de rota (além do index.js)
│   ├── index.js                # Monta todas as rotas no app
│   ├── admin.js                # Limpar estado, SGP, baixa retroativa
│   ├── agendamentos.js         # CRUD de agendamentos
│   ├── alertas.js              # Alertas do sistema
│   ├── backup.js               # Exportação e restauração
│   ├── bot.js                  # Horário, rede, ciclo-info, toggle
│   ├── boas-vindas.js          # Envio de boas-vindas
│   ├── cancelamentos.js        # CRUD de cancelamentos
│   ├── chamados.js             # Listagem e gestão de chamados
│   ├── clientes.js             # CRUD, busca por nome/telefone
│   ├── cobranca.js             # Cobrança manual, promessas, carnê
│   ├── dashboard.js            # Resumo bases, caixa, alertas, fluxo
│   ├── instalacoes.js          # CRUD de instalações
│   ├── instalacoes-agendadas.js # Instalações pendentes
│   ├── logs.js                 # Logs de cobranças, bot, comprovantes
│   ├── migracao.js             # Migração de planilhas
│   ├── paginacao.js            # Paginação genérica
│   └── relatorios.js           # Inadimplentes, gráficos, exportar
├── database/
│   ├── funcoes-firebase.js     # Queries de clientes, histórico, logs
│   ├── agendamentos-firebase.js
│   └── instalacoes-agendadas-firebase.js
└── helpers/
    └── banco.js
```

### 2. Painel Admin (React)

**Localização**: `frontend/`

**Responsabilidades**:
- Interface de gerenciamento de clientes, promessas, agendamentos
- Dashboard com métricas em tempo real
- Disparo manual de cobranças
- Gestão de cancelamentos, instalações, relatórios
- Backup e exportação

**Stack**:
- React + Vite
- React Router DOM
- Recharts (gráficos)
- Server-Sent Events (atualização em tempo real)

### 3. Firestore (Banco de Dados)

#### Collection: `clientes`
```javascript
{
  id: string,
  nome: string,
  cpf: string,
  telefones: string[],        // Array — campo principal
  telefone: string,          // Legado — clientes importados de planilha
  endereco: {
    rua, numero, bairro, cidade, uf, cep
  },
  plano: {
    nome, valor, vencimento
  },
  base_id: string,
  status: "pago" | "pendente" | "isento" | "promessa" | "cancelado",
  dia_vencimento: number,   // 10, 20 ou 30
  data_cadastro: timestamp,

  // Subcoleção — buscar apenas o doc do ciclo, nunca toda a subcoleção
  historico_pagamentos/{MM-YYYY}: {
    status: "pago" | "pendente" | "isento",
    data_pagamento: timestamp,
    valor: number,
    forma_pagamento: string,
    referencia: "MM/YYYY",
    pago_em: timestamp
  }
}
```

#### Collection: `promessas`
```javascript
{
  id: string,
  cliente_id: string,
  numero: string,           // formato WhatsApp: 55xxxxxxxx@c.us
  nome: string,
  valor: number,
  data_promessa: string,    // "YYYY-MM-DD"
  status: "pendente" | "pago" | "cancelada",
  ativa: boolean,
  cumprida: boolean,
  observacao: string,
  criado_em: timestamp,
  pago_em: timestamp
}
```

#### Collection: `carne_solicitacoes`
```javascript
{
  id: string,
  cliente_id: string,
  numero: string,
  nome: string,
  endereco: string,
  observacao: string,
  status: "solicitado" | "impresso" | "entregue",
  origem: "painel",
  solicitado_em: timestamp,
  impresso_em: timestamp,
  entregue_em: timestamp
}
```

#### Collection: `log_cobrancas`
```javascript
{
  id: string,
  numero: string,
  nome: string,
  data_vencimento: string,   // "10", "20", "30"
  data_envio: string,        // "YYYY-MM-DD"
  tipo: string,              // "lembrete", "atraso", "atraso_final", "reconquista", "reconquista_final"
  origem: string,            // "auto" ou "manual"
  status: "enviado" | "falha",
  enviado_em: timestamp
}
```

#### Collection: `log_bot`, `log_comprovantes`, `log_atendimentos`
Logs genéricos de ações do sistema.

#### Collection: `agendamentos`
```javascript
{
  id: string,
  cliente_id: string,
  tipo: "instalacao" | "suporte" | "visita",
  data_agendamento: timestamp,
  descricao: string,
  status: "pendente" | "concluido" | "cancelado",
  base_id: string,
  criado_em: timestamp
}
```

#### Collection: `instalacoes_agendadas`
Instalações pendentes com endereço e dados do cliente.

#### Collection: `bases`
```javascript
{ id: string, nome: string, ativa: boolean }
```

#### Collection: `config`
Documentos isolados: `bot_ativo`, `situacao_rede`, `previsao_retorno`, `motivo_rede`, `horario_atendente`, `horario_cobranca`, `ultima_votacao`, `cobranca_adiada`.

#### Collection: `votacoes`
```javascript
{
  id: string,               // "votacao_${Date.now()}"
  datas: string,            // dia de vencimento
  tipo: string,             // tipo de cobrança
  total: number,
  data: string,             // hoje
  status: "aguardando" | "expirado",
  resolvido: boolean,
  resultado: "aprovado" | "negado" | "expirado",
  votos_sim: string[],
  votos_nao: string[],
  administradores: string[],
  notificou_sim: boolean,
  notificou_nao: boolean,
  criado_em: timestamp
}
```

#### Collection: `atendimento_humano`
Rastreia números em atendimento humano (para não entregar ao bot automaticamente).

#### Collection: `historico_conversa`
Registros de conversas. **Cresce indefinidamente — TTL recomendado.**

## 🔄 Fluxos Principais

### Fluxo 1: Cobrança Automática (background timer 2h)

```
Timer dispara a cada 2h (11h-17h, seg-sáb)
    ↓
adminService.verificarCobrancasAutomaticas
    ├── Calcula ciclos: D-1, D+3, D+5, D+7, D+10
    ├── Busca clientes por dia_vencimento (num e string)
    ├── Filtra: cancelados, promessas, carnês pendentes
    ├── Para cada cliente: busca histórico do ciclo
    ├── perguntaAdmins → votação via WhatsApp
    └── Se aprovado: disparaCobrancaReal com lista filtrada
        ├── Duplicatas (log_cobrancas do dia)
        ├── Envio com retry (tenta com/sem 9º dígito)
        ├── log_cobrancas por cliente
        └── Relatório para admins
```

### Fluxo 2: Cobrança Manual (via API)

```
POST /api/cobrar/manual
    ↓
Verifica se já foi disparado hoje
    ↓
ctx.dispararCobrancaReal(data, tipo)
    → Modo BUSCA (sem lista): busca clientes, filtra, envia
    ↓
Relatório para admins
```

### Fluxo 3: Dashboard em Tempo Real (SSE)

```
Frontend conecta em /api/status-stream
    ↓
sseService mantém conexão aberta
    ↓
Eventos emitidos quando:
  - Bot conecta/desconecta WhatsApp
  - Config do bot é alterada
  - Timer de cobrança é executado
    ↓
Frontend recebe evento
    ↓
Atualiza UI sem recarregar
```

### Fluxo 4: Votação de Cobrança (WhatsApp)

```
adminService.perguntarAdmins
    ↓
Envia mensagem para cada admin com lista de clientes
    ↓
Admins votam via !sim / !nao no WhatsApp
    ↓
Firestore snapshot ouvia votos em tempo real
    ↓
Resultado: aprovado → disparaCobrancaReal
           negado → ignora
           expirou (60min) → ignora
```

## 🚫 O que NÃO existe neste projeto

- **Sem atendimento automático**: Não há `client.on('message')`, sem menus, sem chatbot, sem estados de conversa
- **Sem Groq/IA**: Serviços de IA foram removidos
- **Sem pdf-parse**: Removido do package.json
- **Sem LocalAuth**: Pasta `.wwebjs_auth` é temporária; sessão real persiste no Firebase Storage via RemoteAuth
- **Sem fluxo de comprovante**: Fluxo antigo removido
- **Sem fila de mensagens**: Envio direto via WhatsApp

## 🔐 Segurança

### Camadas de Proteção

1. **API Key** (`ADMIN_API_KEY`)
   - Header `x-api-key` obrigatório em `/api/*`
   - Validado em `middleware/auth.js`

2. **Ambiente de Variáveis**
   - Credenciais Firebase em secrets (Railway)
   - Nunca commitadas no Git

3. **Proteção QR Code**
   - Endpoint `/qr` deve ser protegido em produção (IP whitelist / proxy auth)
   - Acesso público permite assumir o número WhatsApp

4. **CORS**
   - Dinâmico via `ALLOWED_ORIGINS` — valores separados por vírgula

## ⚡ Performance

### Otimizações Implementadas

1. **Firestore**
   - Índices compostos para queries frequentes
   - Paginação com `limit()` em todas as listagens
   - Sempre `where` + `limit` (nunca scan total)
   - Histórico de pagamentos: busca doc específico, nunca toda subcoleção

2. **Backend**
   - `comTimeout` helper: 30s em `sendMessage`, 15s em `getNumberId`/`isRegisteredUser`
   - Retry com sufixo @c.us e 9º dígito
   - Timers em background (não bloqueiam requisições)
   - Votação via Firestore snapshot (não polling)

### Pontos de Atenção

⚠️ **Gargalos conhecidos**:
- `historico_conversa` sem TTL (cresce indefinidamente)
- `buscarClientePorNome` usa `limit(500)` + range query — não escala acima de 500
- N+1 em `adminService.js`: loop sequencial consultando `historico_pagamentos` por cliente
- Queries de `agendamentos` e `instalacoes_agendadas` inicializam tabelas no startup
- Fallback `clientes.limit(500).get()` em buscas sem filtro

## 🚀 Deploy

### Backend (Railway)

- Build: `npm install && npx puppeteer browsers install chrome`
- Start: `node index.js`
- Sessão WhatsApp: RemoteAuth + Firebase Storage (zip em `whatsapp_session/`)
- `DATA_PATH`: `/data` (Railway), `/tmp/data` (Render)
- Porta: Railway define 8080 automaticamente

### Frontend (Vercel)

- Build estático: `cd frontend && npm install && npm run build`
- CDN global
- `VITE_API_URL` em build time → URL do backend Railway
- Auto-deploy no push para `main`

## 📊 Monitoramento

1. **WhatsApp**: Status conexão, uptime, QR code
2. **Firestore**: Reads/dia, writes/dia, latência
3. **API**: Requests/min, erros 5xx
4. **SSE**: Conexões ativas

---

**Última atualização**: 2026-04-29
**Revisado por**: Auditoria técnica — código real vs documentação
