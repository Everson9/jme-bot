Histórico de Desenvolvimento - JME-BOT
Status Atual
Configuração do ambiente de desenvolvimento com Cursor e Cline.

Integração de regras de SKILL (Firestore, Segurança, Fluxos).

Desenvolvimento do Painel Admin.

Correção do sistema de status (pago/pendente).

Correção da visualização no frontend.

[⚠️] Sistema de cobrança automática com problemas NÃO RESOLVIDOS

Decisões Técnicas
IA Engine: Utilizando Gemini 1.5 Pro via Cline (API Key própria) para contornar limites do Cursor.

Regras de Projeto: Uso de arquivos .cursor/rules/SKILL.md para guiar a IA em performance e segurança.

Banco de Dados: Firestore (Foco total em otimização de custos e performance).

Padrão de Status: Campo status como string ('pago', 'pendente', 'isento') no histórico de pagamentos.

Correções Aplicadas com SUCESSO
2026-04-09 - Correção do Sistema de Status e Frontend
Problemas resolvidos:

✅ Inconsistência no campo de status: alguns lugares verificavam pago: true, outros status: 'pago'

✅ Frontend mostrava status incorretos (todos como pendentes)

✅ Interface confusa: "Ciclo atual" vs "Mês corrente"

✅ ADMIN_PHONE não funcionava para números sem 9º dígito

Arquivos corrigidos:

services/statusService.js

Corrigido _status10, _status20, _status30: verificação de reg.pago === true → reg.status === 'pago' || reg.status === 'isento'

Corrigido deveSerCobrado: mesma padronização

services/cobrancaService.js

Linha 48-60: Corrigida verificação de pagamento para usar registro.status

Adicionados logs detalhados para debug

services/adminService.js

Função getCicloCobranca: corrigido para aviso (lembrete) usar o mês atual

routes/index.js

Linha 190: Corrigida verificação de status

Linhas 136-171: Otimização de performance - busca apenas ciclo atual

frontend/src/components/VisualizadorBase.jsx

Adicionado mesRefCorrente() para mostrar mês atual

Botões renomeados: "📅 Mês corrente" e "📆 Mês passado"

Título mostra claramente qual mês está sendo visualizado

index.js

Corrigido ADMIN_PHONE para números sem 9º dígito: 558186650773

PROBLEMA NÃO RESOLVIDO: Cobrança Automática
Sintoma Atual:
✅ Votação no WhatsApp lista clientes corretamente (ex: 24 clientes)

✅ Admin aprova com !sim

✅ Log mostra: 📋 Enviando 24 clientes para disparo

❌ Ao entrar no dispararCobrancaReal, os parâmetros chegam errados:

text
📬 Iniciando disparo dia [object Object], tipo: [object Object]
📬 clientesFiltrados recebido: NENHUM
❌ O sistema cai no modo "BUSCANDO DO BANCO" e usa ciclo 03-2026 (março)

❌ Resultado: 0 mensagens enviadas

Causa Identificada:
Os parâmetros da função dispararCobrancaReal estão sendo passados de forma incorreta em ALGUM lugar.

A assinatura correta é:

javascript
async function dispararCobrancaReal(client, firebaseDb, data, tipo = null, clientesFiltrados = null)
Locais onde a função é chamada (verificado em 2026-04-09):
Arquivo	Linha	Chamada	Status
index.js	171	dispararCobrancaReal: (d, t) => dispararCobrancaReal(client, firebaseDb, d, t)	✅ Correta
index.js	292	dispararCobrancaReal: (d,t) => dispararCobrancaReal(client, firebaseDb, d, t)	✅ Correta
middleware/Mensagem.js	253	await dispararCobrancaReal(client, firebaseDb, data, args[2] || null)	✅ Correta
middleware/timers.js	38	(data, tipo) => dispararCobrancaReal(client, firebaseDb, data, tipo)	✅ Correta
services/adminService.js	261	await dispararCobrancaReal(client, firebaseDb, cobranca.dataVenc, cobranca.tipo, cobranca.clientes)	✅ Correta
routes/index.js	507	const total = await ctx.dispararCobrancaReal(data, tipo || null)	⚠️ CORRIGIDA
services/audioService.js	234	await dispararCobrancaReal(c.data, c.tipo)	⚠️ CORRIGIDA
Tentativas de Correção:
✅ Corrigida chamada no routes/index.js (adicionado client, firebaseDb)

✅ Corrigida chamada no audioService.js (adicionado client, firebaseDb)

✅ Adicionados logs detalhados no cobrancaService.js

✅ Adicionados logs no adminService.js para verificar os dados antes da chamada

Status Final da Sessão:
Frontend: 100% funcional ✅

Status dos clientes: 100% correto ✅

ADMIN_PHONE: 100% funcional ✅

Cobrança automática: ❌ NÃO RESOLVIDO - Os parâmetros continuam chegando como [object Object]

Hipótese para Próxima Sessão:
O problema pode estar no wrapper da função em index.js (linha 171 ou 292) que está sendo chamado em vez da função real, ou há uma versão em cache no servidor Fly.io que não está sendo atualizada com os deploys.

Recomendações para Continuar:
Verificar se o deploy está realmente subindo os arquivos modificados

Adicionar logs no wrapper do index.js para ver quem está chamando

Considerar limpar o cache do Fly.io ou fazer deploy com --build-only

Verificar se há múltiplas máquinas rodando versões diferentes

Pendências / Próximos Passos
URGENTE: Resolver o problema dos parâmetros na cobrança automática

Verificar por que clientesFiltrados chega como NENHUM mesmo sendo passado

Testar os fluxos de diagnóstico de atendimento

Revisar regras de segurança do Painel Admin

Implementar TTL em historico_conversa

Adicionar rate limiting na API

Última atualização: 2026-04-09
Sessão encerrada com: Sistema de cobrança automática NÃO funcional
Responsável: Equipe JMENET