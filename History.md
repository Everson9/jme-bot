# Histórico de Desenvolvimento - JME-BOT

## Status Atual
- [ ] Configuração do ambiente de desenvolvimento com Cursor e Cline.
- [ ] Integração de regras de SKILL (Firestore, Segurança, Fluxos).
- [ ] Desenvolvimento do Painel Admin.

## Decisões Técnicas
- **IA Engine:** Utilizando Gemini 1.5 Pro via Cline (API Key própria) para contornar limites do Cursor.
- **Regras de Projeto:** Uso de arquivos `.cursor/rules/SKILL.md` para guiar a IA em performance e segurança.
- **Banco de Dados:** Firestore (Foco total em otimização de custos e performance).

## Últimas Alterações
- **2024-05-20:** Configuração do arquivo `.clinerules` para carregar automaticamente o contexto das SKILLs.
- **2024-05-20:** Criação deste arquivo de histórico para manter o contexto entre sessões.

## Pendências / Próximos Passos
- [ ] Testar os fluxos de diagnóstico de atendimento.
- [ ] Revisar regras de segurança do Painel Admin.
- [ ] Validar consumo de tokens e limites de leitura do Firestore.