# Pendências — JME-BOT

Em ordem de prioridade. Atualizar conforme for resolvendo.

---

## 🔴 Alta prioridade

### Migration campo `telefones` (array)
**Problema**: clientes importados da planilha têm só `telefone` (string). Buscas por `array-contains` funcionam mas sempre caem no fallback, fazendo queries extras desnecessárias.
**Solução**: script de migration — para cada cliente sem `telefones`, criar array com o valor de `telefone`.
**Impacto**: elimina fallback nas buscas, reduz leituras.

### Solução definitiva para `buscarClientePorNome`
**Problema**: ainda usa scan com `limit(500)` + range query por inicial. Não escala bem acima de 500 clientes.
**Solução**:
1. Salvar campo `nome_normalizado` em cada documento cliente (rodar migration)
2. Criar índice `orderBy('nome_normalizado')` no Firestore
3. Usar range query `startAt / endAt` no campo normalizado

---

## 🟡 Média prioridade

### TTL em `historico_conversa`
**Problema**: coleção cresce indefinidamente. `dbSalvarHistorico` faz uma query extra a cada save para limpar os mais antigos (ineficiente).
**Solução**: configurar TTL nativo do Firestore na coleção `historico_conversa` com campo `criado_em` (90 dias). Ou job periódico no `timers.js`.

### Rate limiting na API
**Problema**: API sem proteção contra abuso.
**Solução**: middleware com `express-rate-limit`.

---

## 🟢 Baixa prioridade

### Autenticação JWT no painel
**Problema**: `VITE_ADMIN_API_KEY` está no bundle do frontend — qualquer usuário consegue extrair.
**Solução**: login com sessão (cookie HttpOnly) ou JWT.

### Logs estruturados (Winston)
**Problema**: `console.log` puro, difícil de filtrar em produção.
**Solução**: substituir por Winston com níveis (error/warn/info) e saída JSON.

---

## ✅ Resolvido (não reabrir)

- ~~Scans completos do Firestore~~ — resolvido 2026-04-10
- ~~Menu duplicado~~ — resolvido 2026-04-10
- ~~N+1 no dashboard~~ — resolvido 2026-04-10
- ~~Loop infinito no fluxo de comprovante~~ — resolvido 2026-04-11
- ~~!cobrar sem ADMINISTRADORES~~ — resolvido 2026-04-11
- ~~SSE acúmulo de conexões~~ — resolvido 2026-04-09
- ~~Toggle bot 401~~ — resolvido 2026-04-09
- ~~Puppeteer crash loop~~ — resolvido 2026-04-09
- ~~Clientes com status promessa sendo cobrados~~ — resolvido 2026-04-17
- ~~Mensagens de cobrança genéricas~~ — resolvido 2026-04-17
- ~~Erro ao salvar sessão no Storage (ENOENT)~~ — resolvido 2026-04-17