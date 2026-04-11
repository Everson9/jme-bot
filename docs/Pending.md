# Pendências — JME-BOT

Em ordem de prioridade. Atualizar conforme for resolvendo.

---

## 🔴 Alta prioridade

### Migration campo `telefones` (array)
**Problema**: clientes importados da planilha têm só `telefone` (string). Buscas por `array-contains` funcionam mas sempre caem no fallback, fazendo queries extras desnecessárias.
**Solução**: script de migration — para cada cliente sem `telefones`, criar array com o valor de `telefone`.
**Impacto**: elimina fallback nas buscas, reduz leituras.

```js
// Script de migration (rodar uma vez)
const snap = await db.collection('clientes').get();
const batch = db.batch();
let count = 0;
snap.docs.forEach(doc => {
    const c = doc.data();
    if (!c.telefones && c.telefone) {
        batch.update(doc.ref, {
            telefones: [c.telefone.replace(/\D/g, '')]
        });
        count++;
    }
});
await batch.commit();
console.log(`Migration: ${count} clientes atualizados`);
```

---

### Solução definitiva para `buscarClientePorNome`
**Problema**: ainda usa scan com `limit(500)` + range query por inicial. Não escala bem acima de 500 clientes.
**Solução**:
1. Salvar campo `nome_normalizado` em cada documento cliente (rodar migration)
2. Criar índice `orderBy('nome_normalizado')` no Firestore
3. Usar range query `startAt / endAt` no campo normalizado

```js
// Depois da migration, a busca vira:
const snapshot = await db.collection('clientes')
    .orderBy('nome_normalizado')
    .startAt(primeiro)
    .endAt(primeiro + '\uf8ff')
    .limit(20)
    .get();
```

**Atenção**: precisa do índice criado no console Firebase antes de colocar em produção.

---

## 🟡 Média prioridade

### TTL em `historico_conversa`
**Problema**: coleção cresce indefinidamente. `dbSalvarHistorico` faz uma query extra a cada save para limpar os mais antigos (ineficiente).
**Solução**: configurar TTL nativo do Firestore na coleção `historico_conversa` com campo `criado_em` (90 dias). Ou job periódico no `timers.js`.
**Impacto**: reduz leituras e custo do Firestore ao longo do tempo.

### Rate limiting na API
**Problema**: API sem proteção contra abuso.
**Solução**: middleware com `express-rate-limit`.
```js
const rateLimit = require('express-rate-limit');
app.use('/api/', rateLimit({ windowMs: 60000, max: 100 }));
```

---

## 🟢 Baixa prioridade

### Autenticação JWT no painel
**Problema**: `VITE_ADMIN_API_KEY` está no bundle do frontend — qualquer usuário consegue extrair.
**Solução**: login com sessão (cookie HttpOnly) ou JWT. Enquanto isso, proteger o painel por IP whitelist ou Basic Auth no proxy.

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