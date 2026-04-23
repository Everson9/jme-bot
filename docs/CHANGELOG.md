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
- ✅ SECURITY.md - Política de segurança

---

## [1.0.0] - 2026-04-22

### Início do Projeto

Primeira versão funcional do JME-BOT.

### Added
- 🚀 Bot WhatsApp funcional via whatsapp-web.js
- 📊 Painel Admin React com Vite
- 🔥 Integração Firestore
- 📨 SSE para atualizações em tempo real
- 💸 Sistema de cobrança automática (D-1, D+3, D+5, D+7, D+10)
- 📅 Agendamentos de instalação
- 💰 Promessas de pagamento
- 📄 Processamento de comprovantes PDF
- 👤 Identificação de clientes por nome/CPF/telefone
- 📡 API REST completa (72 endpoints em 14 categorias)
- 📊 Dashboard em tempo real
- 🔌 Monitoramento de status do bot
- 🖼️ QR Code para conexão WhatsApp
- 🛡️ Timeout helper para chamadas WhatsApp (comTimeout)
- 📁 Rotas modularizadas em 12 arquivos separados

### Changed
- 🔄 **Infraestrutura**: Backend rodando em Railway
- 🔧 **Deploy**: Build Command inclui `npx puppeteer browsers install chrome`
- 🔐 **CORS**: Suporte para `https://*.vercel.app` (previews do Vercel)
- 📁 **DATA_PATH**: Ajustado para Railway (`/data`)
- 📝 **Mensagens de cobrança**: Personalizadas por tipo (lembrete, atraso, reconquista)
- 📝 **Branding**: Adicionado `🤖 JMENET TELECOM` no topo das mensagens
- 📝 **Chaves PIX**: Atualizadas para as chaves reais da empresa
- 🔐 **Sessão WhatsApp**: LocalAuth em `/data/.wwebjs_auth` (mais simples e estável)

### Fixed
- ✅ **Permissão Firebase Storage**: Adicionado papel `Storage Admin` à service account
- ✅ **Chrome não encontrado**: Instalação explícita via `puppeteer browsers install chrome`
- ✅ **CORS bloqueando previews**: Adicionado wildcard para `.vercel.app`
- ✅ **Cobrança**: Clientes com `status: promessa` não são mais cobrados
- ✅ **Mensagens**: Erro ao salvar sessão no Storage (verificação de arquivo zip)
- ✅ **Timeout WhatsApp**: Helper `comTimeout` evita travamentos em chamadas API
- ✅ **Rotas**: Modularização em 12 arquivos para melhor manutenção
- ✅ **Package.json**: Removidas 9 dependências e 1 devDependency não utilizadas
- ✅ **Arquivos obsoletos**: Limpeza completa de fluxos, middleware e services não usados

### Componentes Implementados

#### Backend
- ✅ Express 5
- ✅ Whatsapp-web.js
- ✅ Firebase Admin
- ✅ pdf-parse
- ✅ Middlewares (auth, timers)
- ✅ Services (mensagem, cobrança, whatsapp, admin, status, sse)
- ✅ Rotas API (12 arquivos: bot, clientes, cobranca, dashboard, logs, chamados, cancelamentos, instalacoes, relatorios, admin, boas-vindas, migracao)
- ✅ Camada de banco de dados

#### Frontend
- ✅ React 18 + Vite
- ✅ React Router DOM
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
- ✅ Railway deploy config
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

**Última atualização**: 2026-04-22