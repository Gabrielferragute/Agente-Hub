# Diretrizes Arquiteturais de COBOL da Empresa (Padrão Ouro)

> **Nota:** Os nomes de rotinas, copybooks e DCLGENs abaixo são **fictícios** e servem como exemplo de um padrão arquitetural típico de grandes instalações mainframe. Adapte-os ao padrão real da sua instalação.

Este documento descreve o padrão arquitetural utilizado pela empresa. A IA DEVE respeitar estas regras e NUNCA apontá-las como erro (Falso Positivo).

## 1. Tratamento de Erro Centralizado (ERRH9999)
- A empresa utiliza uma arquitetura de API de Erros centralizada chamada `ERRH9999`. 
- Qualquer erro no programa (seja I/O de arquivo, banco de dados ou erro de negócio) resulta no preenchimento de variáveis `ERRHGARQ-*`, `ERRHGDB2-*` ou `ERRHGHEA-*`, seguido de um `SET WRK-ABENDAR TO TRUE` e uma chamada para a rotina de erro (ex: `PERFORM 9000-ERRO-ARQ` ou `PERFORM 9200-ERRO-DB2`).
- **[⚠️ REGRA CRÍTICA]**: NUNCA sugira a criação de variáveis de erro manuais se o programa já estiver usando a estrutura do `ERRH9999` ou as áreas `WRK-AREA-ERRO-ARQ` / `WRK-AREA-ERRO-DB2`.

## 2. Leitura de Arquivos (FILE STATUS vs AT END)
- A empresa padronizou o controle de fim de arquivo (EOF) **através do `FILE STATUS`** (ex: `IF WRK-FS-ARQENT01 EQUAL '10'`), e NÃO através da cláusula `AT END` no comando `READ`.
- **[⚠️ REGRA CRÍTICA]**: É ESTRITAMENTE PROIBIDO apontar a ausência da cláusula `AT END` como um erro ou risco de ABEND S001, desde que o programa possua um `IF FILE-STATUS = '10'` (ou similar) após o `READ`. O padrão da empresa é seguro.

## 3. Uso Extensivo de COPYBOOKS e DCLGEN (DB2)
- Os programas utilizam dezenas de Copybooks tanto na `FILE SECTION` (ex: `COPY BOOKW001`) quanto na `WORKING-STORAGE SECTION` (ex: `COPY BOOKW002`).
- Para DB2, os programas incluem tabelas usando `EXEC SQL INCLUDE NOME-DA-TABELA END-EXEC` (ex: `INCLUDE DCLTB001`). As variáveis de host geradas a partir destas tabelas não estarão visíveis no código-fonte COBOL.
- **[⚠️ REGRA CRÍTICA]**: Se o código-fonte faz referência a uma variável que não está explicitamente declarada, **ASSUMA IMEDIATAMENTE QUE ELA ESTÁ EM UM COPYBOOK OU DCLGEN (DB2)**. NUNCA reclame que a variável "não foi declarada".

## 4. Rastreabilidade de Parágrafos
- A arquitetura exige que o nome do parágrafo atual seja movido para uma variável de rastreamento antes da execução (ex: `MOVE '1000-PROCEDIMENTOS-INICIAIS' TO ERRHGHEA-IDEN-PARAGRAFO`).
- NUNCA remova esses comandos de rastreamento ao refatorar blocos de código.

## 5. Arquitetura DB2 (Tratamento de SQLCODE)
- O tratamento de DB2 (Erros ou Fim de Cursor) da empresa é estrito:
  - Fim de Cursor é testado como: `IF (SQLCODE EQUAL +100)` ou verificando se `SQLCODE NOT EQUAL ZEROS AND +100`.
  - A execução de query sempre é seguida de um IF para tratamento de abend (validação de `SQLCODE` e `SQLWARN0`).
  - Cursores são declarados com a cláusula `WITH UR` para leitura descomprometida na `WORKING-STORAGE`.
- NUNCA aponte o `WITH UR` como um problema a não ser que a tarefa seja estritamente de UPDATE isolado.

## 6. Limites de Refatoração (Anti-Preguiça)
- Devido a limites de tokens de saída da IA, você **NUNCA DEVE TENTAR REESCREVER O PROGRAMA INTEIRO**.
- Se for sugerir uma refatoração, forneça APENAS o `SECTION` ou o bloco de código específico que foi alterado. Mantenha a resposta focada.
