# Política de Segurança - JME-BOT

## 🎯 Objetivo

Este documento define as políticas e procedimentos de segurança do projeto JME-BOT.

## 🛡️ Princípios de Segurança

1. **Segurança por Design**: Segurança é considerada em todas as etapas do desenvolvimento
2. **Menor Privilégio**: Componentes tem acesso mínimo necessário
3. **Defesa em Profundidade**: Múltiplas camadas de proteção
4. **Transparência**: Vulnerabilidades são reportadas e corrigidas publicamente
5. **Auditoria**: Todas as ações são logadas e auditáveis

## 🔐 Camadas de Proteção

### 1. Variáveis de Ambiente e Segredos

✅ **Implementado**:
- Todas credenciais são armazenadas em variáveis de ambiente
- `.env` nunca é commitado (`.gitignore`)
- `.env.example` documenta todas variáveis necessárias
- Secrets gerenciados via provedor de deploy (Railway)

⚠️ **Nunca**:
- Commit credenciais no Git
- Hardcode chaves API no código
- Expor segredos em logs
- Compartilhar .env por mensagens

### 2. API e Backend

✅ **Implementado**:
- Header `x-api-key` para autenticação de admin
- Validação de todos inputs
- Sanitização de dados antes de inserir no Firestore
- CORS configurado
- Health check público, todo o resto protegido

⚠️ **Em Produção**:
- SEMPRE defina `ADMIN_API_KEY`
- Não deixe API aberta publicamente
- Implementar rate limiting
- Adicionar WAF se necessário

### 3. Painel Admin

✅ **Implementado**:
- API Key para acesso
- Dados sensíveis mascarados no frontend

⚠️ **Atenção**:
- `VITE_ADMIN_API_KEY` **NÃO É UM SEGREDO**
- Qualquer usuário do painel consegue extrair do bundle
- **Nunca exponha o painel publicamente sem proteção adicional**

✅ **Recomendado em Produção**:
- Basic Auth no proxy/edge
- IP Whitelist
- Rede privada / VPN
- Autenticação com login (em desenvolvimento)

### 4. Firestore

✅ **Implementado**:
- Service Account com permissões mínimas
- Regras de segurança configuradas
- Índices otimizados (evita scans)

⚠️ **Atenção**:
- Não use conta de usuário, use Service Account
- Não exponha chave do Firestore em frontend
- Monitore reads/dia para detectar uso anômalo

### 5. WhatsApp e QR Code

✅ **Implementado**:
- Sessão WhatsApp persistida em volume seguro
- QR Code só disponível quando bot desconectado

⚠️ **Crítico**:
- **Endpoint `/qr` é UM RISCO SE EXPOSTO PÚBLICAMENTE**
- Qualquer pessoa com acesso pode assumir o número WhatsApp
- **SEMPRE proteja `/qr` em produção**

✅ **Proteções obrigatórias**:
- IP Whitelist
- Basic Auth
- Acesso só via VPN
- Desativar endpoint quando não necessário

### 6. Logs e Auditoria

✅ **Implementado**:
- Logs de todas ações importantes
- Dados sensíveis mascarados
- Logs acessíveis apenas por admins

❌ **Nunca logue**:
- Senhas
- API Keys
- Dados de cartão
- Conteúdo completo de mensagens

## 🚨 Reportar Vulnerabilidade

Se você encontrar uma vulnerabilidade de segurança:

### 🔴 NÃO FAÇA
- Não abra uma issue pública
- Não divulgue em fóruns ou grupos
- Não compartilhe detalhes publicamente

### ✅ FAÇA
1. Envie um email privado para a equipe
2. Descreva a vulnerabilidade em detalhe
3. Forneça passos para reproduzir
4. Aguarde resposta da equipe

**Contato**: equipe@jme.net

## ⏱️ SLA para Correções

| Severidade | Prazo alvo |
|------------|------------|
| CRÍTICA (ex: acesso total) | 24 horas |
| ALTA | 72 horas |
| MÉDIA | 7 dias |
| BAIXA | 30 dias |

## 🐛 Vulnerabilidades Conhecidas

| Versão | Descrição | Status |
|--------|-----------|--------|
| < 1.1 | API sem rate limit | Planejado corrigir em 1.1 |
| < 1.1 | /qr sem proteção adicional | Recomendado proteger via proxy |
| < 1.1 | Painel sem autenticação | Planejado corrigir em 1.2 |

## 🔧 Melhorias Planejadas

### Curto Prazo (v1.1)
- [ ] Rate limiting na API
- [ ] Logs estruturados
- [ ] Sanitização adicional de inputs
- [ ] Revisão completa de segurança

### Médio Prazo (v1.2)
- [ ] Autenticação JWT no painel
- [ ] Sessões de usuário
- [ ] Auditoria completa de ações
- [ ] MFA para admins
- [ ] Rotação automática de chaves

### Longo Prazo
- [ ] Penetration test
- [ ] Certificação de segurança
- [ ] Criptografia em repouso
- [ ] Compliance LGPD

## 📋 Checklist de Segurança para Deploy

✅ **OBRIGATÓRIO em Produção**:
- [ ] `ADMIN_API_KEY` está definido e é forte
- [ ] Todas credenciais estão em secrets do provedor
- [ ] Nenhuma credencial commitada no Git
- [ ] `/qr` está protegido (IP whitelist / auth)
- [ ] CORS está configurado corretamente
- [ ] Firestore rules estão ativas
- [ ] Health check é o único endpoint público
- [ ] Logs não contém dados sensíveis

✅ **RECOMENDADO**:
- [ ] WAF / Firewall na frente
- [ ] HTTPS obrigatório
- [ ] HSTS habilitado
- [ ] IP Whitelist para admins
- [ ] Backup automático do Firestore
- [ ] Alertas de uso anômalo
- [ ] Monitoramento de logs

## 📚 Recursos

### Documentação Interna
- [SKILL: Segurança e Segredos](docs/skills/seguranca-segredos-painel-admin.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [API](docs/API.md)

### Documentação Externa
- [Firebase Security](https://firebase.google.com/docs/rules)
- [OWASP Top 10](https://owasp.org/Top10/pt_BR/)
- [LGPD](https://www.gov.br/cidadania/pt-br/acoes-e-programas/lgpd)

## 🤝 Contribuição com Segurança

Contribuições que melhoram a segurança são muito bem-vindas!

Antes de submeter PR:
- Leia o [CONTRIBUTING.md](CONTRIBUTING.md)
- Leia a SKILL de Segurança
- Teste as alterações localmente
- Não introduza novas dependências sem justificativa

## 📄 Aviso Legal

Este software é fornecido "como está", sem garantias de qualquer tipo. A equipe não se responsabiliza por danos causados por uso inadequado ou falhas de segurança.

---

**Última atualização**: 2026-04-22
**Responsável**: Equipe JME.NET