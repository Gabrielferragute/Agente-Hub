---
topic: "Job Spool Viewer"
sourceClass: "OFFICIAL_ZOWE"
source: "ispf-mapping.md"
product: "Zowe Explorer"
scope: "GLOBAL"
version: "UNKNOWN"
lastReviewed: "2026-09-24"
---

# Visualizar Spool de Execução

## Quando usar
Para investigar logs detalhados (sysouts, sysprints, dumps) de execução de um job e auditar saídas (outputs) de relatórios do JES.

## Equivalente no ambiente legado
Colocar o line command `?` no SDSF ao lado de um Job para ver as divisões do Spool, ou `S` para abrir tudo (SDSF Spool).

## Como fazer no Zowe
1. Na aba **JOBS** do Zowe Explorer, localize a execução desejada na lista filtrada.
2. Ao lado do Job listado, clique na **Seta de Expansão** (`>`) ou clique simples no nome do Job.
3. O Job revelará uma árvore hierárquica abaixo dele contendo arquivos individuais do sistema JES:
   - `JES2:JESMSGLG` (Log principal de submissão do JES)
   - `JES2:JESJCL` (A transcrição do JCL recebido)
   - `JES2:JESYSMSG` (Mensagens de sistema geradas pelos steps)
   - Qualquer SYSPRINT ou arquivo de SYSOUT alocado pelos passos lógicos do programa.
4. Clique na peça de Spool que deseja abrir; ela carregará em modo leitura (Read-Only) no editor central do VS Code.

## Pré-requisitos
Job com saídas na Output Queue (ainda não expurgado/purged).

## Cuidados / Limitações
Não é possível "escrever" no Spool. A visualização aprofundada depende dos recursos nativos do VS Code (busca de string `Ctrl+F` no arquivo), substituindo filtros de tela do SDSF. Operações de SDSF complexas (filtros específicos em linha de comando) não possuem mapeamento documentado.

## Fonte
- OFFICIAL_ZOWE (ispf-mapping.md)
