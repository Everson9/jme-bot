# Política de Segurança - JME-BOT

## 🎯 Objetivo

Definir políticas e procedimentos de segurança do projeto JME-BOT.

## 🛡️ Princípios

1. **Segurança por Design**: Considerada em todas as etapas
2. **Menor Privilégio**: Componentes com acesso mínimo necessário
3. **Defesa em Profundidade**: Múltiplas camadas de proteção
4. **Transparência**: Vulnerabilidades reportadas e corrigidas
5. **Auditoria**: Todas as ações logadas e auditáveis

## 🔐 Camadas de Proteção

### 1. Variáveis de Ambiente e Segredos

✅ **Implementado**:
- Credenciais em variáveis de ambiente
- `.env` nunca commitado (`.gitignore`)
- `.env.example` documenta variáveis necessárias
- Secrets via Railway

⚠️ **Nunca**:
- Commitar credenciais no Git
- Hardcode chaves no código
- Expor segredos em logs

### 2. API e Backend

✅ **Implementado**:
- Header `x-api-key` para autenticação admin
- Validação de inputs
- CORS configurado

⚠️ **Em produção**:
- SEMPRE defina `ADMIN_API_KEY`
- Implementar rate limiting

### 3. WhatsApp Session

✅ **Implementado**:
- Sessão via RemoteAuth (não LocalAuth)
- Sessão zipada e persistida no Firebase Storage
- Sessão deletada do Storage em caso de desconexão

⚠️ **Crítico**:
- **Endpoint `/qr` é RISCO CRÍTICO** se exposto publicamente
- Qualquer pessoa pode assumir o número WhatsApp
- **Sempre proteger `/qr` em produção**

✅ **Proteções obrigatórias para `/qr`**:
- IP Whitelist
- Basic Auth
- Acesso via VPN

### 4. Firestore

✅ **Implementado**:
- Service Account com permissões mínimas
- Índices otimizados

⚠️ **Atenção**:
- Não usar conta de usuário, usar Service Account
- Não expor chave em frontend

### 5. Logs e Auditoria

✅ **Implementado**:
- Logs de ações importantes em collections (`log_bot`, `log_cobrancas`, etc.)
- Dados sensíveis mascarados

❌ **Nunca logar**:
- Senhas, API Keys, dados de cartão, conteúdo de mensagens

## 🚨 Reportar Vulnerabilidade

1. Enviar email privado para a equipe
2. Descrever vulnerabilidade em detalhe
3. Fornecer passos para reproduzir
4. Aguardar resposta

**Contato**: equipe@jme.net

## ⏱️ SLA para Correções

| Severidade | Prazo |
|------------|-------|
| CRÍTICA | 24 horas |
| ALTA | 72 horas |
| MÉDIA | 7 dias |
| BAIXA | 30 dias |

## 🐛 Vulnerabilidades Conhecidas

| Situação | Descrição | Status |
|----------|-----------|--------|
| < 1.1 | API sem rate limit | Planejado |
| < 1.1 | /qr sem proteção adicional | Proteger via proxy |
| < 1.1 | Painel sem autenticação | Planejado JWT |

## 📋 Checklist de Segurança para Deploy

✅ **OBRIGATÓRIO**:
- [ ] `ADMIN_API_KEY` definido e forte
- [ ] Credenciais em Railway secrets
- [ ] Nenhuma credencial no Git
- [ ] `/qr` protegido (IP whitelist / auth)
- [ ] CORS configurado
- [ ] Health check público, resto protegido

✅ **RECOMENDADO**:
- [ ] WAF / Firewall
- [ ] HTTPS obrigatório
- [ ] HSTS
- [ ] IP Whitelist para admins
- [ ] Backup automático Firestore
- [ ] Monitoramento de logs

## 📚 Recursos

- [SKILL: Segurança e Segredos](docs/skills/seguranca-segredos-painel-admin.md)
- [SKILL: Firestore Performance](docs/skills/firestorecustosperformance.md)
- [SKILL: Runbook Produção](docs/skills/runbookproducao-jme-bot.md)

---

**Última atualização**: 2026-04-29
**Responsável**: Equipe JME.NET
