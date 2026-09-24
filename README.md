# Mainframe Hub Assistant

Uma camada inteligente de suporte à migração TSO -> VS Code e desenvolvimento Mainframe baseada no GitHub Copilot Chat.

## Visão Geral
Este projeto é uma Extensão do VS Code que provê o participante de chat `@mainframehub`. 
O objetivo principal é atuar como um **Router de Inteligência Artificial**, garantindo que as dúvidas de desenvolvimento Mainframe (COBOL, JCL, DB2, Zowe) sejam respondidas da maneira mais rápida, assertiva e **econômica** possível, utilizando Roteamento de Intenção e Skills sob demanda.

## Funcionalidades Principais (MVP)
- **Roteamento de Modelos**: Categorização em níveis Economy, Standard e Deep, reduzindo custos de "AI Credits".
- **Skills On-Demand**: O contexto não é inflado com regras de negócio desnecessárias. A skill de "TSO para Zowe" é injetada apenas se o usuário tiver dúvidas de migração de ambiente.
- **Integração com Copilot**: Expõe comandos slash como `/como-fazia-no-tso`, `/abend`, `/onboarding`.

## Como Compilar
```bash
npm install
npm run compile
```

## Como Testar (F5)
1. Abra este diretório no VS Code.
2. Pressione `F5` para iniciar uma nova janela com a extensão carregada.
3. No painel de Chat do Copilot, digite `@mainframehub` seguido da sua pergunta.
