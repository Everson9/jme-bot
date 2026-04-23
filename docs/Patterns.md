# Padrões de Código — JME-BOT

Siga estes padrões em qualquer código novo ou modificado.

---

## Firestore — regras de query

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
        .collection('historico_pagamentos').get(); // ← busca TODO o histórico
}

// ✅ CERTO — busca só o ciclo necessário
const hDoc = await db.collection('clientes').doc(cliente.id)
    .collection('historico_pagamentos').doc(cicloRef.docId).get();
```

---

## Busca de cliente por telefone

Sempre normalizar o número e tentar variantes. Nunca assumir formato fixo.

```js
// Variantes obrigatórias: com/sem 55, com/sem 9º dígito
const variantes = new Set([num, '55' + num]);
if (num.length === 11) variantes.add(num.slice(0,2) + num.slice(3)); // sem 9
if (num.length === 10) variantes.add(num.slice(0,2) + '9' + num.slice(2)); // com 9

// Tenta campo telefones (array) primeiro, depois telefone (string) legado
for (const v of variantes) {
    const snap = await db.collection('clientes')
        .where('telefones', 'array-contains', v).limit(1).get();
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
}
```

---

## Atualização de status do cliente

Sempre atualizar o campo `status` E o histórico juntos. Nunca só um.

```js
// ✅ CERTO — atualiza os dois
await db.collection('clientes').doc(clienteId).update({
    status: 'pago',
    atualizado_em: new Date().toISOString()
});
await db.collection('clientes').doc(clienteId)
    .collection('historico_pagamentos').doc(cicloRef.docId)
    .set({ status: 'pago', ... }, { merge: true });

// ❌ ERRADO — atualiza só o histórico, painel fica desatualizado
await db.collection('clientes').doc(clienteId)
    .collection('historico_pagamentos').doc(docId)
    .set({ status: 'pago' }, { merge: true });
```

---

## Tratamento de erros em operações de banco

```js
// Operações críticas — deixar propagar para o caller tratar
await db.collection('clientes').doc(id).update({ status: 'pago' });

// Operações de log/SSE — silenciar erro, não são críticas
await banco.dbLogComprovante(deQuem).catch(() => {});
await banco.dbSalvarAtendimentoHumano(deQuem).catch(() => {});
sseService.broadcast();
```

---

## Timeout em chamadas WhatsApp

```js
// ✅ CERTO — usar comTimeout em todas as chamadas
const { comTimeout } = require('./services/whatsappService');

await comTimeout(client.sendMessage(numero, mensagem), 30000, 'sendMessage');
await comTimeout(client.getNumberId(numero), 15000, 'getNumberId');
await comTimeout(client.isRegisteredUser(numero), 15000, 'isRegisteredUser');

// ❌ ERRADO — sem timeout, pode travar indefinidamente
await client.sendMessage(numero, mensagem);
```