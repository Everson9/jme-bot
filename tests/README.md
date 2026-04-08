# Testes - JME-BOT

Documentação completa dos testes do projeto.

## 📋 Visão Geral

O JME-BOT possui três tipos principais de testes:

1. **Testes de Carga** - Simula múltiplos usuários simultâneos
2. **Simulador de Conversas** - Testa fluxos completos de atendimento
3. **Testes Unitários** - Valida funções específicas (em desenvolvimento)

## 🧪 Arquivos de Teste

### `carga.js`

Teste de carga que simula múltiplos clientes enviando mensagens simultaneamente.

**Objetivo**: Verificar se o bot consegue lidar com múltiplos atendimentos simultâneos sem:
- Perder contexto de conversas
- Misturar estados entre clientes
- Degradar performance significativamente
- Travar ou crashar

**Como usar**:
```bash
node tests/carga.js
```

**Configurações**:
```javascript
// No arquivo carga.js
const NUMERO_CLIENTES = 10;      // Clientes simultâneos
const MENSAGENS_POR_CLIENTE = 5; // Mensagens por cliente
const DELAY_ENTRE_MENSAGENS = 1000; // ms
```

**Saída esperada**:
```
🚀 Iniciando teste de carga...
📊 Clientes: 10 | Mensagens/cliente: 5

✅ Cliente 1: 5/5 mensagens enviadas
✅ Cliente 2: 5/5 mensagens enviadas
...
✅ Cliente 10: 5/5 mensagens enviadas

📈 Resultados:
- Total mensagens: 50
- Tempo total: 12.5s
- Taxa de sucesso: 100%
- Média por mensagem: 250ms
```

---

### `simulador.js`

Simulador interativo de conversas do WhatsApp.

**Objetivo**: Testar fluxos completos de atendimento sem precisar de um telefone real.

**Como usar**:
```bash
node tests/simulador.js
```

**Funcionalidades**:
- Simula recebimento de mensagens
- Testa todos os fluxos (financeiro, suporte, promessa, etc.)
- Valida respostas do bot
- Testa identificação de clientes
- Processa comprovantes (mock)

**Comandos disponíveis**:
```
> Oi                      # Inicia conversa
> 1                       # Suporte técnico
> 2                       # Consultar situação
> João Silva              # Identificação
> /reset                  # Reseta estado
> /status                 # Mostra estado atual
> /exit                   # Sair
```

**Exemplo de uso**:
```
$ node tests/simulador.js

🤖 Simulador JME-BOT
Digite 'exit' para sair

> Oi
Bot: Olá! Como posso ajudar?
1️⃣ Suporte Técnico
2️⃣ Financeiro
3️⃣ Instalação

> 2
Bot: Para consultar sua situação, me informe seu nome completo.

> João Silva
Bot: Encontrei seu cadastro! 
📊 Situação: EM DIA ✅
💰 Último pagamento: 15/04/2026
📅 Próximo vencimento: 10/05/2026
```

---

### `util.js`

Funções utilitárias compartilhadas entre testes.

**Funções disponíveis**:

```javascript
const { 
  criarClienteMock,
  gerarCPF,
  gerarTelefone,
  limparFirestoreTeste,
  aguardar
} = require('./util');

// Criar cliente mock para testes
const cliente = criarClienteMock({
  nome: 'João Silva',
  cpf: '12345678900'
});

// Gerar CPF válido aleatório
const cpf = gerarCPF(); // "123.456.789-00"

// Gerar telefone válido
const telefone = gerarTelefone(); // "5581999999999"

// Limpar dados de teste do Firestore
await limparFirestoreTeste();

// Aguardar X milissegundos
await aguardar(1000);
```

---

## 🎯 Cenários de Teste

### 1. Fluxo Financeiro Completo

```bash
# Via simulador
node tests/simulador.js

> Oi
> 2 (Financeiro)
> João Silva
> [Verificar resposta com situação]
```

**Deve validar**:
- ✅ Identificação correta do cliente
- ✅ Consulta ao Firestore
- ✅ Exibição de situação (pago/pendente)
- ✅ Opções de pagamento se pendente

### 2. Suporte Técnico

```bash
> Oi
> 1 (Suporte)
> Internet está lenta
```

**Deve validar**:
- ✅ Diagnóstico automático
- ✅ Perguntas de troubleshooting
- ✅ Opção de agendar técnico
- ✅ Transferência para humano se necessário

### 3. Promessa de Pagamento

```bash
> Oi
> 2 (Financeiro)
> João Silva
> [Está atrasado]
> Fazer promessa
> 25/05/2026
```

