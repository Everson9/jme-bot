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

## State manager — fluxos

```js
// Iniciar fluxo
state.iniciar(deQuem, 'nome_do_fluxo', 'etapa_inicial', { dados: iniciais });

// Avançar etapa sem perder dados
state.avancar(deQuem, 'proxima_etapa', { novosDados: valor });

// Atualizar só dados (mesma etapa)
state.atualizar(deQuem, { campo: valor });

// Encerrar sempre ao terminar — não deixar fluxo pendurado
state.encerrarFluxo(deQuem);

// Verificar antes de processar
if (state.isAtendimentoHumano(deQuem)) return;
const fluxoAtivo = state.getFluxo(deQuem);
const dados = state.getDados(deQuem);
```

---

## Envio de mensagens com prefixo P

Sempre usar o prefixo `P` no início das mensagens do bot para o cliente.
`P` é definido no contexto e garante formatação consistente.

```js
// ✅ CERTO
await client.sendMessage(deQuem, `${P}Sua mensagem aqui.`);

// ❌ ERRADO — sem prefixo
await client.sendMessage(deQuem, `Sua mensagem aqui.`);
```

---

## Notificar admins

```js
// Padrão para notificar todos os admins
for (const adm of ADMINISTRADORES) {
    await client.sendMessage(adm, mensagem).catch(() => {});
}

// Sempre usar .catch(() => {}) — se um admin não receber, não deve travar o fluxo
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

## Normalização de nomes para busca

```js
const norm = (s) => (s || '')
    .toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const STOP = new Set(['da','de','do','das','dos','e']);
const tokens = norm(nome).split(' ').filter(t => t.length > 1 && !STOP.has(t));
```