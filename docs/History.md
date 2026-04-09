# Histórico de Desenvolvimento - JME-BOT

## Status Atual
- Configuração do ambiente de desenvolvimento com Cursor e Cline.
- Integração de regras de SKILL (Firestore, Segurança, Fluxos).
- Desenvolvimento do Painel Admin.
- Correção do sistema de status (pago/pendente).
- Correção da visualização no frontend.
- ✅ Sistema de cobrança automática FUNCIONANDO

## Decisões Técnicas
- **IA Engine**: Utilizando Gemini 1.5 Pro via Cline (API Key própria) para contornar limites do Cursor.
- **Regras de Projeto**: Uso de arquivos `.cursor/rules/SKILL.md` para guiar a IA em performance e segurança.
- **Banco de Dados**: Firestore (Foco total em otimização de custos e performance).
- **Padrão de Status**: Campo status como string ('pago', 'pendente', 'isento') no histórico de pagamentos.

---

## Correções Aplicadas com SUCESSO

### 2026-04-09 - Correção do Sistema de Status e Frontend
Problemas resolvidos:

✅ Inconsistência no campo de status: alguns lugares verificavam `pago: true`, outros `status: 'pago'`

✅ Frontend mostrava status incorretos (todos como pendentes)

✅ Interface confusa: "Ciclo atual" vs "Mês corrente"

✅ ADMIN_PHONE não funcionava para números sem 9º dígito

Arquivos corrigidos:

**services/statusService.js**
- Corrigido `_status10`, `_status20`, `_status30`: verificação de `reg.pago === true` → `reg.status === 'pago' || reg.status === 'isento'`
- Corrigido `deveSerCobrado`: mesma padronização

**services/cobrancaService.js**
- Linha 48-60: Corrigida verificação de pagamento para usar `registro.status`
- Adicionados logs detalhados para debug

**services/adminService.js**
- Função `getCicloCobranca`: corrigido para aviso (lembrete) usar o mês atual

**routes/index.js**
- Linha 190: Corrigida verificação de status
- Linhas 136-171: Otimização de performance - busca apenas ciclo atual

**frontend/src/components/VisualizadorBase.jsx**
- Adicionado `mesRefCorrente()` para mostrar mês atual
- Botões renomeados: "📅 Mês corrente" e "📆 Mês passado"
- Título mostra claramente qual mês está sendo visualizado

**index.js**
- Corrigido ADMIN_PHONE para números sem 9º dígito: `558186650773`

---

### 2026-04-09 - Correção do Sistema de Cobrança Automática

**Problema:** Parâmetros chegavam como `[object Object]` em `dispararCobrancaReal`, resultando em 0 mensagens enviadas.

**Causa raiz:** 3 bugs encadeados.

#### Bug 1 — adminService.js (linha 261)
`verificarCobrancasAutomaticas` recebia `dispararCobrancaReal` como wrapper (sem `client`/`firebaseDb`), mas chamava passando `client, firebaseDb` como primeiros args — invertendo todos os parâmetros.

```js
// ANTES (errado)
await dispararCobrancaReal(client, firebaseDb, cobranca.dataVenc, cobranca.tipo, cobranca.clientes);

// DEPOIS (correto)
await dispararCobrancaReal(cobranca.dataVenc, cobranca.tipo, cobranca.clientes, ADMINISTRADORES);
```

#### Bug 2 — middleware/timers.js (linha 38)
Wrapper não repassava o argumento `clientes` nem `ADMINISTRADORES`.

```js
// ANTES (errado)
(data, tipo) => dispararCobrancaReal(client, firebaseDb, data, tipo)

// DEPOIS (correto)
(data, tipo, clientes) => dispararCobrancaReal(client, firebaseDb, data, tipo, clientes, ADMINISTRADORES)
```

#### Bug 3 — cobrancaService.js
Campo `telefone` (string) vs `telefones` (array) — todos os clientes eram descartados por "SEM TELEFONE".

```js
// ANTES (errado)
if (!cliente.telefone) continue;

// DEPOIS (correto)
const tel = Array.isArray(cliente.telefones)
    ? cliente.telefones[0]
    : cliente.telefone;
if (!tel) continue;
clientesValidos.push({ ...cliente, telefone: tel });
```

#### Adicionado — Relatório final para admins
Após o disparo, admins recebem mensagem com resumo:
- Total enviado / falhas
- Lista de clientes não entregues (se houver)

`dispararCobrancaReal` passou a aceitar `ADMINISTRADORES` como 6º parâmetro.

**Arquivos modificados:**
| Arquivo | Mudança |
|---------|---------|
| `services/cobrancaService.js` | Bug telefone, relatório final, logs de debug removidos |
| `services/adminService.js` | Chamada do wrapper corrigida, ADMINISTRADORES repassado |
| `middleware/timers.js` | Wrapper corrigido para repassar clientes e ADMINISTRADORES |

---

## Arquitetura da Cobrança Automática

```
timers.js (a cada 2h)
    ↓
verificarCobrancasAutomaticas (adminService.js)
    ↓ busca clientes por dia_vencimento
    ↓ verifica histórico do ciclo
    ↓ filtra: cancelados, carnê pendente, já pagaram
    ↓
perguntarAdmins → votação via WhatsApp (!sim / !nao)
    ↓ aprovado
dispararCobrancaReal (cobrancaService.js)
    ↓ normaliza telefone (array → string)
    ↓ tenta com/sem 9º dígito
    ↓ envia mensagem + PIX
    ↓ registra log_cobrancas
    ↓
Relatório para admins (enviadas / falhas / não entregues)
```

## Calendário de Cobranças

| Vencimento | Lembrete | Atraso | Atraso Final | Reconquista | Reconquista Final |
|------------|----------|--------|--------------|-------------|-------------------|
| Dia 10 | Dia 9 | Dia 13 | Dia 15 | Dia 17 | Dia 20 |
| Dia 20 | Dia 19 | Dia 23 | Dia 25 | Dia 27 | Dia 30 |
| Dia 30 | Dia 29 | Dia 3+1m | Dia 5+1m | Dia 7+1m | Dia 10+1m |

---

## Status dos Módulos

| Módulo | Status |
|--------|--------|
| Frontend (painel admin) | ✅ 100% funcional |
| Status dos clientes | ✅ 100% correto |
| ADMIN_PHONE | ✅ 100% funcional |
| Cobrança automática | ✅ FUNCIONANDO |
| Relatório pós-cobrança | ✅ Implementado |
| Rate limiting na API | ⏳ Pendente |
| TTL em historico_conversa | ⏳ Pendente |
| Autenticação JWT no painel | ⏳ Pendente |

---

## Pendências / Próximos Passos

- Implementar rate limiting na API
- Revisar regras de segurança do Painel Admin
- Implementar TTL em `historico_conversa`
- Testar os fluxos de diagnóstico de atendimento
- Adicionar autenticação JWT no painel

---

**Última atualização**: 2026-04-09
**Sessão encerrada com**: Sistema de cobrança automática FUNCIONANDO ✅
**Responsável**: Equipe JMENET