# Como usar o Claude Code neste projeto

Guia prático para não gastar tokens à toa.

---

## Regra principal

**Nunca peça "ajuda com o projeto" sem especificar o arquivo e o problema.**
O Claude vai escanear tudo e consumir 40k+ tokens antes de responder.

---

## Prompts eficientes

### Corrigir um bug
```
Em services/cobrancaService.js, a função dispararCobrancaReal
está retornando erro quando o tipo é null. Leia só esse arquivo
e corrija.
```

### Adicionar funcionalidade
```
Leia services/cobrancaService.js e database/funcoes-firebase.js.
Preciso adicionar verificação para não cobrar clientes com
status 'promessa' na função dispararCobrancaReal.
```

### Novo endpoint
```
Leia routes/index.js e database/funcoes-firebase.js.
Crie um endpoint GET /api/clientes/:id/promessas que retorna
todas as promessas de um cliente específico.
```

### Seguir pendência do PENDING.md
```
Leia docs/PENDING.md e database/funcoes-firebase.js.
Implemente a migration do campo telefones descrita em PENDING.md.
```

### Debug com contexto de histórico
```
Leia docs/History.md (seção de mapa de arquivos) e depois
leia services/cobrancaService.js.
O fluxo de cobrança está [descrever o problema].
```

---

## Quando compartilhar o History.md

Compartilhe `docs/History.md` quando:
- Iniciar uma nova conversa e precisar que o Claude entenda o estado atual do projeto
- O problema envolver múltiplos arquivos e você precisar que ele entenda as decisões já tomadas
- Pedir para continuar algo que foi feito em sessão anterior

Não precisa compartilhar quando:
- O problema está claramente isolado em 1-2 arquivos
- É uma tarefa nova sem dependência de decisões anteriores

---

## Como pedir para ler arquivos sem escanear o projeto

```
# Instrução explícita de escopo — funciona bem
Leia APENAS os arquivos que eu mencionar. Não escaneie outros.

# Especificar função exata — ainda mais eficiente
Em database/funcoes-firebase.js, na função buscarClientePorNome,
preciso que ela também aceite busca por apelido.
```

---

## Quando o Claude sugerir algo que parece errado

Antes de aceitar uma "melhoria", pergunte:

```
Isso está documentado em docs/DECISIONS.md?
Antes de implementar, leia docs/DECISIONS.md e confirme
que a mudança não conflita com decisões já tomadas.
```

---

## Atualizando o History.md após uma sessão

Ao final de cada sessão com correções significativas, peça:

```
Gere um novo docs/History.md atualizado com o que fizemos hoje.
Inclua na seção de mapa de arquivos qualquer função nova ou
modificada. Mantenha o formato do arquivo atual.
```

---

## Estrutura de pastas dos docs

```
docs/
├── History.md     ← histórico completo, sessões, mapa de funções
├── DECISIONS.md   ← decisões técnicas e motivações
├── PATTERNS.md    ← padrões obrigatórios de código
├── PENDING.md     ← pendências priorizadas (atualizar manualmente)
├── PROMPTS.md     ← este arquivo
├── API.md         ← documentação da API REST
├── ARCHITECTURE.md ← arquitetura do sistema
├── CHANGELOG.md   ← changelog do projeto
├── CONTRIBUTING.md ← guia de contribuição
├── FIRESTORE_INDEXES.md ← índices do Firestore
└── SECURITY.md    ← política de segurança
```

---

## Skills disponíveis

Quando o problema se enquadrar na área da skill, leia a skill correspondente:

| Skill | Caminho | Quando usar |
|-------|---------|-------------|
| Firestore Performance | docs/skills/firestorecustosperformance.md | Lentidão, custo alto, muitas leituras, otimização de queries |
| Segurança e Segredos | docs/skills/seguranca-segredos-painel-admin.md | Secrets, .env, API key, painel admin, deploy |
| Runbook de produção | docs/skills/runbook-producao-jme-bot.md | Bot offline, QR code, SSE, variáveis de ambiente, incidente |