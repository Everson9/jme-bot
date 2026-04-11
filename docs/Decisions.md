# Decisões Técnicas — JME-BOT

Leia este arquivo antes de "melhorar" qualquer coisa listada aqui.
Cada decisão tem um motivo. Se quiser mudar, pergunte antes.

---

## Debounce de 12 segundos (Mensagem.js)

**Decisão**: acumular mensagens do mesmo remetente por 12s antes de processar.
**Motivo**: clientes costumam mandar várias mensagens em sequência rápida ("oi", "quero pagar", "meu nome é João"). O timer reinicia a cada nova mensagem. Se processar a primeira imediatamente, o bot responde antes do cliente terminar de digitar.
**NÃO alterar para menos de 10s.**

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

// Mensagem.js — !cobrar
await dispararCobrancaReal(client, firebaseDb, data, args[2] || null, null, ADMINISTRADORES);

// routes/index.js
dispararCobrancaReal: (d, t) => dispararCobrancaReal(client, firebaseDb, d, t, null, ADMINISTRADORES)
```

---

## Groq como classificador de intenções

**Decisão**: usar Groq (llama-3.3-70b-versatile) para classificar intenções e extrair dados.
**Motivo**: respostas mais naturais, classificação mais precisa que regex puro, extração de dados de comprovantes via visão.
**Fallback**: retry progressivo em caso de falha. O bot não para se o Groq estiver lento.

---

## StateManager sem persistência SQLite

**Decisão**: estado em memória pura (Map), sem SQLite no modo Firebase.
**Motivo**: Railway reinicia containers com frequência. Estado em SQLite local seria perdido de qualquer forma. Firebase é a fonte de verdade para atendimento humano ativo.
**Consequência**: se o processo reiniciar, estados de fluxo em andamento são perdidos. Atendimentos humanos são restaurados do Firestore no boot.

---

## Votação de admins via WhatsApp

**Decisão**: antes de disparar cobrança automática, perguntar para admins via `!sim/!nao`.
**Motivo**: evitar cobranças acidentais. Admins confirmam a lista antes do disparo.
**Timeout**: 60 minutos. Se ninguém responder, a cobrança é pulada e tentada no próximo ciclo de 2h.