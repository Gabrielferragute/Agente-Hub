# Core Hardening v1

Data da rodada: 2026-09-25
Branch: `fix/core-contract-hardening-v1`

## Escopo e resultado

Rodada cirúrgica concluída sobre H-01, H-03, H-04, H-05 e M-09. Não houve alteração funcional no Model Router (H-02), no Component Discovery Engine ou no contrato read-only do Zowe Connector. O Migration Pack não foi integrado.

## Achados corrigidos

### H-01 — contrato de classificação e roteamento

Antes: o classificador emitia confiança em minúsculas enquanto o roteador comparava valores em maiúsculas, impedindo as rotas determinísticas de alta confiança.

Depois: `CodeConfidence` é canônico (`HIGH | MEDIUM | LOW`). JCL de alta confiança seleciona `jeff-jcl`; COBOL de alta confiança seleciona `cobol-debug`; ambos ignoram o roteador semântico. Classificações inconclusivas seguem para o roteador semântico e terminam em modo neutro se a etapa falhar.

### H-03 — privacidade do editor

Antes: na ausência de referência explícita a dataset/member, o arquivo visível podia ser lido automaticamente.

Depois: `shouldUseEditorContext` exige ação analítica e referência inequívoca ao conteúdo aberto. A política é determinística, testável e fail-closed. Esquemas `output` e `debug` continuam excluídos. Nome e conteúdo de arquivo não são registrados.

### H-04 — orçamento global e deduplicação

Antes: skill e knowledge podiam aparecer tanto no contexto lógico de sistema quanto no prompt final; histórico era limitado apenas por quantidade.

Depois: existe orçamento provisório global e limites específicos somente para histórico, contexto mainframe/editor e knowledge. Trust Boundary, instruções do assistente, skill e solicitação do usuário formam um envelope obrigatório imutável. A ordem de redução é histórico, knowledge e contexto mainframe/editor; se o envelope obrigatório não couber, o fluxo falha antes da seleção do modelo com `CONTEXT_MANDATORY_ENVELOPE_TOO_LARGE`. Reduções locais e globais são diferenciadas na telemetria. Skill e knowledge são incluídos uma única vez no contexto lógico de sistema; contexto e solicitação atual, uma única vez.

### H-05 — skills semânticas inválidas

Antes: qualquer resposta compatível com `SKILL:<id>` era aceita com alta confiança antes de validar a existência da skill.

Depois: o identificador é normalizado, validado sintaticamente e conferido no `SkillManager`/provider local. Resposta inválida, baixa confiança, ausência de modelo, resposta fora do contrato, falha do modelo ou falha do provider resulta em modo neutro, preservando o contexto disponível. Texto inesperado do modelo não é registrado.

### M-09 — tutorial corporativo

Antes: o HTML rastreado continha organização, endpoint, convenções de datasets, fluxo de solicitação e contato específicos.

Depois: a estrutura didática foi preservada e os dados foram substituídos por placeholders explícitos, como `<organization>`, `<zosmf-host>`, `<corporate-dataset-...>`, `<corporate-access-portal>`, `<userid>` e `<support-contact>`.

`GitHistoryContainsPreviousCorporateData: YES`

Não foi realizada reescrita de histórico Git.

## Telemetria adicionada

- `SemanticSkillRequested` / `semanticSkillRequested`
- `SemanticSkillValid` / `semanticSkillValid`
- `EditorContextRequested` / `editorContextRequested`
- `EditorContextIncluded` / `editorContextIncluded`
- `EditorContextReason` / `editorContextReason`
- `ContextBudgetTotalChars` / `contextBudgetTotalChars`
- `ContextCharsIncluded` / `contextCharsIncluded`
- `HistoryCharsIncluded` / `historyCharsIncluded`
- `KnowledgeCharsIncluded` / `knowledgeCharsIncluded`
- `MainframeContextCharsIncluded` / `mainframeContextCharsIncluded`
- `ContextBudgetExceeded` / `contextBudgetExceeded`

Os nomes em PascalCase representam o contrato solicitado; os nomes em camelCase são as propriedades TypeScript propagadas pelo roteador e logger. Nenhum conteúdo de prompt, resposta semântica inesperada, nome de arquivo, dataset ou member é incluído nesses logs.

## Arquivos

- `src/mainframe/codeClassificationTypes.ts`
- `src/mainframe/codeClassifier.ts`
- `src/router/routingContracts.ts`
- `src/router/semanticRouter.ts`
- `src/router/intentRouter.ts`
- `src/context/editorContextPolicy.ts`
- `src/context/contextBudget.ts`
- `src/context/promptBuilder.ts`
- `src/skillsManager/skillManager.ts`
- `src/telemetry/metrics.ts`
- `src/extension.ts`
- `src/test/core-hardening.test.ts`
- `package.json`
- `knowledge/tutorials/tutorial-zowe.html`

## Testes automatizados

1. JCL HIGH → `jeff-jcl`, sem semântico.
2. COBOL HIGH → `cobol-debug`, sem semântico.
3. Skill semântica inexistente → inválida e neutra.
4. Política de privacidade do editor → exemplos explícitos aceitos e consultas genéricas rejeitadas.
5. Orçamento global → limites, seis mensagens e telemetria de truncamento.
6. Deduplicação → skill, knowledge, contexto e solicitação aparecem uma vez.
7. Classificação inconclusiva + falha semântica → modo neutro.
8. Contrato público do Zowe Connector → nenhuma API mutante.

Comandos de aceite: `tsc -p ./` e `npm run test:core`.

Resultado final:

- `tsc -p ./`: exit code 0.
- `npm run test:core`: exit code 0; 17 testes, 17 aprovados, 0 reprovados.

## Limites e pendências

- H-02 Model Router: **PENDING**.
- Migration Knowledge Selector: **PENDING**.
- Os limites em caracteres são provisórios e não equivalem à contagem real de tokens do modelo.
- O histórico Git ainda contém a versão corporativa anterior; sua remoção exigiria decisão separada e reescrita explícita de histórico.
- Esta rodada não constitui homologação corporativa, validação de credenciais, teste de conectividade real com mainframe ou aprovação de segurança organizacional.
