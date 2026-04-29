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

## RemoteAuth + Firebase Storage (não LocalAuth)

**Decisão**: usar RemoteAuth com FirestoreStore customizado — sessão zipada no Firebase Storage.
**Motivo**: LocalAuth salvava sessão em volume efêmero do Railway — cada deploy recriava o volume e exigia QR novamente. RemoteAuth persiste a sessão como `whatsapp_session/{sessionName}.zip` no Firebase Storage.
**Storage bucket**: `jmenet.appspot.com` (ou `FIREBASE_STORAGE_BUCKET` se definido)
**Intervalo de sync**: `backupSyncIntervalMs: 43200000` (12h)
**Pasta `.wwebjs_auth`**: é temporária — criada pelo RemoteAuth para extração do zip, não é a origem da verdade.
**Risco**: se o servidor reiniciar antes do próximo sync (12h), a sessão no Storage pode estar desatualizada.

---

## Timeout no WhatsApp messaging

**Decisão**: usar helper `comTimeout` em todas as chamadas da API do WhatsApp.
**Motivo**: chamadas como `sendMessage`, `getNumberId` e `isRegisteredUser` podem travar indefinidamente se o Chromium estiver com problemas. Timeout evita que o processo fique pendurado.
**Valores**: 30s para `sendMessage`, 15s para `getNumberId` e `isRegisteredUser`.
**NÃO remover os timeouts** — isso causaria travamentos em produção.

---

## Rotas modularizadas por funcionalidade

**Decisão**: dividir `routes/index.js` em 17 arquivos separados por funcionalidade.
**Motivo**: arquivo único com ~800 linhas é difícil de manter. Modularização facilita encontrar e editar rotas específicas.
**Arquivos**: admin.js, agendamentos.js, alertas.js, backup.js, boas-vindas.js, bot.js, cancelamentos.js, chamados.js, clientes.js, cobranca.js, dashboard.js, index.js, instalacoes-agendadas.js, instalacoes.js, logs.js, migracao.js, paginacao.js, relatorios.js.
**NÃO voltar para arquivo único** — mantenha a separação.