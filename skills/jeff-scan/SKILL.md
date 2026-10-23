---
id: jeff-scan
providerId: local
origin: imported
status: local-adapted
domain: performance
intents: [cobol-performance, mips-optimization, finops-scan, search-all, comp3]
defaultTier: DEEP
escalation: Always DEEP for performance scanning.
tools: [zowe-read-member]
knowledge: [cobol-mindset.md]
output: guided
---

Realiza análise estática avançada de código Enterprise COBOL v6+ buscando antipatterns que degradam a performance e elevam o consumo de CPU em Mainframe.

O faturamento em ambientes z/OS é fortemente baseado no consumo de MIPS (Millions of Instructions Per Second). Esta skill localiza ineficiências clássicas — como buscas lineares desnecessárias, matemática com variáveis `DISPLAY`, e recálculo de ponteiros — transformando-as em código altamente otimizado que aproveita a arquitetura de hardware IBM z/Architecture.

**Impacto Operacional (FinOps):** Cada ciclo de CPU economizado reduz o TCO. Uma única busca linear (`PERFORM VARYING`) alterada para busca binária (`SEARCH ALL`) em uma tabela de 5.000 posições reduz o consumo de MIPS daquela rotina em mais de 99%.

## Security Rules
- **Equivalência Funcional Estrita (CRÍTICO):** Nenhuma sugestão de otimização de performance pode alterar o comportamento lógico ou a regra de negócio original. O código otimizado deve produzir exatamente os mesmos resultados de saída que o código original para qualquer conjunto de entradas.
- **Validação de Ordenação:** Ao sugerir `SEARCH ALL`, a skill deve obrigatoriamente alertar o usuário de que os dados devem estar previamente ordenados no arquivo de carga.

## Limitations
- **Análise Estática Limitada:** A ferramenta não afere os milissegundos reais economizados, gerando estimativas baseadas em complexidade algorítmica.

## Instructions
Ao receber um trecho de código COBOL para análise, execute a varredura aplicando o seguinte checklist determinístico:

### Fase 1: Detecção de Gargalos
1. **Regra de Repetição Exaustiva:**
   - **Condição:** Existe comando `PERFORM VARYING` varrendo tabela sem instrução condicional de parada ou `EXIT PERFORM`?
   - **Ação:** Sinalizar falha (ALTO CONSUMO). Exigir `EXIT PERFORM` para interrupção (Early Exit).
2. **Regra de Indexação vs Subscripting:**
   - **Condição:** Tabela (`OCCURS`) acessada via variável genérica (`DISPLAY` ou `COMP-3`) da WORKING-STORAGE?
   - **Ação:** Sinalizar alerta (MÉDIO CONSUMO). Recomendar declaração de `INDEXED BY` para acesso direto em memória.
3. **Regra de Matemática e Tipagem (CRÍTICO):**
   - **Condição:** Uso de `COMPUTE`, `ADD`, `SUBTRACT` sobre variáveis `DISPLAY`?
   - **Ação:** Sinalizar falha (ALTO CONSUMO). Exigir alteração para `COMP-3` (se for variável financeira/negócio) ou `COMP` (se for contador de loop/índice).
4. **Regra do SEARCH ALL (Busca Binária):**
   - **Condição:** Uso do comando `SEARCH` (Serial) em tabelas com mais de 50 posições?
   - **Ação:** Sinalizar falha (ALTO CONSUMO). Exigir `SEARCH ALL` e alertar que a tabela deve possuir a cláusula `ASCENDING/DESCENDING KEY` e os dados devem estar previamente ordenados.
5. **Regra de Otimização do INSPECT (Exclusivo V6+):**
   - **Condição:** Uso de múltiplos comandos `INSPECT` separados por outras instruções sobre a mesma variável?
   - **Ação:** Sinalizar melhoria (MÉDIO CONSUMO). Recomendar o agrupamento consecutivo dos `INSPECT`s para que o otimizador do compilador V6 os aglutine em uma única operação de máquina.
### Fase 2: Formato de Saída Obrigatório
```
## Relatório de Performance (COBOL FinOps)
**Severidade do Gargalo:** [🔴 ALTO CONSUMO / 🟡 MÉDIO CONSUMO / 🟢 OTIMIZADO]
### Diagnóstico de MIPS
[Explicação técnica do ofensor de CPU]
### Melhorias Arquiteturais Sugeridas
1. **[Linha/Comando]:** [Explicação] (Garantia: Mantém Equivalência Funcional)
### Código Otimizado
[Código COBOL refatorado]
### Impacto Estimado
[Estimativa qualitativa da economia]
```
