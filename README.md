# JME-BOT 🤖

Bot de atendimento automatizado via WhatsApp para gestão de clientes, cobranças e suporte técnico da JME.NET.

## 📋 Visão Geral

O JME-BOT é uma solução completa de automação de atendimento que integra:

- **WhatsApp Business** via whatsapp-web.js
- **Firestore** para persistência de dados
- **IA (Groq LLM)** para classificação de intenções
- **Painel Admin React** para gestão em tempo real
- **Sistema de fluxos** para diferentes tipos de atendimento

## 🚀 Funcionalidades

### Bot WhatsApp
- ✅ Atendimento automatizado com múltiplos fluxos
- ✅ Identificação de clientes por nome/CPF/telefone
- ✅ Consulta de situação financeira
- ✅ Processamento de comprovantes (PDF/imagem)
- ✅ Agendamentos de instalação e suporte
- ✅ Promessas de pagamento
- ✅ Transferência para atendimento humano
- ✅ Cobranças automatizadas

### Painel Admin
- ✅ Dashboard em tempo real (SSE)
- ✅ Gestão de clientes e bases
- ✅ Monitoramento de promessas
- ✅ Acompanhamento de agendamentos
- ✅ Visualização de histórico de conversas
- ✅ Backup e exportação de dados
- ✅ Estatísticas e métricas

## 🛠️ Tecnologias

### Backend
- **Node.js** + Express
- **whatsapp-web.js** para integração WhatsApp
- **Firebase Admin SDK** (Firestore)
- **Groq SDK** para LLM
- **pdf-parse** para extração de dados

### Frontend
- **React 18** + Vite
- **React Router** para navegação
- **Recharts** para gráficos
- **Server-Sent Events (SSE)** para atualizações em tempo real

### Infraestrutura
- **Fly.io** para deploy backend
- **Vercel** para deploy frontend
- **Volumes persistentes** para sessão WhatsApp

## 📦 Instalação

### Pré-requisitos

- Node.js 18+
- Conta Firebase (Firestore)
- Conta Groq (API Key)

### Backend

```bash
# Clonar repositório
git clone https://github.com/Everson9/jme-bot.git
cd jme-bot

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais

# Executar em desenvolvimento
npm run dev

# Executar em produção
npm start
```

### Frontend

```bash
cd frontend

# Instalar dependências
npm install

# Executar em desenvolvimento
npm run dev

# Build para produção
npm run build
```

## ⚙️ Configuração

### Variáveis de Ambiente

Consulte `.env.example` para todas as variáveis necessárias:

- `FIREBASE_CREDENTIALS_JSON` - Credenciais do Firebase
- `GROQ_API_KEY` - Chave API do Groq
- `ADMIN_API_KEY` - Chave para proteger API admin
- `ADMIN_PHONE` - Telefone do administrador
- `PLANILHA_ID` - ID da planilha Google (opcional)

### Firestore

Configure os índices compostos necessários conforme documentado em `docs/FIRESTORE_INDEXES.md`.

## 📚 Documentação

- [Arquitetura](docs/ARCHITECTURE.md) - Visão geral da arquitetura
- [API Endpoints](docs/API.md) - Documentação completa da API
- [Índices Firestore](docs/FIRESTORE_INDEXES.md) - Índices necessários
- [Testes](tests/README.md) - Como executar testes
- [Frontend](frontend/README.md) - Documentação do painel
- [Contribuindo](CONTRIBUTING.md) - Guidelines para contribuição
- [Segurança](SECURITY.md) - Política de segurança

## 🔒 Segurança

Este projeto segue práticas de segurança rigorosas:

- Credenciais nunca commitadas no repositório
- API Key obrigatória em produção
- Proteção de endpoints administrativos
- Sanitização de inputs
- Logs sem dados sensíveis

Consulte `SECURITY.md` para mais detalhes.

## 🧪 Testes

```bash
# Testes de carga
node tests/carga.js

# Simulador de conversas
node tests/simulador.js
```

Veja `tests/README.md` para documentação completa.

## 📖 Guias de Desenvolvimento

### Skills (Diretrizes Técnicas)

O projeto utiliza "Skills" - diretrizes específicas para diferentes áreas:

- **[Firestore Performance](.cursor/skills/firestore-custos-performance/SKILL.md)** - Otimização de custos
- **[Fluxos de Atendimento](.cursor/skills/diagnostico-atendimento-fluxos/SKILL.md)** - Debug de fluxos
- **[Segurança](.cursor/skills/seguranca-segredos-painel-admin/SKILL.md)** - Hardening
- **[Produção](.cursor/skills/runbook-producao-jme-bot/SKILL.md)** - Runbook operacional

**Leia sempre as Skills antes de fazer alterações!**

## 🚀 Deploy

### Fly.io (Backend)

```bash
# Login
fly auth login

# Deploy
fly deploy

# Ver logs
fly logs
```

### Vercel (Frontend)

```bash
cd frontend

# Deploy
vercel --prod
```

## 📊 Monitoramento

### Health Check

```bash
curl https://seu-dominio.fly.dev/api/health
```

### Status do Bot

```bash
curl https://seu-dominio.fly.dev/api/status
```

### QR Code WhatsApp

```bash
# Se o bot estiver desconectado
https://seu-dominio.fly.dev/qr
```

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor, leia [CONTRIBUTING.md](CONTRIBUTING.md) antes de enviar PRs.

## 📝 Changelog

Veja [CHANGELOG.md](CHANGELOG.md) para histórico de versões.

## 📜 Licença

ISC

## 👥 Autores

- Equipe JME.NET

## 🆘 Suporte

Para problemas ou dúvidas:

1. Verifique a documentação nas Skills
2. Consulte [Issues](https://github.com/Everson9/jme-bot/issues)
3. Entre em contato com a equipe

---

**⚠️ Atenção:** Este bot manuseia dados sensíveis. Sempre siga as diretrizes de segurança!
