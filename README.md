# JME-BOT (Internal Ops Platform)

> Status: Em produção ativa

Sistema de cobrança automática e gestão de clientes via WhatsApp para a JME.NET.

## O que é

O JME-BOT é uma plataforma de automação operacional que utiliza o WhatsApp como canal de comunicação para:

- **Cobrança automática** — disparos programados D-1, D+3, D+5, D+7, D+10 com votação de admins
- **Gestão de clientes** — cadastro, status, histórico de pagamentos
- **Painel Admin React** — dashboard em tempo real via SSE
- **Promessas e carnês** — controle de acordos de pagamento
- **Agendamentos** — instalações e suporte técnico

**O bot não possui atendimento automático via WhatsApp.** Não há chatbot, menus interativos ou processamento de mensagens recebidas. O WhatsApp é usado exclusivamente para envio de mensagens transacionais (cobranças, notificações, relatórios).

## Funcionalidades

### Cobrança Automática
- Calendário de disparos: D-1 (lembrete), D+3, D+5, D+7, D+10
- Votação de admins antes de cada disparo
- Filtros: promessa ativa, carnê pendente, cancelado, já pago
- Relatório pós-disparo para admins via WhatsApp

### Gestão de Operações
- Clientes: CRUD, busca por nome/CPF/telefone, histórico
- Bases: agrupamento e estatísticas por região
- Promessas: criação, baixa, cancelamento
- Carnês: solicitação, impressão, entrega
- Agendamentos: instalações e suporte

### Painel Admin
- Dashboard com métricas em tempo real (SSE)
- Listagens com paginação
- Relatórios de inadimplência e arrecadação

## Stack

### Backend
- **Node.js** + **Express 5**
- **whatsapp-web.js** (RemoteAuth)
- **Firebase Admin SDK** (Firestore + Storage)
- **archiver** + **fs-extra** + **unzipper** (RemoteAuth)

### Frontend
- **React** + **Vite**
- **Recharts** (gráficos)
- **Server-Sent Events** (tempo real)

### Infraestrutura
- **Railway** — backend
- **Vercel** — frontend
- **Firebase Storage** — sessão WhatsApp

## WhatsApp Auth

A sessão é persistida via **RemoteAuth + FirestoreStore**:

```
RemoteAuth → zip → Firebase Storage: whatsapp_session/{session}.zip
```

- Intervalo de sync: 12h (`backupSyncIntervalMs: 43200000`)
- Bucket padrão: `jmenet.appspot.com` (configurável via `FIREBASE_STORAGE_BUCKET`)
- A pasta `.wwebjs_auth/` é temporária — não é a origem da verdade

## Instalação

### Pré-requisitos
- Node.js 18+
- Projeto Firebase com Firestore e Storage habilitados
- Service Account com papel Storage Admin

### Backend

```bash
npm install
cp .env.example .env
# configurar FIREBASE_CREDENTIALS_JSON, ADMIN_API_KEY, ALLOWED_ORIGINS
npm start
```

### Frontend

```bash
cd frontend
npm install
npm run build
```

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `FIREBASE_CREDENTIALS_JSON` | Sim | Service account JSON |
| `ADMIN_API_KEY` | Sim (prod) | Protege a API |
| `ALLOWED_ORIGINS` | Sim | URLs separadas por vírgula |
| `ADMIN_PHONE` | Sim | Telefone admin (formato WhatsApp) |
| `FIREBASE_STORAGE_BUCKET` | Não | Default: `jmenet.appspot.com` |
| `PORT` | Não | Default: 3001 (dev), 8080 (Railway) |

## Deploy

### Railway (backend)

```bash
# Build: npm install && npx puppeteer browsers install chrome
# Start: node index.js
# Variables: configurar no dashboard do Railway
```

### Vercel (frontend)

```bash
cd frontend && vercel --prod
```

## Para novos devs / IAs

Leia nesta ordem:

1. **[docs/AI_HANDOFF.md](docs/AI_HANDOFF.md)** — contexto rápido para IAs
2. **[docs/CURRENT_STATE.md](docs/CURRENT_STATE.md)** — resumo do estado atual
3. **[docs/DOCS_MAP.md](docs/DOCS_MAP.md)** — mapa de toda a documentação
4. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — arquitetura real do sistema
5. **[docs/API.md](docs/API.md)** — todos os endpoints da REST API
6. **[docs/PATTERNS.md](docs/PATTERNS.md)** — padrões de código obrigatórios
7. **[docs/PENDING.md](docs/PENDING.md)** — pendências e gargalos conhecidos

Depois consulte:
- **[docs/RULES.md](docs/RULES.md)** — regras consolidadas
- **[docs/History.md](docs/History.md)** — histórico de decisões e sessões

## Estrutura do Projeto

```
.
├── index.js                 # Entry point
├── config/firebase.js       # Firebase Admin SDK
├── services/
│   ├── FirestoreStore.js   # RemoteAuth store (Storage)
│   ├── cobrancaService.js  # Disparo de cobranças
│   ├── adminService.js     # Verificação automática + votação
│   ├── whatsappService.js  # Envio com comTimeout
│   └── sseService.js       # Server-Sent Events
├── middleware/
│   ├── auth.js             # x-api-key
│   └── timers.js           # Background: 2h, 3h, 08h BRT
├── routes/                 # 17 arquivos — ver docs/DOCS_MAP.md
├── database/
│   └── funcoes-firebase.js
└── frontend/               # Painel admin React
```

## Regras Importantes

1. **NUNCA** fazer `db.collection('clientes').get()` sem `where` + `limit`
2. `dispararCobrancaReal` sempre recebe `ADMINISTRADORES` como 6º parâmetro
3. Status do cliente é string: `'pago'`, `'pendente'`, `'isento'`, `'promessa'`, `'cancelado'`
4. `telefones` é array; `telefone` (string) é legado — tratar os dois
5. Dashboard usa `status` direto — nunca buscar histórico em listagens
6. Sempre usar `comTimeout` em chamadas WhatsApp

## Segurança

- Credenciais em variáveis de ambiente — nunca no código
- `.env` e `firebasekey.json` no `.gitignore`
- API key obrigatória em produção (`ADMIN_API_KEY`)
- Endpoint `/qr` é crítico — proteger com IP whitelist ou proxy auth

---

**Mantenedor**: Equipe JME.NET