**Deve validar**:
- ✅ Cliente identificado corretamente
- ✅ Verificação de atraso
- ✅ Criação de promessa no Firestore
- ✅ Confirmação para o cliente

### 4. Processamento de Comprovante

```bash
# Mock de envio de PDF
> Oi
> 2
> João Silva
> [Simular envio de PDF]
```

**Deve validar**:
- ✅ Detecção de arquivo
- ✅ Extração de dados (valor, data)
- ✅ Registro no histórico
- ✅ Atualização de status

### 5. Atendimento Simultâneo

```bash
# Via teste de carga
node tests/carga.js
```

**Deve validar**:
- ✅ Sem mistura de estados
- ✅ Cada cliente mantém seu fluxo
- ✅ Performance aceitável (<500ms/msg)
- ✅ Sem erros ou crashes

---

## 📊 Métricas e Benchmarks

### Performance Esperada

| Métrica | Valor Alvo | Crítico |
|---------|-----------|---------|
| Resposta do bot | < 300ms | < 1s |
| Query Firestore | < 200ms | < 500ms |
| Processamento comprovante | < 2s | < 5s |
| Classificação IA | < 1s | < 3s |

### Limites de Carga

| Cenário | Suportado | Máximo |
|---------|-----------|--------|
| Conversas simultâneas | 50 | 100 |
| Mensagens/segundo | 20 | 50 |
| Mensagens/dia | 10.000 | 50.000 |

---

## 🔧 Configuração de Ambiente de Teste

### 1. Firebase Emulator (Recomendado)

```bash
# Instalar Firebase CLI
npm install -g firebase-tools

# Configurar projeto
firebase init emulators

# Iniciar emulador
firebase emulators:start --only firestore

# Rodar testes contra emulator
export FIRESTORE_EMULATOR_HOST="localhost:8080"
node tests/simulador.js
```

### 2. Banco de Teste (Alternativa)

Crie um projeto Firebase separado apenas para testes:

```bash
# .env.test
FIREBASE_CREDENTIALS_JSON={"project_id":"jme-bot-test",...}
GROQ_API_KEY=gsk_test_key
```

```bash
# Rodar com env de teste
NODE_ENV=test node tests/simulador.js
```

---

## ✅ Checklist de Testes

Antes de fazer deploy, execute:

### Backend
- [ ] Teste de carga passa sem erros
- [ ] Simulador completa todos os fluxos
- [ ] Queries Firestore otimizadas (ver logs)
- [ ] Sem vazamento de memória (rodar por 30min)
- [ ] Logs sem dados sensíveis

### Fluxos
- [ ] Menu inicial responde
- [ ] Identificação por nome funciona
- [ ] Identificação por CPF funciona
- [ ] Consulta situação retorna correto
- [ ] Promessa de pagamento salva no BD
- [ ] Agendamento cria registro
- [ ] Comprovante processa corretamente
- [ ] Atendimento humano transfere
- [ ] Timers expiram corretamente

### Performance
- [ ] Resposta < 300ms (média)
- [ ] Firestore reads minimizados
- [ ] Índices criados para todas queries
- [ ] Sem N+1 queries
- [ ] Paginação implementada

---

## 🐛 Debug de Testes

### Teste falhando?

1. **Verificar logs**:
```bash
# Backend
npm run dev | grep ERROR

# Firestore
# Ver console Firebase
```

2. **Verificar estado**:
```bash
# No simulador
> /status
Estado atual: {
  fluxo: 'financeiro',
  etapa: 'aguardando_nome',
  ...
}
```

3. **Limpar estado**:
```bash
# No simulador
> /reset

# Via código
await limparFirestoreTeste();
```

### Teste de carga falhando?

- Reduza `NUMERO_CLIENTES`
- Aumente `DELAY_ENTRE_MENSAGENS`
- Verifique limites do Firestore
- Monitore uso de memória

---

## 📚 Próximos Testes (TODO)

- [ ] Testes unitários com Jest
- [ ] Testes de integração com Supertest
- [ ] Testes E2E com Playwright
- [ ] Coverage mínimo de 70%
- [ ] CI/CD com testes automáticos
- [ ] Testes de regressão visual
- [ ] Testes de acessibilidade

---

## 🎓 Recursos

- [Jest](https://jestjs.io/) - Framework de testes
- [Supertest](https://github.com/visionmedia/supertest) - Testes HTTP
- [Firebase Emulator](https://firebase.google.com/docs/emulator-suite) - Testes locais
- [Artillery](https://artillery.io/) - Testes de carga avançados

---

**Última atualização**: 2024-05-20
**Próxima revisão**: A cada nova funcionalidade
