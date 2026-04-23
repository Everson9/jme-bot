# Decisões Técnicas — JME-BOT

Leia este arquivo antes de "melhorar" qualquer coisa listada aqui.
Cada decisão tem um motivo. Se quiser mudar, pergunte antes.

---

## Status do cliente como campo direto no documento

**Decisão**: campo `status` string no documento do cliente, atualizado em toda operação de baixa/reverter.
**Motivo**: dashboard e listagens precisam de O(n) leituras. Se status fosse calculado apenas pelo histórico de pagamentos, cada listagem faria O(3n) leituras (uma por cliente para buscar o histórico). Com 300 clientes isso é 900 leituras por request do painel.
**NÃO remover o campo `status` do documento.** Sempre atualizar junto com o histórico.

---

## Campo telefones como array

**Decisão**: campo `telefones` é array de strings. Campo `telefone` (string) é legado.
**Motivo**: clientes podem ter mais de um número. O array permite `array-contains` no Firestore sem scan.
**Clientes antigos** importados da planilha têm só `telefone` (string). Todas as buscas devem tratar os dois campos. Migration pendente — ver `docs/PENDING.md`.

---

## Firestore sem scan total

**Decisão**: toda query em `clientes` usa `where` + `limit`.
**Motivo**: scan completo da coleção com Railway → Firestore levava 3–8s por query. Com 5 scans em sequência numa única mensagem, o delay chegou a 9 minutos. Corrigido em 2026-04-10.
**Exceção documentada**: `buscarClientePorNome` usa `limit(500)` + range query por inicial. Ainda não é ideal — ver `docs/PENDING.md` para a solução definitiva.

---

## dispararCobrancaReal sempre recebe ADMINISTRADORES

**Decisão**: 6º parâmetro de `dispararCobrancaReal` é `ADMINISTRADORES`.
**Motivo**: a função envia o relatório pós-cobrança (enviadas/falhas/não entregues) diretamente para os admins via WhatsApp. Sem esse parâmetro o relatório não chega.
**Assinatura**: `dispararCobrancaReal(client, firebaseDb, data, tipo, clientesFiltrados, ADMINISTRADORES)`
**Wrappers corretos**:
```js
// timers.js
(data, tipo, clientes) => dispararCobrancaReal(client, firebaseDb, data, tipo, clientes, ADMINISTRADORES)

// routes/index.js
dispararCobrancaReal: (d, t) => dispararCobrancaReal(client, firebaseDb, d, t, null, ADMINISTRADORES)
```

---

## LocalAuth em vez de RemoteAuth

**Decisão**: usar LocalAuth com sessão salva em `/data/.wwebjs_auth` no Railway.
**Motivo**: RemoteAuth com Firebase Storage foi tentado em 2026-04-13/14 mas causava problemas de estabilidade. LocalAuth é mais simples e funciona bem no Railway com persistência de volume.
**NÃO voltar para RemoteAuth** a menos que haja um problema específico que só ele resolva.

---

## Timeout no WhatsApp messaging

**Decisão**: usar helper `comTimeout` em todas as chamadas da API do WhatsApp.
**Motivo**: chamadas como `sendMessage`, `getNumberId` e `isRegisteredUser` podem travar indefinidamente se o Chromium estiver com problemas. Timeout evita que o processo fique pendurado.
**Valores**: 30s para `sendMessage`, 15s para `getNumberId` e `isRegisteredUser`.
**NÃO remover os timeouts** — isso causaria travamentos em produção.

---

## Rotas modularizadas por funcionalidade

**Decisão**: dividir `routes/index.js` em 12 arquivos separados por funcionalidade.
**Motivo**: arquivo único com ~800 linhas é difícil de manter. Modularização facilita encontrar e editar rotas específicas.
**Arquivos**: bot.js, clientes.js, cobranca.js, dashboard.js, logs.js, chamados.js, cancelamentos.js, instalacoes.js, relatorios.js, admin.js, boas-vindas.js, migracao.js.
**NÃO voltar para arquivo único** — mantenha a separação.