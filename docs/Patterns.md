# Padrões de Código — JME-BOT

Siga estes padrões em qualquer código novo ou modificado.

---

## Firestore — Regras de Query

```js
// ✅ CERTO — query com filtro e limite
const snap = await db.collection('clientes')
    .where('telefones', 'array-contains', numero)
    .limit(1)
    .get();

// ✅ CERTO — busca por campo indexado
const snap = await db.collection('clientes')
    .where('cpf', '==', cpfBusca)
    .limit(1)
    .get();

// ✅ CERTO — listagem com paginação
const snap = await db.collection('clientes')
    .where('base_id', '==', baseId)
    .limit(100)
    .get();

// ❌ ERRADO — scan total, nunca fazer
const snap = await db.collection('clientes').get();

// ❌ ERRADO — loop de queries individuais (N+1)
for (const cliente of clientes) {
    const hist = await db.collection('clientes').doc(cliente.id)
        .collection('historico_pagamentos').get();
}

// ✅ CERTO — busca só o ciclo necessário
const hDoc = await db.collection('clientes').doc(cliente.id)
    .collection('historico_pagamentos').doc(cicloRef.docId).get();
```

---

## Busca de Cliente por Telefone

Sempre normalizar o número e tentar variantes.

```js
// Variantes: com/sem 55, com/sem 9º dígito
const variantes = new Set([num, '55' + num]);
if (num.length === 11) variantes.add(num.slice(0,2) + num.slice(3));
if (num.length === 10) variantes.add(num.slice(0,2) + '9' + num.slice(2));

// Tenta telefones (array) primeiro, depois telefone (string) legado
for (const v of variantes) {
    const snap = await db.collection('clientes')
        .where('telefones', 'array-contains', v).limit(1).get();
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
}
```

---

## Atualização de Status do Cliente

Sempre atualizar `status` E `historico_pagamentos` juntos.

```js
// ✅ CERTO — atualiza os dois
await db.collection('clientes').doc(clienteId).update({
    status: 'pago',
    atualizado_em: new Date().toISOString()
});
await db.collection('clientes').doc(clienteId)
    .collection('historico_pagamentos').doc(cicloRef.docId)
    .set({ status: 'pago', ... }, { merge: true });

// ❌ ERRADO — atualiza só o histórico
await db.collection('clientes').doc(clienteId)
    .collection('historico_pagamentos').doc(docId)
    .set({ status: 'pago' }, { merge: true });
```

---

## Timeout em Chamadas WhatsApp

SEMPRE usar `comTimeout` em todas as chamadas WhatsApp.

```js
const { comTimeout } = require('./services/whatsappService');

// ✅ CERTO
await comTimeout(client.sendMessage(numero, mensagem), 30000, 'sendMessage');
await comTimeout(client.getNumberId(numero), 15000, 'getNumberId');
await comTimeout(client.isRegisteredUser(numero), 15000, 'isRegisteredUser');

// ❌ ERRADO — sem timeout, pode travar indefinidamente
await client.sendMessage(numero, mensagem);
```

---

## Assinatura de `dispararCobrancaReal`

6 parâmetros obrigatórios:

```js
dispararCobrancaReal(client, firebaseDb, data, tipo, clientesFiltrados, ADMINISTRADORES)
```

- `data`: dia de vencimento ("10", "20", "30")
- `tipo`: "lembrete", "atraso", "atraso_final", "reconquista", "reconquista_final"
- `clientesFiltrados`: null = modo busca (busca do banco), array = modo lista (já filtrado)
- `ADMINISTRADORES`: sempre como 6º parâmetro

---

## Tratamento de Erros

```js
// Operações críticas — deixar propagar
await db.collection('clientes').doc(id).update({ status: 'pago' });

// Operações de log/SSE — silenciar erro, não são críticas
await banco.dbLogComprovante(deQuem).catch(() => {});
await banco.dbSalvarAtendimentoHumano(deQuem).catch(() => {});
sseService.broadcast();
```

---

## Datas e Timezone

Sempre usar UTC-3 (BRT) para comparações de dia/hora:

```js
const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
const hojeStr = agoraBR.toISOString().split('T')[0]; // "YYYY-MM-DD"
```

---

**Última atualização**: 2026-04-29
