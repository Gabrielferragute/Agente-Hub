# Mainframe Hub Assistant - MVP (Minimum Viable Product)

## Visão Geral
O **Mainframe Hub Assistant** é uma extensão inteligente para o VS Code que atua como uma ponte para desenvolvedores migrando do ambiente tradicional (TSO/ISPF) para o ecossistema moderno (VS Code + Zowe). O objetivo principal é servir como um **Router de Inteligência Artificial**, garantindo que dúvidas de desenvolvimento Mainframe (COBOL, JCL, DB2, Zowe) sejam respondidas de forma rápida, assertiva e econômica.

---

## 1. Agente de Bate-Papo (`@mainframehub`)
Uma interface acoplada ao **GitHub Copilot Chat**, que expõe comandos diretos (slash commands) para reduzir o atrito diário:
- `/como-fazia-no-tso`: Ajuda a mapear comandos familiares do ISPF (ex: `=3.4`, `SDSF`) para as ferramentas equivalentes no VS Code/Zowe.
- `/abend`: Assistência focada em *troubleshooting* de problemas comuns no Mainframe (ex: S0C7, S0C4, JCL JCL errors).
- `/explicar` e `/onboarding`: Guias passo a passo para suporte geral e rápida integração de novos desenvolvedores à arquitetura.

## 2. Roteamento de IA Orientado a Custo (FinOps AI)
O sistema não envia todo e qualquer prompt para o modelo mais caro. Ele avalia a intenção da pergunta e faz o roteamento inteligente:
- **Economy**: Para perguntas simples de navegação ou atalhos.
- **Standard**: Para dúvidas intermediárias de sintaxe.
- **Deep (Agente Jeff)**: Para revisões profundas de código e otimizações complexas.
Isso garante a gestão eficiente de custos (FinOps) de "AI Credits".

## 3. Injeção de Contexto Sob Demanda (Skills Manager)
O MVP identifica qual "Skill" é necessária para a pergunta atual (Skill de JCL, Skill de DB2, etc.) e carrega apenas esse contexto na requisição da IA.
- Impede a "poluição" do prompt com regras de negócio desnecessárias.
- Melhora a precisão das respostas (menos alucinações).

## 4. Persona "Agente Jeff" - Arquiteto de Alta Plataforma
A estrela do modo "Deep" é o Agente Jeff, um especialista sênior em Arquitetura Mainframe (Enterprise COBOL v6+, CICS, DB2, IMS e JCL).
- **Foco Primário**: Estabilidade transacional e alta performance.
- **Segurança**: Prevenção ativa de abends críticos (S0C7, -911, Lock Escalation).
- **Otimização (FinOps)**: Foco rigoroso na redução do consumo de MIPS/CPU (substituindo `SEARCH` linear por `SEARCH ALL`, garantindo *SARGability* no DB2, etc.).
- **Limitação**: Baseia-se estritamente em Manuais Oficiais da IBM, garantindo soluções de alto padrão.

## 5. Integração Segura com Zowe
A extensão comunica-se com os perfis Zowe configurados no workspace (`mainframeHub.workspaceProfile`). 
- Permite o teste de acesso Read-Only e a fixação (pinning) de profiles, assegurando que as ferramentas da IA trabalhem sincronizadas com o contexto real de infraestrutura sem comprometer a segurança.

---

### Estado Atual
A extensão encontra-se na versão `0.2.1` e já possui sua infraestrutura de pacotes (`.vsix`), testes de pipeline (`JclRouterPipeline`, `JclLlmPipeline`) e integração com o SDK do Zowe plenamente configurados.
