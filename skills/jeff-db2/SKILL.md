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
knowledge: []
output: guided
---

Analisa e otimiza sentenças SQL e DDLs no ambiente IBM DB2 for z/OS. Foca na eliminação de Gargalos Relacionais e Table Scans que afetam o faturamento da plataforma Mainframe (MIPS).

Queries ineficientes são a maior causa de consumo invisível de MIPS e travamento (Timeouts/-911) em ambientes bancários transacionais. Esta skill mapeia problemas estruturais no Access Path das SQLs, garantindo a utilização de índices (Index Scan).

**Impacto Operacional (FinOps):** Corrigir queries sem Predicados SARGable reduz imediatamente o custo faturado do DB2.

## Security Rules
- **Equivalência Lógica e de Result Set (CRÍTICO):** A refatoração da query SQL não pode sob nenhuma hipótese alterar o *Result Set* retornado (volume e conteúdo das linhas). O comportamento transacional e os bloqueios (Locks) devem manter a equivalência com a intenção original do desenvolvedor.

## Limitations
- **Análise Heurística:** A skill opera sem acesso ao Catalog (SYSIBM) ou ao comando EXPLAIN verdadeiro do z/OS.

## Instructions
Ao receber um trecho de SQL e/ou DDL, execute a varredura aplicando o seguinte checklist determinístico:

### Fase 1: Análise SARGable (Predicados)
1. **Regra de Funções Ocultas:**
   - **Condição:** A cláusula `WHERE` contém função envolvendo uma coluna da tabela (ex: `YEAR(DATA)` ou `SUBSTR(NOME)`)?
   - **Ação:** Sinalizar falha. Recomendar a transposição do cálculo para o literal.
2. **Regra de Coringas à Esquerda:**
   - **Condição:** A cláusula `WHERE` usa `LIKE '%...'`?
   - **Ação:** Sinalizar Table Scan iminente. Exigir índice de texto completo (Text Search) ou reestruturação.

### Fase 2: Análise de Sort e Transferência
3. **Regra de Order By Sem Index:**
   - **Condição:** Existe `ORDER BY` na query?
   - **Ação:** Verificar se as colunas do `ORDER BY` combinadas com o `WHERE` justificam a recomendação de um Índice Composto (Composite Index) para evitar Sort em memória.
4. **Regra de Paginação de Cursor:**
   - **Condição:** O desenvolvedor declarou um cursor voltado para UI/Paginação?
   - **Ação:** Exigir inclusão da cláusula `OPTIMIZE FOR n ROWS` para antecipar resposta do DB2 (Fast Return).

### Fase 3: Formato de Saída Obrigatório
```
## Relatório de Análise DB2 (SQL Access Path)
**Risco de T-Scan (Table Scan):** [🔴 ALTO / 🟡 MÉDIO / 🟢 BAIXO]
### Diagnóstico de MIPS e I/O
[Explicação do ofensor]
### Melhorias Sugeridas no Código DB2
1. **[Cláusula]:** [Solução] (Garantia: Result Set inalterado)
### Query / DDL Otimizada
[Novo código SQL / DDL]
```
