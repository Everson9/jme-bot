# Changelog - JME-BOT

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [Unreleased]

### Added
- Auditoria completa de documentação — todas as docs reconciliadas com código real

---

## [1.1.0] - 2026-04-29

### Changed
- **RemoteAuth**: Sessão WhatsApp agora persiste no Firebase Storage (zip em `whatsapp_session/`)
- **backupSyncIntervalMs**: 12h (43200000ms)
- **Express**: Atualizado para 5.2.1
- **whatsapp-web.js**: 1.34.6
- **Dependências removidas**: pdf-parse, axios, body-parser, helmet, morgan, multer, node-cron, puppeteer, sharp, uuid
- **Dependências adicionadas**: archiver (zip RemoteAuth), fs-extra, unzipper

### Fixed
- Lock files entre deploys Railway (LocalAuth → RemoteAuth)
- Sessão não persistia entre deploys
- Arquivos obsoletos de fluxos e serviços removidos

---

## [1.0.0] - 2026-04-22

### Added
- Bot WhatsApp funcional via `whatsapp-web.js`
- Painel Admin React com Vite
- Integração Firestore
- SSE para atualizações em tempo real
- Sistema de cobrança automática (D-1, D+3, D+5, D+7, D+10)
- Agendamentos de instalação
- Promessas de pagamento
- Identificação de clientes por nome/CPF/telefone
- API REST completa
- Dashboard em tempo real
- QR Code para conexão WhatsApp
- ComTimeout helper (30s sendMessage, 15s getNumberId)
- 17 rotas modularizadas
- Mensagens de cobrança personalizadas por tipo
- Branding JMENET TELECOM nas mensagens
- Votação de cobranças via WhatsApp

### Changed
- Backend: Fly.io → Railway
- DATA_PATH: /data (Railway)
- CORS: suporte para `https://*.vercel.app`

### Infrastructure
- Dockerfile
- Railway deploy config
- .env.example
- .gitignore

---

## [0.x.x] - Versões anteriores

Versões anteriores documentadas no código fonte.

---

## 📖 Convenção de Versões

### MAJOR.MINOR.PATCH

- **MAJOR**: Mudanças incompatíveis na API
- **MINOR**: Novas funcionalidades compatíveis
- **PATCH**: Correções de bugs

---

**Última atualização**: 2026-04-29
