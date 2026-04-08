# Índices do Firestore - JME-BOT

## 🎯 Objetivo

Este documento lista todos os índices compostos necessários no Firestore para garantir performance otimizada e evitar erros de query.

## ⚠️ Importância

**Índices são CRÍTICOS para**:
- Evitar scans completos de coleções
- Reduzir custos de leitura
- Melhorar latência das queries
- Permitir queries complexas

## 📊 Índices Necessários

### Collection: `clientes`

#### Índice 1: Busca por base e status
```
Coleção: clientes
Campos:
  - base_id (Ascending)
  - status (Ascending)
  - nome (Ascending)
Query scope: Collection
```

**Usado em**: Listagens filtradas por base e status no painel admin

#### Índice 2: Inadimplentes por base
```
Coleção: clientes
Campos:
  - base_id (Ascending)
  - inadimplente (Ascending)
  - nome (Ascending)
Query scope: Collection
```

**Usado em**: Página de inadimplentes, cobranças automáticas

#### Índice 3: Busca por CPF
```
Coleção: clientes
Campos:
  - cpf (Ascending)
  - ativo (Ascending)
Query scope: Collection
```

**Usado em**: Identificação de clientes por CPF

#### Índice 4: Busca por telefone
```
Coleção: clientes
Campos:
  - telefones (Array contains)
  - ativo (Ascending)
Query scope: Collection
```

**Usado em**: Identificação de clientes por telefone no WhatsApp

#### Índice 5: Clientes ativos por base
```
Coleção: clientes
Campos:
  - base_id (Ascending)
  - ativo (Ascending)
  - data_cadastro (Descending)
Query scope: Collection
```

**Usado em**: Dashboard, estatísticas por base

### Collection: `promessas`

#### Índice 1: Promessas ativas por cliente
```
Coleção: promessas
Campos:
  - cliente_id (Ascending)
  - ativa (Ascending)
  - data_promessa (Descending)
Query scope: Collection
```

**Usado em**: Verificação de promessas ativas, página de promessas

#### Índice 2: Promessas por base
```
Coleção: promessas
Campos:
  - base_id (Ascending)
  - ativa (Ascending)
  - data_promessa (Descending)
Query scope: Collection
```

**Usado em**: Listagem de promessas por base no painel

#### Índice 3: Promessas vencendo
```
Coleção: promessas
Campos:
  - ativa (Ascending)
  - data_promessa (Ascending)
  - notificado (Ascending)
Query scope: Collection
```

**Usado em**: Job de notificação de promessas vencendo

### Collection: `agendamentos`

#### Índice 1: Agendamentos por base e status
```
Coleção: agendamentos
Campos:
  - base_id (Ascending)
  - status (Ascending)
  - data_agendamento (Ascending)
Query scope: Collection
```

**Usado em**: Página de agendamentos, filtros por base

#### Índice 2: Agendamentos do dia
```
Coleção: agendamentos
Campos:
  - data_agendamento (Ascending)
  - status (Ascending)
  - tipo (Ascending)
Query scope: Collection
```

**Usado em**: Dashboard, notificações de agendamentos do dia

### Collection: `instalacoes_agendadas`

#### Índice 1: Instalações por status
```
Coleção: instalacoes_agendadas
Campos:
  - status (Ascending)
  - data_agendamento (Ascending)
  - base_id (Ascending)
Query scope: Collection
```

**Usado em**: Página de instalações agendadas

### Collection: `bases`

#### Índice 1: Bases ativas
```
Coleção: bases
Campos:
  - ativa (Ascending)
  - nome (Ascending)
Query scope: Collection
```

**Usado em**: Seleção de bases no painel

### Collection: `historico_conversa`

#### Índice 1: Histórico por cliente
```
Coleção: historico_conversa
Campos:
  - cliente_id (Ascending)
  - timestamp (Descending)
Query scope: Collection
```

**Usado em**: Visualização de histórico de conversas

**⚠️ ATENÇÃO**: Esta coleção pode crescer muito. Considere usar TTL ou arquivamento.

## 🔧 Como Criar Índices

### Opção 1: Console Firebase

1. Acesse https://console.firebase.google.com
2. Selecione seu projeto
3. Vá em **Firestore Database** → **Índices**
4. Clique em **Criar índice**
5. Configure os campos conforme especificado acima

### Opção 2: Via Erro de Query

Quando uma query falhar por falta de índice, o Firestore retorna um link direto para criar o índice necessário.

**Exemplo de erro**:
```
Error: The query requires an index. You can create it here: 
https://console.firebase.google.com/v1/r/project/...
```

### Opção 3: firestore.indexes.json (Recomendado)

Crie um arquivo `firestore.indexes.json` na raiz do projeto:

```json
{
  "indexes": [
    {
      "collectionGroup": "clientes",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "base_id", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "nome", "order": "ASCENDING" }
      ]
    }
    // ... outros índices
  ]
}
```

Deploy via Firebase CLI:
```bash
firebase deploy --only firestore:indexes
```

## 📈 Monitoramento de Performance

### Verificar uso de índices

No console Firebase:
1. **Firestore Database** → **Uso**
2. Observe métricas de leitura
3. Identifique queries lentas

### Alertas de custo

Configure alertas no GCP quando:
- Leituras > X por dia
- Latência > Yms

## 🎓 Boas Práticas

### ✅ Fazer

- Criar índices ANTES de colocar queries em produção
- Usar `limit()` em todas as queries de listagem
- Implementar paginação com cursors
- Monitorar uso de reads diariamente
- Testar queries no emulador local primeiro

### ❌ Evitar

- `.get()` sem `where()` em coleções grandes
- Loops de N queries individuais (N+1)
- Filtros em memória (trazer tudo e filtrar no código)
- Subcoleções muito grandes sem TTL
- Queries sem índice em produção

## 🔍 Debugging

### Query não funciona?

1. Verifique o erro no console
2. O Firebase gera link automático para criar índice
3. Aguarde alguns minutos após criar (propagação)
4. Teste novamente

### Lentidão mesmo com índice?

- Verifique quantidade de documentos retornados
- Use `limit()` adequado
- Considere pagination
- Verifique se o índice está realmente sendo usado (console Firebase)

## 📚 Referências

- [Firestore Indexing](https://firebase.google.com/docs/firestore/query-data/indexing)
- [Best Practices](https://firebase.google.com/docs/firestore/best-practices)
- [SKILL: Firestore Performance](.cursor/skills/firestore-custos-performance/SKILL.md)

---

**Última atualização**: 2024-05-20
**Próxima revisão**: A cada novo tipo de query implementada
