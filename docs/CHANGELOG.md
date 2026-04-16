# Changelog - JME-BOT

Todas as alterações notáveis do projeto serão documentadas neste arquivo.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [Unreleased]

### Added
- ✅ Documentação completa do projeto
- ✅ README.md principal
- ✅ docs/API.md - Documentação completa da API
- ✅ docs/ARCHITECTURE.md - Arquitetura do sistema
- ✅ docs/FIRESTORE_INDEXES.md - Índices do Firestore
- ✅ CONTRIBUTING.md - Guia de contribuição
- ✅ frontend/README.md - Documentação do painel
- ✅ tests/README.md - Documentação dos testes
- ✅ SECURITY.md - Política de segurança (em breve)

---

## [1.0.0] - 2024-05-20

### Início do Projeto

Primeira versão funcional do JME-BOT.

### Added
- 🚀 Bot WhatsApp funcional via whatsapp-web.js
- 📊 Painel Admin React com Vite
- 🔥 Integração Firestore
- 🤖 Integração Groq LLM para IA
- 📨 SSE para atualizações em tempo real
- 💸 Fluxo financeiro completo
- 🛠️ Fluxo suporte técnico
- 📅 Agendamentos de instalação
- 💰 Promessas de pagamento
- 📄 Processamento de comprovantes PDF/imagem
- 👤 Identificação de clientes por nome/CPF/telefone
- 📋 Sistema de fluxos com StateManager
- 📡 API REST completa
- 📊 Dashboard em tempo real
- 🔌 Monitoramento de status do bot
- 🖼️ QR Code para conexão WhatsApp

### Changed
- 🔄 **Infraestrutura**: Migração do backend do Fly.io para Railway
- 🔧 **Deploy**: Build Command agora inclui `npx puppeteer browsers install chrome`
- 🔐 **CORS**: Adicionado suporte para `https://*.vercel.app` (previews do Vercel)
- 📁 **DATA_PATH**: Ajustado para Railway (`/data`) e Render (`/tmp/data`)

### Fixed
- ✅ **Permissão Firebase Storage**: Adicionado papel `Storage Admin` à service account
- ✅ **Chrome não encontrado**: Instalação explícita via `puppeteer browsers install chrome`
- ✅ **CORS bloqueando previews**: Adicionado wildcard para `.vercel.app`

### Componentes Implementados

#### Backend
- ✅ Express 5
- ✅ Whatsapp-web.js
- ✅ Firebase Admin
- ✅ Groq SDK
- ✅ pdf-parse
- ✅ StateManager
- ✅ Middlewares (auth, mensagem, comprovante, timers)
- ✅ Services (fluxo, mensagem, cobrança, groq, whatsapp)
- ✅ Fluxos (suporte, financeiro, promessa, novoCliente, cancelamento)
- ✅ Rotas API
- ✅ Camada de banco de dados

#### Frontend
- ✅ React 18 + Vite
- ✅ React Router 7
- ✅ Recharts
- ✅ SSE
- ✅ Dashboard
- ✅ Listagens de clientes, promessas, agendamentos
- ✅ Modais para CRUD
- ✅ Paginação
- ✅ Temas claro/escuro
- ✅ Notificações

### Infraestrutura
- ✅ Dockerfile
- ✅ Fly.io deploy config
- ✅ Render config
- ✅ Github Actions CI/CD
- ✅ .env.example
- ✅ .gitignore

---

## Versões Futuras

### [1.1.0] - Próxima Release

#### Planejado
- [ ] Testes unitários (Jest)
- [ ] Testes de integração (Supertest)
- [ ] Rate limiting na API
- [ ] Logs estruturados (Winston)
- [ ] TTL em historico_conversa
- [ ] Autenticação JWT no painel
- [ ] Relatórios personalizados
- [ ] Integração com gateway de pagamento

### [1.2.0]

#### Planejado
- [ ] Multi-tenancy
- [ ] Cache Redis
- [ ] Filas com BullMQ
- [ ] Webhooks de pagamento
- [ ] IA generativa para respostas
- [ ] Notificações por email

---

## 📖 Convenção de Versões

### MAJOR.MINOR.PATCH

- **MAJOR**: Mudanças incompatíveis na API
- **MINOR**: Novas funcionalidades compatíveis
- **PATCH**: Correções de bugs

---

## 🔗 Referências

- [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/)
- [Semantic Versioning](https://semver.org/lang/pt-BR/)
- [History.md](History.md) - Histórico completo do projeto

---

**Última atualização**: 2024-05-20
