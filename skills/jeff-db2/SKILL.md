---
id: jeff-db2
providerId: local
origin: imported
status: local-adapted
domain: performance
intents: [db2-analysis, sql-optimization, access-path, table-scan, sargable]
defaultTier: DEEP
escalation: Always DEEP for DB2 Access Path analysis.
tools: [zowe-read-member]
knowledge: [empresa-cobol-guidelines.md]
output: guided
---

Realiza análise estática avançada de sentenças SQL e DDLs no ambiente IBM DB2 for z/OS. Foca na eliminação de Gargalos Relacionais, Table Scans e operações de Sort que impactam o consumo de MIPS e geram travamentos (Timeouts/-911).

O faturamento em ambientes z/OS é fortemente baseado no custo de I/O e CPU. Esta skill mapeia falhas de SARGability, ausência de índices compostos e má utilização de cursores, garantindo o uso eficiente do Access Path.

Security Rules
Equivalência Lógica e de Result Set (CRÍTICO): A refatoração da query SQL não pode alterar o Result Set retornado (volume e conteúdo das linhas). O comportamento transacional e os níveis de isolamento (Locks) devem manter a equivalência estrita.

Limitations
Análise Heurística: A skill opera sem acesso direto ao Catalog (SYSIBM) ou ao comando EXPLAIN real do z/OS.

Instructions
Ao receber um trecho de SQL e/ou DDL, execute a varredura aplicando o seguinte checklist determinístico:

Fase 1: Análise SARGable e Predicados (CRÍTICO)
Regra de Funções Ocultas:

Condição: A cláusula WHERE contém função sobre coluna (ex: YEAR(DATA) ou SUBSTR(NOME))?

Ação: Sinalizar falha (🔴 ALTO CONSUMO). Exigir a transposição para predicados de intervalo SARGable (ex: DATA >= '2026-01-01').

Regra de Coringas à Esquerda (Leading Wildcard):

Condição: A cláusula WHERE utiliza LIKE '%...' ou LIKE '%...%'?

Ação: Sinalizar Table Scan iminente. Exigir reestruturação da lógica de busca ou uso de IBM Text Search.

Fase 2: Análise de Sort, Joins e Paginação
Regra de Order By / Group By Sem Índice Coberto:

Condição: A query possui ORDER BY ou GROUP BY cujas colunas não fazem parte de um índice composto com o WHERE?

Ação: Sinalizar risco de Workfile/Sort em disco. Recomendar a criação de Índice Composto cobrindo a chave.

Regra de Paginação e Fetch:

Condição: Uso de cursores sem limite de linhas ou paginação voltada para aplicações online?

Ação: Recomendar o uso de FETCH FIRST n ROWS ONLY combinado com OPTIMIZE FOR n ROWS para forçar o Fast Return do DB2.

Fase 3: Formato de Saída Obrigatório
Plaintext
## Relatório de Análise DB2 (SQL Access Path)
**Risco de T-Scan (Table Scan):** [🔴 ALTO / 🟡 MÉDIO / 🟢 BAIXO]

### Diagnóstico de MIPS e I/O
[Explicação técnica do ofensor de CPU e do impacto no Access Path]

### Melhorias Sugeridas no Código DB2
1. **[Cláusula / Predicado]:** [Problema encontrado] → [Solução SARGable] (Garantia: Result Set inalterado)

### Query / DDL Otimizada
[Novo código SQL otimizado ou DDL do Índice recomendado]
