# Guia de Contribuição - JME-BOT

Obrigado por considerar contribuir com o JME-BOT! 🎉

## 📋 Índice

- [Código de Conduta](#código-de-conduta)
- [Como Contribuir](#como-contribuir)
- [Configuração do Ambiente](#configuração-do-ambiente)
- [Fluxo de Trabalho](#fluxo-de-trabalho)
- [Padrões de Código](#padrões-de-código)
- [Skills e Diretrizes](#skills-e-diretrizes)
- [Testes](#testes)
- [Documentação](#documentação)
- [Pull Requests](#pull-requests)

## 📜 Código de Conduta

Este projeto adota princípios de:
- Respeito mútuo
- Colaboração construtiva
- Foco em soluções
- Comunicação clara

## 🤝 Como Contribuir

### Tipos de Contribuição

Aceitamos contribuições de várias formas:

1. **🐛 Reportar Bugs**
   - Verifique se já não existe issue similar
   - Use o template de issue
   - Forneça passos para reproduzir
   - Inclua logs relevantes

2. **✨ Sugerir Features**
   - Descreva o problema que resolve
   - Explique a solução proposta
   - Considere impactos em performance

3. **📝 Melhorar Documentação**
   - Corrigir typos
   - Adicionar exemplos
   - Esclarecer conceitos

4. **💻 Contribuir com Código**
   - Correções de bugs
   - Novas funcionalidades
   - Otimizações de performance
   - Refatorações

## ⚙️ Configuração do Ambiente

### 1. Fork e Clone

```bash
# Fork o repositório no GitHub
# Clone seu fork
git clone https://github.com/SEU-USUARIO/jme-bot.git
cd jme-bot

# Adicione o upstream
git remote add upstream https://github.com/Everson9/jme-bot.git
```

### 2. Instalar Dependências

```bash
# Backend
npm install

# Frontend
cd frontend
npm install
```

### 3. Configurar Ambiente

```bash
# Copie o .env.example
cp .env.example .env

# Configure suas credenciais de desenvolvimento
# IMPORTANTE: Use credenciais de TESTE, não de produção!
```

### 4. Firestore Local (Emulador)

```bash
# Instalar Firebase CLI
npm install -g firebase-tools

# Iniciar emulador
firebase emulators:start
```

## 🔄 Fluxo de Trabalho

### 1. Criar Branch

```bash
# Sincronize com upstream
git fetch upstream
git checkout main
git merge upstream/main

# Crie uma branch descritiva
git checkout -b feature/nome-da-feature
# ou
git checkout -b fix/descricao-do-bug
```

**Convenção de nomes**:
- `feature/` - Nova funcionalidade
- `fix/` - Correção de bug
- `docs/` - Apenas documentação
- `refactor/` - Refatoração de código
- `perf/` - Melhoria de performance
- `test/` - Adicionar/melhorar testes

### 2. Desenvolver

```bash
# Faça suas alterações
# Teste localmente

# Backend
npm run dev

# Frontend
cd frontend
npm run dev
```

### 3. Commitar

```bash
git add .
git commit -m "tipo: descrição curta

Descrição mais detalhada do que foi feito e por quê.

Refs: #123"
```

**Tipos de commit**:
- `feat:` - Nova feature
- `fix:` - Correção de bug
- `docs:` - Documentação
- `style:` - Formatação (não afeta código)
- `refactor:` - Refatoração
- `perf:` - Performance
- `test:` - Testes
- `chore:` - Manutenção

### 4. Push e PR

```bash
# Push para seu fork
git push origin feature/nome-da-feature

# Abra um Pull Request no GitHub
```

## 📏 Padrões de Código

### JavaScript/Node.js

```javascript
// ✅ BOM
const buscarCliente = async (clienteId) => {
  try {
    const doc = await db.collection('clientes').doc(clienteId).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() };
  } catch (erro) {
    console.error('Erro ao buscar cliente:', erro);
    throw erro;
  }
};

// ❌ EVITAR
function buscarCliente(clienteId) {
  return db.collection('clientes').doc(clienteId).get().then(doc => {
    if (doc.exists) {
      return { id: doc.id, ...doc.data() };
    }
  });
}
```

**Regras**:
- Usar `const` e `let`, nunca `var`
- Arrow functions preferencialmente
- Async/await ao invés de callbacks
- Nomes descritivos em português
- Try/catch em operações assíncronas
- Comentários apenas quando necessário

### React/Frontend

```jsx
// ✅ BOM
const ListaClientes = ({ clientes, onClienteClick }) => {
  return (
    <div className="lista-clientes">
      {clientes.map(cliente => (
        <ClienteCard
          key={cliente.id}
          cliente={cliente}
          onClick={() => onClienteClick(cliente.id)}
        />
      ))}
    </div>
  );
};

// ❌ EVITAR
function ListaClientes(props) {
  return (
    <div>
      {props.clientes.map((c, i) => (
        <div key={i} onClick={() => props.onClick(c.id)}>
          {c.nome}
        </div>
      ))}
    </div>
  );
}
```

**Regras**:
- Componentes funcionais com hooks
- Props descritivos
- Keys únicas (nunca index)
- Componentização quando reutilizável
- Custom hooks para lógica compartilhada

## 🎯 Skills e Diretrizes

**⚠️ IMPORTANTE**: Antes de trabalhar em qualquer área específica, **LEIA a SKILL correspondente**:

### Backend / Performance
- [Firestore Performance](docs/skills/firestorecustosperformance.md)
- Sempre use índices
- Implemente paginação
- Use `limit()` em queries
- Evite N+1

### Segurança
- [Segurança e Segredos](docs/skills/seguranca-segredos-painel-admin.md)
- Nunca commite credenciais
- Use variáveis de ambiente
- Valide inputs
- Sanitize outputs

### Produção
- [Runbook Produção](docs/skills/runbook-producao-jme-bot.md)
- Configure health checks
- Documente variáveis necessárias
- Teste em ambiente similar

## 🧪 Testes

### Rodar Testes

```bash
# Testes de carga
node tests/carga.js

# Simulador de conversas
node tests/simulador.js
```

### Escrever Testes

```javascript
// tests/exemplo.test.js
const { buscarCliente } = require('../database/funcoes-firebase');

describe('buscarCliente', () => {
  it('deve retornar cliente quando existe', async () => {
    const cliente = await buscarCliente('cliente123');
    expect(cliente).toBeDefined();
    expect(cliente.nome).toBe('João Silva');
  });

  it('deve retornar null quando não existe', async () => {
    const cliente = await buscarCliente('inexistente');
    expect(cliente).toBeNull();
  });
});
```

## 📚 Documentação

### Quando Documentar

Documente quando:
- Adicionar nova funcionalidade
- Mudar comportamento existente
- Adicionar novo endpoint de API
- Criar novo fluxo de atendimento
- Adicionar índice Firestore

### O Que Documentar

1. **README.md** - Overview geral
2. **docs/API.md** - Novos endpoints
3. **docs/FIRESTORE_INDEXES.md** - Novos índices
4. **docs/ARCHITECTURE.md** - Mudanças estruturais
5. **Comentários no código** - Lógica complexa
6. **CHANGELOG.md** - Mudanças da versão

## 🔍 Pull Requests

### Checklist antes de abrir PR

- [ ] Código segue os padrões do projeto
- [ ] Leu a SKILL relevante
- [ ] Testou localmente
- [ ] Atualizou documentação
- [ ] Commit messages seguem convenção
- [ ] Sem credenciais no código
- [ ] Performance verificada (se aplicável)
- [ ] Firestore: índices documentados (se aplicável)

### Template de PR

```markdown
## Descrição
Breve descrição do que foi feito

## Tipo de mudança
- [ ] Bug fix
- [ ] Nova feature
- [ ] Breaking change
- [ ] Documentação

## Como testar
1. Passo 1
2. Passo 2
3. Resultado esperado

## Checklist
- [ ] Li a SKILL relevante
- [ ] Testei localmente
- [ ] Atualizei documentação
- [ ] Sem impacto em performance

## Screenshots (se aplicável)
```

### Revisão de Código

Quando revisar PRs, verifique:
- ✅ Segue padrões do projeto
- ✅ Skills foram respeitadas
- ✅ Performance considerada
- ✅ Sem vazamento de credenciais
- ✅ Documentação atualizada
- ✅ Lógica clara e testável

## 🎓 Recursos Úteis

### Documentação Externa
- [Firestore Best Practices](https://firebase.google.com/docs/firestore/best-practices)
- [whatsapp-web.js Guide](https://wwebjs.dev/guide/)
- [React Best Practices](https://react.dev/learn)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)

### Documentação Interna
- [History.md](History.md) - Histórico do projeto
- [Skills](docs/skills/) - Diretrizes técnicas

## ❓ Dúvidas?

- Abra uma [Discussion](https://github.com/Everson9/jme-bot/discussions)
- Entre em contato com a equipe
- Consulte o [History.md](History.md)

## 🙏 Agradecimentos

Toda contribuição é valiosa, independente do tamanho!

Obrigado por fazer o JME-BOT melhor! 🚀